/**
 * Fixed plans and fake data, so every lane can build before the real signal
 * module and coach exist. fakeReadings() is also the replay-mode fallback.
 */

import type { AttentionState, PlanCitation, SessionMs, SessionPlan, SignalReading } from "./types";
import { BASELINE_SEC, PACED_CHECK_SEC, PACED_RATE_BPM, WAVE_HZ } from "./types";
import { rateFromBreaths } from "./scoring";

/** The breath-counting validation study. Also in the research library (seed PMID). */
export const LEVINSON_2014: PlanCitation = {
  externalId: "MED:25386148",
  why: "Breath-counting skill goes with less mind wandering, and 4 weeks of practice improved it.",
  citation:
    "Levinson et al. (2014). A mind you can count on: validating breath counting as a behavioral measure of mindfulness. Front Psychol.",
  url: "https://doi.org/10.3389/fpsyg.2014.01202",
};

/** The only session not designed by the coach: a 5-minute assessment. */
export const BASELINE_PLAN: SessionPlan = {
  version: 1,
  technique: "breathFocus",
  lengthSec: 300,
  cues: [
    { atSec: 0, kind: "settle", text: "Close your eyes. Let your breath find its own pace.", onBreath: "exhale" },
    { atSec: BASELINE_SEC, kind: "anchor", text: "Rest your attention on the breath.", onBreath: "inhale" },
    { atSec: 290, kind: "close", text: "When you're ready, open your eyes.", onBreath: "exhale" },
  ],
  feelChecks: [{ atSec: 120 }, { atSec: 200 }, { atSec: 270 }],
  fadingLevel: 0,
  intro: "This first session is a baseline. Just breathe and answer when I ask.",
  reasons: [],
  citations: [],
};

/** What a coach-designed plan looks like. Use it to build the runner and to prompt the agent. */
export const EXAMPLE_COACH_PLAN: SessionPlan = {
  version: 1,
  technique: "breathFocus",
  lengthSec: 360,
  cues: [
    { atSec: 0, kind: "settle", text: "Eyes closed. Three slow breaths to arrive.", onBreath: "exhale" },
    { atSec: 210, kind: "anchor", text: "Notice the next inhale.", onBreath: "inhale" },
    { atSec: 300, kind: "posture", text: "Lengthen your spine a little.", onBreath: "inhale" },
    { atSec: 350, kind: "close", text: "Gently open your eyes.", onBreath: "exhale" },
  ],
  feelChecks: [{ atSec: 150 }, { atSec: 240 }, { atSec: 330 }],
  fadingLevel: 1,
  intro: "You usually drift around minute four, so I'll check in just before then.",
  reasons: [
    { claim: "First drift landed between 3:40 and 4:20 in your last three sessions.", sessionIds: ["s1", "s2", "s3"] },
    { claim: "Posture dropped after minute 5 in two of three sessions.", sessionIds: ["s2", "s3"] },
  ],
  citations: [LEVINSON_2014],
};

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface FakeOptions {
  lengthSec?: number;
  seed?: number;
  /** [startSec, endSec) windows of drifting. */
  drifts?: [number, number][];
  restless?: [number, number][];
  /** Drowsy from this second to the end. */
  drowsyFromSec?: number | null;
  /** Prepend the 30 s paced-breathing check (negative t). */
  withCalibration?: boolean;
}

/** A plausible session: slow regular breathing when focused, faster and uneven when drifting. */
export function fakeReadings(opts: FakeOptions = {}): SignalReading[] {
  const {
    lengthSec = 300,
    seed = 1,
    drifts = [[140, 175], [235, 255]],
    restless = [[175, 185]],
    drowsyFromSec = null,
    withCalibration = true,
  } = opts;
  const rand = mulberry32(seed);
  const inside = (s: number, ws: [number, number][]) => ws.some(([a, b]) => s >= a && s < b);
  const stateAt = (s: number): AttentionState | null => {
    if (s < 0) return null;
    if (s < BASELINE_SEC) return "settling";
    if (drowsyFromSec !== null && s >= drowsyFromSec) return "drowsy";
    if (inside(s, restless)) return "restless";
    if (inside(s, drifts)) return "drifting";
    return "focused";
  };

  const out: SignalReading[] = [];
  const allBreaths: SessionMs[] = [];
  let phase = 0;
  const dt = 1 / WAVE_HZ;

  for (let s = withCalibration ? -PACED_CHECK_SEC : 0; s < lengthSec; s++) {
    const state = stateAt(s);
    const rate =
      s < 0 ? PACED_RATE_BPM
      : state === "drifting" ? 15
      : state === "restless" ? 17
      : state === "drowsy" ? 9
      : state === "settling" ? 13
      : 10;
    const jitter = state === "drifting" || state === "restless" ? 0.35 : 0.06;
    const amp = state === "drowsy" ? 0.6 : state === "focused" ? 1.2 : 1;

    const wave: number[] = [];
    const breaths: SessionMs[] = [];
    for (let k = 0; k < WAVE_HZ; k++) {
      const before = phase;
      phase += 2 * Math.PI * (rate / 60) * dt * (1 + jitter * (rand() - 0.5) * 2);
      // Inhale peak = sin crossing pi/2.
      const crossed = Math.floor((before - Math.PI / 2) / (2 * Math.PI)) < Math.floor((phase - Math.PI / 2) / (2 * Math.PI));
      const t = Math.round((s + (k + 1) * dt) * 1000);
      if (crossed) breaths.push(t);
      wave.push(+(amp * Math.sin(phase) + 0.08 * (rand() - 0.5)).toFixed(3));
    }
    allBreaths.push(...breaths);

    const t = (s + 1) * 1000;
    const recent = allBreaths.filter((b) => b > t - 30_000);
    const intervals = recent.slice(1).map((b, i) => b - recent[i]);
    const mean = intervals.reduce((a, b) => a + b, 0) / (intervals.length || 1);
    const sd = Math.sqrt(intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / (intervals.length || 1));
    const noisy = (base: number, spread = 0.05) => Math.min(1, Math.max(0, base + spread * (rand() - 0.5) * 2));

    out.push({
      t,
      phase: s < 0 ? "calibration" : s < BASELINE_SEC ? "baseline" : "meditation",
      wave,
      breaths,
      breathRate: recent.length >= 3 ? +rateFromBreaths(recent)!.toFixed(2) : null,
      depth: s < BASELINE_SEC ? null : +noisy(amp / 1.1, 0.05).toFixed(2),
      regularity: intervals.length >= 2 ? +Math.max(0, 1 - sd / mean).toFixed(2) : null,
      stillness: +noisy(state === "restless" ? 0.35 : state === "drifting" ? 0.7 : 0.92).toFixed(2),
      posture: +noisy(state === "drowsy" ? 0.55 : 0.95).toFixed(2),
      tension: +noisy(state === "drifting" || state === "restless" ? 0.45 : 0.2).toFixed(2),
      flutter: +noisy(state === "drifting" ? 0.4 : 0.15).toFixed(2),
      state,
      confidence: state === null ? 0 : +noisy(0.75, 0.15).toFixed(2),
      quality: +noisy(0.9).toFixed(2),
    });
  }
  return out;
}
