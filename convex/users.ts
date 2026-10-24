/**
 * People using TIDE. No login for the hackathon: a user is picked by name.
 */

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import schema from "./schema";

const vUser = schema.tables.users.validator.extend({ _id: v.id("users"), _creationTime: v.number() });

/** Find a user by name, creating them on first use. Returns their ID. */
export const getOrCreate = mutation({
  args: { name: v.string() },
  returns: v.id("users"),
  handler: async (ctx, { name }) => {
    const clean = name.trim();
    if (!clean) throw new Error("Name is required");
    const existing = await ctx.db
      .query("users")
      .withIndex("by_name", (q) => q.eq("name", clean))
      .first();
    if (existing) return existing._id;
    return await ctx.db.insert("users", { name: clean, coachEnabled: true, createdAt: Date.now() });
  },
});

export const get = query({
  args: { userId: v.id("users") },
  returns: v.union(vUser, v.null()),
  handler: async (ctx, { userId }) => await ctx.db.get("users", userId),
});

export const list = query({
  args: {},
  returns: v.array(vUser),
  handler: async (ctx) => await ctx.db.query("users").order("desc").take(50),
});

/** The demo's "Coach off" switch. Off = no analysis, no plans, just the breathing graph. */
export const setCoachEnabled = mutation({
  args: { userId: v.id("users"), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { userId, enabled }) => {
    await ctx.db.patch("users", userId, { coachEnabled: enabled });
    return null;
  },
});

const PURGE_SESSIONS = 5;
const PURGE_ROWS = 1000;

/**
 * Delete a person and everything recorded for them (sessions, readings, Feel Checks, plans, coach
 * runs). Done in batches so a long history can't blow a transaction; the user row goes last, so
 * nothing dangles while it runs. There is no login in this app: the user ID is the key, as everywhere.
 */
export const remove = mutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    if (await ctx.db.get("users", userId)) await ctx.scheduler.runAfter(0, internal.users.purge, { userId });
    return null;
  },
});

export const purge = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_userId_and_startedAt", (q) => q.eq("userId", userId))
      .take(PURGE_SESSIONS);
    let more = false;
    for (const s of sessions) {
      const samples = await ctx.db
        .query("samples")
        .withIndex("by_sessionId_and_t", (q) => q.eq("sessionId", s._id))
        .take(PURGE_ROWS);
      for (const d of samples) await ctx.db.delete("samples", d._id);
      if (samples.length === PURGE_ROWS) { more = true; continue; }
      for (const d of await ctx.db.query("feelChecks").withIndex("by_sessionId_and_t", (q) => q.eq("sessionId", s._id)).take(PURGE_ROWS)) await ctx.db.delete("feelChecks", d._id);
      for (const d of await ctx.db.query("calibrations").withIndex("by_sessionId", (q) => q.eq("sessionId", s._id)).take(PURGE_ROWS)) await ctx.db.delete("calibrations", d._id);
      for (const d of await ctx.db.query("breathCountTests").withIndex("by_sessionId", (q) => q.eq("sessionId", s._id)).take(PURGE_ROWS)) await ctx.db.delete("breathCountTests", d._id);
      for (const d of await ctx.db.query("coachRuns").withIndex("by_sessionId", (q) => q.eq("sessionId", s._id)).take(PURGE_ROWS)) await ctx.db.delete("coachRuns", d._id);
      await ctx.db.delete("sessions", s._id);
    }
    if (more || sessions.length === PURGE_SESSIONS) {
      await ctx.scheduler.runAfter(0, internal.users.purge, { userId });
      return null;
    }
    for (const d of await ctx.db.query("plans").withIndex("by_userId_and_createdAt", (q) => q.eq("userId", userId)).take(PURGE_ROWS)) await ctx.db.delete("plans", d._id);
    await ctx.db.delete("users", userId);
    return null;
  },
});
