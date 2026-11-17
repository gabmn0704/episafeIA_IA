import { describe, expect, it } from 'vitest';
import { analyzePatternsSchema } from '../../src/domain/schemas.js';
import { analyzePatterns } from '../../src/patterns/engine.js';
import { generateSynthetic } from '../helpers/synthetic.js';

const run = (data: ReturnType<typeof generateSynthetic>, extra: Record<string, unknown> = {}) =>
  analyzePatterns(analyzePatternsSchema.parse({ ...data, ...extra }));

describe('analyzePatterns on synthetic data with a known sleep effect', () => {
  it('recovers short sleep as the top trigger with a lift well above 1', () => {
    const { insights } = run(generateSynthetic({ days: 180, seed: 42 }));
    const top = insights[0];
    expect(top?.kind).toBe('trigger_pattern');
    expect(top?.evidence.factor).toBe('short_sleep');
    expect(top?.evidence.lift as number).toBeGreaterThan(5);
    const [low] = top?.evidence.liftInterval95 as number[];
    expect(low).toBeGreaterThan(1);
    expect(top?.body).toContain('menos de 5 horas de sueño');
    expect(top?.confidence).toBeGreaterThan(0.5);
  });

  it('does not report the independent noise factors', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { insights } = run(generateSynthetic({ days: 240, seed }));
      const factors = insights.filter((i) => i.kind === 'trigger_pattern').map((i) => i.evidence.factor);
      expect(factors).not.toContain('high_caffeine');
      expect(factors).not.toContain('alcohol');
      expect(factors).not.toContain('missed_meds');
      expect(factors).not.toContain('low_mood');
    }
  });

  it('reports nothing when there is no real association at all', () => {
    const data = generateSynthetic({ days: 240, seed: 9, pSeizureShortSleep: 0.05, pSeizureBaseline: 0.05 });
    const { insights } = run(data);
    expect(insights.filter((i) => i.kind === 'trigger_pattern')).toEqual([]);
  });

  it('refuses to conclude with too little data', () => {
    const d = generateSynthetic({ days: 10, seed: 42, pSeizureShortSleep: 1, pShortSleep: 0.5 });
    expect(run(d).insights.filter((i) => i.kind === 'trigger_pattern')).toEqual([]);
  });

  it('refuses to conclude from fewer than 3 seizures', () => {
    const d = generateSynthetic({ days: 120, seed: 42 });
    d.seizures = d.seizures.slice(0, 2);
    expect(run(d).insights.filter((i) => i.kind === 'trigger_pattern')).toEqual([]);
  });

  it('respects maxInsights and explains the lack of data for empty input', () => {
    expect(run(generateSynthetic({ days: 180, seed: 42 }), { maxInsights: 1 }).insights.length).toBeLessThanOrEqual(1);
    expect(analyzePatterns(analyzePatternsSchema.parse({})).insights.map((i) => i.kind)).toEqual(['insufficient_data']);
  });
});

describe('other detectors and data sufficiency', () => {
  it('flags concentration of seizures in the morning window', () => {
    const { insights } = run(generateSynthetic({ days: 180, seed: 42 }));
    const t = insights.find((i) => i.kind === 'time_of_day');
    expect(t?.evidence.bucket).toBe('morning');
  });

  it('explains what is missing when data is insufficient', () => {
    const { insights } = run(generateSynthetic({ days: 5, seed: 1 }));
    expect(insights).toHaveLength(1);
    expect(insights[0]?.kind).toBe('insufficient_data');
    expect(insights[0]?.confidence).toBe(0);
  });

  it('reports self-noted triggers that repeat', () => {
    const d = generateSynthetic({ days: 120, seed: 11 });
    d.seizures = d.seizures.map((s, i) => ({ ...s, triggersNoted: i % 2 === 0 ? ['Luces parpadeantes'] : [] }));
    const { insights } = run(d);
    expect(insights.some((i) => i.kind === 'self_reported_trigger')).toBe(true);
  });

  it('only pairs factors that are individually significant', () => {
    const d = generateSynthetic({ days: 300, seed: 21, pSeizureHighStress: 0.5 });
    const { insights } = run(d);
    const pair = insights.find((i) => i.kind === 'cooccurrence');
    if (pair) {
      const individually = insights.filter((i) => i.kind === 'trigger_pattern').map((i) => i.evidence.factor);
      for (const f of pair.evidence.factors as string[]) expect(individually).toContain(f);
    }
    const factors = insights.filter((i) => i.kind === 'trigger_pattern').map((i) => i.evidence.factor);
    expect(factors).toContain('short_sleep');
    expect(factors).toContain('high_stress');
  });
});
