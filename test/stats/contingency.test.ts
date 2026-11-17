import { describe, expect, it } from 'vitest';
import { buildContingency, contingencyStats } from '../../src/stats/contingency.js';

describe('contingency', () => {
  it('counts the four cells', () => {
    const t = buildContingency([
      { exposed: true, outcome: true },
      { exposed: true, outcome: false },
      { exposed: false, outcome: true },
      { exposed: false, outcome: false },
      { exposed: false, outcome: false },
    ]);
    expect(t).toEqual({ a: 1, b: 1, c: 1, d: 2 });
  });

  it('computes conditional probabilities and lift', () => {
    const s = contingencyStats({ a: 8, b: 12, c: 4, d: 76 });
    expect(s.n).toBe(100);
    expect(s.pExposed).toBeCloseTo(0.4);
    expect(s.pUnexposed).toBeCloseTo(0.05);
    expect(s.lift).toBeGreaterThan(5);
    expect(s.liftInterval.low).toBeGreaterThan(1);
    expect(s.outcomeShareExposed).toBeCloseTo(8 / 12);
  });

  it('gives a lift near 1 and an interval containing 1 when independent', () => {
    const s = contingencyStats({ a: 10, b: 40, c: 20, d: 80 });
    expect(s.lift).toBeGreaterThan(0.6);
    expect(s.lift).toBeLessThan(1.4);
    expect(s.liftInterval.low).toBeLessThan(1);
    expect(s.liftInterval.high).toBeGreaterThan(1);
  });

  it('stays finite with empty cells', () => {
    const s = contingencyStats({ a: 5, b: 0, c: 0, d: 20 });
    expect(Number.isFinite(s.lift)).toBe(true);
    expect(Number.isFinite(s.liftInterval.high)).toBe(true);
  });
});
