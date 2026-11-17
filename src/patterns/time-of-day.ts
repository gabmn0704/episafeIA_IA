import { localParts } from '../domain/dates.js';
import type { Seizure } from '../domain/schemas.js';
import { wilsonInterval } from '../stats/wilson.js';
import { clamp01, NON_CAUSAL_NOTE, pct, pctRange, round } from './format.js';
import type { Thresholds } from './thresholds.js';
import type { ScoredInsight } from './triggers.js';

export const BUCKETS = [
  { id: 'night', label: 'de madrugada (00:00-05:59)', from: 0, to: 5 },
  { id: 'morning', label: 'por la mañana (06:00-11:59)', from: 6, to: 11 },
  { id: 'afternoon', label: 'por la tarde (12:00-17:59)', from: 12, to: 17 },
  { id: 'evening', label: 'por la noche (18:00-23:59)', from: 18, to: 23 },
] as const;

/**
 * Looks for a time-of-day concentration. A uniform spread would put 25% of
 * seizures in each bucket, so we require both a high share and a Wilson lower
 * bound clearly above that baseline.
 */
export function findTimeOfDay(seizures: readonly Seizure[], timezone: string, th: Thresholds): ScoredInsight[] {
  if (seizures.length < th.minSeizures) return [];
  const counts = new Map<string, number>(BUCKETS.map((b) => [b.id, 0]));
  for (const s of seizures) {
    const { hour } = localParts(s.startedAt, timezone);
    const bucket = BUCKETS.find((b) => hour >= b.from && hour <= b.to);
    if (bucket) counts.set(bucket.id, (counts.get(bucket.id) ?? 0) + 1);
  }
  const n = seizures.length;
  const [id, count] = [...counts].sort((a, b) => b[1] - a[1])[0] as [string, number];
  const share = count / n;
  const ci = wilsonInterval(count, n);
  if (share < th.minTimeShare || ci.low < th.minTimeShareLower) return [];
  const bucket = BUCKETS.find((b) => b.id === id)!;
  const confidence = round(clamp01(0.5 * Math.min(1, count / 10) + 0.5 * Math.min(1, (ci.low - 0.25) / 0.5)), 2);
  return [
    {
      score: confidence * 0.9,
      insight: {
        kind: 'time_of_day',
        title: 'Horario habitual de tus crisis',
        body:
          `El ${pct(share)} de tus crisis (${count} de ${n}) ocurrieron ${bucket.label} (IC 95%: ${pctRange(ci)}). ` +
          NON_CAUSAL_NOTE,
        evidence: { bucket: id, count, n, share: round(share), interval95: [round(ci.low), round(ci.high)] },
        confidence,
      },
    },
  ];
}
