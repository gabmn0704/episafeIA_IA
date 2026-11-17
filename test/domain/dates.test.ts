import { describe, expect, it } from 'vitest';
import { addDays, isValidTimezone, localParts } from '../../src/domain/dates.js';

describe('dates', () => {
  it('converts an instant to the local calendar day (Bogota is UTC-5)', () => {
    expect(localParts('2025-03-10T03:30:00Z', 'America/Bogota')).toEqual({ day: '2025-03-09', hour: 22 });
    expect(localParts('2025-03-10T12:00:00Z', 'America/Bogota')).toEqual({ day: '2025-03-10', hour: 7 });
  });

  it('adds days across month and leap boundaries', () => {
    expect(addDays('2024-02-28', 2)).toBe('2024-03-01');
    expect(addDays('2025-01-01', -1)).toBe('2024-12-31');
  });

  it('validates time zones and rejects bad dates', () => {
    expect(isValidTimezone('America/Bogota')).toBe(true);
    expect(isValidTimezone('Mars/Olympus')).toBe(false);
    expect(() => localParts('not-a-date')).toThrow(RangeError);
  });
});
