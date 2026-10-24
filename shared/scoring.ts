/**
 * Pure scoring helpers shared by the app, Convex and our offline eval.
 * The Session Analyst recomputes these in Python; these are the reference.
 */

import type {
  AttentionState,
  FeelAnswer,
  FeelCheck,
  SessionMs,
  SessionSummary,
  SignalReading,
} from "./types";
import { ATTENTION_STATES, SESSION_VECTOR_DIM } from "./types";

/** Does a spoken answer agree with the sensors? null = not scorable. */
export function answerMatchesState(
  answer: FeelAnswer | null,
  state: AttentionState | null,
): boolean | null {
  if (answer === null || state === null || state === "settling") return null;
  switch (answer) {
    case "focused":
      return state === "focused";
    case "drifting":
      return state === "drifting" || state === "restless";
    case "sleepy":
      return state === "drowsy";
  }
}

/** Most common non-null state over (t - windowMs, t]. */
export function dominantState(
  readings: SignalReading[],
  t: SessionMs,
  windowMs = 20_000,
): AttentionState | null {
  const counts = new Map<AttentionState, number>();
  for (const r of readings) {
    if (r.state !== null && r.t > t - windowMs && r.t <= t) {
      counts.set(r.state, (counts.get(r.state) ?? 0) + 1);
    }
  }
  let best: AttentionState | null = null;
  let bestCount = 0;
  for (const [s, c] of counts) {
    if (c > bestCount) [best, bestCount] = [s, c];
  }
  return best;
}

/** Fraction of scorable Feel Checks that matched. null if none were scorable. */
export function selfAwarenessScore(checks: FeelCheck[]): number | null {
  const scored = checks.filter((c) => c.match !== null);
  if (scored.length === 0) return null;
  return scored.filter((c) => c.match).length / scored.length;
}

/**
 * Pair ground-truth inhale taps with detected peaks (greedy, nearest first).
 * This is the number for Devpost: precision, recall and timing offset.
 */
export function matchBreaths(taps: SessionMs[], detected: SessionMs[], toleranceMs = 1500) {
  const pairs: { tap: SessionMs; detected: SessionMs; gap: number }[] = [];
  for (const tap of taps) {
    for (const d of detected) pairs.push({ tap, detected: d, gap: Math.abs(d - tap) });
  }
  pairs.sort((a, b) => a.gap - b.gap);
  const usedTaps = new Set<SessionMs>();
  const usedDetected = new Set<SessionMs>();
  const offsets: number[] = [];
  for (const p of pairs) {
    if (p.gap > toleranceMs) break;
    if (usedTaps.has(p.tap) || usedDetected.has(p.detected)) continue;
    usedTaps.add(p.tap);
    usedDetected.add(p.detected);
    offsets.push(p.detected - p.tap);
  }
  const tp = offsets.length;
  return {
    tp,
    fp: detected.length - tp,
    fn: taps.length - tp,
    precision: detected.length ? tp / detected.length : null,
    recall: taps.length ? tp / taps.length : null,
    countError: Math.abs(detected.length - taps.length),
    meanOffsetMs: tp ? offsets.reduce((a, b) => a + b, 0) / tp : null,
  };
}

/** Breaths per minute from peak times (mean interval). */
export function rateFromBreaths(times: SessionMs[]): number | null {
  if (times.length < 2) return null;
  const sorted = [...times].sort((a, b) => a - b);
  const span = sorted[sorted.length - 1] - sorted[0];
  return span > 0 ? ((sorted.length - 1) / span) * 60_000 : null;
}

/**
 * Breath-counting test. Each tap claims "that was breath N". A tap is correct
 * when the camera saw N breaths since the previous tap. tolerance=1 by default
 * because camera detection itself can miss or add one breath.
 */
export function scoreBreathCount(
  tapTimes: SessionMs[],
  detectedTimes: SessionMs[],
  n: number,
  startT: SessionMs,
  tolerance = 1,
  graceMs = 1500,
) {
  const taps = [...tapTimes].sort((a, b) => a - b);
  const breaths = [...detectedTimes].sort((a, b) => a - b);
  const counts: number[] = [];
  let prev = startT;
  for (const tap of taps) {
    // A tap lags its inhale, so a peak up to graceMs after the tap still counts.
    counts.push(breaths.filter((b) => b > prev && b <= tap + graceMs).length);
    prev = tap + graceMs;
  }
  const correct = counts.filter((c) => Math.abs(c - n) <= tolerance).length;
  return { counts, correct, total: taps.length, accuracy: taps.length ? correct / taps.length : null };
}

/** Fixed-length feature vector for "sessions that looked like this one". */
export function sessionFeatureVector(s: SessionSummary): number[] {
  const total = ATTENTION_STATES.reduce((a, k) => a + s.timeInState[k], 0) || 1;
  const v = [
    ...ATTENTION_STATES.map((k) => s.timeInState[k] / total),
    s.firstDriftSec === null ? 1 : Math.min(s.firstDriftSec / 600, 1),
    (s.meanBreathRate ?? 12) / 30,
    s.meanRegularity ?? 0.5,
    s.meanStillness,
    s.meanPosture,
    s.meanTension,
    s.selfAwareness ?? 0.5,
  ];
  if (v.length !== SESSION_VECTOR_DIM) throw new Error("SESSION_VECTOR_DIM out of sync");
  return v;
}
