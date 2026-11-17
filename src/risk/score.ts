import { z } from 'zod';
import { round } from '../patterns/format.js';
import {
  dayInputSchema,
  FEATURE_LABELS,
  FEATURE_NAMES,
  featureDetail,
  featurize,
  type Baseline,
  type DayInput,
} from './features.js';
import { dot, sigmoid } from './logistic.js';
import { PRIOR_MODEL_VERSION, PRIOR_WEIGHTS } from './prior.js';
import { historySchema, trainFromHistory, type TrainSummary } from './train.js';

export const riskScoreSchema = z.object({
  today: dayInputSchema,
  history: historySchema.optional(),
  /** previously trained weights ([bias, ...]); skips training when provided */
  weights: z.array(z.number().finite()).length(PRIOR_WEIGHTS.length).optional(),
});
export type RiskScoreInput = z.infer<typeof riskScoreSchema>;

export const trainSchema = z.object({ history: historySchema });

export type RiskLevel = 'low' | 'moderate' | 'high' | 'critical';

export interface RiskFactor {
  name: string;
  /** signed change in score points attributable to this factor */
  impact: number;
  direction: 'increases' | 'decreases';
  detail: string;
}

export interface RiskResult {
  score: number;
  level: RiskLevel;
  factors: RiskFactor[];
  modelVersion: string;
  confidence: number;
  personalized: boolean;
  /** raw probability behind the score */
  probability: number;
}

export function levelFor(score: number): RiskLevel {
  if (score < 25) return 'low';
  if (score < 50) return 'moderate';
  if (score < 75) return 'high';
  return 'critical';
}

/** Share of the five core daily inputs that were actually provided. */
function coverage(day: DayInput): number {
  const core = [day.sleepHours, day.stressLevel, day.caffeineMg, day.exerciseMinutes, day.missedMeds];
  return core.filter((v) => v !== undefined).length / core.length;
}

function modelConfidence(t: Pick<TrainSummary, 'personalized' | 'n' | 'positives'>): number {
  if (!t.personalized) return 0.3;
  return 0.3 + 0.7 * (0.5 * Math.min(1, t.n / 120) + 0.5 * Math.min(1, t.positives / 20));
}

/**
 * Scores one day. Uses `weights` when given, else trains on `history`
 * (prior fallback), so the response always works with zero history.
 */
export function scoreRisk(input: RiskScoreInput): RiskResult {
  const history = input.history ?? { days: [] };
  const summary: Pick<TrainSummary, 'weights' | 'modelVersion' | 'personalized' | 'n' | 'positives' | 'baseline'> = input.weights
    ? {
        weights: input.weights,
        modelVersion: 'logit-supplied-weights',
        personalized: true,
        n: 0,
        positives: 0,
        baseline: trainFromHistory({ ...history, days: [] }).baseline,
      }
    : trainFromHistory(history);

  return scoreWithWeights(input.today, summary.weights, summary.baseline, {
    modelVersion: summary.modelVersion || PRIOR_MODEL_VERSION,
    personalized: summary.personalized,
    confidenceBase: input.weights ? 0.5 : modelConfidence(summary),
  });
}

export function scoreWithWeights(
  today: DayInput,
  weights: readonly number[],
  baseline: Baseline,
  meta: { modelVersion: string; personalized: boolean; confidenceBase: number },
): RiskResult {
  const x = featurize(today, baseline);
  const z = (weights[0] as number) + dot(weights.slice(1), x);
  const p = sigmoid(z);
  const score = Math.round(p * 100);

  const factors: RiskFactor[] = [];
  FEATURE_NAMES.forEach((name, i) => {
    const contribution = (weights[i + 1] as number) * (x[i] as number);
    const impact = round(100 * (p - sigmoid(z - contribution)), 1);
    if (Math.abs(impact) < 0.5) return;
    factors.push({
      name: FEATURE_LABELS[name],
      impact,
      direction: impact > 0 ? 'increases' : 'decreases',
      detail: featureDetail(name, today, baseline),
    });
  });
  factors.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

  return {
    score,
    level: levelFor(score),
    factors,
    modelVersion: meta.modelVersion,
    confidence: round(meta.confidenceBase * (0.6 + 0.4 * coverage(today)), 2),
    personalized: meta.personalized,
    probability: round(p, 4),
  };
}
