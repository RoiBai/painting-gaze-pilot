import type {ParticipantAssignment, StudyConfig} from './types';
import {orderForParticipant} from './machine';
import {questionVariants, QUESTION_VARIANT_VERSION} from './questionVariants';

export const PARTICIPANT_PLAN_VERSION = 'crossed-four-v1' as const;
export const FOUR_PERSON_PLAN = [
  {participantId:'N03', order:'AB', questionVariant:'alpha'},
  {participantId:'N04', order:'BA', questionVariant:'alpha'},
  {participantId:'N05', order:'AB', questionVariant:'beta'},
  {participantId:'N06', order:'BA', questionVariant:'beta'},
] as const;

const PLAN_PAINTINGS = ['ming-xingle-archery', 'ming-xingle-cuju'] as const;

/** Resolve once when starting a new session. Imported sessions retain their saved questions. */
export function resolveParticipantConfig(config:StudyConfig, participantId:string):{config:StudyConfig;assignment?:ParticipantAssignment} {
  const copy = structuredClone(config);
  if (!copy.participantPlan) return {config:copy};
  if (copy.participantPlan !== PARTICIPANT_PLAN_VERSION) throw Error('未知的参与者分配方案');
  const plan = FOUR_PERSON_PLAN.find(row => row.participantId === participantId);
  // N01/N02 remain available for legacy workflow checks and are not one of the four pilot cells.
  if (!plan) return {config:copy};
  if (copy.paintings.length !== 2 || !PLAN_PAINTINGS.every(id => copy.paintings.some(p => p.paintingId === id))) {
    throw Error('四人交叉方案仅适用于射箭与蹴鞠两幅指定场景；其他材料请关闭四人方案');
  }
  // Define A/B by the material IDs, even if an imported configuration lists them backwards.
  copy.paintings = PLAN_PAINTINGS.map(id => {
    const painting = copy.paintings.find(p => p.paintingId === id)!;
    const questions = questionVariants[plan.questionVariant][id];
    return {...painting, pre:structuredClone(questions.pre), post:structuredClone(questions.post)};
  });
  copy.order = plan.order;
  const assignment:ParticipantAssignment = {
    planVersion:PARTICIPANT_PLAN_VERSION,
    participantId,
    order:plan.order,
    questionVariant:plan.questionVariant,
    questionVersion:QUESTION_VARIANT_VERSION,
    paintingOrder:orderForParticipant(participantId, copy),
  };
  return {config:copy, assignment};
}
