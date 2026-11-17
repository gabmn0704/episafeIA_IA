import { addDays } from '../../src/domain/dates.js';

/** Small deterministic PRNG (mulberry32) so synthetic data is reproducible. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SyntheticOptions {
  days?: number;
  seed?: number;
  start?: string;
  /** P(seizure | slept < 5h) */
  pSeizureShortSleep?: number;
  /** P(seizure | slept >= 5h) */
  pSeizureBaseline?: number;
  /** P(short sleep on a given day) */
  pShortSleep?: number;
  /** P(seizure | high stress) when different from baseline (default: independent) */
  pSeizureHighStress?: number;
  /** first local hour (Bogota) of the seizure window */
  hour?: number;
}

export interface SyntheticData {
  seizures: Array<{ startedAt: string; severity: number; triggersNoted: string[] }>;
  dailyLogs: Array<{
    logDate: string;
    sleepHours: number;
    stressLevel: number;
    caffeineMg: number;
    exerciseMinutes: number;
    mood: number;
    alcoholUnits: number;
  }>;
  medicationLogs: Array<{ scheduledFor: string; takenAt: string | null; status: 'taken' | 'missed' }>;
}

/**
 * Generates `days` of plausible data where the ONLY real association is
 * short sleep (< 5h) -> seizure. Stress, caffeine, alcohol and missed meds are
 * independent noise, so a correct engine must find sleep and nothing else.
 */
export function generateSynthetic(opts: SyntheticOptions = {}): SyntheticData {
  const {
    days = 180,
    seed = 42,
    start = '2025-01-01',
    pSeizureShortSleep = 0.5,
    pSeizureBaseline = 0.02,
    pShortSleep = 0.2,
    pSeizureHighStress,
    hour = 6,
  } = opts;
  const rand = rng(seed);
  const out: SyntheticData = { seizures: [], dailyLogs: [], medicationLogs: [] };

  for (let i = 0; i < days; i++) {
    const day = addDays(start, i);
    const short = rand() < pShortSleep;
    const sleepHours = short ? 3 + rand() * 1.8 : 5.5 + rand() * 3;
    const stressLevel = 1 + Math.floor(rand() * 10);
    const caffeineMg = Math.floor(rand() * 500);
    const alcoholUnits = rand() < 0.15 ? 2 + Math.floor(rand() * 3) : 0;
    const exerciseMinutes = rand() < 0.5 ? 0 : 20 + Math.floor(rand() * 40);
    out.dailyLogs.push({
      logDate: day,
      sleepHours: Math.round(sleepHours * 10) / 10,
      stressLevel,
      caffeineMg,
      exerciseMinutes,
      mood: 1 + Math.floor(rand() * 5),
      alcoholUnits,
    });

    const missed = rand() < 0.1;
    out.medicationLogs.push({
      scheduledFor: `${day}T13:00:00Z`,
      takenAt: missed ? null : `${day}T13:05:00Z`,
      status: missed ? 'missed' : 'taken',
    });

    let p = short ? pSeizureShortSleep : pSeizureBaseline;
    if (pSeizureHighStress !== undefined && stressLevel >= 8) p = Math.max(p, pSeizureHighStress);
    if (rand() < p) {
      // 05:00-12:00 UTC = 00:00-07:00 Bogota -> same local calendar day
      const h = hour + Math.floor(rand() * 3);
      out.seizures.push({
        startedAt: `${day}T${String(h + 5).padStart(2, '0')}:15:00Z`,
        severity: 1 + Math.floor(rand() * 4),
        triggersNoted: [],
      });
    }
  }
  return out;
}
