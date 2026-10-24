/**
 * Read models for the CREAO agents' HTTP tools (served by convex/http.ts).
 * Session Analyst: GET /session → SessionExport. Coach: GET /history → past sessions.
 */

import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { planForSession } from "./plans";
import type { SessionExport } from "../shared/types";

const MAX_SAMPLES = 3600;

const strip = <T extends { _id: unknown; _creationTime: unknown; sessionId: unknown }>(row: T) => {
  const { _id, _creationTime, sessionId, ...rest } = row;
  return rest;
};

export const sessionExport = internalQuery({
  args: { sessionId: v.id("sessions") },
  returns: v.any(),
  handler: async (ctx, { sessionId }): Promise<SessionExport | null> => {
    const session = await ctx.db.get("sessions", sessionId);
    if (!session) return null;
    const calibrations = await ctx.db
      .query("calibrations")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .take(20);
    const breathCountTests = await ctx.db
      .query("breathCountTests")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .take(20);
    const readings = await ctx.db
      .query("samples")
      .withIndex("by_sessionId_and_t", (q) => q.eq("sessionId", sessionId))
      .take(MAX_SAMPLES);
    const feelChecks = await ctx.db
      .query("feelChecks")
      .withIndex("by_sessionId_and_t", (q) => q.eq("sessionId", sessionId))
      .take(50);
    return {
      sessionId,
      userId: session.userId,
      kind: session.kind,
      startedAt: session.startedAt,
      endedAt: session.endedAt ?? null,
      plan: await planForSession(ctx, session),
      readings: readings.map(strip),
      feelChecks: feelChecks.map(strip),
      calibrations: calibrations.map(strip),
      breathCountTests: breathCountTests.map(strip),
    };
  },
});

/** Everything the Coach needs to find patterns. Every claim it makes must cite these sessionIds. */
export const history = internalQuery({
  args: { userId: v.id("users"), limit: v.number() },
  returns: v.any(),
  handler: async (ctx, { userId, limit }) => {
    const user = await ctx.db.get("users", userId);
    if (!user) return null;
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_userId_and_startedAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(Math.min(Math.max(limit, 1), 50));
    const rows = [];
    for (const s of sessions) {
      const plan = await planForSession(ctx, s);
      rows.push({
        sessionId: s._id,
        kind: s.kind,
        status: s.status,
        startedAt: s.startedAt,
        endedAt: s.endedAt ?? null,
        durationSec: s.endedAt ? Math.round((s.endedAt - s.startedAt) / 1000) : null,
        plan: {
          technique: plan.technique,
          lengthSec: plan.lengthSec,
          fadingLevel: plan.fadingLevel,
          cueTimesSec: plan.cues.map((c) => c.atSec),
          feelCheckTimesSec: plan.feelChecks.map((f) => f.atSec),
        },
        summary: s.summary ?? null,
      });
    }
    return {
      user: { userId, name: user.name, selfAwareness: user.selfAwareness ?? null },
      // Newest first. startedAt is epoch ms (UTC); the hackathon is in Pacific time.
      sessions: rows,
    };
  },
});
