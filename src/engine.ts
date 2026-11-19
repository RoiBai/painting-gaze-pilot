import type {Session,StudyConfig,Phase,Geometry,ResponseRow,ValidationRow,BackgroundAnswers, ParticipantAssignment, CardDecision, CardExposure, CardRect, PilotMetadata} from './types';
import {WebGazerAdapter} from './webgazerAdapter';
import {saveSession} from './storage';
import {mapPoint} from './geometry';
import {summarizeValidation} from './validation';
import {orderForParticipant,canTransition} from './machine';
import {defaultScanpath} from './scanpath';
import {validateConfig} from './study';
import {validationExplanation} from './quality';
import {resolveParticipantConfig} from './assignment';
import {freezeBackground} from './background';
import {COMMON_QUESTIONNAIRE_VERSION} from './commonQuestionnaire';
import {buildPilotPlan,cardPermutation,hitRect,PILOT_VERSION,SELECTION_RULES,selectCard,singleAoi} from './pilotProtocol';

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
 private visibleDecision:CardDecision|null=null;
 private openExposure:CardExposure|null=null;
 private windowResetMs=0;
 private deck:string[]=[];
 private clock:()=>number; private runId=''; private targetStarted=0; private lastTick=0; private phaseStarted=0; private interval:ReturnType<typeof setInterval>|null=null; private persistTimer:ReturnType<typeof setInterval>|null=null; private disposed=false;
 constructor(factory?:(sample:(s:InputSample)=>void,status:(s:CameraState)=>void)=>Adapter, clock=()=>performance.now()){
  this.clock=clock; this.adapter=(factory??((s,c)=>new WebGazerAdapter(s,c)))(s=>this.sample(s),s=>{this.camera=s;this.event('camera_status',s);if(s.status==='error'){if(this.session?.calibrationVersion)this.requireCalibration=true;this.pause('camera_error',true);}this.emit()});
 }
 subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn)}};
 snapshot=()=>this.revision;
 emit(){this.revision++;this.listeners.forEach(fn=>fn())}
 get painting(){return this.session?.config.paintings.find(p=>p.paintingId===this.session?.order[this.trialIndex])??null}
 get activeCard(){
  if(this.phase!=='free_view'||this.paused||!this.visibleDecision)return null;
  return this.painting?.cards.find(card=>card.id===this.visibleDecision!.cardId)??null;
 }
 private get trialCondition(){return this.session?.pilot?.plan[this.trialIndex]?.condition}
 get targets(){return this.phase==='calibration'?CALIBRATION_TARGETS:this.phase==='validation'?VALIDATION_TARGETS:DRIFT_TARGETS}
 get target(){const t=this.targets[this.targetIndex]??[.5,.5];return {x:t[0]*window.innerWidth,y:t[1]*window.innerHeight}}
 get currentTiming(){return this.session?.timings.findLast(t=>t.paintingId===this.painting?.paintingId)}
 event(type:string,detail:unknown={}){if(!this.session)return;this.session.events.push({sessionId:this.session.sessionId,participantId:this.session.participantId,timeMs:this.clock(),type,phase:this.phase,paintingId:this.painting?.paintingId??null,detail:JSON.stringify(detail)})}
 async persist(){if(!this.session||this.session.pilot?.practice)return;try{await saveSession(this.session);if(this.storageError){this.storageError='';this.emit()}}catch(e){this.storageError=String(e);this.pause('storage_error',false);this.emit()}}
 begin(config:StudyConfig,id:string,background:string|BackgroundAnswers){
  if(this.session?.status==='active')throw Error('已有进行中的会话');
  let copy:StudyConfig;
  let assignment:ParticipantAssignment|undefined;
  let pilot:PilotMetadata|undefined;
  if(config.pilotProtocol===PILOT_VERSION){
    const plan=buildPilotPlan(id);
    copy=structuredClone(config);
    if(!plan.every(({paintingId})=>copy.paintings.some(p=>p.paintingId===paintingId)))throw Error('缺少本轮指定的蹴鞠、马球或射箭材料');
    const seed=crypto.getRandomValues(new Uint32Array(1))[0];
    pilot={version:PILOT_VERSION,practice:id==='P00',seed,plan,selectionRules:{...SELECTION_RULES}};
  }else{
    if(!/^N0[1-6]$/.test(id))throw Error('匿名编号须为 N01–N06');
    ({config:copy,assignment}=resolveParticipantConfig(config,id));
  }
  const errors=validateConfig(copy);if(errors.length)throw Error(errors.join('\n'));
  const backgroundSnapshot=typeof background==='string'?undefined:freezeBackground(background);
  const sessionId=`${id}-${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomUUID().slice(0,8)}`;
  this.session={schemaVersion:1,sessionId,participantId:id,startedUtc:new Date().toISOString(),endedUtc:null,timeOrigin:performance.timeOrigin,status:'active',phase:'consent',mode:copy.mode,dataSource:'webgazer-camera',config:copy,order:pilot?pilot.plan.map(trial=>trial.paintingId):orderForParticipant(id,copy),...(pilot?{pilot,cardExposures:[]}:{}),...(assignment?{assignment}:{}),artBackground:typeof background==='string'?background:'',...(backgroundSnapshot?{background:backgroundSnapshot}:{}),calibrationVersion:0,quality:'pending',qualityNotes:[],dependencies:{webgazer:'3.5.3',react:'18.3.1',app:pilot?'2.0.0':'1.5.0',browser:navigator.userAgent},geometries:[],timings:[],validationSummaries:[],heatmap:{width:1000,kernelPx:30,opacity:.65,weight:'one-per-sample',normalization:'per-image-max',colorScale:'blue-cyan-yellow-red-v1'},scanpath:{...defaultScanpath},samples:[],events:[],responses:[],validation:[]};
  this.phase='consent';this.trialIndex=0;this.geometry=null;this.paused=false;this.requireCalibration=false;this.cardIndex=0;
  this.resetCardState();
  if(pilot)this.event('pilot_plan_assigned',{...pilot});
  if(assignment)this.event('participant_assignment_resolved',assignment);
  this.event('consent_confirmed');this.move('camera');this.lastTick=this.clock();this.lastPredictionAt=this.clock();
  this.interval=setInterval(()=>this.tick(),100); if(!pilot?.practice)this.persistTimer=setInterval(()=>void this.persist(),1000);void this.persist();
 }
 move(to:Phase){if(!this.session)return;if(this.phase!==to&&!canTransition(this.phase,to))throw Error(`非法阶段转换 ${this.phase} → ${to}`);this.event('phase_end',{to,durationMs:this.clock()-this.phaseStarted});this.phase=to;this.session.phase=to;this.phaseStarted=this.clock();this.adapter.setPhase(to);this.adapter.showPreview(to==='camera');this.event('phase_start');this.emit();void this.persist()}
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
 tick(){if(!this.session||this.session.status!=='active')return;const now=this.clock();const dt=now-this.lastTick;this.lastTick=now;
  if(this.phase==='free_view'&&!this.paused&&this.session.quality!=='flow_only'&&now-this.lastPredictionAt>this.session.config.nullPauseMs){this.event('prediction_gap',{gapMs:now-this.lastPredictionAt});this.pause('sustained_no_prediction',false)}
  if(this.phase==='free_view'){
    const timing=this.currentTiming;
    if(timing){
      timing.wallMs=now-timing.startedMs;
      if(!this.paused)timing.activeMs+=dt;
      if(timing.activeMs>=this.session.config.durationSeconds*1000 && !this.paused){
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
  this.deck=[];
  this.windowResetMs=this.clock();
 }
 private scheduleCard(now:number){
  const session=this.session!;
  const timing=this.currentTiming!;
  const painting=this.painting!;
  const condition=this.trialCondition!;
  const slotLength=session.config.durationSeconds*1000/SELECTION_RULES.slots;
  const index=Math.floor(timing.activeMs/slotLength);
  const withinSlot=timing.activeMs-index*slotLength;
  if(withinSlot<slotLength*SELECTION_RULES.blankFraction){
    this.visibleDecision=null;return;
  }
  const slot=index+1;
  let decision=this.slotChoices.get(slot);
  if(!decision){
    const validation=session.validationSummaries.findLast(s=>s.kind==='validation'&&s.calibrationVersion===session.calibrationVersion);
    const drift=session.validationSummaries.findLast(s=>s.kind==='drift'&&s.calibrationVersion===session.calibrationVersion);
    const qualityOK=session.quality!=='flow_only' && validation?.status==='pass' && drift?.status==='pass';
    const choice=selectCard({condition,painting,slot,deck:this.deck,priorIds:[...this.slotChoices.values()].map(d=>d.cardId),
      samples:session.samples,trialId:timing.trialId,now,windowStart:Math.max(this.windowResetMs,now-withinSlot),qualityOK});
    if(!choice)return;
    decision=choice;this.slotChoices.set(slot,choice);
    this.event('card_selected',{...choice,condition,trialId:timing.trialId,activeMs:timing.activeMs});
  }
  this.visibleDecision=decision;
 }
 /** Called in a layout effect after the card has a measurable viewport rectangle. */
 cardShown(rect:CardRect,cardId?:string){
  const session=this.session;
  const card=this.activeCard;
  if(!session?.pilot||!this.geometry||!card||!this.visibleDecision||(cardId&&cardId!==card.id))return;
  if(![rect.left,rect.top,rect.width,rect.height].every(Number.isFinite)||rect.width<=0||rect.height<=0)return;
  const old=this.openExposure;
  if(old && old.cardId===card.id && old.rect.left===rect.left && old.rect.top===rect.top && old.rect.width===rect.width && old.rect.height===rect.height)return;
  this.cardHidden();
  const now=this.clock();
  const exposure:CardExposure={...structuredClone(this.visibleDecision),exposureId:crypto.randomUUID(),trialId:this.currentTiming!.trialId,
    paintingId:this.painting!.paintingId,condition:this.trialCondition!,geometryVersion:this.geometry.version,calibrationVersion:session.calibrationVersion,
    activeStartMs:this.currentTiming!.activeMs+Math.max(0,now-this.lastTick),shownMs:now,hiddenMs:null,
    rect:{left:rect.left,top:rect.top,width:rect.width,height:rect.height}};
  this.openExposure=exposure;session.cardExposures!.push(exposure);
  this.event('card_shown',{exposureId:exposure.exposureId,slot:exposure.slot,cardId:card.id,rect:exposure.rect,trialId:exposure.trialId});
 }
 cardHidden(cardId?:string){
  const exposure=this.openExposure;
  if(!exposure||(cardId&&exposure.cardId!==cardId))return;
  exposure.hiddenMs=Math.max(exposure.shownMs,this.clock());
  this.openExposure=null;
  this.event('card_hidden',{exposureId:exposure.exposureId,cardId:exposure.cardId,trialId:exposure.trialId});
 }
 discardPractice(){
  if(!this.session?.pilot?.practice)return;
  if(this.session.status==='active')this.interrupt('discard_practice');
  this.clearTimers();this.adapter.stop();this.resetCardState();
  this.session=null;this.geometry=null;this.phase='consent';this.paused=false;
  this.emit();
 }

 imageReady(geometry:Geometry){if(this.phase!=='loading_image'||!this.session)return;
  this.resetCardState();
  if(this.session.pilot)this.deck=cardPermutation(this.painting!.cards.map(card=>card.id),this.session.pilot.seed,this.painting!.paintingId);
  this.geometry=geometry;this.session.geometries.push(geometry);this.event('image_decoded_and_presented',{geometry,browserFrameEvent:'requestAnimationFrame after decode; not hardware onset'});const now=this.clock();this.session.timings.push({trialId:`${this.session.sessionId}-${this.trialIndex+1}-a${this.session.timings.filter(t=>t.paintingId===this.painting!.paintingId).length+1}`,paintingId:this.painting!.paintingId,startedMs:now,endedMs:null,wallMs:0,activeMs:0,status:'active'});this.lastTick=now;this.lastPredictionAt=now;this.paused=false;this.move('free_view');if(document.hidden||!document.hasFocus())this.pause('not_focused_at_presentation',false)}
 sample(input:InputSample){if(!this.session||this.session.status!=='active')return;this.lastCallbackAt=input.callbackTimeMs;const predictionAvailable=Number.isFinite(input.x)&&Number.isFinite(input.y);if(predictionAvailable)this.lastPredictionAt=input.callbackTimeMs;
  const geometry=this.phase==='free_view'?this.geometry:null;
  const point=mapPoint(input.x,input.y,geometry);
  const exposure=this.openExposure;
  const pilotFields=this.session.pilot && this.phase==='free_view'?{
    condition:this.trialCondition,cardExposureId:exposure?.exposureId??null,cardId:exposure?.cardId??null,
    onCard:!this.paused&&exposure&&predictionAvailable?hitRect(input.x!,input.y!,exposure.rect):null,
    imageAoiId:!this.paused&&point.insideImage?singleAoi(point.imageNormX,point.imageNormY,this.painting!.aois):null,
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
    if(this.trialIndex<this.session.pilot.plan.length-1){this.trialIndex++;this.geometry=null;this.startTargets('drift')}
    else{this.adapter.stop();this.move('interview')}
    return;
  }
  switch(this.phase){case'familiarity':this.move('pre');break;case'pre':this.cardIndex=0;this.move('cards');break;case'cards':this.cardIndex++;if(this.cardIndex>=2)this.move('post');else{this.phaseStarted=this.clock();this.emit()}break;case'post':if(this.trialIndex===0){this.trialIndex++;this.geometry=null;this.startTargets('drift')}else if(this.session?.config.questionnaireVersion===COMMON_QUESTIONNAIRE_VERSION)this.complete();else{this.adapter.stop();this.move('interview')}break;case'interview':this.complete();break}}
 complete(){if(!this.session)return;this.move('completed');this.session.status='completed';this.session.endedUtc=new Date().toISOString();this.adapter.stop();this.clearTimers();void this.persist();this.emit()}
 interrupt(reason='researcher_exit'){if(!this.session||this.session.status!=='active')return;this.cardHidden();this.visibleDecision=null;this.event('interrupted',{reason});const t=this.currentTiming;if(t?.status==='active'){if(!this.paused){t.activeMs+=Math.max(0,this.clock()-this.lastTick);this.lastTick=this.clock();}t.status='interrupted';t.endedMs=this.clock();t.wallMs=t.endedMs-t.startedMs}this.session.status='interrupted';this.session.phase='interrupted';this.phase='interrupted';this.session.endedUtc=new Date().toISOString();this.adapter.stop();this.clearTimers();void this.persist();this.emit()}
 private clearTimers(){if(this.interval)clearInterval(this.interval);if(this.persistTimer)clearInterval(this.persistTimer);this.interval=null;this.persistTimer=null}
 dispose(){if(this.disposed)return;this.disposed=true;this.interrupt('page_exit');this.adapter.stop();this.clearTimers();this.listeners.clear()}
}
