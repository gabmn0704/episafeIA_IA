import { describe, expect, it } from 'vitest';
import { wilsonInterval } from '../../src/stats/wilson.js';

describe('wilsonInterval', () => {
  it('matches the reference value for 8/10 at 95%', () => {
    const { low, high } = wilsonInterval(8, 10);
    expect(low).toBeCloseTo(0.4902, 3);
    expect(high).toBeCloseTo(0.9433, 3);
  });

  it('stays inside [0,1] at the extremes and is wide for tiny samples', () => {
    const zero = wilsonInterval(0, 5);
    const all = wilsonInterval(5, 5);
    expect(zero.low).toBe(0);
    expect(all.high).toBeLessThanOrEqual(1);
    expect(all.low).toBeGreaterThan(0.4);
    expect(all.high - all.low).toBeGreaterThan(0.3);
  });

  it('narrows as n grows for the same proportion', () => {
    const a = wilsonInterval(8, 10);
    const b = wilsonInterval(800, 1000);
    expect(b.high - b.low).toBeLessThan(a.high - a.low);
  });

  it('handles n=0 and rejects impossible counts', () => {
    expect(wilsonInterval(0, 0)).toEqual({ low: 0, high: 1 });
    expect(() => wilsonInterval(3, 2)).toThrow(RangeError);
  });
});
