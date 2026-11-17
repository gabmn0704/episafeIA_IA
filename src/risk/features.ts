import { z } from 'zod';
import { withCamelKeys } from '../domain/schemas.js';

const opt = z.preprocess((v) => (v === null || v === '' ? undefined : v), z.coerce.number().finite().optional());

/** One day of inputs to the risk model. Missing values are treated as "typical" (feature = 0). */
export const dayFields = {
  sleepHours: opt,
  stressLevel: opt,
  caffeineMg: opt,
  exerciseMinutes: opt,
  missedMeds: opt,
  hrAvg: opt,
  hrvMs: opt,
  motion: opt,
};
export const dayInputSchema = withCamelKeys(z.object(dayFields));
export type DayInput = z.infer<typeof dayInputSchema>;

export interface Baseline {
  hrAvg: number;
  hrvMs: number;
}
export const DEFAULT_BASELINE: Baseline = { hrAvg: 72, hrvMs: 45 };

export const FEATURE_NAMES = [
  'sleep',
  'stress',
  'caffeine',
  'exercise',
  'missed_meds',
  'heart_rate',
  'hrv',
  'motion',
] as const;
export type FeatureName = (typeof FEATURE_NAMES)[number];

const clip = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/**
 * Maps a day to a signed feature vector where 0 means "typical/reference" and
 * positive means "more seizure-prone". Scaling keeps every feature roughly in
 * [-1, 2] so one learning rate and one L2 strength fit them all.
 */
export function featurize(day: DayInput, baseline: Baseline = DEFAULT_BASELINE): number[] {
  const f = (v: number | undefined, fn: (x: number) => number) => (v === undefined ? 0 : fn(v));
  return [
    // 7.5 h is the reference; 4.5 h or less saturates at +1; extra sleep is mildly protective
    f(day.sleepHours, (v) => clip((7.5 - v) / 3, -0.5, 1.5)),
    // stress 1-10, reference 4
    f(day.stressLevel, (v) => clip((v - 4) / 6, -0.5, 1)),
    // reference 200 mg/day (about two coffees), saturates at 600 mg
    f(day.caffeineMg, (v) => clip((v - 200) / 200, -1, 2)),
    // 20 min/day is the reference; none is a deficit
    f(day.exerciseMinutes, (v) => clip((20 - Math.min(v, 40)) / 20, -1, 1)),
    // each missed dose counts, capped at 3
    f(day.missedMeds, (v) => clip(v, 0, 3)),
    // resting-ish heart rate vs personal baseline, per 20 bpm
    f(day.hrAvg, (v) => clip((v - baseline.hrAvg) / 20, -1, 2)),
    // low HRV vs personal baseline, per 20 ms
    f(day.hrvMs, (v) => clip((baseline.hrvMs - v) / 20, -1, 2)),
    // normalized motion intensity 0..1 (restlessness)
    f(day.motion, (v) => clip((v - 0.3) / 0.5, -0.6, 2)),
  ];
}

const s = (v: number | undefined, unit: string, digits = 1) => (v === undefined ? 'sin dato' : `${v.toFixed(digits)} ${unit}`.replace('.', ','));

/** Human-readable (Spanish) description of what the user entered for a feature. */
export function featureDetail(name: FeatureName, day: DayInput, baseline: Baseline = DEFAULT_BASELINE): string {
  switch (name) {
    case 'sleep':
      return `Dormiste ${s(day.sleepHours, 'h')} (referencia: 7,5 h).`;
    case 'stress':
      return `Estrés declarado: ${day.stressLevel ?? 'sin dato'} sobre 10.`;
    case 'caffeine':
      return `Cafeína: ${s(day.caffeineMg, 'mg', 0)} (referencia: 200 mg).`;
    case 'exercise':
      return `Ejercicio: ${s(day.exerciseMinutes, 'min', 0)} (referencia: 20 min).`;
    case 'missed_meds':
      return `Dosis olvidadas hoy: ${day.missedMeds ?? 0}.`;
    case 'heart_rate':
      return `Pulso medio: ${s(day.hrAvg, 'lpm', 0)} (tu base: ${baseline.hrAvg.toFixed(0)} lpm).`;
    case 'hrv':
      return `Variabilidad cardíaca: ${s(day.hrvMs, 'ms', 0)} (tu base: ${baseline.hrvMs.toFixed(0)} ms).`;
    case 'motion':
      return `Intensidad de movimiento: ${day.motion === undefined ? 'sin dato' : day.motion.toFixed(2).replace('.', ',')}.`;
  }
}

export const FEATURE_LABELS: Record<FeatureName, string> = {
  sleep: 'Sueño',
  stress: 'Estrés',
  caffeine: 'Cafeína',
  exercise: 'Actividad física',
  missed_meds: 'Medicación olvidada',
  heart_rate: 'Pulso',
  hrv: 'Variabilidad cardíaca',
  motion: 'Movimiento',
};
