import { z } from 'zod';
import { withCamelKeys } from '../domain/schemas.js';

const opt = z.preprocess((v) => (v === null || v === '' ? undefined : v), z.coerce.number().finite().optional());

export const wearableSampleSchema = withCamelKeys(
  z.object({
    sampledAt: z
      .union([z.string(), z.date()])
      .transform((v) => (v instanceof Date ? v.toISOString() : v))
      .refine((s) => !Number.isNaN(new Date(s).getTime()), 'invalid date-time'),
    heartRate: opt,
    hrvMs: opt,
    spo2: opt,
    motionIntensity: opt,
    skinTempC: opt,
    steps: opt,
    /** raw accelerometer axes in g (or m/s^2, auto-detected) */
    ax: opt,
    ay: opt,
    az: opt,
    /** alternatively, a precomputed acceleration magnitude */
    accelMagnitude: opt,
  }),
);

export const wearableEvaluateSchema = z.object({
  window: z.array(wearableSampleSchema).max(5000),
  /** reference heart-rate values from earlier days, to compare against */
  baselineHr: z.array(z.number().finite()).max(5000).optional(),
});

export type WearableSample = z.infer<typeof wearableSampleSchema>;
export type WearableEvaluateInput = z.infer<typeof wearableEvaluateSchema>;

export type AnomalyKind = 'tachycardia' | 'motion_convulsive' | 'hr_anomaly' | 'fall';

export interface Anomaly {
  kind: AnomalyKind;
  /** 0..1 */
  confidence: number;
  detail: string;
  evidence: Record<string, unknown>;
}

export interface WearableEvaluation {
  anomalies: Anomaly[];
  summary: {
    samples: number;
    spanSeconds: number;
    hrMean: number | null;
    hrEwma: number | null;
    accelSampleRateHz: number | null;
  };
  /** why some detectors did not run (e.g. no accelerometer, rate too low) */
  notes: string[];
}
