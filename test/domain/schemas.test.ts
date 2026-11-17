import { describe, expect, it } from 'vitest';
import { analyzePatternsSchema, camelizeKeys, medicationLogSchema, seizureSchema } from '../../src/domain/schemas.js';

describe('camelizeKeys', () => {
  it('converts nested snake_case keys and leaves values alone', () => {
    expect(camelizeKeys({ started_at: 'x', triggers_noted: [{ a_b: 1 }] })).toEqual({
      startedAt: 'x',
      triggersNoted: [{ aB: 1 }],
    });
    expect(camelizeKeys(null)).toBeNull();
    expect(camelizeKeys('a_b')).toBe('a_b');
  });
});

describe('domain schemas', () => {
  it('normalizes Date objects and numeric strings from the database driver', () => {
    const s = seizureSchema.parse({ started_at: new Date('2025-03-01T10:00:00Z'), duration_seconds: '95', severity: null });
    expect(s.startedAt).toBe('2025-03-01T10:00:00.000Z');
    expect(s.durationSeconds).toBe(95);
    expect(s.severity).toBeUndefined();
  });

  it('only accepts known medication statuses', () => {
    expect(medicationLogSchema.safeParse({ scheduledFor: '2025-03-01T10:00:00Z', status: 'taken' }).success).toBe(true);
    expect(medicationLogSchema.safeParse({ scheduledFor: '2025-03-01T10:00:00Z', status: 'maybe' }).success).toBe(false);
  });

  it('defaults missing arrays and caps maxInsights', () => {
    const p = analyzePatternsSchema.parse({});
    expect(p.seizures).toEqual([]);
    expect(analyzePatternsSchema.safeParse({ maxInsights: 99 }).success).toBe(false);
  });
});
