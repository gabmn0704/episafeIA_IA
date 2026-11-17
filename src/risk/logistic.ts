/** Numerically stable logistic function. */
export function sigmoid(z: number): number {
  if (z >= 0) {
    const e = Math.exp(-z);
    return 1 / (1 + e);
  }
  const e = Math.exp(z);
  return e / (1 + e);
}

export function dot(w: readonly number[], x: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < w.length; i++) s += (w[i] as number) * (x[i] as number);
  return s;
}

/** Mean binary cross-entropy. */
export function logLoss(p: readonly number[], y: readonly number[]): number {
  if (p.length === 0) return 0;
  const eps = 1e-12;
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const pi = Math.min(1 - eps, Math.max(eps, p[i] as number));
    s += (y[i] as number) === 1 ? -Math.log(pi) : -Math.log(1 - pi);
  }
  return s / p.length;
}

/** Brier score: mean squared error of the predicted probabilities. */
export function brier(p: readonly number[], y: readonly number[]): number {
  if (p.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < p.length; i++) s += ((p[i] as number) - (y[i] as number)) ** 2;
  return s / p.length;
}

export interface TrainOptions {
  learningRate?: number;
  epochs?: number;
  /** L2 strength on the feature weights (the bias is never regularized) */
  lambda?: number;
  /** weights the penalty pulls toward (defaults to zeros); we pass the clinical prior */
  center?: readonly number[];
  /** stop when the loss improves by less than this between epochs */
  tolerance?: number;
}

export interface TrainResult {
  /** [bias, ...featureWeights] */
  weights: number[];
  epochs: number;
  loss: number;
}

/**
 * Batch gradient descent for L2-regularized logistic regression.
 * Objective: mean logloss + (lambda / 2) * ||w - center||^2 (bias excluded).
 * `x` rows are feature vectors WITHOUT the bias term; `initial` is [bias, ...w].
 */
export function trainLogistic(
  x: readonly (readonly number[])[],
  y: readonly number[],
  initial: readonly number[],
  opts: TrainOptions = {},
): TrainResult {
  const { epochs = 1500, lambda = 0.05, tolerance = 1e-9 } = opts;
  // The L2 term makes the problem stiffer: keep the step below 1/(curvature bound) or it diverges.
  const learningRate = Math.min(opts.learningRate ?? 0.2, 1 / (lambda + 1));
  const d = initial.length - 1;
  const center = opts.center ?? new Array<number>(d).fill(0);
  const w = [...initial];
  const n = x.length;
  if (n === 0) return { weights: w, epochs: 0, loss: 0 };

  const objective = (): number => {
    const p = x.map((row) => sigmoid((w[0] as number) + dot(w.slice(1), row)));
    let reg = 0;
    for (let j = 0; j < d; j++) reg += ((w[j + 1] as number) - (center[j] as number)) ** 2;
    return logLoss(p, y) + (lambda / 2) * reg;
  };

  let prev = objective();
  let done = 0;
  for (let e = 0; e < epochs; e++) {
    const grad = new Array<number>(d + 1).fill(0);
    for (let i = 0; i < n; i++) {
      const row = x[i] as readonly number[];
      const err = sigmoid((w[0] as number) + dot(w.slice(1), row)) - (y[i] as number);
      grad[0] = (grad[0] as number) + err;
      for (let j = 0; j < d; j++) grad[j + 1] = (grad[j + 1] as number) + err * (row[j] as number);
    }
    w[0] = (w[0] as number) - (learningRate * (grad[0] as number)) / n;
    for (let j = 0; j < d; j++) {
      const g = (grad[j + 1] as number) / n + lambda * ((w[j + 1] as number) - (center[j] as number));
      w[j + 1] = (w[j + 1] as number) - learningRate * g;
    }
    done = e + 1;
    const cur = objective();
    if (Math.abs(prev - cur) < tolerance) {
      prev = cur;
      break;
    }
    prev = cur;
  }
  return { weights: w, epochs: done, loss: prev };
}
