import { wilsonInterval, type Interval } from './wilson.js';

/**
 * 2x2 contingency table of exposure (E: e.g. slept < 5h) vs outcome
 * (O: e.g. seizure within the next 24h), counted over observation days.
 */
export interface Contingency {
  /** exposed and outcome */
  a: number;
  /** exposed, no outcome */
  b: number;
  /** not exposed, outcome */
  c: number;
  /** not exposed, no outcome */
  d: number;
}

export function buildContingency(pairs: ReadonlyArray<{ exposed: boolean; outcome: boolean }>): Contingency {
  const t: Contingency = { a: 0, b: 0, c: 0, d: 0 };
  for (const p of pairs) {
    if (p.exposed) {
      if (p.outcome) t.a++;
      else t.b++;
    } else if (p.outcome) t.c++;
    else t.d++;
  }
  return t;
}

export interface ContingencyStats {
  n: number;
  exposedDays: number;
  outcomeDays: number;
  /** P(outcome | exposed) */
  pExposed: number;
  /** P(outcome | not exposed) */
  pUnexposed: number;
  /** pExposed / pUnexposed with Haldane +0.5 smoothing (finite and stable) */
  lift: number;
  /** relative risk CI (log method, smoothed) */
  liftInterval: Interval;
  /** Wilson interval for P(outcome | exposed) */
  pExposedInterval: Interval;
  /** share of outcome days that were exposed: a / (a + c) */
  outcomeShareExposed: number;
  outcomeShareInterval: Interval;
}

export function contingencyStats(t: Contingency, z = 1.96): ContingencyStats {
  const exposedDays = t.a + t.b;
  const unexposedDays = t.c + t.d;
  const outcomeDays = t.a + t.c;
  const n = exposedDays + unexposedDays;
  const pExposed = exposedDays ? t.a / exposedDays : 0;
  const pUnexposed = unexposedDays ? t.c / unexposedDays : 0;

  // Haldane-Anscombe correction avoids division by zero when a cell is empty.
  const a = t.a + 0.5;
  const c = t.c + 0.5;
  const e = exposedDays + 1;
  const u = unexposedDays + 1;
  const lift = a / e / (c / u);
  const se = Math.sqrt(1 / a - 1 / e + 1 / c - 1 / u);
  const liftInterval = { low: Math.exp(Math.log(lift) - z * se), high: Math.exp(Math.log(lift) + z * se) };

  return {
    n,
    exposedDays,
    outcomeDays,
    pExposed,
    pUnexposed,
    lift,
    liftInterval,
    pExposedInterval: wilsonInterval(t.a, exposedDays, z),
    outcomeShareExposed: outcomeDays ? t.a / outcomeDays : 0,
    outcomeShareInterval: wilsonInterval(t.a, outcomeDays, z),
  };
}
