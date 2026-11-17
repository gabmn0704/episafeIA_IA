import { describe, expect, it } from 'vitest';
import { ewma, mad, mean, median, robustZ, stdev } from '../../src/stats/robust.js';

describe('basic stats', () => {
  it('mean, stdev and median', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(mean([])).toBe(0);
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe('robustZ', () => {
  it('computes MAD correctly', () => {
    expect(mad([1, 1, 2, 2, 4, 6, 9])).toBe(1);
  });

  it('is not inflated by outliers in the reference', () => {
    const ref = [70, 71, 72, 70, 69, 71, 72, 70, 250, 71];
    const z = robustZ(100, ref);
    const classic = (100 - mean(ref)) / stdev(ref);
    expect(z).toBeGreaterThan(5);
    expect(classic).toBeLessThan(1);
  });

  it('handles constant references without NaN', () => {
    expect(robustZ(5, [5, 5, 5])).toBe(0);
    expect(robustZ(6, [5, 5, 5])).toBe(Infinity);
    expect(robustZ(1, [])).toBe(0);
  });
});

describe('ewma', () => {
  it('smooths and converges toward a step', () => {
    const out = ewma([0, 10, 10, 10], 0.5);
    expect(out).toEqual([0, 5, 7.5, 8.75]);
  });

  it('rejects invalid alpha', () => {
    expect(() => ewma([1], 0)).toThrow(RangeError);
    expect(() => ewma([1], 1.2)).toThrow(RangeError);
  });
});
