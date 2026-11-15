import type {Session, StudyConfig, ValidationSummary} from './types';

/** Explain the frozen validation rule without equating missing thresholds with failure. */
export function validationExplanation(summary:ValidationSummary, thresholds:StudyConfig['validation']):string[] {
  const reasons:string[]=[];
  if (!summary.targets.length) reasons.push('没有验证目标记录，无法判断定位质量。');
  for (const target of summary.targets) {
    if (target.n < thresholds.minSamplesPerTarget) {
      const label=/^\d+$/.test(target.targetId)?String(Number(target.targetId)+1):target.targetId;
      reasons.push(`目标 ${label} 的有效预测样本只有 ${target.n} 个，少于要求的 ${thresholds.minSamplesPerTarget} 个。`);
    }
  }
  if(thresholds.maxTargetMedianErrorPx!=null) for(const target of summary.targets){
    if(target.medianErrorPx!==null&&target.medianErrorPx>thresholds.maxTargetMedianErrorPx){
      const label=/^\d+$/.test(target.targetId)?String(Number(target.targetId)+1):target.targetId;
      reasons.push(`目标 ${label} 的中位误差 ${target.medianErrorPx.toFixed(1)} CSS px，超过单目标上限 ${thresholds.maxTargetMedianErrorPx.toFixed(1)} CSS px。`);
    }
  }
  const hasPixelError=summary.medianErrorPx!==null&&Number.isFinite(summary.medianErrorPx);
  const hasRelativeError=summary.errorDiagonalRatio!==null&&Number.isFinite(summary.errorDiagonalRatio);
  if (!hasPixelError) reasons.push('没有可计算的整体定位误差；未获得足够的有效预测坐标。');
  if (!hasRelativeError) reasons.push('没有可计算的视口相对误差；缺少有效预测或视口尺寸。');
  if (hasPixelError&&thresholds.maxMedianErrorPx!==null&&summary.medianErrorPx!>thresholds.maxMedianErrorPx) {
    reasons.push(`整体中位误差 ${summary.medianErrorPx!.toFixed(1)} CSS px，超过已设上限 ${thresholds.maxMedianErrorPx.toFixed(1)} CSS px。`);
  }
  if (hasRelativeError&&thresholds.maxErrorDiagonalRatio!==null&&summary.errorDiagonalRatio!>thresholds.maxErrorDiagonalRatio) {
    reasons.push(`误差占视口对角线 ${(summary.errorDiagonalRatio!*100).toFixed(2)}%，超过已设上限 ${(thresholds.maxErrorDiagonalRatio*100).toFixed(2)}%。`);
  }
  const noThreshold=thresholds.maxMedianErrorPx===null&&thresholds.maxErrorDiagonalRatio===null&&thresholds.maxTargetMedianErrorPx==null;
  if (noThreshold) {
    reasons.push('尚未设置定位误差判断标准，因此不自动判为合格，也不因未设标准判为低质量。');
  }
  if (summary.status==='judgment'&&!reasons.length) reasons.push('本轮结果仍待研究者判断；请核对冻结的验证标准与记录。');
  if (summary.status==='pass'&&!reasons.length) reasons.push('各目标样本数达到要求，整体误差符合本会话已设置的判断标准。');
  if (summary.status==='fail'&&!reasons.length) reasons.push('本轮记录为未通过；请核对验证目标和原始记录。');
  return reasons;
}

/** Display-only compatibility for the old UI's forced low-quality continuation.
 * Never rewrite stored data or reinterpret a real failure/interruption as unassessed.
 */
export function legacyUnassessed(session:Session):boolean {
  if (session.quality!=='low_quality'||session.status!=='completed') return false;
  const thresholds=session.config.validation;
  if (thresholds.maxMedianErrorPx!==null||thresholds.maxErrorDiagonalRatio!==null||thresholds.maxTargetMedianErrorPx!=null) return false;
  if (!session.qualityNotes.length||!session.qualityNotes.every(note=>/^(quality|drift_result): judgment，研究者选择继续$/.test(note))) return false;
  if (!session.validationSummaries.length||!session.validationSummaries.some(summary=>summary.kind==='validation')) return false;
  if (session.validationSummaries.some(summary=>summary.status!=='judgment')) return false;
  if (session.timings.some(timing=>timing.status==='interrupted')) return false;
  return true;
}

export function validationRuleText(thresholds:StudyConfig['validation']):string {
  const rules:string[]=[];
  if(thresholds.maxMedianErrorPx!==null)rules.push(`整体中位误差 ≤ ${thresholds.maxMedianErrorPx} CSS px`);
  if(thresholds.maxErrorDiagonalRatio!==null)rules.push(`整体相对误差 ≤ ${(thresholds.maxErrorDiagonalRatio*100).toFixed(1)}% 视口对角线`);
  if(thresholds.maxTargetMedianErrorPx!=null)rules.push(`每个目标的中位误差 ≤ ${thresholds.maxTargetMedianErrorPx} CSS px`);
  if(!rules.length)rules.push('未设置误差合格线：质量待判断');
  rules.push(`每个目标至少 ${thresholds.minSamplesPerTarget} 个有效样本（排除最初 ${thresholds.settleMs} ms）`);
  return rules.join('；');
}
