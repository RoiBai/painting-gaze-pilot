import {cardHitAt,paperAppVersion} from './cardPresentation';
import type {ArcheryHistory,PaperGuideLayout} from './paperGuide';
import type {Session,StudyConfig,Phase,Geometry,ResponseRow,ValidationRow,BackgroundAnswers, ParticipantAssignment, CardDecision, CardExposure, CardRect, PilotMetadata, PilotTrial} from './types';
import {WebGazerAdapter} from './webgazerAdapter';
import {saveSession} from './storage';
import {writeCheckpoint,type PilotCheckpoint} from './pilotResume';
import {mapPoint} from './geometry';
import {summarizeValidation} from './validation';
import {orderForParticipant,canTransition} from './machine';
import {defaultScanpath} from './scanpath';
import {validateConfig} from './study';
import {validationExplanation} from './quality';
import {resolveParticipantConfig} from './assignment';
import {freezeBackground} from './background';
import {COMMON_QUESTIONNAIRE_VERSION} from './commonQuestionnaire';
import {buildPilotPlan,cardPermutation,cardWindows,type CardWindow,PILOT_VERSION,responsiveSelectionRules,SELECTION_RULES,selectCard,singleAoi} from './pilotProtocol';

export const CALIBRATION_TARGETS = [[.12,.15],[.5,.15],[.88,.15],[.12,.5],[.5,.5],[.88,.5],[.12,.85],[.5,.85],[.88,.85]];
export const VALIDATION_TARGETS = [[.25,.28],[.75,.28],[.5,.5],[.25,.72],[.75,.72]];
export const DRIFT_TARGETS = [[.2,.5],[.5,.5],[.8,.5]];
export interface CameraState {status:'idle'|'loading'|'ready'|'tracking'|'error'|'stopped';message:string;faceDetected?:boolean}
export interface Adapter {start(o:{regression:'ridge'|'weightedRidge';kalman:boolean}):Promise<void>;stop():void;resetCalibration():Promise<void>;train(x:number,y:number):void;setPhase(p:string):void;showPreview(b:boolean):void}
export type InputSample={x:number|null;y:number|null;libraryElapsedMs:number|null;callbackTimeMs:number};
export class StudyEngine {
 session:Session|null=null; phase:Phase='consent'; trialIndex=0; cardIndex=0; targetIndex=0; clicks=0;
 paused=false; pauseReason=''; requireCalibration=false; camera:CameraState={status:'idle',message:'尚未启用摄像头'}; storageError='';
 revision=0; listeners=new Set<()=>void>(); adapter:Adapter; geometry:Geometry|null=null; lastPredictionAt=0; lastCallbackAt=0;
 private slotChoices=new Map<number,CardDecision>();
 private windows:CardWindow[]=[];
 private visibleDecision:CardDecision|null=null;
 private visibleUntilActiveMs=0;
 private visibleSinceActiveMs=0;
 private openExposure:CardExposure|null=null;
 private windowResetMs=0;
 private deck:string[]=[];
 private clock:()=>number; private draftTimer:ReturnType<typeof setTimeout>|null=null; private pageTimeOffset=0; private reconnectAfterSurvey=false; private runId=''; private targetStarted=0; private lastTick=0; private phaseStarted=0; private interval:ReturnType<typeof setInterval>|null=null; private persistTimer:ReturnType<typeof setInterval>|null=null; private disposed=false;
 constructor(factory?:(sample:(s:InputSample)=>void,status:(s:CameraState)=>void)=>Adapter, clock=()=>performance.now()){
  this.clock=()=>clock()+this.pageTimeOffset; this.adapter=(factory??((s,c)=>new WebGazerAdapter(s,c)))(s=>this.sample(s),s=>{this.camera=s;this.event('camera_status',s);if(s.status==='error'){if(this.session?.calibrationVersion)this.requireCalibration=true;this.pause('camera_error',true);}this.emit()});
 }
 subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn)}};
 snapshot=()=>this.revision;
 emit(){this.revision++;this.listeners.forEach(fn=>fn())}
 get painting(){return this.session?.config.paintings.find(p=>p.paintingId===this.session?.order[this.trialIndex])??null}
 get activeCard(){
  if(this.phase!=='free_view'||this.paused||!this.visibleDecision)return null;
  return this.painting?.cards.find(card=>card.id===this.visibleDecision!.cardId)??null;
 }
 get archeryHistory():ArcheryHistory{
  const trial=this.currentTiming?.trialId,slot=this.visibleDecision?.slot;
  if(!trial||!slot)return {};
  const prior=this.session?.cardExposures?.filter(e=>e.trialId===trial&&e.slot<slot)??[];
  const previous=prior.at(-1);
  const adjoining=previous?.slot===slot-1&&this.windows[slot-2]?.end===this.windows[slot-1]?.reveal;
  return {previousCardId:adjoining?previous.cardId:undefined,arrowLanded:prior.some(e=>e.paper?.arrowLandedAtMs!==undefined)};
 }
 private get trialCondition(){return this.session?.pilot?.plan[this.trialIndex]?.condition}
 get targets(){return this.phase==='calibration'?CALIBRATION_TARGETS:this.phase==='validation'?VALIDATION_TARGETS:DRIFT_TARGETS}
 get target(){const t=this.targets[this.targetIndex]??[.5,.5];return {x:t[0]*window.innerWidth,y:t[1]*window.innerHeight}}
 get currentTiming(){return this.session?.timings.findLast(t=>t.paintingId===this.painting?.paintingId)}
 private get sceneDurationMs(){
   const session=this.session!;
   return session.pilot?.selectionRules.durationMsByPainting?.[session.order[this.trialIndex]]??session.config.durationSeconds*1000;
 }
 event(type:string,detail:unknown={}){if(!this.session)return;this.session.events.push({sessionId:this.session.sessionId,participantId:this.session.participantId,timeMs:this.clock(),type,phase:this.phase,paintingId:this.painting?.paintingId??null,detail:JSON.stringify(detail)})}
 saveSurvey(submitted=false){
   if(!this.session)return;
   if(submitted){void this.persist();return}
   try{writeCheckpoint(this.session,this.trialIndex)}catch{/* Persist below even if sessionStorage is unavailable. */}
   if(!this.draftTimer)this.draftTimer=setTimeout(()=>void this.persist(),300);
 }
 async persist(){if(this.draftTimer){clearTimeout(this.draftTimer);this.draftTimer=null}if(!this.session)return;try{
   try{writeCheckpoint(this.session,this.trialIndex)}catch{/* IndexedDB remains the durable copy if per-tab storage is unavailable. */}
   await saveSession(this.session);if(this.storageError){this.storageError='';this.emit()}}catch(e){this.storageError=String(e);this.pause('storage_error',false);this.emit()}}
 begin(config:StudyConfig,id:string,background:string|BackgroundAnswers,previewTrial?:PilotTrial){
  if(this.session?.status==='active')throw Error('已有进行中的会话');
  let copy:StudyConfig;
  let assignment:ParticipantAssignment|undefined;
  let pilot:PilotMetadata|undefined;
  if(config.pilotProtocol===PILOT_VERSION){
    const plan=buildPilotPlan(id,previewTrial);
    copy=structuredClone(config);
    if(!plan.every(({paintingId})=>copy.paintings.some(p=>p.paintingId===paintingId)))throw Error('缺少本轮指定的蹴鞠、马球或射箭材料');
    const seed=crypto.getRandomValues(new Uint32Array(1))[0];
    pilot={version:PILOT_VERSION,practice:id==='P00',...(previewTrial?{rehearsalMode:'single-scene' as const}:{}),seed,plan,selectionRules:config.pilotSurveyVersion?responsiveSelectionRules(copy.paintings,copy.durationSeconds):{...SELECTION_RULES}};
  }else{
    if(previewTrial!==undefined)throw Error('仅三条件研究中的 P00 可自选场景和讲解方式');
    if(!/^N0[1-6]$/.test(id))throw Error('匿名编号须为 N01–N06');
    ({config:copy,assignment}=resolveParticipantConfig(config,id));
  }
  const errors=validateConfig(copy);if(errors.length)throw Error(errors.join('\n'));
  const backgroundSnapshot=typeof background==='string'?undefined:freezeBackground(background);
  const sessionId=`${id}-${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomUUID().slice(0,8)}`;
  this.session={schemaVersion:1,sessionId,participantId:id,startedUtc:new Date().toISOString(),endedUtc:null,timeOrigin:performance.timeOrigin,status:'active',phase:'consent',mode:copy.mode,dataSource:'webgazer-camera',config:copy,order:pilot?pilot.plan.map(trial=>trial.paintingId):orderForParticipant(id,copy),...(pilot?{pilot,cardExposures:[]}:{}),...(assignment?{assignment}:{}),artBackground:typeof background==='string'?background:'',...(backgroundSnapshot?{background:backgroundSnapshot}:{}),calibrationVersion:0,quality:'pending',qualityNotes:[],dependencies:{webgazer:'3.5.3',react:'18.3.1',app:paperAppVersion(copy.paintings[0].materialVersion)??(copy.pilotSurveyVersion==='pilot2-uci-recall-v2'?'3.1.0':copy.pilotSurveyVersion?'2.1.1':pilot?'2.0.0':'1.5.0'),browser:navigator.userAgent},geometries:[],timings:[],validationSummaries:[],heatmap:{width:1000,kernelPx:30,opacity:.65,weight:'one-per-sample',normalization:'per-image-max',colorScale:'blue-cyan-yellow-red-v1'},scanpath:{...defaultScanpath},samples:[],events:[],responses:[],validation:[]};
  this.phase='consent';this.trialIndex=0;this.geometry=null;this.paused=false;this.requireCalibration=false;this.cardIndex=0;
  this.resetCardState();
  if(pilot)this.event('pilot_plan_assigned',{...pilot});
  if(assignment)this.event('participant_assignment_resolved',assignment);
  this.event('consent_confirmed');this.move('camera');this.lastTick=this.clock();this.lastPredictionAt=this.clock();
  this.startTimers();void this.persist();
 }
 private startTimers(){
   this.clearTimers();
   this.interval=setInterval(()=>this.tick(),100);
   this.persistTimer=setInterval(()=>{
     if(!this.inPilotQuestions)void this.persist();
   },1000);
 }
 private get inPilotQuestions(){return !!this.session?.config.pilotSurveyVersion&&(this.phase==='pre'||this.phase==='interview')}
 restorePilot(session:Session,checkpoint:PilotCheckpoint){
   if(this.session || session.status!=='active' || !session.config.pilotSurveyVersion ||
      session.sessionId!==checkpoint.sessionId || session.participantId!==checkpoint.participantId ||
      !Number.isInteger(checkpoint.trialIndex) || checkpoint.trialIndex<0 || checkpoint.trialIndex>=session.order.length)return false;
   this.pageTimeOffset=performance.timeOrigin-session.timeOrigin;
   this.session=session;
   this.trialIndex=checkpoint.trialIndex;
   this.phase=checkpoint.phase;
   session.phase=this.phase;
   session.pilotSurveys=checkpoint.surveys??session.pilotSurveys;
   session.responses=checkpoint.responses;
   const timing=checkpoint.timing;
   if(timing && session.timings.at(-1)?.trialId===timing.trialId)Object.assign(session.timings.at(-1)!,timing);
   const exposure=checkpoint.lastExposure;
   if(exposure && session.cardExposures?.at(-1)?.exposureId===exposure.exposureId)Object.assign(session.cardExposures.at(-1)!,exposure);
   const lastTime=Math.max(0,...[session.samples.at(-1)?.callbackTimeMs,session.events.at(-1)?.timeMs,session.cardExposures?.at(-1)?.shownMs].map(t=>t??0));
   for(const e of session.cardExposures??[])if(e.hiddenMs===null)e.hiddenMs=Math.max(e.shownMs,lastTime);
   if(timing?.status==='active'){
     const interrupted=session.timings.find(t=>t.trialId===timing.trialId);
     if(interrupted){interrupted.status='interrupted';interrupted.endedMs=Math.max(lastTime,interrupted.startedMs);interrupted.wallMs=interrupted.endedMs-interrupted.startedMs;}
     session.qualityNotes.push('观看期间刷新，本景保留先前试次，并在重新校准后重新展示。');
   }
   const priorPhase=this.phase;
   if(this.inPilotQuestions){this.reconnectAfterSurvey=true;}
   else {this.phase='camera'; session.phase='camera';}
   this.phaseStarted=this.lastTick=this.clock();
   this.adapter.setPhase(this.inPilotQuestions?'pilot_questionnaire':this.phase);
   this.event('pilot_resume_after_reload',{priorPhase,phase:this.phase,trialIndex:this.trialIndex,pageOffsetMs:this.pageTimeOffset});
   this.startTimers();void this.persist();this.emit();
   return true;
 }
 suspendForReload(){
   if(!this.session?.config.pilotSurveyVersion || this.session.status!=='active'){this.dispose();return}
   this.cardHidden();
   this.event('pilot_page_hidden_for_navigation');
   void this.persist();this.clearTimers();this.adapter.stop();
 }
 move(to:Phase){if(!this.session)return;if(this.phase!==to&&!canTransition(this.phase,to,this.session.pilot))throw Error(`非法阶段转换 ${this.phase} → ${to}`);this.event('phase_end',{to,durationMs:this.clock()-this.phaseStarted});this.phase=to;this.session.phase=to;this.phaseStarted=this.clock();this.adapter.setPhase(this.inPilotQuestions?'pilot_questionnaire':to);this.adapter.showPreview(to==='camera');this.event('phase_start');this.emit();void this.persist()}
 async startCamera(){if(!this.session)return;this.event('camera_requested');try{await this.adapter.start({regression:this.session.config.regression,kalman:this.session.config.kalman});this.adapter.showPreview(this.phase==='camera')}catch(e){this.camera={status:'error',message:String(e)};this.event('camera_error',{message:String(e)});this.emit()}}
 flowOnly(){if(!this.session)return;if(this.session.pilot&&!this.session.pilot.practice)throw Error('此编号需使用摄像头真实采集，请重新连接或结束本次记录。');this.session.quality='flow_only';this.session.qualityNotes.push('研究者选择仅流程试用；不能作为合格视线记录');this.event('flow_only');this.emit()}
 async calibrate(){if(!this.session)return;if(this.phase==='free_view')this.pause('recalibration_requested',true);else this.paused=true;
  if(this.phase==='free_view'){const t=this.currentTiming;if(t){t.status='interrupted';t.endedMs=this.clock();t.wallMs=t.endedMs-t.startedMs}if(this.session.quality!=='flow_only')this.session.quality='low_quality';this.session.qualityNotes.push('自由观看中重新校准，保留中断段并重复展示；存在重复曝光');this.event('trial_restart_required',{reason:'recalibration during viewing',retainsPreviousSamples:true})}
  try{await this.adapter.resetCalibration()}catch(e){if(this.session.quality!=='flow_only'){this.camera={status:'error',message:String(e)};this.emit();return}}
  this.paused=false;this.requireCalibration=false;this.session.calibrationVersion++;this.targetIndex=0;this.clicks=0;this.runId=crypto.randomUUID();this.targetStarted=this.clock();this.move('calibration');this.event('calibration_started',{version:this.session.calibrationVersion});
 }
 calibrationClick(){if(this.phase!=='calibration'||this.paused||!this.session)return;const target=this.target;
  if(this.session.quality!=='flow_only'&&!this.camera.faceDetected)return;
  try{if(this.session.quality!=='flow_only')this.adapter.train(target.x,target.y)}catch(e){this.event('calibration_training_error',String(e));this.camera={status:'error',message:String(e)};this.emit();return}
  this.validationRow(null,'calibration',true);this.clicks++;this.event('calibration_click',{target:this.targetIndex,click:this.clicks,...target,training:this.session.quality!=='flow_only'});
  if(this.clicks>=this.session.config.calibrationClicks){this.clicks=0;this.targetIndex++;this.targetStarted=this.clock();if(this.targetIndex>=CALIBRATION_TARGETS.length){this.startTargets('validation');return}}
  this.emit();
 }
 startTargets(kind:'validation'|'drift'){if(this.requireCalibration){void this.calibrate();return}this.paused=false;this.targetIndex=0;this.runId=crypto.randomUUID();this.targetStarted=this.clock();this.lastPredictionAt=this.clock();this.move(kind);this.event('target_presented',{runId:this.runId,targetId:'0',...this.target});}
 private validationRow(sample:InputSample|null,kind:ValidationRow['kind'],training=false){if(!this.session)return;const target=this.target;const valid=sample&&Number.isFinite(sample.x)&&Number.isFinite(sample.y);this.session.validation.push({sessionId:this.session.sessionId,participantId:this.session.participantId,paintingId:this.painting?.paintingId??null,kind,runId:this.runId,calibrationVersion:this.session.calibrationVersion,targetId:String(this.targetIndex),targetX:target.x,targetY:target.y,viewportWidth:window.innerWidth,viewportHeight:window.innerHeight,timeMs:sample?.callbackTimeMs??this.clock(),predictionX:sample?.x??null,predictionY:sample?.y??null,errorPx:valid?Math.hypot(sample!.x!-target.x,sample!.y!-target.y):null,settling:this.clock()-this.targetStarted<this.session.config.validation.settleMs,training:training&&this.session.quality!=='flow_only'})}
 tick(){if(!this.session||this.session.status!=='active'||this.inPilotQuestions)return;const now=this.clock();const dt=now-this.lastTick;this.lastTick=now;
  if(this.phase==='free_view'&&!this.paused&&this.session.quality!=='flow_only'&&now-this.lastPredictionAt>this.session.config.nullPauseMs){this.event('prediction_gap',{gapMs:now-this.lastPredictionAt});this.pause('sustained_no_prediction',false)}
  if(this.phase==='free_view'){
    const timing=this.currentTiming;
    if(timing){
      timing.wallMs=now-timing.startedMs;
      if(!this.paused)timing.activeMs+=dt;
      if(timing.activeMs>=this.sceneDurationMs && !this.paused){
        this.cardHidden();
        this.visibleDecision=null;
        timing.endedMs=now;timing.status='completed';this.geometry=null;
        this.move(this.session.pilot||this.session.config.questionnaireVersion===COMMON_QUESTIONNAIRE_VERSION?'pre':'familiarity');
      }else if(this.session.pilot&&!this.paused)this.scheduleCard(now);
    }
  }
  if((this.phase==='validation'||this.phase==='drift')&&!this.paused&&now-this.targetStarted>=this.session.config.validation.targetDurationMs){
   // Record empty targets explicitly; these rows are never gaze samples.
   this.validationRow(null,this.phase);this.targetIndex++;
   if(this.targetIndex>=this.targets.length){const kind=this.phase;const summary=summarizeValidation(this.session.validation.filter(r=>r.runId===this.runId),this.session.config.validation,this.targets.map((_,i)=>String(i)),this.runId,kind,this.session.calibrationVersion);this.session.validationSummaries.push(summary);this.event('validation_result',summary);this.move(kind==='validation'?'quality':'drift_result')}
   else{this.targetStarted=now;this.event('target_presented',{runId:this.runId,targetId:String(this.targetIndex),...this.target})}
  }
  this.emit();
 }
 acceptQuality(low:boolean){
  if(!this.session)return;
  if(this.phase!=='quality'&&this.phase!=='drift_result')throw Error('当前阶段不能确认验证结果');
  const latest=this.session.validationSummaries.at(-1);
  if(!latest)throw Error('没有验证记录，请重新验证');
  if(latest.status==='fail'&&!low)throw Error('验证未通过；请重新校准，或明确保留低质量标记后继续');
  if(this.session.pilot&&!this.session.pilot.practice && !latest.targets.some(target=>target.n>0)){
    throw Error('本次检查没有有效摄像头预测，请重试校准或退出并保留记录。');
  }
  const notes=validationExplanation(latest,this.session.config.validation);
  let decision:'accepted'|'unassessed'|'low_quality';
  if(latest.status==='judgment'){
   decision='unassessed';
   // No frozen error criterion is an unknown outcome, never a failure or a pass.
   this.session.qualityNotes.push(`${this.phase}: 未设置误差合格线，质量未判定；研究者选择继续记录`);
  }else if(low){
   decision='low_quality';
   if(this.session.quality!=='flow_only')this.session.quality='low_quality';
   this.session.qualityNotes.push(`${this.phase}: ${notes.join('；')}；研究者保留未通过标记继续`);
  }else{
   decision='accepted';
   if(this.session.quality==='pending')this.session.quality='accepted';
  }
  this.event('researcher_quality_decision',{decision,low:decision==='low_quality',reasons:notes,summary:latest});
  if(this.phase==='quality')this.startTargets('drift');else if(this.requireCalibration)void this.calibrate();else this.move('loading_image');
 }

 private resetCardState(){
  this.cardHidden();
  this.slotChoices.clear();
  this.visibleDecision=null;
  this.visibleUntilActiveMs=0;
  this.deck=[];
  this.windowResetMs=this.clock();
 }
 private scheduleCard(now:number){
  const session=this.session!;
  const timing=this.currentTiming!;
  const painting=this.painting!;
  const condition=this.trialCondition!;
  const rules=session.pilot!.selectionRules;
  const count=this.windows.length;
  const index=this.windows.findIndex(window=>timing.activeMs<window.end);
  if(index<0){this.visibleDecision=null;return}
  const window=this.windows[index];
  const withinSlot=timing.activeMs-window.start;
  const slot=index+1;
  const selected=this.slotChoices.get(slot);
  if(selected){
    this.visibleDecision=timing.activeMs<this.visibleUntilActiveMs?selected:null;
    return;
  }
  this.visibleDecision=null;
  const deadline=window.reveal-window.start;
  const beforeDeadline=withinSlot<deadline;
  if(beforeDeadline && (!rules.maximumSelectionMs || condition!=='gaze' || slot===count || withinSlot<rules.minimumDwellMs))return;
  const validation=session.validationSummaries.findLast(s=>s.kind==='validation'&&s.calibrationVersion===session.calibrationVersion);
  const drift=session.validationSummaries.findLast(s=>s.kind==='drift'&&s.calibrationVersion===session.calibrationVersion);
  const qualityOK=session.quality!=='flow_only' && validation?.status==='pass' && drift?.status==='pass';
  const choice=selectCard({condition,painting,slot,deck:this.deck,priorIds:[...this.slotChoices.values()].map(d=>d.cardId),
    samples:session.samples,trialId:timing.trialId,now,windowStart:Math.max(this.windowResetMs,now-withinSlot),qualityOK,rules});
  if(!choice || (beforeDeadline && choice.selectionSource!=='gaze'))return;
  this.slotChoices.set(slot,choice);
  this.visibleSinceActiveMs=timing.activeMs;
  // Advance the end along with the onset so an early gaze trigger never buys
  // extra reading time. The remaining blank time is carried at the slot's end.
  this.visibleUntilActiveMs=window.end-Math.max(0,deadline-withinSlot);
  this.visibleDecision=choice;
  this.event('card_selected',{...choice,condition,trialId:timing.trialId,activeMs:timing.activeMs,plannedEndActiveMs:this.visibleUntilActiveMs});
 }
 /** Called in a layout effect after the card has a measurable viewport rectangle. */
 cardShown(rect:CardRect,cardId?:string,entranceMs?:number,entranceRect?:CardRect,illustration?:{layout:PaperGuideLayout;reducedMotion:boolean}){
  const session=this.session;
  const card=this.activeCard;
  if(!session?.pilot||!this.geometry||!card||!this.visibleDecision||(cardId&&cardId!==card.id))return;
  if(![rect.left,rect.top,rect.width,rect.height].every(Number.isFinite)||rect.width<=0||rect.height<=0)return;
  const old=this.openExposure;
  if(old && old.cardId===card.id && old.rect.left===rect.left && old.rect.top===rect.top && old.rect.width===rect.width && old.rect.height===rect.height)return old;
  this.cardHidden();
  const now=this.clock();
  const activeStartMs=this.currentTiming!.activeMs+Math.max(0,now-this.lastTick);
  const durationMs=Math.max(1,this.visibleUntilActiveMs-this.visibleSinceActiveMs);
  const paper=illustration?{...illustration,durationMs,offsetMs:Math.min(durationMs,Math.max(0,activeStartMs-this.visibleSinceActiveMs))}:undefined;
  const exposure:CardExposure={...structuredClone(this.visibleDecision),...(paper?{paper}:{}),...(entranceMs===undefined?{}:{entranceMs,entranceRect}),exposureId:crypto.randomUUID(),trialId:this.currentTiming!.trialId,
    paintingId:this.painting!.paintingId,condition:this.trialCondition!,geometryVersion:this.geometry.version,calibrationVersion:session.calibrationVersion,
    activeStartMs,shownMs:now,hiddenMs:null,
    rect:{left:rect.left,top:rect.top,width:rect.width,height:rect.height}};
  this.openExposure=exposure;session.cardExposures!.push(exposure);
  this.event('card_shown',{exposureId:exposure.exposureId,slot:exposure.slot,cardId:card.id,rect:exposure.rect,trialId:exposure.trialId});
  return exposure;
 }
 exposureTime(exposure:CardExposure){return this.clock()-exposure.shownMs}
 arrowLanded(exposure:CardExposure){
  if(exposure!==this.openExposure||!exposure.paper||exposure.paper.arrowLandedAtMs!==undefined)return;
  const wasSeen=this.session?.cardExposures?.some(e=>e.trialId===exposure.trialId&&e.paper?.arrowLandedAtMs!==undefined);
  exposure.paper.arrowLandedAtMs=this.clock();
  if(!wasSeen)this.event('arrow_landed',{trialId:exposure.trialId,cardId:exposure.cardId,exposureId:exposure.exposureId});
 }
 cardHidden(cardId?:string){
  const exposure=this.openExposure;
  if(!exposure||(cardId&&exposure.cardId!==cardId))return;
  exposure.hiddenMs=Math.max(exposure.shownMs,this.clock());
  this.openExposure=null;
  this.event('card_hidden',{exposureId:exposure.exposureId,cardId:exposure.cardId,trialId:exposure.trialId});
 }
 imageReady(geometry:Geometry){if(this.phase!=='loading_image'||!this.session)return;
  this.resetCardState();
  if(this.pageTimeOffset)geometry={...geometry,timeMs:geometry.timeMs+this.pageTimeOffset};
  if(this.session.pilot){
    this.deck=cardPermutation(this.painting!.cards.map(card=>card.id),this.session.pilot.seed,this.painting!.paintingId);
    this.windows=cardWindows(this.painting!,this.trialCondition!,this.session.pilot.selectionRules,this.sceneDurationMs);
  }
  this.geometry=geometry;this.session.geometries.push(geometry);this.event('image_decoded_and_presented',{geometry,browserFrameEvent:'requestAnimationFrame after decode; not hardware onset'});const now=this.clock();this.session.timings.push({trialId:`${this.session.sessionId}-${this.trialIndex+1}-a${this.session.timings.filter(t=>t.paintingId===this.painting!.paintingId).length+1}`,paintingId:this.painting!.paintingId,startedMs:now,endedMs:null,wallMs:0,activeMs:0,status:'active'});this.lastTick=now;this.lastPredictionAt=now;this.paused=false;this.move('free_view');if(document.hidden||!document.hasFocus())this.pause('not_focused_at_presentation',false)}
 sample(input:InputSample){if(!this.session||this.session.status!=='active'||this.inPilotQuestions)return;
  if(this.pageTimeOffset)input={...input,callbackTimeMs:input.callbackTimeMs+this.pageTimeOffset};this.lastCallbackAt=input.callbackTimeMs;const predictionAvailable=Number.isFinite(input.x)&&Number.isFinite(input.y);if(predictionAvailable)this.lastPredictionAt=input.callbackTimeMs;
  const geometry=this.phase==='free_view'?this.geometry:null;
  const point=mapPoint(input.x,input.y,geometry);
  const exposure=this.openExposure;
  const exposedCard=exposure?this.painting?.cards.find(c=>c.id===exposure.cardId):undefined;
  const pilotFields=this.session.pilot && this.phase==='free_view'?{
    condition:this.trialCondition,cardExposureId:exposure?.exposureId??null,cardId:exposure?.cardId??null,
    onCard:!this.paused&&exposure&&exposedCard&&predictionAvailable?cardHitAt(input.x!,input.y!,exposure,input.callbackTimeMs,exposedCard):null,
    imageAoiId:!this.paused&&point.insideImage?singleAoi(point.imageNormX,point.imageNormY,this.painting!.aois,!!this.session.pilot!.selectionRules.maximumSelectionMs):null,
    trialActiveMs:this.currentTiming!.activeMs+(!this.paused?Math.max(0,input.callbackTimeMs-this.lastTick):0),
  }:{};
  this.session.samples.push({sessionId:this.session.sessionId,participantId:this.session.participantId,paintingId:this.painting?.paintingId??null,trialId:this.currentTiming?.trialId??null,phase:this.phase,sampleIndex:this.session.samples.length,callbackTimeMs:input.callbackTimeMs,libraryElapsedMs:input.libraryElapsedMs,viewportX:input.x,viewportY:input.y,...point,...pilotFields,predictionAvailable,geometryVersion:geometry?.version??null,calibrationVersion:this.session.calibrationVersion,paused:this.paused,confidence:null});
  if(!this.paused&&(this.phase==='validation'||this.phase==='drift'))this.validationRow(input,this.phase);
 }
 pause(reason:string,recalibrate:boolean){if(!this.session||this.session.status!=='active')return;if(!['free_view','calibration','validation','drift','loading_image'].includes(this.phase))return;this.requireCalibration ||= recalibrate;if(!this.paused){if(this.phase==='free_view'&&this.currentTiming){const now=this.clock();this.currentTiming.activeMs+=Math.max(0,now-this.lastTick);this.lastTick=now;}this.cardHidden();this.paused=true;this.pauseReason=reason;this.event('pause',{reason,recalibrate});void this.persist();this.emit()}}
 environmentChange(reason:string){if(this.session&&this.session.calibrationVersion>0&&reason==='resize')this.requireCalibration=true;this.event('environment_change',{reason,width:window.innerWidth,height:window.innerHeight,dpr:window.devicePixelRatio});this.pause(reason,reason==='resize'||reason==='camera_disconnected')}
 resume(){if(!this.session||!this.paused||this.requireCalibration)return;if(document.hidden||!document.hasFocus())return;
  if(this.phase==='free_view'&&this.session.quality!=='flow_only'&&(this.camera.status==='error'||this.clock()-this.lastPredictionAt>1500))return;
  if(this.phase==='validation'||this.phase==='drift'){// Restart this validation run; old observations remain with original run id.
   this.event('validation_run_abandoned',{runId:this.runId,reason:this.pauseReason});const kind=this.phase;this.paused=false;this.targetIndex=0;this.runId=crypto.randomUUID();this.targetStarted=this.clock();this.event('validation_run_restart',{kind,runId:this.runId});
  }else this.paused=false;this.lastTick=this.clock();this.windowResetMs=this.lastTick;if(this.session.pilot&&this.phase==='free_view')this.scheduleCard(this.lastTick);this.event('resume',{reason:this.pauseReason});this.pauseReason='';this.emit()
 }
 response(row:Pick<ResponseRow,'questionId'|'answer'|'confidence'|'unknown'|'skipped'|'selectedOptions'|'otherText'>,durationMs:number){if(!this.session)return;this.session.responses.push({...structuredClone(row),sessionId:this.session.sessionId,participantId:this.session.participantId,paintingId:this.phase==='interview'?null:this.painting?.paintingId??null,phase:this.phase,durationMs,timeMs:this.clock()});void this.persist()}
 next(){
  if(this.phase==='pre'&&this.session?.pilot){
    if(this.trialIndex<this.session.pilot.plan.length-1){this.trialIndex++;this.geometry=null;if(this.reconnectAfterSurvey){this.reconnectAfterSurvey=false;this.move('camera')}else this.startTargets('drift')}
    else if(this.session.pilot.rehearsalMode==='single-scene')this.complete();
    else{this.adapter.stop();this.move('interview')}
    return;
  }
  switch(this.phase){case'familiarity':this.move('pre');break;case'pre':this.cardIndex=0;this.move('cards');break;case'cards':this.cardIndex++;if(this.cardIndex>=2)this.move('post');else{this.phaseStarted=this.clock();this.emit()}break;case'post':if(this.trialIndex===0){this.trialIndex++;this.geometry=null;if(this.reconnectAfterSurvey){this.reconnectAfterSurvey=false;this.move('camera')}else this.startTargets('drift')}else if(this.session?.config.questionnaireVersion===COMMON_QUESTIONNAIRE_VERSION)this.complete();else{this.adapter.stop();this.move('interview')}break;case'interview':this.complete();break}}
 complete(){if(!this.session)return;this.move('completed');this.session.status='completed';this.session.endedUtc=new Date().toISOString();this.adapter.stop();this.clearTimers();void this.persist();this.emit()}
 interrupt(reason='researcher_exit'){if(!this.session||this.session.status!=='active')return;this.cardHidden();this.visibleDecision=null;this.event('interrupted',{reason});const t=this.currentTiming;if(t?.status==='active'){if(!this.paused){t.activeMs+=Math.max(0,this.clock()-this.lastTick);this.lastTick=this.clock();}t.status='interrupted';t.endedMs=this.clock();t.wallMs=t.endedMs-t.startedMs}this.session.status='interrupted';this.session.phase='interrupted';this.phase='interrupted';this.session.endedUtc=new Date().toISOString();this.adapter.stop();this.clearTimers();void this.persist();this.emit()}
 private clearTimers(){if(this.draftTimer)clearTimeout(this.draftTimer);this.draftTimer=null;if(this.interval)clearInterval(this.interval);if(this.persistTimer)clearInterval(this.persistTimer);this.interval=null;this.persistTimer=null}
 dispose(){if(this.disposed)return;this.disposed=true;this.interrupt('page_exit');this.adapter.stop();this.clearTimers();this.listeners.clear()}
}
