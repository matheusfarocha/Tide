/**
 * Convex validators mirroring shared/types.ts. Use these as function args so
 * Convex rejects malformed readings and CREAO payloads at runtime.
 * convex/contract.ts checks at compile time that both files agree.
 */

import { v } from "convex/values";

const nullable = <T extends Parameters<typeof v.union>[0]>(x: T) => v.union(x, v.null());

export const vAttentionState = v.union(
  v.literal("settling"),
  v.literal("focused"),
  v.literal("drifting"),
  v.literal("drowsy"),
  v.literal("restless"),
);
export const vSessionPhase = v.union(
  v.literal("calibration"),
  v.literal("baseline"),
  v.literal("meditation"),
  v.literal("breathCount"),
);
export const vSessionKind = v.union(v.literal("baseline"), v.literal("training"), v.literal("breathCount"));
export const vSessionStatus = v.union(
  v.literal("live"),
  v.literal("ended"),
  v.literal("analyzing"),
  v.literal("coached"),
  v.literal("coachFailed"),
);
export const vFeelAnswer = v.union(v.literal("focused"), v.literal("drifting"), v.literal("sleepy"));
export const vCoachRunStatus = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("succeeded"),
  v.literal("failed"),
);

export const readingFields = {
  t: v.number(),
  phase: vSessionPhase,
  wave: v.array(v.number()),
  breaths: v.array(v.number()),
  breathRate: nullable(v.number()),
  depth: nullable(v.number()),
  regularity: nullable(v.number()),
  stillness: v.number(),
  posture: v.number(),
  tension: v.number(),
  flutter: v.number(),
  state: nullable(vAttentionState),
  confidence: v.number(),
  quality: v.number(),
};
export const vSignalReading = v.object(readingFields);

export const feelCheckFields = {
  t: v.number(),
  answeredAt: nullable(v.number()),
  source: v.union(v.literal("voice"), v.literal("button"), v.literal("timeout")),
  transcript: nullable(v.string()),
  answer: nullable(vFeelAnswer),
  interpretedBy: nullable(v.union(v.literal("keyword"), v.literal("claude"), v.literal("button"))),
  sensorState: nullable(vAttentionState),
  match: nullable(v.boolean()),
};
export const vFeelCheck = v.object(feelCheckFields);

export const vPlanCue = v.object({
  atSec: v.number(),
  kind: v.union(
    v.literal("settle"),
    v.literal("anchor"),
    v.literal("posture"),
    v.literal("wake"),
    v.literal("close"),
  ),
  text: v.string(),
  onBreath: v.union(v.literal("inhale"), v.literal("exhale"), v.literal("any")),
});

export const vTechnique = v.union(
  v.literal("breathFocus"),
  v.literal("bodyScan"),
  v.literal("breathCounting"),
  v.literal("openAwareness"),
);

export const planFields = {
  version: v.literal(1),
  technique: vTechnique,
  lengthSec: v.number(),
  cues: v.array(vPlanCue),
  feelChecks: v.array(v.object({ atSec: v.number() })),
  fadingLevel: v.number(),
  intro: v.string(),
  reasons: v.array(v.object({ claim: v.string(), sessionIds: v.array(v.string()) })),
};
export const vSessionPlan = v.object(planFields);

export const vTimeInState = v.object({
  settling: v.number(),
  focused: v.number(),
  drifting: v.number(),
  drowsy: v.number(),
  restless: v.number(),
});

export const vSessionSummary = v.object({
  timeInState: vTimeInState,
  driftOnsetsSec: v.array(v.number()),
  firstDriftSec: nullable(v.number()),
  meanBreathRate: nullable(v.number()),
  meanRegularity: nullable(v.number()),
  meanStillness: v.number(),
  meanPosture: v.number(),
  meanTension: v.number(),
  selfAwareness: nullable(v.number()),
  breathCountAccuracy: nullable(v.number()),
  highlights: v.array(v.string()),
});

export const calibrationFields = {
  kind: v.union(v.literal("paced"), v.literal("tapLabel")),
  startT: v.number(),
  endT: v.number(),
  trueRate: nullable(v.number()),
  measuredRate: nullable(v.number()),
  tapTimes: v.array(v.number()),
  detectedTimes: v.array(v.number()),
  rateError: nullable(v.number()),
};
export const vCalibration = v.object(calibrationFields);

export const breathCountFields = {
  startT: v.number(),
  endT: v.number(),
  n: v.number(),
  tapTimes: v.array(v.number()),
  detectedTimes: v.array(v.number()),
  correct: v.number(),
  total: v.number(),
  accuracy: nullable(v.number()),
};
export const vBreathCountTest = v.object(breathCountFields);

export const vCoachWebhookPayload = v.object({
  sessionId: v.string(),
  creaoRunId: nullable(v.string()),
  shareUrl: nullable(v.string()),
  summary: vSessionSummary,
  plan: nullable(vSessionPlan),
});

export const vStudyType = v.union(
  v.literal("metaAnalysis"),
  v.literal("systematicReview"),
  v.literal("rct"),
  v.literal("pilot"),
  v.literal("review"),
  v.literal("study"),
);

export const researchFindingFields = {
  externalId: v.string(),
  title: v.string(),
  authors: v.string(),
  journal: nullable(v.string()),
  year: nullable(v.number()),
  doi: nullable(v.string()),
  technique: vTechnique,
  tags: v.array(v.string()),
  population: v.string(),
  clinical: v.boolean(),
  sampleSize: nullable(v.number()),
  studyType: vStudyType,
  outcome: v.string(),
  summary: v.string(),
  citation: v.string(),
  url: v.string(),
  openAccess: v.boolean(),
  citedByCount: v.number(),
  foundVia: v.array(v.union(v.literal("europepmc"), v.literal("pubmed"))),
};
export const vResearchFinding = v.object(researchFindingFields);
