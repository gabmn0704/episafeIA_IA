import { ewma, mean, median, robustZ } from '../stats/robust.js';
import { round } from '../patterns/format.js';
import type { Anomaly } from './schemas.js';
import type { TimedSample } from './signals.js';

export const TACHYCARDIA_BPM = 120;
export const TACHYCARDIA_MIN_SECONDS = 30;
export const TACHYCARDIA_MIN_POINTS = 5;
export const HR_ANOMALY_Z = 3.5;
export const HR_ANOMALY_MIN_DELTA = 15;
const EWMA_ALPHA = 0.3;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export interface HeartPoint {
  t: number;
  hr: number;
  motion?: number;
}

export function heartSeries(samples: readonly TimedSample[]): HeartPoint[] {
  return samples.flatMap((s) =>
    s.heartRate !== undefined && s.heartRate > 20 && s.heartRate < 250
      ? [{ t: s.t, hr: s.heartRate, motion: s.motionIntensity }]
      : [],
  );
}

/**
 * Sustained tachycardia: the EWMA-smoothed heart rate stays at or above the
 * threshold for at least 30 s and 5 samples. Smoothing keeps a single noisy
 * reading from triggering it. High motion at the same time (exercise) halves
 * the confidence, since a fast pulse while running is expected.
 */
export function detectTachycardia(series: readonly HeartPoint[]): Anomaly | null {
  if (series.length < TACHYCARDIA_MIN_POINTS) return null;
  const smooth = ewma(series.map((p) => p.hr), EWMA_ALPHA);

  let best: { start: number; end: number } | null = null;
  let runStart = -1;
  for (let i = 0; i <= smooth.length; i++) {
    const hot = i < smooth.length && (smooth[i] as number) >= TACHYCARDIA_BPM;
    if (hot && runStart < 0) runStart = i;
    if (!hot && runStart >= 0) {
      const run = { start: runStart, end: i - 1 };
      const dur = (series[run.end] as HeartPoint).t - (series[run.start] as HeartPoint).t;
      const len = run.end - run.start + 1;
      if (dur / 1000 >= TACHYCARDIA_MIN_SECONDS && len >= TACHYCARDIA_MIN_POINTS) {
        const bestDur = best ? (series[best.end] as HeartPoint).t - (series[best.start] as HeartPoint).t : -1;
        if (dur > bestDur) best = run;
      }
      runStart = -1;
    }
  }
  if (!best) return null;

  const slice = smooth.slice(best.start, best.end + 1);
  const peak = Math.max(...slice);
  const durationSec = ((series[best.end] as HeartPoint).t - (series[best.start] as HeartPoint).t) / 1000;
  const motions = series.slice(best.start, best.end + 1).flatMap((p) => (p.motion === undefined ? [] : [p.motion]));
  const exerciseContext = motions.length > 0 && mean(motions) > 0.6;

  let confidence = 0.5 + 0.3 * clamp01((peak - TACHYCARDIA_BPM) / 40) + 0.2 * clamp01((durationSec - TACHYCARDIA_MIN_SECONDS) / 120);
  if (exerciseContext) confidence *= 0.5;

  return {
    kind: 'tachycardia',
    confidence: round(clamp01(confidence), 2),
    detail: `Pulso sostenido por encima de ${TACHYCARDIA_BPM} lpm durante ${Math.round(durationSec)} s (máximo suavizado ${Math.round(peak)} lpm).` +
      (exerciseContext ? ' Había mucho movimiento al mismo tiempo, puede ser ejercicio.' : ''),
    evidence: { peakEwma: round(peak, 1), durationSeconds: Math.round(durationSec), exerciseContext },
  };
}

/**
 * Heart-rate anomaly versus a reference: robust z-score (median/MAD) of the
 * recent smoothed pulse. The reference is `baselineHr` when provided,
 * otherwise the first half of the window itself.
 */
export function detectHrAnomaly(series: readonly HeartPoint[], baselineHr?: readonly number[]): Anomaly | null {
  const hrs = series.map((p) => p.hr);
  let reference: number[];
  let recent: number[];
  if (baselineHr && baselineHr.length >= 20) {
    reference = [...baselineHr];
    recent = hrs.slice(-5);
  } else {
    if (hrs.length < 20) return null;
    const cut = Math.floor(hrs.length / 2);
    reference = hrs.slice(0, cut);
    recent = hrs.slice(-5);
  }
  if (recent.length < 3) return null;
  const level = mean(ewma(recent, EWMA_ALPHA).slice(-1));
  const z = robustZ(level, reference);
  const refMedian = median(reference);
  const delta = level - refMedian;
  if (!Number.isFinite(z) || Math.abs(z) < HR_ANOMALY_Z || Math.abs(delta) < HR_ANOMALY_MIN_DELTA) return null;

  const confidence = 0.4 + 0.6 * clamp01((Math.abs(z) - HR_ANOMALY_Z) / 6);
  return {
    kind: 'hr_anomaly',
    confidence: round(confidence, 2),
    detail: `Pulso ${delta > 0 ? 'más alto' : 'más bajo'} de lo habitual: ${Math.round(level)} lpm frente a una referencia de ${Math.round(refMedian)} lpm.`,
    evidence: { robustZ: round(z, 2), level: round(level, 1), referenceMedian: refMedian, delta: round(delta, 1) },
  };
}
