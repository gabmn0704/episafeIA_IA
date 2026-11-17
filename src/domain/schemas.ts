import { z } from 'zod';

/** Converts snake_case keys (as stored in PostgreSQL) to camelCase, recursively. */
export function camelizeKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelizeKeys);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())] = camelizeKeys(v);
    }
    return out;
  }
  return value;
}

/** Accepts camelCase or snake_case payloads. */
export function withCamelKeys<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(camelizeKeys, schema);
}

/** PostgreSQL `numeric` arrives as a string; null means "not recorded". */
const num = z.preprocess(
  (v) => (v === null || v === '' ? undefined : v),
  z.coerce.number().finite().optional(),
);

const isoDateTime = z
  .union([z.string(), z.date()])
  .transform((v) => (v instanceof Date ? v.toISOString() : v))
  .refine((s) => !Number.isNaN(new Date(s).getTime()), 'invalid date-time');

const dayKey = z
  .union([z.string(), z.date()])
  .transform((v) => (v instanceof Date ? v.toISOString() : v).slice(0, 10))
  .refine((s) => /^\d{4}-\d{2}-\d{2}$/.test(s), 'expected YYYY-MM-DD');

export const seizureSchema = withCamelKeys(
  z.object({
    startedAt: isoDateTime,
    durationSeconds: num,
    severity: num,
    seizureType: z.string().nullish(),
    triggersNoted: z.array(z.string()).nullish(),
  }),
);

export const dailyLogSchema = withCamelKeys(
  z.object({
    logDate: dayKey,
    sleepHours: num,
    stressLevel: num,
    caffeineMg: num,
    exerciseMinutes: num,
    mood: num,
    alcoholUnits: num,
  }),
);

export const medicationLogSchema = withCamelKeys(
  z.object({
    scheduledFor: isoDateTime,
    takenAt: isoDateTime.nullish(),
    status: z.enum(['taken', 'missed', 'skipped', 'pending']),
  }),
);

export const analyzePatternsSchema = z.object({
  seizures: z.array(seizureSchema).max(5000).default([]),
  dailyLogs: z.array(dailyLogSchema).max(5000).default([]),
  medicationLogs: z.array(medicationLogSchema).max(20000).default([]),
  timezone: z.string().optional(),
  maxInsights: z.number().int().min(1).max(20).optional(),
});

export type Seizure = z.infer<typeof seizureSchema>;
export type DailyLog = z.infer<typeof dailyLogSchema>;
export type MedicationLog = z.infer<typeof medicationLogSchema>;
export type AnalyzePatternsInput = z.infer<typeof analyzePatternsSchema>;

export interface Insight {
  kind: 'trigger_pattern' | 'cooccurrence' | 'time_of_day' | 'self_reported_trigger' | 'insufficient_data';
  title: string;
  body: string;
  evidence: Record<string, unknown>;
  /** 0..1, how much sample size and effect size support the finding */
  confidence: number;
}
