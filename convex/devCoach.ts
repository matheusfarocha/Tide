/**
 * DEV ONLY. Stands in for the CREAO agents so the app can be built and tested
 * before they exist. Internal, so the app can't call it; run it by hand:
 *   npx convex run devCoach:fakeResult '{"sessionId":"..."}'
 * Never use it for demo history: real sessions must be coached by CREAO.
 */

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { agentUrls } from "./coach";
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

/**
 * Recent finished training sessions with how much data they hold, to pick one for building
 * the CREAO agents against:  npx convex run devCoach:candidates
 */
export const candidates = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      sessionId: v.id("sessions"),
      userName: v.string(),
      kind: v.string(),
      status: v.string(),
      readings: v.number(),
      meditationReadings: v.number(),
      feelChecks: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const sessions = await ctx.db.query("sessions").order("desc").take(40);
    const out = [];
    for (const s of sessions) {
      if (s.status === "live" || s.kind === "breathCount") continue;
      const readings = await ctx.db
        .query("samples")
        .withIndex("by_sessionId_and_t", (q) => q.eq("sessionId", s._id))
        .take(3600);
      const checks = await ctx.db
        .query("feelChecks")
        .withIndex("by_sessionId_and_t", (q) => q.eq("sessionId", s._id))
        .take(50);
      const user = await ctx.db.get("users", s.userId);
      out.push({
        sessionId: s._id,
        userName: user?.name ?? "",
        kind: s.kind,
        status: s.status,
        readings: readings.length,
        meditationReadings: readings.filter((r) => r.phase === "meditation").length,
        feelChecks: checks.length,
      });
    }
    return out;
  },
});

/**
 * The exact `inputs` Convex sends each agent for this session, to paste into the CREAO chat
 * while building the agents. Contains TIDE_AGENT_KEY: paste it only into CREAO.
 *   npx convex run devCoach:agentInputs '{"sessionId":"..."}'
 */
export const agentInputs = internalQuery({
  args: { sessionId: v.id("sessions") },
  returns: v.any(),
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get("sessions", sessionId);
    if (!session) throw new Error("Unknown session");
    const user = await ctx.db.get("users", session.userId);
    const urls = agentUrls(sessionId, session.userId);
    const base = {
      sessionId,
      userId: session.userId,
      userName: user?.name ?? "",
      sessionUrl: urls.sessionUrl,
      historyUrl: urls.historyUrl,
      researchUrl: urls.researchUrl,
    };
    return {
      analyst: base,
      coach: { ...base, summaryJson: session.summary ? JSON.stringify(session.summary) : "<paste the Analyst's JSON here>" },
    };
  },
});

/**
 * Calls the agents' tool URLs the way CREAO will (from outside, with the key) and reports
 * what comes back, without printing the key:  npx convex run devCoach:checkTools '{"sessionId":"..."}'
 */
export const checkTools = internalAction({
  args: { sessionId: v.id("sessions") },
  returns: v.any(),
  handler: async (ctx, { sessionId }) => {
    const inputs: { analyst: { userId: string; sessionUrl: string; historyUrl: string; researchUrl: string } } =
      await ctx.runQuery(internal.devCoach.agentInputs, { sessionId });
    const { sessionUrl, historyUrl, researchUrl } = inputs.analyst;
    const probe = async (url: string, summarize: (body: any) => unknown) => {
      const res = await fetch(url);
      const text = await res.text();
      let body: unknown = null;
      try { body = JSON.parse(text); } catch { /* not JSON */ }
      return { status: res.status, bytes: text.length, ...(res.ok && body ? { sees: summarize(body) } : { body: text.slice(0, 200) }) };
    };
    return {
      session: await probe(sessionUrl, (b) => ({
        readings: b.readings?.length, feelChecks: b.feelChecks?.length,
        calibrations: b.calibrations?.length, plan: b.plan?.technique,
      })),
      history: await probe(historyUrl, (b) => ({ sessions: b.sessions?.length, coached: b.sessions?.filter((s: any) => s.summary).length })),
      research: await probe(`${researchUrl}mind%20wandering&limit=5`, (b) =>
        b.findings?.map((f: any) => `${f.externalId}: ${String(f.title ?? f.citation).slice(0, 90)}`)),
      withoutKey: (await fetch(sessionUrl.replace(/&key=[^&]*/, ""))).status,
    };
  },
});
