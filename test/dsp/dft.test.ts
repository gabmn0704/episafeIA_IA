import { describe, expect, it } from 'vitest';
import { bandEnergy, binFrequency, detrend, hann, powerSpectrum } from '../../src/dsp/dft.js';

const sine = (hz: number, fs: number, n: number, amp = 1, offset = 0) =>
  Array.from({ length: n }, (_, i) => offset + amp * Math.sin((2 * Math.PI * hz * i) / fs));

describe('dft', () => {
  it('detrend removes the mean', () => {
    const d = detrend([5, 6, 7]);
    expect(d.reduce((a, b) => a + b, 0)).toBeCloseTo(0);
  });

  it('hann window zeroes the edges', () => {
    const w = hann([1, 1, 1, 1, 1]);
    expect(w[0]).toBeCloseTo(0);
    expect(w[4]).toBeCloseTo(0);
    expect(w[2]).toBeCloseTo(1);
  });

  it('puts a pure tone in the right bin', () => {
    const fs = 32;
    const n = 64;
    const spec = powerSpectrum(sine(4, fs, n));
    const peakBin = spec.indexOf(Math.max(...spec));
    expect(binFrequency(peakBin, n, fs)).toBeCloseTo(4);
  });

  it('satisfies Parseval for the one-sided spectrum (energy conservation)', () => {
    const x = sine(3, 32, 64, 2);
    const time = x.reduce((a, v) => a + v * v, 0);
    const spec = powerSpectrum(x);
    const first = spec[0] as number;
    const last = spec[spec.length - 1] as number;
    const freq = first + 2 * spec.slice(1, -1).reduce((a, b) => a + b, 0) + last;
    expect(freq).toBeCloseTo(time, 6);
  });

  it('bandEnergy concentrates in 3-8 Hz for a 5 Hz tone even with DC offset', () => {
    const e = bandEnergy(sine(5, 32, 128, 1, 9.8), 32, 3, 8);
    expect(e.ratio).toBeGreaterThan(0.9);
    expect(e.peakHz).toBeCloseTo(5, 0);
  });

  it('bandEnergy is low for slow movement (0.5 Hz) and handles short input', () => {
    expect(bandEnergy(sine(0.5, 32, 128), 32, 3, 8).ratio).toBeLessThan(0.1);
    expect(bandEnergy([1, 2, 3], 32, 3, 8).ratio).toBe(0);
  });
});
