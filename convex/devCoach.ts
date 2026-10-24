/**
 * DEV ONLY. Stands in for the CREAO agents so the app can be built and tested
 * before they exist. Internal, so the app can't call it; run it by hand:
 *   npx convex run devCoach:fakeResult '{"sessionId":"..."}'
 * Never use it for demo history: real sessions must be coached by CREAO.
 */

import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { EXAMPLE_COACH_PLAN } from "../shared/fixtures";
import { selfAwarenessScore, sessionFeatureVector } from "../shared/scoring";
import type { SessionSummary, TimeInState } from "../shared/types";

export const fakeResult = internalMutation({
  args: { sessionId: v.id("sessions") },
  returns: v.id("plans"),
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get("sessions", sessionId);
    if (!session) throw new Error("Unknown session");
    const readings = await ctx.db
      .query("samples")
      .withIndex("by_sessionId_and_t", (q) => q.eq("sessionId", sessionId))
      .take(3600);
    const checks = await ctx.db
      .query("feelChecks")
      .withIndex("by_sessionId_and_t", (q) => q.eq("sessionId", sessionId))
      .take(50);

    const med = readings.filter((r) => r.phase === "meditation");
    const timeInState: TimeInState = { settling: 0, focused: 0, drifting: 0, drowsy: 0, restless: 0 };
    const driftOnsetsSec: number[] = [];
    let prev: string | null = null;
    for (const r of med) {
      if (r.state) timeInState[r.state] += 1;
      if (r.state === "drifting" && prev !== "drifting") driftOnsetsSec.push(Math.round(r.t / 1000));
      prev = r.state;
    }
    const mean = (xs: (number | null)[]) => {
      const ok = xs.filter((x): x is number => x !== null);
      return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null;
    };
    const summary: SessionSummary = {
      timeInState,
      driftOnsetsSec,
      firstDriftSec: driftOnsetsSec[0] ?? null,
      meanBreathRate: mean(med.map((r) => r.breathRate)),
      meanRegularity: mean(med.map((r) => r.regularity)),
      meanStillness: mean(med.map((r) => r.stillness)) ?? 0,
      meanPosture: mean(med.map((r) => r.posture)) ?? 0,
      meanTension: mean(med.map((r) => r.tension)) ?? 0,
      selfAwareness: selfAwarenessScore(checks),
      breathCountAccuracy: null,
      highlights: ["[dev] Fake coach result, not from CREAO."],
    };

    const coachRunId = await ctx.db.insert("coachRuns", {
      sessionId,
      userId: session.userId,
      stage: "coach",
      status: "succeeded",
      startedAt: Date.now(),
      finishedAt: Date.now(),
      error: "dev fake result",
    });
    await ctx.db.patch("sessions", sessionId, {
      summary,
      features: sessionFeatureVector(summary),
      status: "coached",
    });
    return await ctx.db.insert("plans", {
      userId: session.userId,
      basedOnSessionId: sessionId,
      coachRunId,
      createdAt: Date.now(),
      ...EXAMPLE_COACH_PLAN,
      reasons: EXAMPLE_COACH_PLAN.reasons.map((r) => ({ ...r, sessionIds: [sessionId] })),
    });
  },
});
