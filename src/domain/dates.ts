export const DEFAULT_TIMEZONE = 'America/Bogota';

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export function isValidTimezone(tz: string): boolean {
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
}

export interface LocalParts {
  /** YYYY-MM-DD in the given time zone */
  day: string;
  /** 0-23 in the given time zone */
  hour: number;
}

/** Calendar day and hour of an instant, expressed in `timeZone`. */
export function localParts(instant: string | Date, timeZone = DEFAULT_TIMEZONE): LocalParts {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  if (Number.isNaN(d.getTime())) throw new RangeError(`invalid date: ${String(instant)}`);
  const parts = formatter(timeZone).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) % 24 };
}

/** Adds whole days to a YYYY-MM-DD key (calendar arithmetic, no DST issues). */
export function addDays(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
