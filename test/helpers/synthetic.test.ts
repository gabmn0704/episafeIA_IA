import { describe, expect, it } from 'vitest';
import { generateSynthetic, rng } from './synthetic.js';

describe('synthetic generator', () => {
  it('is deterministic for a seed', () => {
    expect(generateSynthetic({ seed: 7 })).toEqual(generateSynthetic({ seed: 7 }));
    expect(rng(1)()).toBe(rng(1)());
  });

  it('builds one log per day with a clearly higher seizure rate after short sleep', () => {
    const d = generateSynthetic({ days: 400, seed: 3 });
    expect(d.dailyLogs).toHaveLength(400);
    const seizureDays = new Set(d.seizures.map((s) => s.startedAt.slice(0, 10)));
    const short = d.dailyLogs.filter((l) => l.sleepHours < 5);
    const rest = d.dailyLogs.filter((l) => l.sleepHours >= 5);
    const rate = (ls: typeof short) => ls.filter((l) => seizureDays.has(l.logDate)).length / ls.length;
    expect(rate(short)).toBeGreaterThan(rate(rest) * 5);
  });
});
