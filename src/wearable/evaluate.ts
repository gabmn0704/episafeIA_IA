import { ewma, mean } from '../stats/robust.js';
import { round } from '../patterns/format.js';
import { CircularBuffer } from '../structures/circular-buffer.js';
import { detectHrAnomaly, detectTachycardia, heartSeries } from './heart.js';
import { evaluateMotion } from './motion.js';
import type { Anomaly, WearableEvaluateInput, WearableEvaluation } from './schemas.js';
import { accelMagnitudesG, toTimed } from './signals.js';

/** Keeps the most recent samples, like the live window the API maintains. */
export const MAX_WINDOW = 1500;

export function evaluateWearable(input: WearableEvaluateInput): WearableEvaluation {
  // CircularBuffer bounds memory and keeps only the newest samples if a huge window is sent.
  const ring = new CircularBuffer<(typeof input.window)[number]>(MAX_WINDOW);
  for (const s of input.window) ring.push(s);
  const samples = toTimed(ring.toArray());

  const notes: string[] = [];
  const anomalies: Anomaly[] = [];

  const hr = heartSeries(samples);
  const tachy = detectTachycardia(hr);
  if (tachy) anomalies.push(tachy);
  const hrAnomaly = detectHrAnomaly(hr, input.baselineHr);
  // a fast pulse is already reported as tachycardia: avoid saying the same thing twice
  if (hrAnomaly && !(tachy && (hrAnomaly.evidence.delta as number) > 0)) anomalies.push(hrAnomaly);
  if (hr.length === 0) notes.push('Sin datos de pulso: no se evaluó taquicardia.');

  const accel = accelMagnitudesG(samples);
  const motion = evaluateMotion(accel);
  anomalies.push(...motion.anomalies);
  if (motion.note) notes.push(motion.note);

  anomalies.sort((a, b) => b.confidence - a.confidence);
  const first = samples[0];
  const last = samples[samples.length - 1];
  return {
    anomalies,
    summary: {
      samples: samples.length,
      spanSeconds: first && last ? Math.round((last.t - first.t) / 1000) : 0,
      hrMean: hr.length ? round(mean(hr.map((p) => p.hr)), 1) : null,
      hrEwma: hr.length ? round(ewma(hr.map((p) => p.hr), 0.3).slice(-1)[0] as number, 1) : null,
      accelSampleRateHz: motion.rateHz === null ? null : round(motion.rateHz, 1),
    },
    notes,
  };
}
