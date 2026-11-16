import type {ParticipantAssignment, StudyConfig} from './types';
import {orderForParticipant} from './machine';
import {questionVariants, QUESTION_VARIANT_VERSION} from './questionVariants';
import {commonQuestions,COMMON_QUESTIONNAIRE_VERSION} from './commonQuestionnaire';

export const PARTICIPANT_PLAN_VERSION = 'common-four-v2' as const;
export const FOUR_PERSON_PLAN = [
  {participantId:'N03', order:'AB', questionVariant:'common'},
  {participantId:'N04', order:'BA', questionVariant:'common'},
  {participantId:'N05', order:'AB', questionVariant:'common'},
  {participantId:'N06', order:'BA', questionVariant:'common'},
] as const;

const PLAN_PAINTINGS = ['ming-xingle-archery', 'ming-xingle-cuju'] as const;

/** Resolve once when starting a new session. Imported sessions retain their saved questions. */
export function resolveParticipantConfig(config:StudyConfig, participantId:string):{config:StudyConfig;assignment?:ParticipantAssignment} {
  const copy = structuredClone(config);
  if (!copy.participantPlan) return {config:copy};
  if (copy.participantPlan !== PARTICIPANT_PLAN_VERSION && copy.participantPlan !== 'crossed-four-v1') throw Error('未知的参与者分配方案');
  const plan = FOUR_PERSON_PLAN.find(row => row.participantId === participantId);
  // N01/N02 remain available for legacy workflow checks and are not one of the four pilot cells.
  if (!plan) return {config:copy};
  const legacy=copy.participantPlan==='crossed-four-v1';
  const variant=legacy?(participantId==='N03'||participantId==='N04'?'alpha':'beta'):'common';
  if (copy.paintings.length !== 2 || !PLAN_PAINTINGS.every(id => copy.paintings.some(p => p.paintingId === id))) {
    throw Error('四人顺序方案仅适用于射箭与蹴鞠两幅指定场景；其他材料请关闭四人方案');
  }
  // Define A/B by the material IDs, even if an imported configuration lists them backwards.
  copy.paintings = PLAN_PAINTINGS.map(id => {
    const painting = copy.paintings.find(p => p.paintingId === id)!;
    const questions = variant==='common'?commonQuestions[id]:questionVariants[variant][id];
    return {...painting, pre:structuredClone(questions.pre), post:structuredClone(questions.post)};
  });
  copy.order = plan.order;
  if(legacy)delete copy.questionnaireVersion;
  else copy.questionnaireVersion=COMMON_QUESTIONNAIRE_VERSION;
  const assignment:ParticipantAssignment = {
    planVersion:copy.participantPlan,
    participantId,
    order:plan.order,
    questionVariant:variant,
    questionVersion:legacy?QUESTION_VARIANT_VERSION:COMMON_QUESTIONNAIRE_VERSION,
    paintingOrder:orderForParticipant(participantId, copy),
  };
  return {config:copy, assignment};
}
