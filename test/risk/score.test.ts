import { describe, expect, it } from 'vitest';
import { featurize, FEATURE_NAMES } from '../../src/risk/features.js';
import { sigmoid } from '../../src/risk/logistic.js';
import { PRIOR_WEIGHTS } from '../../src/risk/prior.js';
import { levelFor, riskScoreSchema, scoreRisk } from '../../src/risk/score.js';
import { trainFromHistory, historySchema } from '../../src/risk/train.js';
import { rng } from '../helpers/synthetic.js';

const score = (today: Record<string, unknown>, history?: unknown) =>
  scoreRisk(riskScoreSchema.parse({ today, history }));

describe('risk score with the clinical prior', () => {
  const good = { sleepHours: 8, stressLevel: 3, caffeineMg: 100, exerciseMinutes: 30, missedMeds: 0 };
  const bad = { sleepHours: 3.5, stressLevel: 9, caffeineMg: 500, exerciseMinutes: 0, missedMeds: 2 };

  it('gives a low score for a good day and a high one for a bad day', () => {
    const g = score(good);
    const b = score(bad);
    expect(g.level).toBe('low');
    expect(g.score).toBeLessThan(10);
    expect(['high', 'critical']).toContain(b.level);
    expect(b.score).toBeGreaterThan(g.score + 40);
    expect(g.modelVersion).toBe('logit-prior-1.0');
    expect(g.personalized).toBe(false);
  });

  it('is monotonic: less sleep never lowers the score', () => {
    const scores = [9, 8, 7, 6, 5, 4, 3].map((h) => score({ ...good, sleepHours: h }).score);
    for (let i = 1; i < scores.length; i++) expect(scores[i] as number).toBeGreaterThanOrEqual(scores[i - 1] as number);
  });

  it('explains the score: factors sorted by absolute impact, with direction and detail', () => {
    const r = score(bad);
    expect(r.factors.length).toBeGreaterThan(3);
    const impacts = r.factors.map((f) => Math.abs(f.impact));
    expect([...impacts].sort((a, b) => b - a)).toEqual(impacts);
    expect(r.factors.every((f) => f.direction === 'increases')).toBe(true);
    expect(r.factors.find((f) => f.name === 'Sueño')?.detail).toContain('3,5 h');
  });

  it('marks protective factors as decreasing', () => {
    const r = score({ ...good, sleepHours: 9.5 });
    expect(r.factors.find((f) => f.name === 'Sueño')?.direction).toBe('decreases');
  });

  it('works with no data at all and reports lower confidence than with full data', () => {
    const empty = score({});
    const full = score(good);
    expect(empty.score).toBeGreaterThanOrEqual(0);
    expect(empty.confidence).toBeLessThan(full.confidence);
    expect(empty.factors).toEqual([]);
  });

  it('uses wearable signals when present', () => {
    const base = score(good);
    const hot = score({ ...good, hrAvg: 110, hrvMs: 15, motion: 0.9 });
    expect(hot.score).toBeGreaterThan(base.score);
    expect(hot.factors.map((f) => f.name)).toEqual(expect.arrayContaining(['Pulso', 'Variabilidad cardíaca']));
  });

  it('maps scores to levels at 25/50/75', () => {
    expect([0, 24, 25, 49, 50, 74, 75, 100].map(levelFor)).toEqual([
      'low', 'low', 'moderate', 'moderate', 'high', 'high', 'critical', 'critical',
    ]);
  });

  it('accepts numeric strings and snake_case, and rejects bad payloads', () => {
    const r = riskScoreSchema.parse({ today: { sleep_hours: '4.5', stress_level: 8 } });
    expect(r.today.sleepHours).toBe(4.5);
    expect(riskScoreSchema.safeParse({}).success).toBe(false);
    expect(riskScoreSchema.safeParse({ today: { sleepHours: 'abc' } }).success).toBe(false);
    expect(riskScoreSchema.safeParse({ today: {}, weights: [1, 2] }).success).toBe(false);
  });
});

/** Builds a history from a known truth: seizures are driven by STRESS, not by sleep. */
function stressDrivenHistory(n: number, seed: number) {
  const r = rng(seed);
  const trueW = PRIOR_WEIGHTS.map((w, i) => (i === 0 ? -3.2 : FEATURE_NAMES[i - 1] === 'stress' ? 2.6 : FEATURE_NAMES[i - 1] === 'sleep' ? 0 : w * 0.2));
  const days = Array.from({ length: n }, () => {
    const d = {
      sleepHours: 4 + r() * 5,
      stressLevel: 1 + Math.floor(r() * 10),
      caffeineMg: Math.floor(r() * 500),
      exerciseMinutes: Math.floor(r() * 60),
      missedMeds: r() < 0.1 ? 1 : 0,
    };
    const x = featurize(d);
    const z = (trueW[0] as number) + x.reduce((a, v, i) => a + v * (trueW[i + 1] as number), 0);
    return { ...d, seizure: r() < sigmoid(z) };
  });
  return historySchema.parse({ days });
}

describe('personalized training', () => {
  it('falls back to the prior when the history is too short', () => {
    const t = trainFromHistory(stressDrivenHistory(20, 1));
    expect(t.personalized).toBe(false);
    expect(t.weights).toEqual([...PRIOR_WEIGHTS]);
    expect(t.reason).toMatch(/30 días/);
  });

  it('falls back when there are too few seizure days', () => {
    const h = stressDrivenHistory(60, 2);
    h.days = h.days.map((d) => ({ ...d, seizure: false }));
    expect(trainFromHistory(h).reason).toMatch(/días con crisis/);
  });

  it('learns from the user history: stress weight up, sleep weight down vs the prior', () => {
    const h = stressDrivenHistory(600, 3);
    const t = trainFromHistory(h);
    expect(t.personalized).toBe(true);
    const iStress = FEATURE_NAMES.indexOf('stress') + 1;
    const iSleep = FEATURE_NAMES.indexOf('sleep') + 1;
    expect(t.weights[iStress] as number).toBeGreaterThan(PRIOR_WEIGHTS[iStress] as number);
    expect(t.weights[iSleep] as number).toBeLessThan(PRIOR_WEIGHTS[iSleep] as number);
    expect(t.metrics!.trainedLogLoss).toBeLessThan(t.metrics!.priorLogLoss);
    expect(t.modelVersion).toBe('logit-personal-1.0-n600');
  });

  it('the personalized score reacts to stress more than the prior does', () => {
    const h = stressDrivenHistory(600, 4);
    const stressed = { sleepHours: 8, stressLevel: 10, caffeineMg: 150, exerciseMinutes: 30, missedMeds: 0 };
    const tired = { sleepHours: 4, stressLevel: 3, caffeineMg: 150, exerciseMinutes: 30, missedMeds: 0 };
    const withHistory = (day: Record<string, unknown>) => score(day, h);
    expect(withHistory(stressed).score).toBeGreaterThan(withHistory(tired).score);
    expect(score(stressed).score).toBeLessThanOrEqual(score(tired).score + 5);
    expect(withHistory(stressed).personalized).toBe(true);
  });

  it('is deterministic', () => {
    const h = stressDrivenHistory(120, 5);
    expect(trainFromHistory(h)).toEqual(trainFromHistory(h));
  });

  it('uses supplied weights without training', () => {
    const w = [...PRIOR_WEIGHTS];
    w[0] = 3;
    const r = scoreRisk(riskScoreSchema.parse({ today: {}, weights: w }));
    expect(r.score).toBe(Math.round(sigmoid(3) * 100));
  });
});
