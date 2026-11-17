import { describe, expect, it } from 'vitest';
import { brier, logLoss, sigmoid, trainLogistic } from '../../src/risk/logistic.js';
import { rng } from '../helpers/synthetic.js';

describe('logistic primitives', () => {
  it('sigmoid is stable at the extremes and symmetric', () => {
    expect(sigmoid(0)).toBe(0.5);
    expect(sigmoid(1000)).toBe(1);
    expect(sigmoid(-1000)).toBe(0);
    expect(sigmoid(2) + sigmoid(-2)).toBeCloseTo(1);
  });

  it('logLoss and brier penalize confident mistakes', () => {
    expect(logLoss([0.9], [1])).toBeLessThan(logLoss([0.1], [1]));
    expect(brier([1], [1])).toBe(0);
    expect(brier([0], [1])).toBe(1);
    expect(logLoss([0], [1])).toBeGreaterThan(20);
  });
});

describe('trainLogistic', () => {
  const makeData = (n: number, seed: number) => {
    const r = rng(seed);
    const x: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = r() * 2 - 1;
      const b = r() * 2 - 1;
      x.push([a, b]);
      // true model: logit = -1 + 3a + 0b
      y.push(r() < sigmoid(-1 + 3 * a) ? 1 : 0);
    }
    return { x, y };
  };

  it('recovers the sign and rough size of the true weights', () => {
    const { x, y } = makeData(2000, 5);
    const res = trainLogistic(x, y, [0, 0, 0], { lambda: 0.001, epochs: 3000 });
    expect(res.weights[1]).toBeGreaterThan(2);
    expect(Math.abs(res.weights[2] as number)).toBeLessThan(0.6);
    expect(res.weights[0]).toBeLessThan(-0.4);
  });

  it('decreases the loss versus the initial weights', () => {
    const { x, y } = makeData(500, 6);
    const init = [0, 0, 0];
    const before = logLoss(x.map(() => 0.5), y);
    const res = trainLogistic(x, y, init, { lambda: 0.01 });
    expect(res.loss).toBeLessThan(before);
  });

  it('L2 shrinks weights toward the center: stronger lambda means smaller weights', () => {
    const { x, y } = makeData(300, 7);
    const weak = trainLogistic(x, y, [0, 0, 0], { lambda: 0.001, epochs: 2000 });
    const strong = trainLogistic(x, y, [0, 0, 0], { lambda: 1, epochs: 2000 });
    expect(Math.abs(strong.weights[1] as number)).toBeLessThan(Math.abs(weak.weights[1] as number));
  });

  it('with a strong penalty it stays near a non-zero center (the prior)', () => {
    const { x, y } = makeData(40, 8);
    const res = trainLogistic(x, y, [0, 1, 1], { lambda: 50, center: [1, 1], epochs: 800 });
    expect(res.weights[1]).toBeCloseTo(1, 1);
    expect(res.weights[2]).toBeCloseTo(1, 1);
  });

  it('returns the initial weights for empty data', () => {
    expect(trainLogistic([], [], [0.3, 1]).weights).toEqual([0.3, 1]);
  });
});
