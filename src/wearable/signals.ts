import { median } from '../stats/robust.js';
import type { WearableSample } from './schemas.js';

export interface TimedSample extends WearableSample {
  t: number; // ms epoch
}

export function toTimed(window: readonly WearableSample[]): TimedSample[] {
  return window.map((s) => ({ ...s, t: new Date(s.sampledAt).getTime() })).sort((a, b) => a.t - b.t);
}

const G = 9.80665;

/** Acceleration magnitude per sample, in g. Empty when there is no accelerometer data. */
export function accelMagnitudesG(samples: readonly TimedSample[]): Array<{ t: number; g: number }> {
  const raw: Array<{ t: number; m: number }> = [];
  for (const s of samples) {
    if (s.ax !== undefined && s.ay !== undefined && s.az !== undefined) {
      raw.push({ t: s.t, m: Math.hypot(s.ax, s.ay, s.az) });
    } else if (s.accelMagnitude !== undefined) {
      raw.push({ t: s.t, m: s.accelMagnitude });
    }
  }
  if (raw.length === 0) return [];
  // Resting magnitude is ~1 g or ~9.8 m/s^2: tell the unit apart by the median.
  const unitIsMs2 = median(raw.map((r) => r.m)) > 4;
  return raw.map((r) => ({ t: r.t, g: unitIsMs2 ? r.m / G : r.m }));
}

/** Sampling rate estimated from the median time step; null when not computable. */
export function estimateRateHz(times: readonly number[]): number | null {
  if (times.length < 3) return null;
  const dts: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const dt = (times[i] as number) - (times[i - 1] as number);
    if (dt > 0) dts.push(dt);
  }
  if (dts.length === 0) return null;
  const m = median(dts);
  return m > 0 ? 1000 / m : null;
}
