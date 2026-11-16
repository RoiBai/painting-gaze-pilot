import type { Phase, StudyConfig } from './types';

const transitions: Record<Phase, readonly Phase[]> = {
  consent: ['camera'],
  camera: ['calibration'],
  calibration: ['validation', 'camera'],
  validation: ['quality', 'calibration'],
  quality: ['calibration', 'drift', 'camera'],
  drift: ['drift_result', 'calibration'],
  drift_result: ['calibration', 'loading_image', 'camera'],
  loading_image: ['free_view', 'drift', 'camera', 'calibration'],
  free_view: ['familiarity', 'pre', 'calibration', 'camera'],
  familiarity: ['pre'],
  pre: ['cards'],
  cards: ['post'],
  post: ['drift', 'interview', 'completed', 'calibration'],
  interview: ['completed'],
  completed: [],
  interrupted: [],
};

/** Guard transitions; interrupted records are terminal and require a new session. */
export function canTransition(from: Phase, to: Phase): boolean {
  if (to === 'interrupted') return from !== 'completed' && from !== 'interrupted';
  return transitions[from]?.includes(to) ?? false;
}

export function orderForParticipant(participantId: string, config: Pick<StudyConfig, 'order' | 'paintings'>): string[] {
  if (!/^N0[1-6]$/.test(participantId)) throw new Error('匿名编号须为 N01–N06');
  if (config.paintings.length !== 2) throw new Error('必须配置两幅画');
  const reverse = config.order === 'BA' || (config.order === 'alternate' && Number(participantId.slice(1)) % 2 === 0);
  const ids = config.paintings.map(p => p.paintingId);
  return reverse ? ids.reverse() : ids;
}
