export type Phase = 'consent'|'camera'|'calibration'|'validation'|'quality'|'drift'|'drift_result'|'loading_image'|'free_view'|'familiarity'|'pre'|'cards'|'post'|'interview'|'completed'|'interrupted';
export interface AOI {id:string;label:string;rect:[number,number,number,number];hitRects?:AOI['rect'][]}
export interface Question {ratingScale?:{min:number;max:number;step:number;lowLabel:string;highLabel:string};id:string;prompt:string;scoring:string;type?:'text'|'multi-select';description?:string;optional?:boolean;options?:{id:string;label:string;exclusive?:boolean}[];otherOptionId?:string;analysisRole?:'spontaneous'|'prompted'|'classification'|'card-feedback';confidence?:boolean;allowUnknown?:boolean}
export type ParticipantPlanVersion = 'crossed-four-v1'|'common-four-v2';
export type QuestionVariant = 'alpha'|'beta'|'common';
export interface BackgroundAnswers {studyField:string;artEducation:'none'|'short'|'long';paintingInterest:1|2|3|4|5}
export interface BackgroundQuestion {id:keyof BackgroundAnswers;prompt:string;options?:{id:string;label:string}[];scale?:{min:number;max:number;minLabel:string;maxLabel:string}}
export interface ParticipantBackground {version:string;answers:BackgroundAnswers;questions:BackgroundQuestion[]}
export interface ParticipantAssignment {planVersion:ParticipantPlanVersion;participantId:string;order:'AB'|'BA';questionVariant:QuestionVariant;questionVersion:string;paintingOrder:string[]}
export interface CutoutArt { image:string; board:string; glow:string; shape?:{width:number;height:number;cols:number;rows:number;bits:string} }
export interface Painting {recallQuestions?:RecallQuestion[];crop?:{sourceImage:string;sourceWidth:number;sourceHeight:number;rect:[number,number,number,number];sourceSha256:string};paintingId:string;image:string;width:number;height:number;title:string;source:string;materialVersion:string;verified:boolean;placeholder:boolean;aois:AOI[];relations:{id:string;text:string;aoiIds:string[];source:string}[];pre:Question[];post:Question[];cards:{id:string;title:string;location:string;text:string;source:string;aoiIds:string[];art?:CutoutArt}[];interview:string[]}
export type PilotSurveyVersion = 'pilot2-recall-v1' | 'pilot2-uci-recall-v2';
export interface StudyConfig {pilotSurveyVersion?:PilotSurveyVersion;pilotProtocol?:'three-condition-v1';version:string;mode:'preview'|'research';durationSeconds:number;order:'alternate'|'AB'|'BA';participantPlan?:ParticipantPlanVersion;questionnaireVersion?:'common-viewing-v1';regression:'ridge'|'weightedRidge';kalman:boolean;displayMode:'window'|'fullscreen';validation:{maxTargetMedianErrorPx?:number|null;maxMedianErrorPx:number|null;maxErrorDiagonalRatio:number|null;minSamplesPerTarget:number;targetDurationMs:number;settleMs:number};nullPauseMs:number;calibrationClicks:number;paintings:Painting[];copy:{intro:string;consent:string;freeView:string;interview:string}}
export interface Geometry {version:number;paintingId:string;timeMs:number;viewportWidth:number;viewportHeight:number;dpr:number;naturalWidth:number;naturalHeight:number;left:number;top:number;width:number;height:number;scale:number}
export interface GazeSample {condition?:Condition;cardExposureId?:string|null;cardId?:string|null;onCard?:boolean|null;imageAoiId?:string|null;trialActiveMs?:number|null;sessionId:string;participantId:string;paintingId:string|null;trialId:string|null;phase:Phase;sampleIndex:number;callbackTimeMs:number;libraryElapsedMs:number|null;viewportX:number|null;viewportY:number|null;imageX:number|null;imageY:number|null;imageNormX:number|null;imageNormY:number|null;predictionAvailable:boolean;insideImage:boolean;geometryVersion:number|null;calibrationVersion:number;paused:boolean;confidence:null}
export interface PhaseEvent {sessionId:string;participantId:string;timeMs:number;type:string;phase:Phase;paintingId:string|null;detail:string}
export interface ResponseRow {sessionId:string;participantId:string;paintingId:string|null;phase:Phase;questionId:string;answer:string;confidence:number|null;unknown:boolean;skipped:boolean;durationMs:number|null;timeMs:number;selectedOptions?:string[];otherText?:string}
export interface ValidationRow {sessionId:string;participantId:string;paintingId:string|null;kind:'calibration'|'validation'|'drift';runId:string;calibrationVersion:number;targetId:string;targetX:number;targetY:number;viewportWidth:number;viewportHeight:number;timeMs:number;predictionX:number|null;predictionY:number|null;errorPx:number|null;settling:boolean;training:boolean}
export interface ValidationSummary {runId:string;kind:'validation'|'drift';targets:{targetId:string;n:number;medianErrorPx:number|null}[];medianErrorPx:number|null;errorDiagonalRatio:number|null;status:'pass'|'fail'|'judgment';calibrationVersion:number}
export interface HeatmapParameters {width:number;kernelPx:number;opacity:number;weight:'one-per-sample';normalization:'per-image-max';colorScale:string}
export interface ScanpathParameters {width:number;opacity:number;lineWidth:number;pointRadius:number;displayIntervalMs:number;maxGapMs:number;numberEvery:number;colorScale:'time-blue-orange-v1'}
export interface TrialTiming {trialId:string;paintingId:string;startedMs:number;endedMs:number|null;wallMs:number;activeMs:number;status:'active'|'completed'|'interrupted'}
export interface Session {pilotSurveys?:Record<string,PilotSceneSurvey>;pilot?:PilotMetadata;cardExposures?:CardExposure[];coordinateSource?:'raw'|'reference-corrected';assignment?:ParticipantAssignment;background?:ParticipantBackground;schemaVersion:1;sessionId:string;participantId:string;startedUtc:string;endedUtc:string|null;timeOrigin:number;status:'active'|'completed'|'interrupted';phase:Phase;mode:'preview'|'research';dataSource:'webgazer-camera';config:StudyConfig;order:string[];artBackground:string;calibrationVersion:number;quality:'pending'|'accepted'|'low_quality'|'flow_only';qualityNotes:string[];dependencies:Record<string,string>;geometries:Geometry[];timings:TrialTiming[];validationSummaries:ValidationSummary[];heatmap:HeatmapParameters;scanpath?:ScanpathParameters;samples:GazeSample[];events:PhaseEvent[];responses:ResponseRow[];validation:ValidationRow[]}

export type Condition = 'sequential'|'random'|'gaze';
export interface PilotTrial {paintingId:string; condition:Condition}
export interface PilotMetadata {
  version:'three-condition-v1';
  practice:boolean;
  rehearsalMode?:'single-scene';
  plan:PilotTrial[];
  seed:number;
  selectionRules:{
    minimumDwellMs:number;
    minimumSamples:number;
    maximumGapMs:number;
    lookbackMs:number;
    maximumAgeMs:number;
    maximumOffTargetMs?:number;
    slots?:number;
    slotCountsByPainting?:Record<string,number>;
    durationMsByPainting?:Record<string,number>;
    maximumSelectionMs?:number;
    blankFraction:number;
    randomAlgorithm:string;
  };
}
export interface CardRect {left:number;top:number;width:number;height:number}
export interface CardDecision {
  cardId:string;
  slot:number;
  selectionSource:'sequential'|'random'|'gaze'|'fallback'|'remaining';
  selectionReason:string;
  validSelectionSamples:number;
  dwellMs:number;
  selectionAoiId:string|null;
  candidateCardIds:string[];
}
export interface CardExposure extends CardDecision {
  entranceMs?:number;
  entranceRect?:CardRect;
  exposureId:string;
  trialId:string;
  paintingId:string;
  condition:Condition;
  shownMs:number;
  hiddenMs:number|null;
  rect:CardRect;
  geometryVersion:number;
  calibrationVersion:number;
  activeStartMs:number;
}

export type WorkloadId = 'mental'|'physical'|'temporal'|'performance'|'effort'|'frustration';
export interface RecallQuestion {id:string;cardId:string;prompt:string}
export interface PilotSceneSurvey {
  version:PilotSurveyVersion;
  trialId:string|null;
  submittedCardOrder:string[];
  workload:Partial<Record<WorkloadId,number>>;
  workloadSubmittedMs:number|null;
  recall:Record<string,{text:string;unknown:boolean}>;
  recallSubmittedMs:number|null;
  supplemental:Record<string,string>;
  supplementalSubmittedMs:number|null;
  manualScores?:Record<string,0|1>;
}
