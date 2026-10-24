/**
 * Feel Checks: "Focused or drifting?" answered out loud, eyes closed.
 *
 * Voice: the app streams mic audio to Cartesia Ink 2 (token from voice.sttToken), then
 * calls `answer` with the transcript. Keyword match first; Claude only if that's unclear.
 * Buttons / no answer: the app calls `record` directly.
 * The sensor state and the match are always computed here, from the stored readings.
 */

import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalMutation, mutation, type MutationCtx } from "./_generated/server";
import { classifyFeelAnswer } from "./claude";
import { feelCheckFields, vFeelAnswer } from "./validators";
import { answerMatchesState, dominantState } from "../shared/scoring";
import type { FeelAnswer, FeelCheck } from "../shared/types";

const WINDOW_MS = 20_000;

type FeelInput = Omit<FeelCheck, "sensorState" | "match">;

async function insertScored(ctx: MutationCtx, sessionId: Id<"sessions">, input: FeelInput) {
  const session = await ctx.db.get("sessions", sessionId);
  if (!session) throw new Error("Unknown session");
  const recent = await ctx.db
    .query("samples")
    .withIndex("by_sessionId_and_t", (q) =>
      q.eq("sessionId", sessionId).gt("t", input.t - WINDOW_MS).lte("t", input.t),
    )
    .take(Math.ceil(WINDOW_MS / 1000) + 5);
  const sensorState = dominantState(recent, input.t, WINDOW_MS);
  const match = answerMatchesState(input.answer, sensorState);
  const id = await ctx.db.insert("feelChecks", { sessionId, ...input, sensorState, match });
  return { id, sensorState, match };
}

const vRecordArgs = {
  sessionId: v.id("sessions"),
  t: feelCheckFields.t,
  answeredAt: feelCheckFields.answeredAt,
  source: feelCheckFields.source,
  transcript: feelCheckFields.transcript,
  answer: feelCheckFields.answer,
  interpretedBy: feelCheckFields.interpretedBy,
};
const vRecordResult = v.object({
  feelCheckId: v.id("feelChecks"),
  answer: v.union(vFeelAnswer, v.null()),
  sensorState: feelCheckFields.sensorState,
  match: feelCheckFields.match,
});

/** Button answers and timeouts (answer: null, source: "timeout"). */
export const record = mutation({
  args: vRecordArgs,
  returns: vRecordResult,
  handler: async (ctx, { sessionId, ...input }) => {
    const r = await insertScored(ctx, sessionId, input);
    return { feelCheckId: r.id, answer: input.answer, sensorState: r.sensorState, match: r.match };
  },
});

export const recordInternal = internalMutation({
  args: vRecordArgs,
  returns: vRecordResult,
  handler: async (ctx, { sessionId, ...input }) => {
    const r = await insertScored(ctx, sessionId, input);
    return { feelCheckId: r.id, answer: input.answer, sensorState: r.sensorState, match: r.match };
  },
});

const KEYWORDS: [FeelAnswer, RegExp][] = [
  ["focused", /\b(focus(ed)?|present|here|clear|calm|good|with it|on (it|the breath))\b/],
  ["drifting", /\b(drift(ing|ed)?|wander(ing|ed)?|distracted|lost|elsewhere|thinking|mind)\b/],
  ["sleepy", /\b(sleep(y|ing)?|tired|drows(y|ing)|asleep|heavy|nodding)\b/],
];

/** Exactly one category must match; anything else is left for Claude. */
export function keywordAnswer(transcript: string): FeelAnswer | null {
  const text = transcript.toLowerCase();
  if (/\b(not|n't|no longer)\b/.test(text)) return null; // "not focused" needs real reading
  const hits = KEYWORDS.filter(([, re]) => re.test(text)).map(([a]) => a);
  return hits.length === 1 ? hits[0] : null;
}

/** A spoken answer (Ink 2 transcript). Audio is never sent here or stored. */
export const answer = action({
  args: {
    sessionId: v.id("sessions"),
    t: v.number(),
    answeredAt: v.union(v.number(), v.null()),
    transcript: v.string(),
  },
  returns: vRecordResult,
  handler: async (ctx, { sessionId, t, answeredAt, transcript }): Promise<Infer<typeof vRecordResult>> => {
    const clean = transcript.trim();
    let answer: FeelAnswer | null = clean ? keywordAnswer(clean) : null;
    let interpretedBy: FeelCheck["interpretedBy"] = answer ? "keyword" : null;
    if (!answer && clean) {
      answer = await classifyFeelAnswer(clean);
      interpretedBy = answer ? "claude" : null;
    }
    return await ctx.runMutation(internal.feel.recordInternal, {
      sessionId,
      t,
      answeredAt,
      source: "voice",
      transcript: clean || null,
      answer,
      interpretedBy,
    });
  },
});
