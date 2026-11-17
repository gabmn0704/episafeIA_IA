import { FACTORS } from './factors.js';
import { clamp01, NON_CAUSAL_NOTE, pct, round } from './format.js';
import type { DayObservation } from './observations.js';
import type { Thresholds } from './thresholds.js';
import type { ScoredInsight } from './triggers.js';
import { Graph } from '../structures/graph.js';

const labelOf = (id: string) => FACTORS.find((f) => f.id === id)?.label ?? id;

/**
 * Builds the co-occurrence graph of factors on seizure days: nodes are
 * factors, edge weight = number of seizure days where both were present.
 */
export function buildCooccurrenceGraph(observations: readonly DayObservation[], only?: ReadonlySet<string>): Graph {
  const g = new Graph();
  for (const o of observations) {
    if (!o.outcome) continue;
    const present = [...o.exposures].filter(([id, e]) => e && (!only || only.has(id))).map(([id]) => id);
    present.forEach((id) => g.addNode(id));
    for (let i = 0; i < present.length; i++) {
      for (let j = i + 1; j < present.length; j++) g.addEdge(present[i] as string, present[j] as string);
    }
  }
  return g;
}

/**
 * Reports the heaviest pair of factors that were present together on
 * seizure days. Only factors that already passed the single-factor test are
 * considered, so noise factors can never form a "pattern" by pairing up.
 */
export function findCooccurrence(
  observations: readonly DayObservation[],
  significant: ReadonlySet<string>,
  th: Thresholds,
): ScoredInsight[] {
  if (significant.size < 2) return [];
  const seizureDays = observations.filter((o) => o.outcome).length;
  if (seizureDays === 0) return [];
  const graph = buildCooccurrenceGraph(observations, significant);
  const best = graph.edges()[0];
  if (!best || best.weight < th.minPairCount) return [];
  const share = best.weight / seizureDays;
  if (share < 0.3) return [];
  const confidence = round(clamp01(0.4 * Math.min(1, best.weight / 8) + 0.4 * share), 2);
  const a = labelOf(best.a);
  const b = labelOf(best.b);
  return [
    {
      score: confidence * 0.8,
      insight: {
        kind: 'cooccurrence',
        title: 'Factores que coinciden en tus crisis',
        body:
          `En ${best.weight} de tus ${seizureDays} días con crisis coincidieron ${a} y ${b} (${pct(share)}). ` +
          `Ambos factores ya aparecían de forma individual en tus patrones. ${NON_CAUSAL_NOTE}`,
        evidence: { factors: [best.a, best.b], seizureDays, pairDays: best.weight, share: round(share) },
        confidence,
      },
    },
  ];
}
