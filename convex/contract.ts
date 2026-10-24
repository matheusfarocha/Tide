/**
 * Compile-time check that convex/validators.ts matches shared/types.ts.
 * If you change one and not the other, `npm run typecheck` fails here.
 */

import type { Infer } from "convex/values";
import type * as S from "../shared/types";
import type * as V from "./validators";

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

export type _Contract = [
  Assert<Same<Infer<typeof V.vAttentionState>, S.AttentionState>>,
  Assert<Same<Infer<typeof V.vSessionPhase>, S.SessionPhase>>,
  Assert<Same<Infer<typeof V.vSessionKind>, S.SessionKind>>,
  Assert<Same<Infer<typeof V.vSessionStatus>, S.SessionStatus>>,
  Assert<Same<Infer<typeof V.vFeelAnswer>, S.FeelAnswer>>,
  Assert<Same<Infer<typeof V.vCoachRunStatus>, S.CoachRunStatus>>,
  Assert<Same<Infer<typeof V.vSignalReading>, S.SignalReading>>,
  Assert<Same<Infer<typeof V.vFeelCheck>, S.FeelCheck>>,
  Assert<Same<Infer<typeof V.vSessionPlan>, S.SessionPlan>>,
  Assert<Same<Infer<typeof V.vPlanCitation>, S.PlanCitation>>,
  Assert<Same<Infer<typeof V.vSessionSummary>, S.SessionSummary>>,
  Assert<Same<Infer<typeof V.vCalibration>, S.Calibration>>,
  Assert<Same<Infer<typeof V.vBreathCountTest>, S.BreathCountTest>>,
  Assert<Same<Infer<typeof V.vCoachWebhookPayload>, S.CoachWebhookPayload>>,
  Assert<Same<Infer<typeof V.vTechnique>, S.Technique>>,
  Assert<Same<Infer<typeof V.vStudyType>, S.StudyType>>,
  Assert<Same<Infer<typeof V.vResearchFinding>, S.ResearchFinding>>,
];
