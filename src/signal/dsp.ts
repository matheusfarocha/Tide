export interface Sample {
  /** seconds */
  t: number;
  value: number;
}

/** Linear-interpolate irregular samples onto a fixed rate grid. */
export function resample(samples: Sample[], fs: number): { t0: number; x: number[] } {
  if (samples.length < 2) return { t0: samples[0]?.t ?? 0, x: [] };
  const t0 = samples[0].t;
  const tEnd = samples[samples.length - 1].t;
  const n = Math.floor((tEnd - t0) * fs) + 1;
  const x = new Array<number>(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + i / fs;
    while (j < samples.length - 2 && samples[j + 1].t < t) j++;
    const a = samples[j];
    const b = samples[j + 1];
    const span = b.t - a.t;
    const w = span > 0 ? Math.min(1, Math.max(0, (t - a.t) / span)) : 0;
    x[i] = a.value + w * (b.value - a.value);
  }
  return { t0, x };
}

export function mean(x: number[]): number {
  let s = 0;
  for (const v of x) s += v;
  return x.length ? s / x.length : 0;
}

export function std(x: number[]): number {
  const m = mean(x);
  let s = 0;
  for (const v of x) s += (v - m) ** 2;
  return x.length ? Math.sqrt(s / x.length) : 0;
}

interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

// RBJ cookbook, Butterworth Q.
function biquad(kind: 'low' | 'high', fc: number, fs: number): Biquad {
  const w0 = (2 * Math.PI * fc) / fs;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
  const a0 = 1 + alpha;
  const b0 = (kind === 'low' ? 1 - cos : 1 + cos) / 2;
  const b1 = kind === 'low' ? 1 - cos : -(1 + cos);
  return { b0: b0 / a0, b1: b1 / a0, b2: b0 / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 };
}

function applyBiquad(x: number[], f: Biquad): number[] {
  const y = new Array<number>(x.length);
  let x1 = x[0] ?? 0;
  let x2 = x1;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const out = f.b0 * x[i] + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = out;
    y[i] = out;
  }
  return y;
}

/** Zero-phase band-pass (forward-backward 2nd-order high-pass + low-pass). */
export function bandpass(x: number[], fs: number, lowHz: number, highHz: number): number[] {
  if (x.length < 8) return x.slice();
  const m = mean(x);
  let y = x.map((v) => v - m);
  const stages = [biquad('high', lowHz, fs), biquad('low', highHz, fs)];
  for (const s of stages) {
    y = applyBiquad(y, s);
    y.reverse();
    y = applyBiquad(y, s);
    y.reverse();
  }
  return y;
}

/**
 * Indices of local maxima separated by at least minDist samples,
 * with height above the neighbouring trough of at least minProminence.
 */
export function findPeaks(x: number[], minDist: number, minProminence: number): number[] {
  const cand: number[] = [];
  for (let i = 1; i < x.length - 1; i++) {
    if (x[i] > x[i - 1] && x[i] >= x[i + 1]) cand.push(i);
  }
  const prom = (i: number): number => {
    let lo = x[i];
    for (let k = i - 1; k >= 0 && x[k] <= x[i]; k--) lo = Math.min(lo, x[k]);
    let lo2 = x[i];
    for (let k = i + 1; k < x.length && x[k] <= x[i]; k++) lo2 = Math.min(lo2, x[k]);
    return x[i] - Math.max(lo, lo2);
  };
  const strong = cand.filter((i) => prom(i) >= minProminence);
  // enforce min distance, keeping the taller peak
  const out: number[] = [];
  for (const i of strong) {
    const last = out[out.length - 1];
    if (last === undefined || i - last >= minDist) out.push(i);
    else if (x[i] > x[last]) out[out.length - 1] = i;
  }
  return out;
}

/** Dominant frequency (Hz) in [lowHz, highHz] via Hann-windowed DFT scan, plus peak-to-mean power ratio. */
export function dominantFrequency(
  x: number[],
  fs: number,
  lowHz: number,
  highHz: number,
): { freq: number; ratio: number } | null {
  const n = x.length;
  if (n < fs * 8) return null;
  const m = mean(x);
  const w = x.map((v, i) => (v - m) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))));
  const step = 0.005;
  let best = 0;
  let bestF = 0;
  let sum = 0;
  let count = 0;
  for (let f = lowHz; f <= highHz; f += step) {
    let re = 0;
    let im = 0;
    const k = (2 * Math.PI * f) / fs;
    for (let i = 0; i < n; i++) {
      re += w[i] * Math.cos(k * i);
      im -= w[i] * Math.sin(k * i);
    }
    const p = re * re + im * im;
    sum += p;
    count++;
    if (p > best) {
      best = p;
      bestF = f;
    }
  }
  const avg = sum / count;
  return avg > 0 ? { freq: bestF, ratio: best / avg } : null;
}
