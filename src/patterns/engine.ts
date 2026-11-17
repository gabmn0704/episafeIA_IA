import { DEFAULT_TIMEZONE, isValidTimezone } from '../domain/dates.js';
import type { AnalyzePatternsInput, Insight } from '../domain/schemas.js';
import { TopK } from '../structures/min-heap.js';
import { findCooccurrence } from './cooccurrence.js';
import { buildObservations } from './observations.js';
import { findSelfReported } from './self-reported.js';
import { DEFAULT_THRESHOLDS, type Thresholds } from './thresholds.js';
import { findTimeOfDay } from './time-of-day.js';
import { findTriggerPatterns, type ScoredInsight } from './triggers.js';

export interface AnalyzeOptions {
  thresholds?: Partial<Thresholds>;
}

export const DEFAULT_MAX_INSIGHTS = 6;

function insufficientData(th: Thresholds, days: number, seizures: number): Insight {
  return {
    kind: 'insufficient_data',
    title: 'Aún no hay datos suficientes',
    body:
      `Para detectar patrones hacen falta al menos ${th.minObservationDays} días de registro y ${th.minSeizures} crisis ` +
      `(ahora: ${days} días y ${seizures} crisis). Seguir registrando el sueño, el estrés y la medicación ayuda a obtener resultados fiables.`,
    evidence: {
      observationDays: days,
      seizures,
      requiredDays: th.minObservationDays,
      requiredSeizures: th.minSeizures,
    },
    confidence: 0,
  };
}

/** Runs every detector and returns the top-k insights by ranking score. */
export function analyzePatterns(input: AnalyzePatternsInput, opts: AnalyzeOptions = {}): { insights: Insight[] } {
  const th: Thresholds = { ...DEFAULT_THRESHOLDS, ...opts.thresholds };
  const timezone = input.timezone && isValidTimezone(input.timezone) ? input.timezone : DEFAULT_TIMEZONE;
  const k = input.maxInsights ?? DEFAULT_MAX_INSIGHTS;

  const observations = buildObservations(input.seizures, input.dailyLogs, input.medicationLogs, { timezone });

  const candidates: ScoredInsight[] = [];
  const enoughData = observations.length >= th.minObservationDays && input.seizures.length >= th.minSeizures;
  if (enoughData) {
    const triggers = findTriggerPatterns(observations, th);
    const significant = new Set(triggers.map((t) => String(t.insight.evidence.factor)));
    candidates.push(...triggers, ...findCooccurrence(observations, significant, th));
  }
  candidates.push(...findTimeOfDay(input.seizures, timezone, th), ...findSelfReported(input.seizures, th));

  if (candidates.length === 0 && !enoughData) {
    return { insights: [insufficientData(th, observations.length, input.seizures.length)] };
  }

  const top = new TopK<Insight>(k);
  for (const c of candidates) top.add(c.insight, c.score);
  return { insights: top.result() };
}
