/**
 * Which plan a session runs. Only the first (baseline) session uses a fixed plan;
 * every training session after it was designed by the CREAO coach.
 */

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { BASELINE_PLAN, LEVINSON_2014 } from "../shared/fixtures";
import type { SessionPlan } from "../shared/types";
import { BASELINE_SEC } from "../shared/types";

/** "Coach off": no cues, no Feel Checks, no fading. Just the breathing graph. */
export const COACH_OFF_PLAN: SessionPlan = {
  version: 1,
  technique: "breathFocus",
  lengthSec: 300,
  cues: [],
  feelChecks: [],
  fadingLevel: 3,
  intro: "",
  reasons: [],
  citations: [],
};

/** Breath-counting focus test (Levinson et al., 2014): count breaths, tap on every Nth. */
export const BREATH_COUNT_PLAN: SessionPlan = {
  version: 1,
  technique: "breathCounting",
  lengthSec: BASELINE_SEC + 180,
  cues: [
    { atSec: 0, kind: "settle", text: "Close your eyes and let your breath settle.", onBreath: "exhale" },
    {
      atSec: BASELINE_SEC,
      kind: "anchor",
      text: "Now count each breath silently. Tap on every ninth, then start again at one.",
      onBreath: "exhale",
    },
    { atSec: BASELINE_SEC + 175, kind: "close", text: "Stop counting. Gently open your eyes.", onBreath: "exhale" },
  ],
  feelChecks: [],
  fadingLevel: 0,
  intro: "This is the breath-counting test.",
  reasons: [],
  citations: [LEVINSON_2014],
};

export function planFromDoc(p: Doc<"plans">): SessionPlan {
  return {
    version: p.version,
    technique: p.technique,
    lengthSec: p.lengthSec,
    cues: p.cues,
    feelChecks: p.feelChecks,
    fadingLevel: p.fadingLevel,
    intro: p.intro,
    reasons: p.reasons,
    citations: p.citations ?? [],
  };
}

export type NextPlan =
  | { source: "baseline"; plan: SessionPlan; planId: null }
  | { source: "coach"; plan: SessionPlan; planId: Id<"plans"> }
  /** The coach hasn't designed the next session yet (run in progress or failed). */
  | { source: "waiting"; plan: null; planId: null }
  | { source: "coachOff"; plan: SessionPlan; planId: null };

export async function nextPlanFor(ctx: QueryCtx, user: Doc<"users">): Promise<NextPlan> {
  const anySession = await ctx.db
    .query("sessions")
    .withIndex("by_userId_and_startedAt", (q) => q.eq("userId", user._id))
    .first();
  if (!anySession) return { source: "baseline", plan: BASELINE_PLAN, planId: null };
  if (!user.coachEnabled) return { source: "coachOff", plan: COACH_OFF_PLAN, planId: null };
  const latest = await ctx.db
    .query("plans")
    .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", user._id))
    .order("desc")
    .first();
  if (latest) return { source: "coach", plan: planFromDoc(latest), planId: latest._id };
  // No plan yet: wait only while a coach run is actually in progress. If every earlier session
  // ended without one (coach failed, or ran with the coach off), start over from the baseline
  // instead of refusing new sessions forever.
  const newest = await ctx.db
    .query("sessions")
    .withIndex("by_userId_and_startedAt", (q) => q.eq("userId", user._id))
    .order("desc")
    .first();
  if (newest?.status === "analyzing") return { source: "waiting", plan: null, planId: null };
  return { source: "baseline", plan: BASELINE_PLAN, planId: null };
}

/** The plan a session actually ran. */
export async function planForSession(ctx: QueryCtx, session: Doc<"sessions">): Promise<SessionPlan> {
  if (session.planId) {
    const p = await ctx.db.get("plans", session.planId);
    if (p) return planFromDoc(p);
  }
  if (session.kind === "breathCount") return BREATH_COUNT_PLAN;
  if (session.kind === "baseline") return BASELINE_PLAN;
  return COACH_OFF_PLAN;
}
