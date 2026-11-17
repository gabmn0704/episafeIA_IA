import { z } from 'zod';
import { withCamelKeys } from '../domain/schemas.js';
import { median } from '../stats/robust.js';
import { dayFields, DEFAULT_BASELINE, featurize, type Baseline } from './features.js';
import { brier, dot, logLoss, sigmoid, trainLogistic } from './logistic.js';
import { PRIOR_MODEL_VERSION, PRIOR_WEIGHTS } from './prior.js';

export const historyDaySchema = withCamelKeys(
  z.object({
    date: z.string().optional(),
    ...dayFields,
    /** did a seizure happen that day? */
    seizure: z.boolean(),
  }),
);

export const historySchema = z.object({
  days: z.array(historyDaySchema).max(3650).default([]),
  baseline: z
    .object({ hrAvg: z.number().optional(), hrvMs: z.number().optional() })
    .optional(),
});
export type History = z.infer<typeof historySchema>;

export const MIN_TRAIN_DAYS = 30;
export const MIN_TRAIN_POSITIVES = 5;
export const MIN_TRAIN_NEGATIVES = 5;

export interface TrainSummary {
  /** true when the weights were learned from the user's history */
  personalized: boolean;
  /** [bias, ...weights] in the order of FEATURE_NAMES */
  weights: number[];
  modelVersion: string;
  n: number;
  positives: number;
  baseline: Baseline;
  reason?: string;
  metrics?: { priorLogLoss: number; trainedLogLoss: number; priorBrier: number; trainedBrier: number; epochs: number; lambda: number };
}

/** Personal baseline of heart signals: median of the history, else defaults. */
export function estimateBaseline(history: History): Baseline {
  const hr = history.days.flatMap((d) => (d.hrAvg === undefined ? [] : [d.hrAvg]));
  const hrv = history.days.flatMap((d) => (d.hrvMs === undefined ? [] : [d.hrvMs]));
  return {
    hrAvg: history.baseline?.hrAvg ?? (hr.length >= 7 ? median(hr) : DEFAULT_BASELINE.hrAvg),
    hrvMs: history.baseline?.hrvMs ?? (hrv.length >= 7 ? median(hrv) : DEFAULT_BASELINE.hrvMs),
  };
}

/**
 * Fits the logistic model on the user's own history by gradient descent,
 * with L2 regularization centered on the clinical prior: with little data
 * the weights stay close to the prior, with more data they move toward what
 * this person's records show. Falls back to the prior when there is not
 * enough data (or not enough of each class).
 */
export function trainFromHistory(history: History): TrainSummary {
  const baseline = estimateBaseline(history);
  const n = history.days.length;
  const positives = history.days.filter((d) => d.seizure).length;
  const negatives = n - positives;

  const fallback = (reason: string): TrainSummary => ({
    personalized: false,
    weights: [...PRIOR_WEIGHTS],
    modelVersion: PRIOR_MODEL_VERSION,
    n,
    positives,
    baseline,
    reason,
  });

  if (n < MIN_TRAIN_DAYS) return fallback(`Se necesitan al menos ${MIN_TRAIN_DAYS} días de historial (hay ${n}).`);
  if (positives < MIN_TRAIN_POSITIVES) {
    return fallback(`Se necesitan al menos ${MIN_TRAIN_POSITIVES} días con crisis para ajustar el modelo (hay ${positives}).`);
  }
  if (negatives < MIN_TRAIN_NEGATIVES) return fallback('Faltan días sin crisis para comparar.');

  const x = history.days.map((d) => featurize(d, baseline));
  const y = history.days.map((d) => (d.seizure ? 1 : 0));
  const lambda = Math.min(0.6, Math.max(0.05, 15 / n));
  const res = trainLogistic(x, y, PRIOR_WEIGHTS, { lambda, epochs: 2000, learningRate: 0.3, center: PRIOR_WEIGHTS.slice(1) });

  const predict = (w: readonly number[]) => x.map((row) => sigmoid((w[0] as number) + dot(w.slice(1), row)));
  const priorP = predict(PRIOR_WEIGHTS);
  const trainedP = predict(res.weights);

  return {
    personalized: true,
    weights: res.weights,
    modelVersion: `logit-personal-1.0-n${n}`,
    n,
    positives,
    baseline,
    metrics: {
      priorLogLoss: logLoss(priorP, y),
      trainedLogLoss: logLoss(trainedP, y),
      priorBrier: brier(priorP, y),
      trainedBrier: brier(trainedP, y),
      epochs: res.epochs,
      lambda,
    },
  };
}
