import {describe, expect, it} from 'vitest';
import {FOUR_PERSON_PLAN, PARTICIPANT_PLAN_VERSION, resolveParticipantConfig} from '../src/assignment';
import {orderForParticipant} from '../src/machine';
import {questionVariants, QUESTION_VARIANT_VERSION} from '../src/questionVariants';
import {commonQuestions,COMMON_QUESTIONNAIRE_VERSION} from '../src/commonQuestionnaire';
import {defaultConfig} from '../src/study';
import type {StudyConfig} from '../src/types';

const sceneIds = ['ming-xingle-archery', 'ming-xingle-cuju'];
const plannedConfig = ():StudyConfig => ({...structuredClone(defaultConfig), participantPlan:PARTICIPANT_PLAN_VERSION});

describe('common questionnaire with balanced viewing order', () => {
  it('has two participants in each viewing order, all using the common questions', () => {
    expect(FOUR_PERSON_PLAN.map(row => row.participantId)).toEqual(['N03','N04','N05','N06']);
    expect(new Set(FOUR_PERSON_PLAN.map(row => `${row.order}/${row.questionVariant}`)).size).toBe(2);
    expect(FOUR_PERSON_PLAN.filter(row => row.order === 'AB')).toHaveLength(2);
    expect(FOUR_PERSON_PLAN.every(row => row.questionVariant === 'common')).toBe(true);
  });

  it.each(FOUR_PERSON_PLAN)('resolves $participantId to $order / $questionVariant and snapshots the final questions', row => {
    const config = plannedConfig();
    config.order = row.order === 'AB' ? 'BA' : 'AB';
    const before = structuredClone(config);
    const resolved = resolveParticipantConfig(config, row.participantId);
    const expectedOrder = row.order === 'AB' ? sceneIds : [...sceneIds].reverse();
    expect(resolved.assignment).toEqual({
      planVersion:PARTICIPANT_PLAN_VERSION, participantId:row.participantId,
      order:row.order, questionVariant:row.questionVariant,
      questionVersion:COMMON_QUESTIONNAIRE_VERSION, paintingOrder:expectedOrder,
    });
    expect(orderForParticipant(row.participantId, resolved.config)).toEqual(expectedOrder);
    for (const painting of resolved.config.paintings) {
      const expected = commonQuestions[painting.paintingId];
      expect(painting.pre).toEqual(expected.pre);
      expect(painting.post).toEqual(expected.post);
      expect(painting.pre).not.toBe(expected.pre);
      expect(painting.post[0]).not.toBe(expected.post[0]);
      expect(painting.pre).toHaveLength(5);
      expect(painting.post).toHaveLength(2);
      const original = config.paintings.find(p => p.paintingId === painting.paintingId)!;
      expect({...painting,pre:original.pre,post:original.post}).toEqual(original);
    }
    expect(config).toEqual(before);
    resolved.config.paintings[0].pre[0].prompt = '会话局部修改';
    expect(resolveParticipantConfig(config,row.participantId).config.paintings[0].pre[0].prompt).not.toBe('会话局部修改');
  });

  it('preserves historical A/B plans without replacing their wording or flow',()=>{
    for(const id of ['N03','N04','N05','N06']){
      const config=plannedConfig();config.participantPlan='crossed-four-v1';
      const resolved=resolveParticipantConfig(config,id);
      const variant=id==='N03'||id==='N04'?'alpha':'beta';
      expect(resolved.assignment?.questionVariant).toBe(variant);
      expect(resolved.assignment?.questionVersion).toBe(QUESTION_VARIANT_VERSION);
      expect(resolved.config.questionnaireVersion).toBeUndefined();
      expect(resolved.config.paintings[0].pre).toEqual(questionVariants[variant][sceneIds[0]].pre);
    }
  });

  it('keeps wording and question roles identical across participants and scenes',()=>{
    const first=resolveParticipantConfig(plannedConfig(),'N03').config.paintings[0];
    for(const row of FOUR_PERSON_PLAN){
      const config=resolveParticipantConfig(plannedConfig(),row.participantId).config;
      for(const painting of config.paintings){
        expect(painting.pre.map(q=>q.prompt)).toEqual(first.pre.map(q=>q.prompt));
        expect(painting.post.map(q=>q.prompt)).toEqual(first.post.map(q=>q.prompt));
        expect(painting.pre.map(q=>q.analysisRole)).toEqual(['spontaneous','spontaneous','spontaneous','prompted','classification']);
        expect(painting.post.map(q=>q.analysisRole)).toEqual(['card-feedback','card-feedback']);
        expect(painting.pre[2].optional).toBe(true);
        expect(painting.pre[4].options?.find(o=>o.id==='none')?.exclusive).toBe(true);
        expect([...painting.pre,...painting.post].every(q=>q.confidence===false&&q.allowUnknown===false)).toBe(true);
      }
    }
    const ids=Object.values(commonQuestions).flatMap(q=>[...q.pre,...q.post].map(q=>q.id));
    expect(new Set(ids).size).toBe(14);
  });

  it('defines A as archery even when the supplied painting list is reversed', () => {
    const config = plannedConfig();
    config.paintings.reverse();
    expect(resolveParticipantConfig(config,'N03').assignment?.paintingOrder).toEqual(sceneIds);
    expect(resolveParticipantConfig(config,'N04').assignment?.paintingOrder).toEqual([...sceneIds].reverse());
    expect(config.paintings.map(p => p.paintingId)).toEqual([...sceneIds].reverse());
  });

  it('rejects other or duplicate materials rather than applying unrelated questions', () => {
    const config = plannedConfig();
    config.paintings[0].paintingId = 'custom-material';
    expect(() => resolveParticipantConfig(config,'N03')).toThrow('仅适用于射箭与蹴鞠');
    config.paintings[0] = structuredClone(config.paintings[1]);
    expect(() => resolveParticipantConfig(config,'N03')).toThrow('仅适用于射箭与蹴鞠');
  });

  it('leaves legacy configurations, explicit order and N01/N02 debugging outside the plan', () => {
    const legacy = plannedConfig();
    delete legacy.participantPlan;
    legacy.order = 'BA';
    const old = resolveParticipantConfig(legacy,'N03');
    expect(old.assignment).toBeUndefined();
    expect(old.config).toEqual(legacy);
    expect(old.config).not.toBe(legacy);
    expect(orderForParticipant('N03',old.config)).toEqual([...sceneIds].reverse());
    for (const id of ['N01','N02']) {
      const config = plannedConfig();
      const resolved = resolveParticipantConfig(config,id);
      expect(resolved.assignment).toBeUndefined();
      expect(resolved.config).toEqual(config);
    }
  });
});
