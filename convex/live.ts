/**
 * The coach view on the laptop. These are reactive queries: every reading the phone
 * writes re-runs them and pushes the change to the screen. No polling anywhere.
 */

import { v } from "convex/values";
import { query } from "./_generated/server";
import schema from "./schema";
import { vSignalReading } from "./validators";

const vSession = schema.tables.sessions.validator.extend({ _id: v.id("sessions"), _creationTime: v.number() });
const vFeelCheckDoc = schema.tables.feelChecks.validator.extend({ _id: v.id("feelChecks"), _creationTime: v.number() });

/** The session happening right now (the most recently started live one), or null. */
export const current = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({ session: vSession, userName: v.string(), coachEnabled: v.boolean() }),
  ),
  handler: async (ctx) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_status", (q) => q.eq("status", "live"))
      .order("desc")
      .first();
    if (!session) return null;
    const user = await ctx.db.get("users", session.userId);
    return { session, userName: user?.name ?? "", coachEnabled: user?.coachEnabled ?? false };
  },
});

/** The last `n` readings (default 60 = one minute), oldest first, for the live breath wave. */
export const recentReadings = query({
  args: { sessionId: v.id("sessions"), n: v.optional(v.number()) },
  returns: v.array(vSignalReading),
  handler: async (ctx, { sessionId, n }) => {
    const rows = await ctx.db
      .query("samples")
      .withIndex("by_sessionId_and_t", (q) => q.eq("sessionId", sessionId))
      .order("desc")
      .take(Math.min(Math.max(n ?? 60, 1), 600));
    return rows.reverse().map(({ _id, _creationTime, sessionId: _s, ...r }) => r);
  },
});

/** Feel Checks so far: the spoken answer next to what the sensors saw. */
export const feelChecks = query({
  args: { sessionId: v.id("sessions") },
  returns: v.array(vFeelCheckDoc),
  handler: async (ctx, { sessionId }) =>
    await ctx.db
      .query("feelChecks")
      .withIndex("by_sessionId_and_t", (q) => q.eq("sessionId", sessionId))
      .take(50),
});
