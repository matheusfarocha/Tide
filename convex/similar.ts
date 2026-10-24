/**
 * "Find my past sessions that looked like this one": vector search over each
 * session's feature vector (shared/scoring.ts sessionFeatureVector), per user.
 */

import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalQuery } from "./_generated/server";
import { vSessionSummary } from "./validators";

const vMatch = v.object({
  sessionId: v.id("sessions"),
  score: v.number(),
  startedAt: v.number(),
  summary: vSessionSummary,
});

export const target = internalQuery({
  args: { sessionId: v.id("sessions") },
  returns: v.union(v.null(), v.object({ userId: v.id("users"), features: v.array(v.float64()) })),
  handler: async (ctx, { sessionId }) => {
    const s = await ctx.db.get("sessions", sessionId);
    return s?.features ? { userId: s.userId, features: s.features } : null;
  },
});

export const hydrate = internalQuery({
  args: { hits: v.array(v.object({ _id: v.id("sessions"), _score: v.number() })) },
  returns: v.array(vMatch),
  handler: async (ctx, { hits }) => {
    const out = [];
    for (const h of hits) {
      const s = await ctx.db.get("sessions", h._id);
      if (s?.summary) out.push({ sessionId: s._id, score: h._score, startedAt: s.startedAt, summary: s.summary });
    }
    return out;
  },
});

/** Up to `limit` of the same user's sessions most like this one, best first. [] until it's analyzed. */
export const sessions = action({
  args: { sessionId: v.id("sessions"), limit: v.optional(v.number()) },
  returns: v.array(vMatch),
  handler: async (ctx, { sessionId, limit }): Promise<Infer<typeof vMatch>[]> => {
    const t = await ctx.runQuery(internal.similar.target, { sessionId });
    if (!t) return [];
    const n = Math.min(Math.max(limit ?? 3, 1), 10);
    const hits = await ctx.vectorSearch("sessions", "by_features", {
      vector: t.features,
      limit: n + 1,
      filter: (q) => q.eq("userId", t.userId),
    });
    const others = hits.filter((h) => h._id !== sessionId).slice(0, n) as { _id: Id<"sessions">; _score: number }[];
    return await ctx.runQuery(internal.similar.hydrate, { hits: others });
  },
});
