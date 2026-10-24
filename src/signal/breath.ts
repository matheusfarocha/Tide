import { bandpass, dominantFrequency, findPeaks, resample, std, type Sample } from './dsp';

export interface BreathConfig {
  /** Internal analysis sample rate (Hz). */
  fs: number;
  /** Breathing band, breaths per minute. */
  minBpm: number;
  maxBpm: number;
  /** Seconds of history kept (longer than rateWindow so filter edges can be discarded). */
  bufferSec: number;
  /** Seconds used for the rate estimate. */
  rateWindowSec: number;
  /** Minimum seconds of data before a reading is produced. */
  warmupSec: number;
  /** Peak prominence as a fraction of the filtered signal's std. */
  prominenceStd: number;
}

export const DEFAULT_CONFIG: BreathConfig = {
  fs: 10,
  minBpm: 6,
  maxBpm: 40,
  bufferSec: 60,
  rateWindowSec: 30,
  warmupSec: 12,
  prominenceStd: 0.5,
};

export interface BreathReading {
  /** Time of the reading (s, same clock as pushed samples). */
  t: number;
  /** Breaths/min from inhale peaks in the rate window; null if too few peaks. */
  rate: number | null;
  /** Breaths/min from the spectral peak; independent cross-check. */
  rateSpectral: number | null;
  /** 0..1, 1 = perfectly even breath-to-breath intervals. */
  regularity: number | null;
  /** 0..1, how trustworthy the rate is (signal strength and method agreement). */
  confidence: number;
  /** Times (s) of detected inhale peaks in the buffer. */
  inhales: number[];
  /** Amplitude of the filtered breath signal (std, in input units): proxy for breath depth. */
  depth: number;
  /** Diagnostics for tuning. */
  debug: { samples: number; fps: number; peaks: number; specRatio: number | null; strength: number; agree: number };
}

/**
 * Streaming respiratory-rate estimator. Feed it one value per video frame
 * (e.g. shoulder-midpoint y) with timestamps; call read() as often as needed.
 */
export class BreathAnalyzer {
  private buf: Sample[] = [];
  constructor(private cfg: BreathConfig = DEFAULT_CONFIG) {}

  push(t: number, value: number): void {
    if (!Number.isFinite(value)) return;
    const last = this.buf[this.buf.length - 1];
    if (last && t <= last.t) return;
    this.buf.push({ t, value });
    const cutoff = t - this.cfg.bufferSec;
    let drop = 0;
    while (drop < this.buf.length - 2 && this.buf[drop].t < cutoff) drop++;
    if (drop > 0) this.buf.splice(0, drop);
  }

  reset(): void {
    this.buf = [];
  }

  read(): BreathReading {
    const c = this.cfg;
    const empty: BreathReading = {
      t: this.buf[this.buf.length - 1]?.t ?? 0,
      rate: null,
      rateSpectral: null,
      regularity: null,
      confidence: 0,
      inhales: [],
      depth: 0,
      debug: { samples: this.buf.length, fps: 0, peaks: 0, specRatio: null, strength: 0, agree: 0 },
    };
    if (this.buf.length < 2) return empty;
    const { t0, x } = resample(this.buf, c.fs);
    if (x.length < c.warmupSec * c.fs) return empty;

    const y = bandpass(x, c.fs, c.minBpm / 60 / 1.5, (c.maxBpm / 60) * 1.1);
    const tEnd = t0 + (y.length - 1) / c.fs;
    const winStart = Math.max(0, y.length - Math.round(c.rateWindowSec * c.fs));
    const win = y.slice(winStart);

    const sd = std(win);
    if (sd === 0) return { ...empty, t: tEnd };

    // Scan a little below the breathing band so a true 6 breaths/min sits inside the scan, and reject a
    // peak pinned to either edge: that means no real peak exists, only a spectrum sloping toward the edge.
    const specLow = (c.minBpm * 0.6) / 60;
    const specHigh = c.maxBpm / 60;
    const specRaw = dominantFrequency(win, c.fs, specLow, specHigh);
    const spec = specRaw && specRaw.freq > specLow + 0.011 && specRaw.freq < specHigh - 0.011 ? specRaw : null;
    const rateSpectral = spec ? spec.freq * 60 : null;

    // Minimum peak spacing: the hard physiological limit, tightened to ~60% of the
    // dominant spectral period when the spectrum is clear, so shoulder jitter and
    // double-bump inhales aren't counted as extra breaths.
    let minDist = Math.floor((c.fs * 60) / c.maxBpm);
    if (spec && spec.ratio > 4) minDist = Math.max(minDist, Math.floor((0.6 * c.fs) / spec.freq));
    const peakIdx = findPeaks(y, minDist, sd * c.prominenceStd);
    const inhales = peakIdx.map((i) => t0 + i / c.fs);
    const inWin = inhales.filter((t) => t >= t0 + winStart / c.fs);

    let rate: number | null = null;
    let regularity: number | null = null;
    if (inWin.length >= 3) {
      const intervals: number[] = [];
      for (let i = 1; i < inWin.length; i++) intervals.push(inWin[i] - inWin[i - 1]);
      const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      rate = 60 / mean;
      const cv = std(intervals) / mean;
      regularity = Math.max(0, Math.min(1, 1 - cv * 2));
    }

    let confidence = 0;
    let strength = 0;
    let agree = 0;
    if (spec) {
      strength = Math.min(1, spec.ratio / 8);
      agree =
        rate !== null && rateSpectral !== null
          ? Math.max(0, 1 - Math.abs(rate - rateSpectral) / Math.max(2, rateSpectral * 0.25))
          : 0.3;
      const warm = Math.min(1, (win.length / c.fs) / c.rateWindowSec);
      confidence = strength * agree * warm;
    }

    const span = this.buf[this.buf.length - 1].t - this.buf[0].t;
    const debug = {
      samples: this.buf.length,
      fps: span > 0 ? this.buf.length / span : 0,
      peaks: inWin.length,
      specRatio: spec ? spec.ratio : null,
      strength,
      agree,
    };
    return { t: tEnd, rate, rateSpectral, regularity, confidence, inhales, depth: sd, debug };
  }
}
