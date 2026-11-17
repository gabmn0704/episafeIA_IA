export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function stdev(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return Math.sqrt(s / (xs.length - 1));
}

export function median(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

/** Median absolute deviation (raw, not scaled). */
export function mad(xs: readonly number[]): number {
  const m = median(xs);
  return median(xs.map((x) => Math.abs(x - m)));
}

/** 1.4826 makes MAD a consistent estimator of sigma for normal data. */
const MAD_TO_SIGMA = 1.4826;

/**
 * Robust z-score of `x` against a reference sample: (x - median) / (1.4826 * MAD).
 * Unlike the classic z-score, outliers inside the reference do not inflate the scale.
 * Falls back to the mean absolute deviation when MAD is 0 (many identical values).
 */
export function robustZ(x: number, reference: readonly number[]): number {
  if (reference.length === 0) return 0;
  const med = median(reference);
  let scale = MAD_TO_SIGMA * mad(reference);
  if (scale === 0) {
    const meanAbs = mean(reference.map((v) => Math.abs(v - med)));
    scale = 1.2533 * meanAbs; // sqrt(pi/2): mean abs dev -> sigma
  }
  if (scale === 0) return x === med ? 0 : Math.sign(x - med) * Infinity;
  return (x - med) / scale;
}

/** Exponentially weighted moving average series; alpha in (0, 1]. */
export function ewma(xs: readonly number[], alpha: number): number[] {
  if (!(alpha > 0 && alpha <= 1)) throw new RangeError('alpha must be in (0, 1]');
  const out: number[] = [];
  let prev: number | undefined;
  for (const x of xs) {
    prev = prev === undefined ? x : alpha * x + (1 - alpha) * prev;
    out.push(prev);
  }
  return out;
}
