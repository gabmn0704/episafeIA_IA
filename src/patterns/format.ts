import type { Interval } from '../stats/wilson.js';

export const pct = (x: number): string => `${Math.round(x * 100)}%`;

export const pctRange = (i: Interval): string => `${Math.round(i.low * 100)}%-${Math.round(i.high * 100)}%`;

export const times = (x: number): string => (x >= 10 ? x.toFixed(0) : x.toFixed(1)).replace('.', ',');

export const round = (x: number, digits = 3): number => {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
};

export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

export const NON_CAUSAL_NOTE =
  'Es una asociación observada en tus registros, no prueba que sea la causa. Coméntalo con tu neurólogo.';
