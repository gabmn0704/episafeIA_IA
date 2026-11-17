/**
 * Discrete Fourier transform implemented from scratch (O(n^2) direct form).
 * Windows are small (a few hundred samples), so a direct DFT is fast enough
 * and avoids the power-of-two constraint of the radix-2 FFT.
 */

/** Removes the mean (DC component) so it does not leak into low bins. */
export function detrend(xs: readonly number[]): number[] {
  if (xs.length === 0) return [];
  let m = 0;
  for (const x of xs) m += x;
  m /= xs.length;
  return xs.map((x) => x - m);
}

/** Hann window: reduces spectral leakage at the window edges. */
export function hann(xs: readonly number[]): number[] {
  const n = xs.length;
  if (n < 2) return [...xs];
  return xs.map((x, i) => x * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))));
}

/** One-sided power spectrum: bins 0..floor(n/2), power = |X_k|^2 / n. */
export function powerSpectrum(xs: readonly number[]): number[] {
  const n = xs.length;
  const half = Math.floor(n / 2);
  const out: number[] = [];
  for (let k = 0; k <= half; k++) {
    let re = 0;
    let im = 0;
    const w = (-2 * Math.PI * k) / n;
    for (let t = 0; t < n; t++) {
      const v = xs[t] as number;
      re += v * Math.cos(w * t);
      im += v * Math.sin(w * t);
    }
    out.push((re * re + im * im) / n);
  }
  return out;
}

/** Frequency in Hz of bin k for n samples taken at `sampleRateHz`. */
export function binFrequency(k: number, n: number, sampleRateHz: number): number {
  return (k * sampleRateHz) / n;
}

export interface BandEnergy {
  band: number;
  total: number;
  /** band / total (0 when total is 0) */
  ratio: number;
  /** frequency of the strongest bin inside the band */
  peakHz: number;
}

/**
 * Energy of `signal` inside [lowHz, highHz] relative to total non-DC energy.
 * Applies detrending and a Hann window first.
 */
export function bandEnergy(signal: readonly number[], sampleRateHz: number, lowHz: number, highHz: number): BandEnergy {
  const n = signal.length;
  if (n < 8 || sampleRateHz <= 0) return { band: 0, total: 0, ratio: 0, peakHz: 0 };
  const spec = powerSpectrum(hann(detrend(signal)));
  let band = 0;
  let total = 0;
  let peak = 0;
  let peakHz = 0;
  for (let k = 1; k < spec.length; k++) {
    const p = spec[k] as number;
    total += p;
    const f = binFrequency(k, n, sampleRateHz);
    if (f >= lowHz && f <= highHz) {
      band += p;
      if (p > peak) {
        peak = p;
        peakHz = f;
      }
    }
  }
  return { band, total, ratio: total > 0 ? band / total : 0, peakHz };
}
