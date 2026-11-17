import { describe, expect, it } from 'vitest';
import { wearableEvaluateSchema } from '../../src/wearable/schemas.js';
import { evaluateWearable } from '../../src/wearable/evaluate.js';
import { rng } from '../helpers/synthetic.js';

const T0 = Date.parse('2025-06-01T10:00:00Z');

type Sample = Record<string, unknown>;

/** accelerometer stream: g(t) in g units at `hz` for `seconds` */
function accelStream(seconds: number, hz: number, g: (t: number) => number): Sample[] {
  const out: Sample[] = [];
  for (let i = 0; i < seconds * hz; i++) {
    const t = i / hz;
    out.push({ sampledAt: new Date(T0 + t * 1000).toISOString(), accelMagnitude: g(t) });
  }
  return out;
}

/** heart-rate stream at 1 Hz */
function hrStream(seconds: number, hr: (t: number) => number, extra: Sample = {}): Sample[] {
  return Array.from({ length: seconds }, (_, t) => ({
    sampledAt: new Date(T0 + t * 1000).toISOString(),
    heartRate: hr(t),
    ...extra,
  }));
}

const evaluate = (window: Sample[], extra: Record<string, unknown> = {}) =>
  evaluateWearable(wearableEvaluateSchema.parse({ window, ...extra }));

describe('convulsive movement (3-8 Hz energy)', () => {
  it('flags a 5 Hz shaking window', () => {
    const r = evaluate(accelStream(8, 32, (t) => 1 + 0.7 * Math.sin(2 * Math.PI * 5 * t)));
    const a = r.anomalies.find((x) => x.kind === 'motion_convulsive');
    expect(a).toBeDefined();
    expect(a!.confidence).toBeGreaterThan(0.5);
    expect(a!.evidence.peakHz as number).toBeCloseTo(5, 0);
    expect(r.summary.accelSampleRateHz).toBeCloseTo(32, 0);
  });

  it('does not flag slow walking-like motion (1.5 Hz) or rest noise', () => {
    const walk = evaluate(accelStream(8, 32, (t) => 1 + 0.6 * Math.sin(2 * Math.PI * 1.5 * t)));
    expect(walk.anomalies.find((x) => x.kind === 'motion_convulsive')).toBeUndefined();
    const r = rng(3);
    const rest = evaluate(accelStream(8, 32, () => 1 + (r() - 0.5) * 0.02));
    expect(rest.anomalies).toEqual([]);
  });

  it('does not flag a 5 Hz tremor with negligible amplitude', () => {
    const r = evaluate(accelStream(8, 32, (t) => 1 + 0.05 * Math.sin(2 * Math.PI * 5 * t)));
    expect(r.anomalies.find((x) => x.kind === 'motion_convulsive')).toBeUndefined();
  });

  it('accepts m/s^2 units and raw axes', () => {
    const win = accelStream(8, 32, (t) => 9.80665 * (1 + 0.7 * Math.sin(2 * Math.PI * 5 * t)));
    expect(evaluate(win).anomalies.some((x) => x.kind === 'motion_convulsive')).toBe(true);
    const axes = Array.from({ length: 8 * 32 }, (_, i) => ({
      sampledAt: new Date(T0 + (i / 32) * 1000).toISOString(),
      ax: 0,
      ay: 0,
      az: 1 + 0.7 * Math.sin(2 * Math.PI * 5 * (i / 32)),
    }));
    expect(evaluate(axes).anomalies.some((x) => x.kind === 'motion_convulsive')).toBe(true);
  });

  it('explains when the sampling rate is too low for the band', () => {
    const r = evaluate(accelStream(20, 8, (t) => 1 + 0.7 * Math.sin(2 * Math.PI * 3 * t)));
    expect(r.anomalies.find((x) => x.kind === 'motion_convulsive')).toBeUndefined();
    expect(r.notes.join(' ')).toMatch(/16 Hz/);
  });

  it('notes the absence of an accelerometer', () => {
    const r = evaluate(hrStream(60, () => 70));
    expect(r.notes.join(' ')).toMatch(/Sin acelerómetro/);
  });
});

describe('falls', () => {
  it('detects an impact followed by stillness', () => {
    const win = accelStream(10, 32, (t) => (t >= 3 && t < 3.1 ? 3.4 : 1));
    const f = evaluate(win).anomalies.find((x) => x.kind === 'fall');
    expect(f).toBeDefined();
    expect(f!.evidence.peakG as number).toBeCloseTo(3.4, 1);
  });

  it('ignores an impact when movement continues afterwards', () => {
    const win = accelStream(10, 32, (t) => (t >= 3 && t < 3.1 ? 3.4 : 1 + 0.5 * Math.sin(2 * Math.PI * 1.2 * t)));
    expect(evaluate(win).anomalies.find((x) => x.kind === 'fall')).toBeUndefined();
  });
});

describe('heart rate', () => {
  it('flags sustained tachycardia', () => {
    const r = evaluate(hrStream(120, (t) => (t < 20 ? 75 : 135)));
    const a = r.anomalies.find((x) => x.kind === 'tachycardia');
    expect(a).toBeDefined();
    expect(a!.confidence).toBeGreaterThan(0.5);
  });

  it('ignores a brief spike (EWMA smoothing + minimum duration)', () => {
    const r = evaluate(hrStream(120, (t) => (t === 60 || t === 61 ? 150 : 75)));
    expect(r.anomalies.find((x) => x.kind === 'tachycardia')).toBeUndefined();
  });

  it('halves the confidence when strong motion suggests exercise', () => {
    const rest = evaluate(hrStream(120, () => 135)).anomalies[0]!;
    const run = evaluate(hrStream(120, () => 135, { motionIntensity: 0.9 })).anomalies[0]!;
    expect(run.evidence.exerciseContext).toBe(true);
    expect(run.confidence).toBeLessThan(rest.confidence);
  });

  it('flags a sudden low pulse with a robust z-score vs the baseline', () => {
    const r = rng(4);
    const baseline = Array.from({ length: 200 }, () => 70 + Math.round((r() - 0.5) * 6));
    const out = evaluate(hrStream(30, () => 42), { baselineHr: baseline });
    const a = out.anomalies.find((x) => x.kind === 'hr_anomaly');
    expect(a).toBeDefined();
    expect(a!.evidence.delta as number).toBeLessThan(-15);
  });

  it('does not duplicate a fast pulse as both tachycardia and anomaly', () => {
    const r = rng(5);
    const baseline = Array.from({ length: 200 }, () => 70 + Math.round((r() - 0.5) * 6));
    const out = evaluate(hrStream(120, () => 140), { baselineHr: baseline });
    expect(out.anomalies.map((x) => x.kind)).toEqual(['tachycardia']);
  });

  it('stays quiet on a normal window and ignores implausible readings', () => {
    const r = rng(6);
    const out = evaluate(hrStream(120, () => 72 + Math.round((r() - 0.5) * 6)));
    expect(out.anomalies).toEqual([]);
    expect(out.summary.hrMean).toBeGreaterThan(68);
    expect(evaluate(hrStream(60, () => 400)).summary.hrMean).toBeNull();
  });
});

describe('window handling', () => {
  it('handles an empty window', () => {
    const out = evaluate([]);
    expect(out.anomalies).toEqual([]);
    expect(out.summary.samples).toBe(0);
  });

  it('accepts unordered samples and snake_case fields', () => {
    const w = hrStream(120, (t) => (t < 20 ? 75 : 135)).reverse().map((s) => ({
      sampled_at: s.sampledAt,
      heart_rate: s.heartRate,
    }));
    expect(evaluate(w).anomalies.some((x) => x.kind === 'tachycardia')).toBe(true);
  });

  it('rejects invalid timestamps', () => {
    expect(wearableEvaluateSchema.safeParse({ window: [{ sampledAt: 'nope' }] }).success).toBe(false);
  });
});
