/**
 * DEV ONLY. Stands in for the CREAO agents so the app can be built and tested
 * before they exist. Internal, so the app can't call it; run it by hand:
 *   npx convex run devCoach:fakeResult '{"sessionId":"..."}'
 * Never use it for demo history: real sessions must be coached by CREAO.
 */

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { agentUrls } from "./coach";
import { asPlan, asSummary } from "./coachParse";
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

/**
 * Checks each configured CREAO app ID + capi_ key by asking for a run that doesn't exist:
 * 404 RUN_NOT_FOUND means the pair is valid. Starts nothing, spends no credits, prints no keys.
 *   npx convex run devCoach:checkCreao
 */
export const checkCreao = internalAction({
  args: {},
  returns: v.any(),
  handler: async () => {
    const pairs = {
      analyst: [env.CREAO_ANALYST_APP_ID, env.CREAO_ANALYST_API_KEY],
      coach: [env.CREAO_COACH_APP_ID, env.CREAO_COACH_API_KEY],
    };
    const out: Record<string, unknown> = {};
    for (const [stage, [appId, key]] of Object.entries(pairs)) {
      if (!appId || !key) { out[stage] = "not set"; continue; }
      const res = await fetch(
        `https://agent.creao.ai/api/v1/apps/${encodeURIComponent(appId.trim())}/runs/00000000-0000-4000-8000-000000000000`,
        { headers: { authorization: `Bearer ${key.trim()}` } },
      );
      const body = (await res.text()).slice(0, 200);
      out[stage] = {
        status: res.status,
        body,
        ok: res.status === 404 && body.includes("RUN_NOT_FOUND"),
        keyLooksRight: key.startsWith("capi_"),
        whitespace: appId !== appId.trim() || key !== key.trim(),
      };
    }
    return out;
  },
});

/**
 * Checks an agent's final JSON the way Convex will read it, before saving the agent:
 * shape (SessionSummary / SessionPlan) and whether each cited paper is in the library.
 *   npx convex run devCoach:checkReply '{"json": {...}}'
 */
export const checkReply = internalQuery({
  args: { json: v.any() },
  returns: v.any(),
  handler: async (ctx, { json }) => {
    const plan = json?.plan ? asPlan(json.plan) : null;
    const citations = [];
    for (const c of plan?.citations ?? []) {
      const found = await ctx.db
        .query("techniques")
        .withIndex("by_externalId", (q) => q.eq("externalId", c.externalId))
        .unique();
      citations.push({ externalId: c.externalId, inLibrary: !!found, title: found?.title ?? null });
    }
    return {
      // null: this reply has no summary to check (a coach reply carries only the plan).
      summaryOk: json?.summary ? asSummary(json.summary) !== null : json?.plan ? null : asSummary(json) !== null,
      planOk: json?.plan ? plan !== null : null,
      citations,
    };
  },
});

/**
 * What CREAO reports for our recent real runs (credits used, timing), for the README's cost
 * estimate. Reads run status with the app keys; prints no keys.  npx convex run devCoach:runUsage
 */
export const runUsage = internalAction({
  args: { limit: v.optional(v.number()) },
  returns: v.any(),
  handler: async (ctx, { limit }) => {
    const runs: { stage: string | null; creaoRunId: string }[] = await ctx.runQuery(internal.devCoach.recentRuns, { limit: limit ?? 8 });
    const out = [];
    for (const r of runs) {
      const appId = r.stage === "analyst" ? env.CREAO_ANALYST_APP_ID : env.CREAO_COACH_APP_ID;
      const key = r.stage === "analyst" ? env.CREAO_ANALYST_API_KEY : env.CREAO_COACH_API_KEY;
      if (!appId || !key) continue;
      const res = await fetch(`https://agent.creao.ai/api/v1/apps/${appId}/runs/${r.creaoRunId}`, { headers: { authorization: `Bearer ${key}` } });
      const body = (await res.json()) as Record<string, unknown>;
      const { result: _r, ...meta } = body; // drop the reply text
      out.push({ stage: r.stage, status: res.status, meta });
    }
    return out;
  },
});

export const recentRuns = internalQuery({
  args: { limit: v.number() },
  returns: v.array(v.object({ stage: v.union(v.string(), v.null()), creaoRunId: v.string() })),
  handler: async (ctx, { limit }) => {
    const rows = await ctx.db.query("coachRuns").order("desc").take(100);
    return rows
      .filter((r) => r.creaoRunId && !r.creaoRunId.startsWith("phase1-") && r.status === "succeeded")
      .slice(0, limit)
      .map((r) => ({ stage: r.stage ?? null, creaoRunId: r.creaoRunId! }));
  },
});

/** Cost of the latest Research Actor runs on Apify (for the README's cost estimate). */
export const researchRunCost = internalAction({
  args: {},
  returns: v.any(),
  handler: async () => {
    const res = await fetch(`https://api.apify.com/v2/acts/${encodeURIComponent(env.APIFY_RESEARCH_ACTOR ?? "")}/runs?desc=true&limit=3`, {
      headers: { authorization: `Bearer ${env.APIFY_TOKEN}` },
    });
    const body = (await res.json()) as { data?: { items?: { id: string; status: string; usageTotalUsd?: number; stats?: { runTimeSecs?: number } }[] } };
    return (body.data?.items ?? []).map((r) => ({ id: r.id, status: r.status, usd: r.usageTotalUsd, secs: r.stats?.runTimeSecs }));
  },
});
