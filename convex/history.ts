/**
 * The history screen: self-awareness and breath-count accuracy over sessions,
 * plus the coach's latest plan and the reasons behind it.
 */

import { v } from "convex/values";
import { query } from "./_generated/server";
import schema from "./schema";
import { vSessionSummary } from "./validators";

const vPlanDoc = schema.tables.plans.validator.extend({ _id: v.id("plans"), _creationTime: v.number() });

export const forUser = query({
  args: { userId: v.id("users") },
  returns: v.object({
    selfAwareness: v.union(v.number(), v.null()),
    sessions: v.array(
      v.object({
        sessionId: v.id("sessions"),
        kind: schema.tables.sessions.validator.fields.kind,
        status: schema.tables.sessions.validator.fields.status,
        startedAt: v.number(),
        endedAt: v.union(v.number(), v.null()),
        summary: v.union(vSessionSummary, v.null()),
        planId: v.union(v.id("plans"), v.null()),
      }),
    ),
    latestPlan: v.union(vPlanDoc, v.null()),
  }),
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get("users", userId);
    if (!user) throw new Error("Unknown user");
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_userId_and_startedAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);
    const latestPlan = await ctx.db
      .query("plans")
      .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
    return {
      selfAwareness: user.selfAwareness ?? null,
      // Oldest first, ready to chart.
      sessions: sessions.reverse().map((s) => ({
        sessionId: s._id,
        kind: s.kind,
        status: s.status,
        startedAt: s.startedAt,
        endedAt: s.endedAt ?? null,
        summary: s.summary ?? null,
        planId: s.planId ?? null,
      })),
      latestPlan,
    };
  },
});
