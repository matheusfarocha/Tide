import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { SESSION_VECTOR_DIM } from "../shared/types";
import {
  breathCountFields,
  calibrationFields,
  feelCheckFields,
  planFields,
  readingFields,
  researchFindingFields,
  vCoachRunStatus,
  vSessionKind,
  vSessionPhase,
  vSessionStatus,
  vSessionSummary,
} from "./validators";

export default defineSchema({
  users: defineTable({
    name: v.string(),
    /** One CREAO thread per user so the coach remembers them across sessions. */
    creaoThreadId: v.optional(v.string()),
    selfAwareness: v.optional(v.number()),
    /** The demo's "Coach off" switch. */
    coachEnabled: v.boolean(),
    createdAt: v.number(),
  }).index("by_name", ["name"]),

  sessions: defineTable({
    userId: v.id("users"),
    kind: vSessionKind,
    /** Absent for the fixed baseline session (BASELINE_PLAN). */
    planId: v.optional(v.id("plans")),
    status: vSessionStatus,
    /** Current phase, so the coach view can label the live graph. */
    phase: vSessionPhase,
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    summary: v.optional(vSessionSummary),
    /** sessionFeatureVector(summary), for "sessions that looked like this one". */
    features: v.optional(v.array(v.float64())),
  })
    .index("by_userId_and_startedAt", ["userId", "startedAt"])
    .index("by_status", ["status"])
    .vectorIndex("by_features", {
      vectorField: "features",
      dimensions: SESSION_VECTOR_DIM,
      filterFields: ["userId"],
    }),

  /** One SignalReading per second while a session is live. */
  samples: defineTable({ sessionId: v.id("sessions"), ...readingFields }).index("by_sessionId_and_t", [
    "sessionId",
    "t",
  ]),

  feelChecks: defineTable({ sessionId: v.id("sessions"), ...feelCheckFields }).index("by_sessionId_and_t", [
    "sessionId",
    "t",
  ]),

  plans: defineTable({
    userId: v.id("users"),
    /** The session this plan was designed after. */
    basedOnSessionId: v.id("sessions"),
    coachRunId: v.optional(v.id("coachRuns")),
    createdAt: v.number(),
    ...planFields,
  }).index("by_userId_and_createdAt", ["userId", "createdAt"]),

  coachRuns: defineTable({
    sessionId: v.id("sessions"),
    userId: v.id("users"),
    /** analyst = Session Analyst agent, coach = Coach & Plan Designer agent. */
    stage: v.optional(v.union(v.literal("analyst"), v.literal("coach"))),
    status: vCoachRunStatus,
    creaoRunId: v.optional(v.string()),
    creaoThreadId: v.optional(v.string()),
    shareUrl: v.optional(v.string()),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_creaoRunId", ["creaoRunId"]),

  calibrations: defineTable({ sessionId: v.id("sessions"), ...calibrationFields }).index("by_sessionId", [
    "sessionId",
  ]),

  breathCountTests: defineTable({ sessionId: v.id("sessions"), ...breathCountFields }).index("by_sessionId", [
    "sessionId",
  ]),

  /**
   * Research library: one row per paper from the Apify TIDE Research Actor.
   * The coach picks techniques only from here, so every plan can cite one.
   */
  techniques: defineTable({
    ...researchFindingFields,
    /** title + summary + outcome + population + tags, for full-text search. */
    searchText: v.string(),
    fetchedAt: v.number(),
  })
    .index("by_externalId", ["externalId"])
    .index("by_technique_and_citedByCount", ["technique", "citedByCount"])
    .searchIndex("search_text", { searchField: "searchText", filterFields: ["technique", "clinical"] }),

  /** Cached Sonic audio per (voice, text), so repeated cues play instantly. */
  speech: defineTable({
    key: v.string(),
    text: v.string(),
    storageId: v.id("_storage"),
    createdAt: v.number(),
  }).index("by_key", ["key"]),

  /** Dev only: our own tap-labelled RecordingTrace JSON files (numbers, no pixels) for offline tuning. */
  recordings: defineTable({
    label: v.string(),
    storageId: v.id("_storage"),
    frames: v.number(),
    inhaleTaps: v.number(),
    pacedRateBpm: v.union(v.number(), v.null()),
    createdAt: v.number(),
  }),
});
