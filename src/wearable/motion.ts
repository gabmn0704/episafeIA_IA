import { bandEnergy, detrend } from '../dsp/dft.js';
import { round } from '../patterns/format.js';
import { mean, stdev } from '../stats/robust.js';
import type { Anomaly } from './schemas.js';
import { estimateRateHz } from './signals.js';

export const CONVULSIVE_BAND_HZ: readonly [number, number] = [3, 8];
export const CONVULSIVE_MIN_RATIO = 0.5;
export const CONVULSIVE_MIN_RMS_G = 0.25;
export const CONVULSIVE_MIN_SECONDS = 3;
/** the band reaches 8 Hz, so Nyquist asks for at least 16 Hz sampling */
export const MIN_RATE_HZ = 16;
const MAX_DFT_SAMPLES = 256;

export const FALL_IMPACT_G = 2.5;
export const FALL_STILL_SECONDS = 2;
export const FALL_STILL_STD_G = 0.12;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export interface AccelPoint {
  t: number;
  g: number;
}

export type MotionResult = { anomalies: Anomaly[]; rateHz: number | null; note?: string };

/**
 * Convulsive movement: rhythmic, high-energy shaking concentrates power in
 * 3-8 Hz. We require the band to hold at least half of the (non-DC) energy
 * AND an RMS amplitude of at least 0.25 g, so neither slow voluntary
 * movement nor tiny tremor noise qualifies.
 */
export function detectConvulsive(points: readonly AccelPoint[], rateHz: number): Anomaly | null {
  const recent = points.slice(-MAX_DFT_SAMPLES);
  if (recent.length < rateHz * CONVULSIVE_MIN_SECONDS) return null;
  const signal = recent.map((p) => p.g);
  const e = bandEnergy(signal, rateHz, CONVULSIVE_BAND_HZ[0], CONVULSIVE_BAND_HZ[1]);
  const d = detrend(signal);
  const rms = Math.sqrt(mean(d.map((v) => v * v)));
  if (e.ratio < CONVULSIVE_MIN_RATIO || rms < CONVULSIVE_MIN_RMS_G) return null;

  const confidence = 0.4 + 0.3 * clamp01((e.ratio - CONVULSIVE_MIN_RATIO) / 0.4) + 0.3 * clamp01((rms - CONVULSIVE_MIN_RMS_G) / 0.6);
  const seconds = (recent.length - 1) / rateHz;
  return {
    kind: 'motion_convulsive',
    confidence: round(clamp01(confidence), 2),
    detail: `Movimiento rítmico intenso a ${e.peakHz.toFixed(1).replace('.', ',')} Hz durante unos ${Math.round(seconds)} s (${Math.round(e.ratio * 100)}% de la energía en la banda 3-8 Hz).`,
    evidence: { bandRatio: round(e.ratio, 3), rmsG: round(rms, 3), peakHz: round(e.peakHz, 2), seconds: round(seconds, 1), rateHz: round(rateHz, 1) },
  };
}

/** Impact (>= 2.5 g) followed by at least 2 s of near-stillness around 1 g. */
export function detectFall(points: readonly AccelPoint[]): Anomaly | null {
  let peakIdx = -1;
  for (let i = 0; i < points.length; i++) {
    if ((points[i] as AccelPoint).g >= FALL_IMPACT_G && (peakIdx < 0 || (points[i] as AccelPoint).g > (points[peakIdx] as AccelPoint).g)) {
      peakIdx = i;
    }
  }
  if (peakIdx < 0) return null;
  const peak = points[peakIdx] as AccelPoint;
  const after = points.filter((p) => p.t > peak.t + 500); // skip the bounce right after the impact
  if (after.length < 3) return null;
  const stillSec = ((after[after.length - 1] as AccelPoint).t - (after[0] as AccelPoint).t) / 1000;
  if (stillSec < FALL_STILL_SECONDS) return null;
  const g = after.map((p) => p.g);
  const sd = stdev(g);
  const m = mean(g);
  if (sd > FALL_STILL_STD_G || m < 0.8 || m > 1.2) return null;

  const confidence = 0.5 + 0.3 * clamp01((peak.g - FALL_IMPACT_G) / 2) + 0.2 * clamp01((stillSec - FALL_STILL_SECONDS) / 8);
  return {
    kind: 'fall',
    confidence: round(clamp01(confidence), 2),
    detail: `Golpe de ${peak.g.toFixed(1).replace('.', ',')} g seguido de ${Math.round(stillSec)} s de quietud.`,
    evidence: { peakG: round(peak.g, 2), stillSeconds: round(stillSec, 1), stillStdG: round(sd, 3) },
  };
}

export function evaluateMotion(points: readonly AccelPoint[]): MotionResult {
  if (points.length === 0) return { anomalies: [], rateHz: null, note: 'Sin acelerómetro: no se evaluó movimiento convulsivo ni caídas.' };
  const rateHz = estimateRateHz(points.map((p) => p.t));
  const anomalies: Anomaly[] = [];
  const fall = detectFall(points);
  if (fall) anomalies.push(fall);
  if (rateHz === null || rateHz < MIN_RATE_HZ) {
    return {
      anomalies,
      rateHz,
      note: `La frecuencia de muestreo del acelerómetro (${rateHz === null ? 'desconocida' : rateHz.toFixed(1).replace('.', ',')} Hz) es menor de ${MIN_RATE_HZ} Hz: no se puede analizar la banda 3-8 Hz.`,
    };
  }
  const convulsive = detectConvulsive(points, rateHz);
  if (convulsive) anomalies.push(convulsive);
  return { anomalies, rateHz };
}
