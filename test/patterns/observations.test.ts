import { describe, expect, it } from 'vitest';
import { buildObservations } from '../../src/patterns/observations.js';
import { dailyLogSchema, medicationLogSchema, seizureSchema } from '../../src/domain/schemas.js';

const seizure = (startedAt: string) => seizureSchema.parse({ startedAt });
const log = (o: Record<string, unknown>) => dailyLogSchema.parse(o);

describe('buildObservations', () => {
  it('marks outcome by local calendar day and computes exposures', () => {
    // 03:30Z on the 11th is 22:30 on the 10th in Bogota
    const obs = buildObservations(
      [seizure('2025-03-11T03:30:00Z')],
      [log({ logDate: '2025-03-10', sleepHours: 4 }), log({ logDate: '2025-03-11', sleepHours: 8 })],
      [],
      { timezone: 'America/Bogota' },
    );
    expect(obs.map((o) => o.outcome)).toEqual([true, false]);
    expect(obs[0]?.exposures.get('short_sleep')).toBe(true);
    expect(obs[1]?.exposures.get('short_sleep')).toBe(false);
  });

  it('skips factors without data instead of counting them as not exposed', () => {
    const obs = buildObservations([], [log({ logDate: '2025-03-10', sleepHours: 4 })], [], { timezone: 'UTC' });
    expect(obs[0]?.exposures.has('high_stress')).toBe(false);
    expect(obs[0]?.exposures.has('missed_meds')).toBe(false);
  });

  it('counts missed doses per day and supports a one-day lag', () => {
    const med = medicationLogSchema.parse({ scheduledFor: '2025-03-10T13:00:00Z', status: 'missed' });
    const obs = buildObservations(
      [seizure('2025-03-11T15:00:00Z')],
      [log({ logDate: '2025-03-10', sleepHours: 7 })],
      [med],
      { timezone: 'America/Bogota', lagDays: 1 },
    );
    expect(obs[0]?.exposures.get('missed_meds')).toBe(true);
    expect(obs[0]?.outcome).toBe(true);
  });

  it('accepts snake_case rows with numeric strings, as stored in PostgreSQL', () => {
    const l = dailyLogSchema.parse({ log_date: '2025-03-10T00:00:00.000Z', sleep_hours: '4.50', stress_level: null });
    expect(l.logDate).toBe('2025-03-10');
    expect(l.sleepHours).toBe(4.5);
    expect(l.stressLevel).toBeUndefined();
  });
});
