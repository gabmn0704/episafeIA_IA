export interface Interval {
  low: number;
  high: number;
}

/**
 * Wilson score interval for a binomial proportion. Behaves well for small n
 * and extreme proportions, unlike the normal (Wald) approximation.
 * @param z critical value (1.96 = 95%)
 */
export function wilsonInterval(successes: number, n: number, z = 1.96): Interval {
  if (n <= 0) return { low: 0, high: 1 };
  if (successes < 0 || successes > n) throw new RangeError('successes must be within [0, n]');
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}
