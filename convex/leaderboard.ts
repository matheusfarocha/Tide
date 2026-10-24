/**
 * "Today's table": who tried TIDE today, ranked by self-awareness (how often what they felt
 * matched what the sensors saw), not by how calm they looked.
 */

import { v } from "convex/values";
import { query } from "./_generated/server";

const SESSION_LIMIT = 300;
const ROWS = 20;

export const today = query({
  args: {
    /** Start of the viewer's day, in ms. A stable value, so the query isn't re-run every render. */
    since: v.number(),
  },
  returns: v.array(
    v.object({
      userId: v.id("users"),
      name: v.string(),
      /** 0..100, null when none of their Feel Checks today could be scored yet. */
      score: v.union(v.number(), v.null()),
      /** Times they said "drifting" and the sensors agreed. */
      caught: v.number(),
      sessions: v.number(),
    }),
  ),
  handler: async (ctx, { since }) => {
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_creation_time", (q) => q.gte("_creationTime", since))
      .order("desc")
      .take(SESSION_LIMIT);

    const byUser = new Map<string, { scored: number; matched: number; caught: number; sessions: number }>();
    for (const s of sessions) {
      if (s.kind === "breathCount") continue;
      const row = byUser.get(s.userId) ?? { scored: 0, matched: 0, caught: 0, sessions: 0 };
      row.sessions += 1;
      const checks = await ctx.db
        .query("feelChecks")
        .withIndex("by_sessionId_and_t", (q) => q.eq("sessionId", s._id))
        .take(50);
      for (const c of checks) {
        if (c.match === null) continue;
        row.scored += 1;
        if (c.match) row.matched += 1;
        if (c.match && c.answer === "drifting") row.caught += 1;
      }
      byUser.set(s.userId, row);
    }

    const rows = [];
    for (const s of sessions) {
      const row = byUser.get(s.userId);
      if (!row) continue;
      byUser.delete(s.userId);
      const user = await ctx.db.get("users", s.userId);
      if (!user) continue;
      rows.push({
        userId: s.userId,
        name: user.name,
        score: row.scored ? Math.round((row.matched / row.scored) * 100) : null,
        caught: row.caught,
        sessions: row.sessions,
      });
    }
    rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.caught - a.caught);
    return rows.slice(0, ROWS);
  },
});
