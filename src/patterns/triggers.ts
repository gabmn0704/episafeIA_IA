import type { Insight } from '../domain/schemas.js';
import { buildContingency, contingencyStats } from '../stats/contingency.js';
import { FACTORS } from './factors.js';
import { clamp01, NON_CAUSAL_NOTE, pct, pctRange, round, times } from './format.js';
import type { DayObservation } from './observations.js';
import type { Thresholds } from './thresholds.js';

export interface ScoredInsight {
  insight: Insight;
  /** ranking score used by the top-k heap */
  score: number;
}

/** confidence blends sample adequacy (cell a) with effect robustness (CI lower bound). */
export function triggerConfidence(a: number, liftLow: number): number {
  return round(clamp01(0.5 * Math.min(1, a / 10) + 0.5 * Math.min(1, Math.max(0, liftLow - 1) / 2)), 2);
}

/**
 * For every factor builds the exposure x seizure table and reports it only
 * when it clears every sample-size and effect-size threshold.
 */
export function findTriggerPatterns(observations: readonly DayObservation[], th: Thresholds): ScoredInsight[] {
  const out: ScoredInsight[] = [];
  for (const factor of FACTORS) {
    const pairs = observations.flatMap((o) => {
      const exposed = o.exposures.get(factor.id);
      return exposed === undefined ? [] : [{ exposed, outcome: o.outcome }];
    });
    const table = buildContingency(pairs);
    const s = contingencyStats(table);

    if (s.n < th.minObservationDays) continue;
    if (table.a < th.minExposedOutcomeDays) continue;
    if (s.exposedDays < th.minExposedDays) continue;
    if (s.lift < th.minLift) continue;
    if (s.liftInterval.low <= th.minLiftLowerBound) continue;

    const confidence = triggerConfidence(table.a, s.liftInterval.low);
    out.push({
      score: confidence * Math.log(1 + s.lift),
      insight: {
        kind: 'trigger_pattern',
        title: `Posible desencadenante: ${factor.label}`,
        body:
          `El ${pct(s.outcomeShareExposed)} de tus crisis (${table.a} de ${s.outcomeDays}) ocurrieron en días con ${factor.label} ` +
          `(IC 95%: ${pctRange(s.outcomeShareInterval)}). En esos días la frecuencia de crisis fue ${times(s.lift)} veces ` +
          `la de los demás días (${pct(s.pExposed)} frente a ${pct(s.pUnexposed)}). ${NON_CAUSAL_NOTE}`,
        evidence: {
          factor: factor.id,
          n: s.n,
          exposedDays: s.exposedDays,
          outcomeDays: s.outcomeDays,
          table,
          pExposed: round(s.pExposed),
          pUnexposed: round(s.pUnexposed),
          lift: round(s.lift, 2),
          liftInterval95: [round(s.liftInterval.low, 2), round(s.liftInterval.high, 2)],
          outcomeShare: round(s.outcomeShareExposed),
          outcomeShareInterval95: [round(s.outcomeShareInterval.low), round(s.outcomeShareInterval.high)],
        },
        confidence,
      },
    });
  }
  return out;
}
