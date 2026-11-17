import { DEFAULT_TIMEZONE, isValidTimezone } from '../domain/dates.js';
import type { AnalyzePatternsInput, Insight } from '../domain/schemas.js';
import { TopK } from '../structures/min-heap.js';
import { buildObservations } from './observations.js';
import { DEFAULT_THRESHOLDS, type Thresholds } from './thresholds.js';
import { findTriggerPatterns, type ScoredInsight } from './triggers.js';

export interface AnalyzeOptions {
  thresholds?: Partial<Thresholds>;
}

export const DEFAULT_MAX_INSIGHTS = 6;

/** Runs every detector and returns the top-k insights by ranking score. */
export function analyzePatterns(input: AnalyzePatternsInput, opts: AnalyzeOptions = {}): { insights: Insight[] } {
  const th: Thresholds = { ...DEFAULT_THRESHOLDS, ...opts.thresholds };
  const timezone = input.timezone && isValidTimezone(input.timezone) ? input.timezone : DEFAULT_TIMEZONE;
  const k = input.maxInsights ?? DEFAULT_MAX_INSIGHTS;

  const observations = buildObservations(input.seizures, input.dailyLogs, input.medicationLogs, { timezone });

  const candidates: ScoredInsight[] = [];
  if (observations.length >= th.minObservationDays && input.seizures.length >= th.minSeizures) {
    candidates.push(...findTriggerPatterns(observations, th));
  }

  const top = new TopK<Insight>(k);
  for (const c of candidates) top.add(c.insight, c.score);
  return { insights: top.result() };
}
