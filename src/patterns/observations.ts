import { addDays, localParts } from '../domain/dates.js';
import type { DailyLog, MedicationLog, Seizure } from '../domain/schemas.js';
import { FACTORS } from './factors.js';

export interface DayObservation {
  day: string;
  /** factor id -> exposed (only factors with data that day) */
  exposures: Map<string, boolean>;
  /** at least one seizure on day + lagDays */
  outcome: boolean;
}

export interface ObservationOptions {
  timezone: string;
  /** outcome window: seizure on the log day (0) or the day after (1) */
  lagDays?: 0 | 1;
}

/** Joins the three data sources into one row per logged day. */
export function buildObservations(
  seizures: readonly Seizure[],
  dailyLogs: readonly DailyLog[],
  medicationLogs: readonly MedicationLog[],
  opts: ObservationOptions,
): DayObservation[] {
  const lag = opts.lagDays ?? 0;
  const seizureDays = new Set(seizures.map((s) => localParts(s.startedAt, opts.timezone).day));

  const missedByDay = new Map<string, number>();
  for (const m of medicationLogs) {
    if (m.status !== 'missed') continue;
    const day = localParts(m.scheduledFor, opts.timezone).day;
    missedByDay.set(day, (missedByDay.get(day) ?? 0) + 1);
  }

  const hasMedData = medicationLogs.length > 0;
  const byDay = new Map<string, DailyLog>();
  for (const l of dailyLogs) byDay.set(l.logDate, l); // last write wins on duplicates

  return [...byDay.keys()].sort().map((day) => {
    const log = byDay.get(day) as DailyLog;
    const ctx = { missedMeds: missedByDay.get(day) ?? 0 };
    const exposures = new Map<string, boolean>();
    for (const f of FACTORS) {
      if (f.id === 'missed_meds' && !hasMedData) continue;
      const e = f.exposed(log, ctx);
      if (e !== undefined) exposures.set(f.id, e);
    }
    return { day, exposures, outcome: seizureDays.has(addDays(day, lag)) };
  });
}
