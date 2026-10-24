/**
 * People using TIDE. No login for the hackathon: a user is picked by name.
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
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
