/**
 * The live write path. The phone calls these during a session:
 *   start → addReading (1 Hz) → feel.record / addCalibration / addBreathCountTest → end
 * Ending a session schedules the CREAO coach (convex/coach.ts) when the coach is on.
 */

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { BREATH_COUNT_PLAN, COACH_OFF_PLAN, nextPlanFor, planForSession } from "./plans";
import schema from "./schema";
import {
  breathCountFields,
  calibrationFields,
  vSessionKind,
  vSessionPlan,
  vSignalReading,
} from "./validators";
import { scoreBreathCount } from "../shared/scoring";
import type { SessionPlan, SignalReading } from "../shared/types";

const vNextPlan = v.union(
  v.object({ source: v.literal("baseline"), plan: vSessionPlan, planId: v.null() }),
  v.object({ source: v.literal("coach"), plan: vSessionPlan, planId: v.id("plans") }),
  v.object({ source: v.literal("waiting"), plan: v.null(), planId: v.null() }),
  v.object({ source: v.literal("coachOff"), plan: vSessionPlan, planId: v.null() }),
);

/** What the next session will run. The app shows "Your next session, designed for you" from this. */
export const nextPlan = query({
  args: { userId: v.id("users") },
  returns: vNextPlan,
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get("users", userId);
    if (!user) throw new Error("Unknown user");
    return await nextPlanFor(ctx, user);
  },
});

/**
 * Start a session. kind "training" runs the coach's latest plan (or the bare
 * "Coach off" plan). The first session a user ever runs is always the baseline.
 */
export const start = mutation({
  args: { userId: v.id("users"), kind: vSessionKind },
  returns: v.object({ sessionId: v.id("sessions"), plan: vSessionPlan }),
  handler: async (ctx, { userId, kind }) => {
    const user = await ctx.db.get("users", userId);
    if (!user) throw new Error("Unknown user");

    let plan: SessionPlan;
    let planId: Id<"plans"> | undefined;
    if (kind === "breathCount") {
      plan = BREATH_COUNT_PLAN;
    } else {
      const next = await nextPlanFor(ctx, user);
      if (next.source === "waiting") {
        throw new Error("Your coach is still designing your next session. Try again in a moment.");
      }
      // A user's first session is the baseline, whatever was asked for.
      kind = next.source === "baseline" ? "baseline" : "training";
      plan = next.plan ?? COACH_OFF_PLAN;
      planId = next.planId ?? undefined;
    }

    const sessionId = await ctx.db.insert("sessions", {
      userId,
      kind,
      planId,
      status: "live",
      phase: "calibration",
      startedAt: Date.now(),
    });
    return { sessionId, plan };
  },
});

async function liveSession(ctx: MutationCtx, sessionId: Id<"sessions">): Promise<Doc<"sessions">> {
  const session = await ctx.db.get("sessions", sessionId);
  if (!session) throw new Error("Unknown session");
  if (session.status !== "live") throw new Error("Session has ended");
  return session;
}

async function insertReading(ctx: MutationCtx, session: Doc<"sessions">, reading: SignalReading) {
  // The app may retry a write; one reading per second of session time.
  const dup = await ctx.db
    .query("samples")
    .withIndex("by_sessionId_and_t", (q) => q.eq("sessionId", session._id).eq("t", reading.t))
    .first();
  if (dup) return;
  await ctx.db.insert("samples", { sessionId: session._id, ...reading });
}

/** One SignalReading per second from the phone. The coach view re-renders from this live. */
export const addReading = mutation({
  args: { sessionId: v.id("sessions"), reading: vSignalReading },
  returns: v.null(),
  handler: async (ctx, { sessionId, reading }) => {
    const session = await liveSession(ctx, sessionId);
    await insertReading(ctx, session, reading);
    if (reading.phase !== session.phase) await ctx.db.patch("sessions", sessionId, { phase: reading.phase });
    return null;
  },
});

/** Batch form, for flushing readings buffered while Wi-Fi dropped, or replay mode. */
export const addReadings = mutation({
  args: { sessionId: v.id("sessions"), readings: v.array(vSignalReading) },
  returns: v.null(),
  handler: async (ctx, { sessionId, readings }) => {
    if (readings.length > 120) throw new Error("Send at most 120 readings per call");
    const session = await liveSession(ctx, sessionId);
    for (const r of readings) await insertReading(ctx, session, r);
    const last = readings[readings.length - 1];
    if (last && last.phase !== session.phase) await ctx.db.patch("sessions", sessionId, { phase: last.phase });
    return null;
  },
});

/** Paced-breathing or tap-label check. rateError is computed here. */
export const addCalibration = mutation({
  args: { sessionId: v.id("sessions"), calibration: v.object(calibrationFields) },
  returns: v.id("calibrations"),
  handler: async (ctx, { sessionId, calibration: c }) => {
    const session = await ctx.db.get("sessions", sessionId);
    if (!session) throw new Error("Unknown session");
    const rateError = c.trueRate !== null && c.measuredRate !== null ? Math.abs(c.measuredRate - c.trueRate) : null;
    return await ctx.db.insert("calibrations", { sessionId, ...c, rateError });
  },
});

/** Breath-counting focus test. Scored here with shared/scoring so every client agrees. */
export const addBreathCountTest = mutation({
  args: {
    sessionId: v.id("sessions"),
    test: v.object({
      startT: breathCountFields.startT,
      endT: breathCountFields.endT,
      n: breathCountFields.n,
      tapTimes: breathCountFields.tapTimes,
      detectedTimes: breathCountFields.detectedTimes,
    }),
  },
  returns: v.id("breathCountTests"),
  handler: async (ctx, { sessionId, test }) => {
    const session = await ctx.db.get("sessions", sessionId);
    if (!session) throw new Error("Unknown session");
    const { correct, total, accuracy } = scoreBreathCount(test.tapTimes, test.detectedTimes, test.n, test.startT);
    return await ctx.db.insert("breathCountTests", { sessionId, ...test, correct, total, accuracy });
  },
});

/** End a session. With the coach on, this hands it to CREAO without waiting for the run. */
export const end = mutation({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, { sessionId }) => {
    const session = await liveSession(ctx, sessionId);
    const user = await ctx.db.get("users", session.userId);
    const coachOn = user?.coachEnabled ?? false;
    await ctx.db.patch("sessions", sessionId, {
      status: coachOn ? "analyzing" : "ended",
      endedAt: Date.now(),
    });
    if (coachOn) await ctx.scheduler.runAfter(0, internal.coach.start, { sessionId });
    return null;
  },
});

const vSession = schema.tables.sessions.validator.extend({ _id: v.id("sessions"), _creationTime: v.number() });

export const get = query({
  args: { sessionId: v.id("sessions") },
  returns: v.union(vSession, v.null()),
  handler: async (ctx, { sessionId }) => await ctx.db.get("sessions", sessionId),
});

const MAX_SAMPLES = 3600; // one hour at 1 Hz

/** Everything the Calm Map needs, updating live as the coach's results arrive. */
export const calmMap = query({
  args: { sessionId: v.id("sessions") },
  returns: v.union(
    v.null(),
    v.object({
      session: vSession,
      plan: vSessionPlan,
      readings: v.array(vSignalReading),
      feelChecks: v.array(schema.tables.feelChecks.validator.extend({ _id: v.id("feelChecks"), _creationTime: v.number() })),
      calibrations: v.array(schema.tables.calibrations.validator.extend({ _id: v.id("calibrations"), _creationTime: v.number() })),
      breathCountTests: v.array(
        schema.tables.breathCountTests.validator.extend({ _id: v.id("breathCountTests"), _creationTime: v.number() }),
      ),
      coachRuns: v.array(schema.tables.coachRuns.validator.extend({ _id: v.id("coachRuns"), _creationTime: v.number() })),
    }),
  ),
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get("sessions", sessionId);
    if (!session) return null;
    const samples = await ctx.db
      .query("samples")
      .withIndex("by_sessionId_and_t", (q) => q.eq("sessionId", sessionId))
      .take(MAX_SAMPLES);
    return {
      session,
      plan: await planForSession(ctx, session),
      readings: samples.map(({ _id, _creationTime, sessionId: _s, ...r }) => r),
      feelChecks: await ctx.db
        .query("feelChecks")
        .withIndex("by_sessionId_and_t", (q) => q.eq("sessionId", sessionId))
        .take(50),
      calibrations: await ctx.db
        .query("calibrations")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
        .take(20),
      breathCountTests: await ctx.db
        .query("breathCountTests")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
        .take(20),
      coachRuns: await ctx.db
        .query("coachRuns")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
        .take(20),
    };
  },
});
