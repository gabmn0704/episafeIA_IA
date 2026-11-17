import type { DailyLog } from '../domain/schemas.js';

/** A candidate trigger: a yes/no exposure computed from one day of logs. */
export interface Factor {
  id: string;
  /** noun phrase used in Spanish sentences: "en días con ..." */
  label: string;
  /** undefined means the day has no data for this factor (excluded, not counted as "no") */
  exposed: (log: DailyLog, ctx: DayContext) => boolean | undefined;
}

export interface DayContext {
  missedMeds: number;
}

const defined = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v);

export const FACTORS: readonly Factor[] = [
  {
    id: 'short_sleep',
    label: 'menos de 5 horas de sueño',
    exposed: (l) => (defined(l.sleepHours) ? l.sleepHours < 5 : undefined),
  },
  {
    id: 'high_stress',
    label: 'estrés alto (8 o más sobre 10)',
    exposed: (l) => (defined(l.stressLevel) ? l.stressLevel >= 8 : undefined),
  },
  {
    id: 'high_caffeine',
    label: 'mucha cafeína (400 mg o más)',
    exposed: (l) => (defined(l.caffeineMg) ? l.caffeineMg >= 400 : undefined),
  },
  {
    id: 'alcohol',
    label: 'consumo de alcohol (2 unidades o más)',
    exposed: (l) => (defined(l.alcoholUnits) ? l.alcoholUnits >= 2 : undefined),
  },
  {
    id: 'low_mood',
    label: 'estado de ánimo bajo (1 o 2 sobre 5)',
    exposed: (l) => (defined(l.mood) ? l.mood <= 2 : undefined),
  },
  {
    id: 'no_exercise',
    label: 'ningún ejercicio',
    exposed: (l) => (defined(l.exerciseMinutes) ? l.exerciseMinutes === 0 : undefined),
  },
  {
    id: 'missed_meds',
    label: 'dosis de medicación olvidadas',
    exposed: (_l, ctx) => ctx.missedMeds > 0,
  },
];
