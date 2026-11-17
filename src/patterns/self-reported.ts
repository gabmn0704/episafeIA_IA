import type { Seizure } from '../domain/schemas.js';
import { wilsonInterval } from '../stats/wilson.js';
import { clamp01, NON_CAUSAL_NOTE, pct, pctRange, round } from './format.js';
import type { Thresholds } from './thresholds.js';
import type { ScoredInsight } from './triggers.js';

const normalize = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Surfaces triggers the person noted themselves when they repeat across seizures. */
export function findSelfReported(seizures: readonly Seizure[], th: Thresholds): ScoredInsight[] {
  if (seizures.length < th.minSeizures) return [];
  const counts = new Map<string, { label: string; count: number }>();
  for (const s of seizures) {
    const seen = new Set<string>();
    for (const raw of s.triggersNoted ?? []) {
      const key = normalize(raw);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const prev = counts.get(key);
      counts.set(key, { label: prev?.label ?? raw.trim(), count: (prev?.count ?? 0) + 1 });
    }
  }
  const n = seizures.length;
  const out: ScoredInsight[] = [];
  for (const [key, { label, count }] of counts) {
    const share = count / n;
    if (count < th.minPairCount || share < 0.4) continue;
    const ci = wilsonInterval(count, n);
    const confidence = round(clamp01(0.5 * Math.min(1, count / 10) + 0.5 * Math.min(1, ci.low / 0.5)), 2);
    out.push({
      score: confidence * 0.85,
      insight: {
        kind: 'self_reported_trigger',
        title: `Lo has anotado con frecuencia: ${label}`,
        body:
          `Anotaste "${label}" en ${count} de tus ${n} crisis (${pct(share)}, IC 95%: ${pctRange(ci)}). ` +
          NON_CAUSAL_NOTE,
        evidence: { trigger: key, count, n, share: round(share), interval95: [round(ci.low), round(ci.high)] },
        confidence,
      },
    });
  }
  return out;
}
