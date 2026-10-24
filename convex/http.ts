import { httpRouter } from "convex/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { env, httpAction } from "./_generated/server";
import { resultText } from "./coach";
import type { Technique } from "../shared/types";

const http = httpRouter();

const TECHNIQUES: readonly string[] = ["breathFocus", "bodyScan", "breathCounting", "openAwareness"];

/** Agent endpoints require TIDE_AGENT_KEY (as ?key= or a Bearer header) once it is set. */
function authorized(req: Request) {
  const expected = env.TIDE_AGENT_KEY;
  if (!expected) return true;
  const url = new URL(req.url);
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return url.searchParams.get("key") === expected || bearer === expected;
}

const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });

/** Convex IDs are opaque strings; reject anything that obviously isn't one before querying. */
const looksLikeId = (s: string | null): s is string => !!s && /^[a-z0-9]{10,64}$/.test(s);

/**
 * CREAO coach tool: search the research library.
 * GET /research?q=mind+wandering&technique=breathCounting&limit=5&includeClinical=false
 * Returns ResearchFinding rows; the coach cites `externalId` and `url` in its plan.
 */
http.route({
  path: "/research",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const p = new URL(req.url).searchParams;
    const technique = p.get("technique");
    if (technique !== null && !TECHNIQUES.includes(technique)) {
      return Response.json({ error: `technique must be one of ${TECHNIQUES.join(", ")}` }, { status: 400 });
    }
    const limit = p.get("limit");
    const findings = await ctx.runQuery(api.research.search, {
      q: p.get("q") ?? undefined,
      technique: (technique as Technique | null) ?? undefined,
      includeClinical: p.get("includeClinical") === "true",
      limit: limit && Number.isFinite(Number(limit)) ? Number(limit) : undefined,
    });
    return Response.json({ findings });
  }),
});

/**
 * Session Analyst tool: one finished session as a SessionExport (shared/types.ts).
 * GET /session?sessionId=...&key=...
 */
http.route({
  path: "/session",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    if (!authorized(req)) return unauthorized();
    const sessionId = new URL(req.url).searchParams.get("sessionId");
    if (!looksLikeId(sessionId)) return Response.json({ error: "sessionId required" }, { status: 400 });
    try {
      const data = await ctx.runQuery(internal.agentApi.sessionExport, { sessionId: sessionId as Id<"sessions"> });
      if (!data) return Response.json({ error: "session not found" }, { status: 404 });
      return Response.json(data);
    } catch {
      return Response.json({ error: "invalid sessionId" }, { status: 400 });
    }
  }),
});

/**
 * Coach tool: the user's past sessions with their summaries, newest first.
 * GET /history?userId=...&limit=30&key=...
 */
http.route({
  path: "/history",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    if (!authorized(req)) return unauthorized();
    const p = new URL(req.url).searchParams;
    const userId = p.get("userId");
    if (!looksLikeId(userId)) return Response.json({ error: "userId required" }, { status: 400 });
    const limit = Number(p.get("limit") ?? 30);
    try {
      const data = await ctx.runQuery(internal.agentApi.history, {
        userId: userId as Id<"users">,
        limit: Number.isFinite(limit) ? limit : 30,
      });
      if (!data) return Response.json({ error: "user not found" }, { status: 404 });
      return Response.json(data);
    } catch {
      return Response.json({ error: "invalid userId" }, { status: 400 });
    }
  }),
});

/**
 * CREAO API Trigger webhook: { runId, status, threadId, result: { text, artifacts } }.
 * Only runs we started are acted on (coach.onWebhook looks the run up); unknown runs are ignored.
 */
http.route({
  path: "/creao/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!authorized(req)) return unauthorized();
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "invalid JSON" }, { status: 400 });
    }
    const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
    if (typeof b.runId !== "string" || typeof b.status !== "string") {
      return Response.json({ error: "runId and status required" }, { status: 400 });
    }
    // CREAO times out after 10 s, so acknowledge now and process in the background.
    await ctx.scheduler.runAfter(0, internal.coach.onWebhook, {
      creaoRunId: b.runId,
      status: b.status,
      text: resultText(b.result),
      threadId: typeof b.threadId === "string" ? b.threadId : null,
    });
    return Response.json({ ok: true });
  }),
});

export default http;
