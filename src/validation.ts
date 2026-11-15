import type { StudyConfig, ValidationRow, ValidationSummary } from './types';

export function median(values: number[]): number | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Median Euclidean error over independent post-settling observations, never training labels. */
export function summarizeValidation(
  rows: ValidationRow[],
  thresholds: StudyConfig['validation'],
  expectedTargets: string[],
  runId: string,
  kind: 'validation' | 'drift',
  calibrationVersion: number,
): ValidationSummary {
  const targetSet = new Set(expectedTargets);
  const eligible = rows.filter(r => r.runId === runId && r.kind === kind && r.calibrationVersion === calibrationVersion && targetSet.has(r.targetId) && !r.training && !r.settling && r.predictionX !== null && r.predictionY !== null && Number.isFinite(r.predictionX) && Number.isFinite(r.predictionY) && Number.isFinite(r.targetX) && Number.isFinite(r.targetY));
  // Recalculate from the stored coordinates so an inaccurate cached error cannot produce a pass.
  const error = (r: ValidationRow) => Math.hypot(r.predictionX! - r.targetX, r.predictionY! - r.targetY);
  const targets = [...targetSet].map(targetId => {
    const observations = eligible.filter(r => r.targetId === targetId);
    return { targetId, n: observations.length, medianErrorPx: median(observations.map(error)) };
  });
  const medianErrorPx = median(eligible.map(error));
  const ratios = eligible.filter(r => Number.isFinite(r.viewportWidth) && Number.isFinite(r.viewportHeight) && r.viewportWidth > 0 && r.viewportHeight > 0).map(r => error(r) / Math.hypot(r.viewportWidth, r.viewportHeight));
  const errorDiagonalRatio = median(ratios);
  const insufficient = !targets.length || targets.some(t => t.n < thresholds.minSamplesPerTarget) || medianErrorPx === null || errorDiagonalRatio === null;
  const noThreshold = thresholds.maxMedianErrorPx === null && thresholds.maxErrorDiagonalRatio === null && thresholds.maxTargetMedianErrorPx == null;
  const exceeded = (thresholds.maxMedianErrorPx !== null && medianErrorPx !== null && medianErrorPx > thresholds.maxMedianErrorPx) || (thresholds.maxErrorDiagonalRatio !== null && errorDiagonalRatio !== null && errorDiagonalRatio > thresholds.maxErrorDiagonalRatio);
  const targetExceeded = thresholds.maxTargetMedianErrorPx != null && targets.some(t => t.medianErrorPx !== null && t.medianErrorPx > thresholds.maxTargetMedianErrorPx!);
  return { runId, kind, calibrationVersion, targets, medianErrorPx, errorDiagonalRatio, status: insufficient || exceeded || targetExceeded ? 'fail' : noThreshold ? 'judgment' : 'pass' };
}
