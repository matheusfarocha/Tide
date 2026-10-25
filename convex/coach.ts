/**
 * The CREAO coach loop. Runs between sessions, never during one.
 *
 *   sessions.end ──schedule──▶ start ─▶ Session Analyst run (CREAO, async)
 *        webhook /creao/webhook  or  poll every 30 s ─▶ SessionSummary on the session
 *   ─▶ Coach & Plan Designer run ─▶ SessionPlan ─▶ plans row ─▶ app updates reactively
 *
 * Nothing ever waits on a run: each step is a scheduled function. The webhook is the
 * fast path; polling is the fallback if a delivery is lost. Both are idempotent.
 * If only the coach agent is configured, it must return { summary, plan } itself.
 */

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  env,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  type ActionCtx,
  type MutationCtx,
} from "./_generated/server";
import { asPlan, asSummary, extractJson } from "./coachParse";
import { vSessionPlan, vSessionSummary } from "./validators";
import { sessionFeatureVector } from "../shared/scoring";
import type { PlanCitation, SessionSummary } from "../shared/types";

const CREAO = "https://agent.creao.ai/api/v1";
const FIRST_POLL_MS = 60_000;
const POLL_MS = 30_000;
const MAX_POLLS = 40; // ~20 minutes
/** Coach runs per session before giving up on a plan that cites no paper from the library. */
const MAX_COACH_ATTEMPTS = 2;

type Stage = "analyst" | "coach";
const vStage = v.union(v.literal("analyst"), v.literal("coach"));

function agent(stage: Stage) {
  const appId = stage === "analyst" ? env.CREAO_ANALYST_APP_ID : env.CREAO_COACH_APP_ID;
  const key = stage === "analyst" ? env.CREAO_ANALYST_API_KEY : env.CREAO_COACH_API_KEY;
  return appId && key ? { appId, key } : null;
}

/** URLs the agents call as tools. ?key= is checked by convex/http.ts. */
export function agentUrls(sessionId: Id<"sessions">, userId: Id<"users">) {
  const site = env.CONVEX_SITE_URL;
  const key = env.TIDE_AGENT_KEY ? `&key=${encodeURIComponent(env.TIDE_AGENT_KEY)}` : "";
  return {
    sessionUrl: `${site}/session?sessionId=${sessionId}${key}`,
    historyUrl: `${site}/history?userId=${userId}${key}`,
    researchUrl: `${site}/research?q=`,
    webhookUrl: `${site}/creao/webhook?${key.slice(1)}`,
  };
}

// ---------- Reads and writes (mutations are the only place state changes) ----------

export const context = internalQuery({
  args: { sessionId: v.id("sessions") },
  returns: v.union(
    v.null(),
    v.object({ userId: v.id("users"), userName: v.string(), summary: v.union(vSessionSummary, v.null()) }),
  ),
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get("sessions", sessionId);
    if (!session) return null;
    const user = await ctx.db.get("users", session.userId);
    return { userId: session.userId, userName: user?.name ?? "", summary: session.summary ?? null };
  },
});

export const getRun = internalQuery({
  args: { coachRunId: v.id("coachRuns") },
  returns: v.union(v.null(), v.object({ stage: v.union(vStage, v.null()), status: v.string(), creaoRunId: v.union(v.string(), v.null()), sessionId: v.id("sessions") })),
  handler: async (ctx, { coachRunId }) => {
    const run = await ctx.db.get("coachRuns", coachRunId);
    if (!run) return null;
    return { stage: run.stage ?? null, status: run.status, creaoRunId: run.creaoRunId ?? null, sessionId: run.sessionId };
  },
});

export const runByCreaoId = internalQuery({
  args: { creaoRunId: v.string() },
  returns: v.union(v.id("coachRuns"), v.null()),
  handler: async (ctx, { creaoRunId }) => {
    const run = await ctx.db
      .query("coachRuns")
      .withIndex("by_creaoRunId", (q) => q.eq("creaoRunId", creaoRunId))
      .first();
    return run?._id ?? null;
  },
});

export const createRun = internalMutation({
  args: { sessionId: v.id("sessions"), userId: v.id("users"), stage: vStage },
  returns: v.id("coachRuns"),
  handler: async (ctx, args) =>
    await ctx.db.insert("coachRuns", { ...args, status: "queued", startedAt: Date.now() }),
});

export const markRunning = internalMutation({
  args: { coachRunId: v.id("coachRuns"), creaoRunId: v.string() },
  returns: v.null(),
  handler: async (ctx, { coachRunId, creaoRunId }) => {
    await ctx.db.patch("coachRuns", coachRunId, { status: "running", creaoRunId });
    return null;
  },
});

async function finishRun(ctx: MutationCtx, run: Doc<"coachRuns">, patch: Partial<Doc<"coachRuns">>) {
  await ctx.db.patch("coachRuns", run._id, { finishedAt: Date.now(), ...patch });
  if (patch.creaoThreadId) {
    const user = await ctx.db.get("users", run.userId);
    if (user && !user.creaoThreadId) await ctx.db.patch("users", run.userId, { creaoThreadId: patch.creaoThreadId });
  }
}

export const fail = internalMutation({
  args: { coachRunId: v.id("coachRuns"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, { coachRunId, error }) => {
    const run = await ctx.db.get("coachRuns", coachRunId);
    if (!run || run.status === "succeeded" || run.status === "failed") return null;
    await finishRun(ctx, run, { status: "failed", error: error.slice(0, 1000) });
    await ctx.db.patch("sessions", run.sessionId, { status: "coachFailed" });
    return null;
  },
});

/** Session-level failure before any run exists (e.g. CREAO not configured). */
export const failSession = internalMutation({
  args: { sessionId: v.id("sessions"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, { sessionId, error }) => {
    console.error(`Coach failed for ${sessionId}: ${error}`);
    await ctx.db.patch("sessions", sessionId, { status: "coachFailed" });
    return null;
  },
});

async function saveSummary(ctx: MutationCtx, sessionId: Id<"sessions">, summary: SessionSummary) {
  const session = await ctx.db.get("sessions", sessionId);
  if (!session) return;
  await ctx.db.patch("sessions", sessionId, { summary, features: sessionFeatureVector(summary) });
  // The user's self-awareness score: mean of their last 5 scorable sessions.
  const recent = await ctx.db
    .query("sessions")
    .withIndex("by_userId_and_startedAt", (q) => q.eq("userId", session.userId))
    .order("desc")
    .take(20);
  const scores = recent
    .map((s) => (s._id === sessionId ? summary : s.summary)?.selfAwareness ?? null)
    .filter((x): x is number => x !== null)
    .slice(0, 5);
  if (scores.length) {
    await ctx.db.patch("users", session.userId, {
      selfAwareness: scores.reduce((a, b) => a + b, 0) / scores.length,
    });
  }
}

/** Analyst finished. Returns false if this result was already applied (webhook + poll race). */
export const applyAnalyst = internalMutation({
  args: { coachRunId: v.id("coachRuns"), summary: vSessionSummary, creaoThreadId: v.union(v.string(), v.null()) },
  returns: v.boolean(),
  handler: async (ctx, { coachRunId, summary, creaoThreadId }) => {
    const run = await ctx.db.get("coachRuns", coachRunId);
    if (!run || run.status === "succeeded" || run.status === "failed") return false;
    await finishRun(ctx, run, { status: "succeeded", creaoThreadId: creaoThreadId ?? undefined });
    await saveSummary(ctx, run.sessionId, summary);
    return true;
  },
});

/**
 * Keep only citations of papers in the research library, with citation text and link taken
 * from the library, not from the agent. So a plan can't cite a paper the Actor never collected.
 */
async function resolveCitations(ctx: MutationCtx, cited: PlanCitation[]): Promise<PlanCitation[]> {
  const out: PlanCitation[] = [];
  for (const c of cited) {
    if (out.some((o) => o.externalId === c.externalId)) continue;
    const found = await ctx.db
      .query("techniques")
      .withIndex("by_externalId", (q) => q.eq("externalId", c.externalId))
      .unique();
    if (found) out.push({ externalId: c.externalId, why: c.why, citation: found.citation, url: found.url });
  }
  return out;
}

/**
 * Coach finished: the next session exists, as long as it is grounded in the research library.
 * A plan citing no paper the Apify Actor collected is rejected: "retry" asks the coach again,
 * "failed" means it already had MAX_COACH_ATTEMPTS tries.
 */
export const applyCoach = internalMutation({
  args: {
    coachRunId: v.id("coachRuns"),
    plan: vSessionPlan,
    summary: v.union(vSessionSummary, v.null()),
    creaoThreadId: v.union(v.string(), v.null()),
    shareUrl: v.union(v.string(), v.null()),
  },
  returns: v.union(v.literal("applied"), v.literal("duplicate"), v.literal("retry"), v.literal("failed")),
  handler: async (ctx, { coachRunId, plan, summary, creaoThreadId, shareUrl }) => {
    const run = await ctx.db.get("coachRuns", coachRunId);
    if (!run || run.status === "succeeded" || run.status === "failed") return "duplicate";
    const session = await ctx.db.get("sessions", run.sessionId);
    if (summary && !session?.summary) await saveSummary(ctx, run.sessionId, summary);
    const citations = await resolveCitations(ctx, plan.citations);
    if (citations.length === 0) {
      const error = "Plan cited no paper from the research library";
      await finishRun(ctx, run, { status: "failed", error, creaoThreadId: creaoThreadId ?? undefined });
      const attempts = (await ctx.db
        .query("coachRuns")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", run.sessionId))
        .take(20)).filter((r) => r.stage === "coach").length;
      if (attempts < MAX_COACH_ATTEMPTS) return "retry";
      await ctx.db.patch("sessions", run.sessionId, { status: "coachFailed" });
      return "failed";
    }
    await finishRun(ctx, run, {
      status: "succeeded",
      creaoThreadId: creaoThreadId ?? undefined,
      shareUrl: shareUrl ?? undefined,
    });
    await ctx.db.insert("plans", {
      userId: run.userId,
      basedOnSessionId: run.sessionId,
      coachRunId,
      createdAt: Date.now(),
      ...plan,
      citations,
    });
    await ctx.db.patch("sessions", run.sessionId, { status: "coached" });
    return "applied";
  },
});

// ---------- Talking to CREAO ----------

async function launch(ctx: ActionCtx, sessionId: Id<"sessions">, stage: Stage) {
  const cfg = agent(stage);
  const info = await ctx.runQuery(internal.coach.context, { sessionId });
  if (!cfg || !info) {
    await ctx.runMutation(internal.coach.failSession, { sessionId, error: `CREAO ${stage} agent is not configured` });
    return;
  }
  const coachRunId = await ctx.runMutation(internal.coach.createRun, { sessionId, userId: info.userId, stage });
  const urls = agentUrls(sessionId, info.userId);
  const inputs: Record<string, string> = {
    sessionId,
    userId: info.userId,
    userName: info.userName,
    sessionUrl: urls.sessionUrl,
    historyUrl: urls.historyUrl,
    researchUrl: urls.researchUrl,
  };
  if (stage === "coach" && info.summary) inputs.summaryJson = JSON.stringify(info.summary);

  try {
    const res = await fetch(`${CREAO}/apps/${encodeURIComponent(cfg.appId)}/runs`, {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.key}`, "content-type": "application/json" },
      body: JSON.stringify({ inputs, webhookUrl: urls.webhookUrl }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { id?: unknown };
    if (typeof body.id !== "string") throw new Error("CREAO response had no run id");
    await ctx.runMutation(internal.coach.markRunning, { coachRunId, creaoRunId: body.id });
    console.log(`CREAO ${stage} run ${body.id} started for session ${sessionId}`);
    await ctx.scheduler.runAfter(FIRST_POLL_MS, internal.coach.poll, { coachRunId, attempt: 1 });
  } catch (e) {
    await ctx.runMutation(internal.coach.fail, { coachRunId, error: `Starting CREAO ${stage}: ${String(e)}` });
  }
}

/** Scheduled by sessions.end (and coach.retry). */
export const start = internalAction({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, { sessionId }) => {
    await launch(ctx, sessionId, agent("analyst") ? "analyst" : "coach");
    return null;
  },
});

type RunResult = { status: string; text: string | null; threadId: string | null };

/**
 * The agent's reply from a run's `result`. CREAO adds `chatText` when the conversational reply
 * differs from `text`, so read both; `text` goes last because the last JSON object wins.
 */
export function resultText(result: unknown): string | null {
  if (typeof result === "string") return result;
  if (typeof result !== "object" || result === null) return null;
  const r = result as { text?: unknown; chatText?: unknown };
  const parts = [r.chatText, r.text].filter((s): s is string => typeof s === "string" && s.length > 0);
  return parts.length ? parts.join("\n\n") : null;
}

function readRun(body: unknown): RunResult {
  const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const data = (typeof b.data === "object" && b.data !== null ? b.data : b) as Record<string, unknown>;
  const text = resultText(data.result ?? data.output) ?? (typeof data.text === "string" ? data.text : null);
  return {
    status: typeof data.status === "string" ? data.status : "unknown",
    text,
    threadId: typeof data.threadId === "string" ? data.threadId : null,
  };
}

/** Turn a finished run's text into summary / plan and move the pipeline on. */
async function complete(ctx: ActionCtx, coachRunId: Id<"coachRuns">, result: RunResult) {
  const run = await ctx.runQuery(internal.coach.getRun, { coachRunId });
  if (!run) return;
  const json = result.text ? extractJson(result.text) : null;
  if (!json) {
    await ctx.runMutation(internal.coach.fail, { coachRunId, error: "Agent reply had no JSON object" });
    return;
  }
  const summary = asSummary(json.summary ?? json);
  if (run.stage === "analyst") {
    if (!summary) {
      await ctx.runMutation(internal.coach.fail, { coachRunId, error: "Analyst JSON is not a SessionSummary" });
      return;
    }
    const applied = await ctx.runMutation(internal.coach.applyAnalyst, {
      coachRunId,
      summary,
      creaoThreadId: result.threadId,
    });
    if (applied) await launch(ctx, run.sessionId, "coach");
    return;
  }
  const plan = asPlan(json.plan ?? json);
  if (!plan) {
    await ctx.runMutation(internal.coach.fail, { coachRunId, error: "Coach JSON is not a SessionPlan" });
    return;
  }
  const outcome = await ctx.runMutation(internal.coach.applyCoach, {
    coachRunId,
    plan,
    summary: json.summary ? summary : null,
    creaoThreadId: result.threadId,
    shareUrl: typeof json.shareUrl === "string" ? json.shareUrl : null,
  });
  if (outcome === "retry") {
    console.warn(`Coach plan for ${run.sessionId} cited no library paper; asking the coach again`);
    await launch(ctx, run.sessionId, "coach");
  }
}

/** Fallback path: ask CREAO for the run's status until it finishes. */
export const poll = internalAction({
  args: { coachRunId: v.id("coachRuns"), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, { coachRunId, attempt }) => {
    const run = await ctx.runQuery(internal.coach.getRun, { coachRunId });
    if (!run || run.status !== "running" || !run.creaoRunId || !run.stage) return null;
    const cfg = agent(run.stage);
    if (!cfg) return null;

    let result: RunResult;
    try {
      const res = await fetch(`${CREAO}/apps/${encodeURIComponent(cfg.appId)}/runs/${encodeURIComponent(run.creaoRunId)}`, {
        headers: { authorization: `Bearer ${cfg.key}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
      result = readRun(await res.json());
    } catch (e) {
      console.warn(`Polling CREAO run ${run.creaoRunId} failed: ${String(e)}`);
      result = { status: "unknown", text: null, threadId: null };
    }

    if (result.status === "completed") return (await complete(ctx, coachRunId, result), null);
    if (result.status === "failed" || result.status === "cancelled") {
      await ctx.runMutation(internal.coach.fail, { coachRunId, error: `CREAO run ${result.status}` });
      return null;
    }
    if (attempt >= MAX_POLLS) {
      await ctx.runMutation(internal.coach.fail, { coachRunId, error: "CREAO run timed out" });
      return null;
    }
    await ctx.scheduler.runAfter(POLL_MS, internal.coach.poll, { coachRunId, attempt: attempt + 1 });
    return null;
  },
});

/** Fast path: CREAO POSTed the finished run to /creao/webhook (see convex/http.ts). */
export const onWebhook = internalAction({
  args: { creaoRunId: v.string(), status: v.string(), text: v.union(v.string(), v.null()), threadId: v.union(v.string(), v.null()) },
  returns: v.boolean(),
  handler: async (ctx, { creaoRunId, status, text, threadId }) => {
    const coachRunId = await ctx.runQuery(internal.coach.runByCreaoId, { creaoRunId });
    if (!coachRunId) return false;
    if (status === "completed") await complete(ctx, coachRunId, { status, text, threadId });
    else await ctx.runMutation(internal.coach.fail, { coachRunId, error: `CREAO run ${status}` });
    return true;
  },
});

/** Re-run the coach for a session whose run failed (or that ended with the coach off). */
export const retry = mutation({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get("sessions", sessionId);
    if (!session) throw new Error("Unknown session");
    if (session.status === "live" || session.status === "analyzing") throw new Error("Session is not finished");
    await ctx.db.patch("sessions", sessionId, { status: "analyzing" });
    await ctx.scheduler.runAfter(0, internal.coach.start, { sessionId });
    return null;
  },
});
