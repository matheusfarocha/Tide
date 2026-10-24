/**
 * Narrow untrusted agent output into SessionSummary / SessionPlan.
 * Agents reply in text, so we pull the last JSON object out of it, then keep only
 * the fields we know, clamped to sane ranges. Anything unusable → null.
 */

import type { PlanCue, SessionPlan, SessionSummary, Technique, TimeInState } from "../shared/types";
import { ATTENTION_STATES } from "../shared/types";

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
const str = (x: unknown) => (typeof x === "string" ? x.trim() : null);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const nums = (x: unknown, max = 50) =>
  Array.isArray(x) ? x.map(num).filter((n): n is number => n !== null).slice(0, max) : [];
const unit = (x: unknown) => {
  const n = num(x);
  return n === null ? null : clamp(n, 0, 1);
};

/** The last parseable JSON object in an agent's reply (fenced ```json blocks first). */
export function extractJson(text: string): Obj | null {
  const candidates: string[] = [];
  for (const m of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)) candidates.push(m[1]);
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));
  for (const c of candidates.reverse()) {
    try {
      const parsed: unknown = JSON.parse(c);
      if (isObj(parsed)) return parsed;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

export function asSummary(x: unknown): SessionSummary | null {
  if (!isObj(x) || !isObj(x.timeInState)) return null;
  const tis = x.timeInState;
  const timeInState = Object.fromEntries(
    ATTENTION_STATES.map((s) => [s, Math.max(0, num(tis[s]) ?? 0)]),
  ) as unknown as TimeInState;
  const highlights = Array.isArray(x.highlights)
    ? x.highlights
        .map(str)
        .filter((h): h is string => !!h)
        .map((h) => h.slice(0, 200))
        .slice(0, 8)
    : [];
  return {
    timeInState,
    driftOnsetsSec: nums(x.driftOnsetsSec),
    firstDriftSec: num(x.firstDriftSec),
    meanBreathRate: num(x.meanBreathRate),
    meanRegularity: unit(x.meanRegularity),
    meanStillness: unit(x.meanStillness) ?? 0,
    meanPosture: unit(x.meanPosture) ?? 0,
    meanTension: unit(x.meanTension) ?? 0,
    selfAwareness: unit(x.selfAwareness),
    breathCountAccuracy: unit(x.breathCountAccuracy),
    highlights,
  };
}

const TECHNIQUES: readonly Technique[] = ["breathFocus", "bodyScan", "breathCounting", "openAwareness"];
const CUE_KINDS: readonly PlanCue["kind"][] = ["settle", "anchor", "posture", "wake", "close"];
const BREATH: readonly PlanCue["onBreath"][] = ["inhale", "exhale", "any"];
const oneOf = <T extends string>(xs: readonly T[], x: unknown, fallback: T): T =>
  (xs as readonly unknown[]).includes(x) ? (x as T) : fallback;

export function asPlan(x: unknown): SessionPlan | null {
  if (!isObj(x)) return null;
  const lengthSec = num(x.lengthSec);
  if (lengthSec === null || !Array.isArray(x.cues)) return null;
  const len = Math.round(clamp(lengthSec, 60, 1800));
  const cues: PlanCue[] = x.cues
    .filter(isObj)
    .map((c) => ({
      atSec: Math.round(num(c.atSec) ?? -1),
      kind: oneOf(CUE_KINDS, c.kind, "anchor"),
      text: (str(c.text) ?? "").slice(0, 200),
      onBreath: oneOf(BREATH, c.onBreath, "any"),
    }))
    .filter((c) => c.atSec >= 0 && c.atSec <= len && c.text)
    .sort((a, b) => a.atSec - b.atSec)
    .slice(0, 30);
  const feelChecks = (Array.isArray(x.feelChecks) ? x.feelChecks : [])
    .map((f) => (isObj(f) ? num(f.atSec) : num(f)))
    .filter((t): t is number => t !== null && t > 0 && t < len)
    .map((t) => ({ atSec: Math.round(t) }))
    .sort((a, b) => a.atSec - b.atSec)
    .slice(0, 10);
  const reasons = (Array.isArray(x.reasons) ? x.reasons : [])
    .filter(isObj)
    .map((r) => ({
      claim: (str(r.claim) ?? "").slice(0, 300),
      sessionIds: Array.isArray(r.sessionIds)
        ? r.sessionIds.filter((s): s is string => typeof s === "string").slice(0, 20)
        : [],
    }))
    .filter((r) => r.claim)
    .slice(0, 10);
  // Only the ID and the reason are trusted from the agent; applyCoach fills citation + url
  // from the research library and drops IDs that aren't in it.
  const citations = (Array.isArray(x.citations) ? x.citations : [])
    .filter(isObj)
    .map((c) => ({ externalId: str(c.externalId) ?? "", why: (str(c.why) ?? "").slice(0, 300), citation: "", url: "" }))
    .filter((c) => c.externalId)
    .slice(0, 5);
  return {
    version: 1,
    technique: oneOf(TECHNIQUES, x.technique, "breathFocus"),
    lengthSec: len,
    cues,
    feelChecks,
    fadingLevel: Math.round(clamp(num(x.fadingLevel) ?? 0, 0, 3)),
    intro: (str(x.intro) ?? "").slice(0, 300),
    reasons,
    citations,
  };
}
