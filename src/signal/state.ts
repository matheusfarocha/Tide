import type { MeditationState } from './types';

/** Per-session "normal" for this person, learned from the first baselineSec seconds. */
export interface Baseline {
  rate: number;
  regularity: number;
  motion: number;
  headY: number;
  width: number;
  tension: number;
}

export interface Features {
  rate: number | null;
  regularity: number | null;
  motion: number;
  headDrop: number;
  tension: number | null;
}

/** Tunable starting values (guesses to refine on our own recordings and Feel Check labels). */
export const THRESHOLDS = {
  headDrop: 0.08, // a small nod with the back kept straight; the 3 s hold ignores glances down
  restlessRatio: 3,
  driftMotionRatio: 1.8,
  rateShiftAbs: 3,
  rateShiftFrac: 0.25,
  regularityDrop: 0.25,
  tensionRise: 0.12,
  motionFloor: 0.03,
};

/**
 * The peak rate, but only when it agrees with the spectral rate. A glitchy peak (a missed or doubled
 * inhale) can swing the peak rate by several breaths a minute and cast a false drifting vote; the
 * spectral rate barely moves then. When the two disagree, the rate doesn't vote at all.
 */
export function trustedRate(rate: number | null, spectral: number | null, maxAbs = 1.5, maxFrac = 0.2): number | null {
  if (rate === null || spectral === null) return null;
  return Math.abs(rate - spectral) <= Math.max(maxAbs, spectral * maxFrac) ? rate : null;
}

/** The weak signs that count as votes toward drifting, as readable reasons. */
export function driftVotes(f: Features, b: Baseline): string[] {
  const T = THRESHOLDS;
  const ratio = f.motion / Math.max(b.motion, T.motionFloor / 3);
  const v: string[] = [];
  if (f.rate !== null && Math.abs(f.rate - b.rate) > Math.max(T.rateShiftAbs, b.rate * T.rateShiftFrac)) v.push(`breath rate ${f.rate.toFixed(1)} vs your baseline ${b.rate.toFixed(1)}`);
  if (f.regularity !== null && f.regularity < b.regularity - T.regularityDrop) v.push(`breathing less regular (${f.regularity.toFixed(2)} vs ${b.regularity.toFixed(2)})`);
  if (f.tension !== null && f.tension > b.tension + T.tensionRise) v.push(`face tension ${f.tension.toFixed(2)} vs baseline ${b.tension.toFixed(2)}`);
  if (ratio > T.driftMotionRatio && f.motion > T.motionFloor) v.push(`more movement (${ratio.toFixed(1)}x baseline)`);
  return v;
}

/** Why the model currently says what it says: the reasons behind the instantaneous state. */
export function explain(f: Features, b: Baseline): string[] {
  const T = THRESHOLDS;
  const ratio = f.motion / Math.max(b.motion, T.motionFloor / 3);
  if (f.headDrop > T.headDrop) return [`head dropped ${f.headDrop.toFixed(2)} (line ${T.headDrop})`];
  if (ratio > T.restlessRatio && f.motion > T.motionFloor) return [`lots of movement (${ratio.toFixed(1)}x baseline)`];
  const v = driftVotes(f, b);
  return v.length >= 2 ? v : v.length === 1 ? [`only one sign (${v[0]}); needs two to call drifting`] : ['no signs of drifting'];
}

/** Instantaneous (un-smoothed) state from rules against the baseline. */
export function classify(f: Features, b: Baseline): Exclude<MeditationState, 'settling'> {
  const T = THRESHOLDS;
  const ratio = f.motion / Math.max(b.motion, T.motionFloor / 3);
  // A head sunk below the line counts as drifting (no separate drowsy state: it can't be told apart
  // from calm reliably, and drifting already covers it for scoring). The smoother's hold ignores glances down.
  if (f.headDrop > T.headDrop) return 'drifting';
  if (ratio > T.restlessRatio && f.motion > T.motionFloor) return 'restless';
  return driftVotes(f, b).length >= 2 ? 'drifting' : 'focused';
}

/** Debounces state changes: a new state must persist for `hold` consecutive ticks. */
export class StateSmoother {
  private current: MeditationState = 'settling';
  private candidate: MeditationState | null = null;
  private count = 0;
  constructor(private hold = 3) {}

  get state(): MeditationState {
    return this.current;
  }

  update(raw: MeditationState): MeditationState {
    if (raw === this.current) {
      this.candidate = null;
      this.count = 0;
    } else if (raw === this.candidate) {
      if (++this.count >= this.hold) {
        this.current = raw;
        this.candidate = null;
        this.count = 0;
      }
    } else {
      this.candidate = raw;
      this.count = 1;
    }
    return this.current;
  }

  reset(): void {
    this.current = 'settling';
    this.candidate = null;
    this.count = 0;
  }
}
