/**
 * TIDE data contract.
 *
 * Every module (signal, app, Convex, CREAO agents) talks through these types.
 * Don't change one without telling the team: convex/validators.ts mirrors this
 * file and convex/contract.ts stops compiling if the two drift apart.
 *
 * Clock: SessionMs is ms since the user closed their eyes (start of baseline).
 * The paced-breathing check runs before that, so its readings have negative t.
 * Wall-clock time is EpochMs. Scores are 0–1 unless stated otherwise.
 */

export type SessionMs = number;
export type EpochMs = number;

// ---------- Constants ----------

export const PACED_CHECK_SEC = 30;
export const PACED_RATE_BPM = 6;
export const BASELINE_SEC = 60;
/** The signal module emits one SignalReading per second... */
export const READING_HZ = 1;
/** ...each carrying the breath waveform sampled at this rate, for the live graph. */
export const WAVE_HZ = 10;
/** Breath-counting test: user taps every Nth breath (Levinson et al. use 9). */
export const BREATH_COUNT_N = 9;
/** Length of SessionSummary feature vectors used for vector search. */
export const SESSION_VECTOR_DIM = 12;

// ---------- Vocabulary ----------

export const ATTENTION_STATES = ["settling", "focused", "drifting", "drowsy", "restless"] as const;
export type AttentionState = (typeof ATTENTION_STATES)[number];

export const SESSION_PHASES = ["calibration", "baseline", "meditation", "breathCount"] as const;
export type SessionPhase = (typeof SESSION_PHASES)[number];

export type SessionKind = "baseline" | "training" | "breathCount";

/** live → ended → analyzing (CREAO running) → coached | coachFailed. Coach off stays "ended". */
export type SessionStatus = "live" | "ended" | "analyzing" | "coached" | "coachFailed";

export const FEEL_ANSWERS = ["focused", "drifting", "sleepy"] as const;
export type FeelAnswer = (typeof FEEL_ANSWERS)[number];

export type CoachRunStatus = "queued" | "running" | "succeeded" | "failed";

// ---------- Signal module → app → Convex (1 Hz) ----------

/**
 * One reading per second from the on-phone signal module (Person 1).
 * This is the only thing about the body that leaves the phone.
 */
export interface SignalReading {
  /** End of the 1 s window this reading covers. */
  t: SessionMs;
  phase: SessionPhase;
  /** Filtered breath waveform for this window at WAVE_HZ, roughly z-scored (+ = inhaling). */
  wave: number[];
  /** Inhale peaks confirmed during this window, at their true times (may fall before this window). */
  breaths: SessionMs[];
  /** Breaths per minute over the last ~30 s. null until there are enough breaths. */
  breathRate: number | null;
  /** Breath amplitude relative to this session's baseline (1 = same as baseline). */
  depth: number | null;
  /** 1 = perfectly even breath-to-breath intervals. */
  regularity: number | null;
  /** 1 = perfectly still (body motion outside the breathing band). */
  stillness: number;
  /** 1 = upright as at baseline; falls with slumping shoulders or a dropping head. */
  posture: number;
  /** Brow and jaw tension from face blendshapes. */
  tension: number;
  /** Eyelid flutter with eyes closed. */
  flutter: number;
  /** null while calibrating, during the first seconds, or when tracking is lost. */
  state: AttentionState | null;
  /** Confidence in `state`. */
  confidence: number;
  /** Tracking quality (landmark visibility, face found, lighting). Below ~0.5, distrust everything. */
  quality: number;
}

// ---------- Feel Checks ----------

export interface FeelCheck {
  /** When the voice asked "Focused or drifting?". */
  t: SessionMs;
  answeredAt: SessionMs | null;
  source: "voice" | "button" | "timeout";
  /** Ink 2 transcript. The audio itself is never stored. */
  transcript: string | null;
  /** null = no answer or unintelligible. */
  answer: FeelAnswer | null;
  interpretedBy: "keyword" | "claude" | "button" | null;
  /** Most common sensor state over the ~20 s before the question. */
  sensorState: AttentionState | null;
  /** null when it can't be scored (no answer, or the sensors had no clear state). */
  match: boolean | null;
}

// ---------- Coach plan (CREAO → webhook → app) ----------

export type Technique = "breathFocus" | "bodyScan" | "breathCounting" | "openAwareness";

export interface PlanCue {
  /** Seconds on the session clock (0 = eyes closed). */
  atSec: number;
  kind: "settle" | "anchor" | "posture" | "wake" | "close";
  /** Spoken by Sonic. Keep it short and non-clinical. */
  text: string;
  /** The app waits for this breath phase (up to ~5 s) before speaking. */
  onBreath: "inhale" | "exhale" | "any";
}

export interface PlanReason {
  claim: string;
  /** Sessions the claim is based on. Every pattern claim must cite at least one. */
  sessionIds: string[];
}

/**
 * A paper from the research library (`techniques`) that this plan is based on.
 * The coach sends externalId + why; Convex fills citation + url from the library and drops
 * anything not in it, so a plan can never cite a paper the Actor didn't collect.
 */
export interface PlanCitation {
  /** ResearchFinding.externalId, e.g. "MED:25386148". */
  externalId: string;
  /** One plain sentence: why this paper supports this session. */
  why: string;
  /** ResearchFinding.citation, e.g. "Levinson et al. (2014). Title. Journal." */
  citation: string;
  url: string;
}

export interface SessionPlan {
  version: 1;
  technique: Technique;
  /** Total length on the session clock, baseline included. */
  lengthSec: number;
  cues: PlanCue[];
  feelChecks: { atSec: number }[];
  /** 0 = full support … 3 = no cues at all. Rises as the user improves. */
  fadingLevel: number;
  /** One line spoken at the start, e.g. "Last time you drifted around minute 4." */
  intro: string;
  reasons: PlanReason[];
  /** Research behind the technique, shown as "Why this session". [] for fixed plans. */
  citations: PlanCitation[];
}

// ---------- Session Analyst output ----------

export interface TimeInState {
  settling: number;
  focused: number;
  drifting: number;
  drowsy: number;
  restless: number;
}

export interface SessionSummary {
  /** Seconds spent in each state (after baseline). */
  timeInState: TimeInState;
  /** Session-clock seconds where each drift episode began. */
  driftOnsetsSec: number[];
  firstDriftSec: number | null;
  meanBreathRate: number | null;
  meanRegularity: number | null;
  meanStillness: number;
  meanPosture: number;
  meanTension: number;
  /** Fraction of scorable Feel Checks where the spoken answer matched the sensors. */
  selfAwareness: number | null;
  breathCountAccuracy: number | null;
  /** Short plain-language lines for the Calm Map. No medical claims. */
  highlights: string[];
}

// ---------- Accuracy checks ----------

export interface Calibration {
  /** paced = 6 bpm breathing circle; tapLabel = a teammate tapped each inhale. */
  kind: "paced" | "tapLabel";
  startT: SessionMs;
  endT: SessionMs;
  /** Ground truth: PACED_RATE_BPM, or the rate implied by the taps. */
  trueRate: number | null;
  measuredRate: number | null;
  /** tapLabel only; [] for paced. */
  tapTimes: SessionMs[];
  detectedTimes: SessionMs[];
  rateError: number | null;
}

export interface BreathCountTest {
  startT: SessionMs;
  endT: SessionMs;
  n: number;
  /** User taps each time they reach the Nth breath. */
  tapTimes: SessionMs[];
  detectedTimes: SessionMs[];
  correct: number;
  total: number;
  accuracy: number | null;
}

// ---------- Contracts with the CREAO agents ----------

/** What the Analyst fetches from Convex (GET /session) for one finished session. */
export interface SessionExport {
  sessionId: string;
  userId: string;
  kind: SessionKind;
  startedAt: EpochMs;
  endedAt: EpochMs | null;
  plan: SessionPlan;
  readings: SignalReading[];
  feelChecks: FeelCheck[];
  calibrations: Calibration[];
  breathCountTests: BreathCountTest[];
}

/** What the agents POST to the Convex webhook when a run finishes. */
export interface CoachWebhookPayload {
  sessionId: string;
  creaoRunId: string | null;
  shareUrl: string | null;
  summary: SessionSummary;
  /** The next session. null if the run failed to design one. */
  plan: SessionPlan | null;
}

// ---------- Research library (Apify TIDE Research Actor → Convex `techniques`) ----------

export type StudyType = "metaAnalysis" | "systematicReview" | "rct" | "pilot" | "review" | "study";

/**
 * One paper from Europe PMC / PubMed, reduced by the Actor (apify/tide-research) to a
 * short summary plus a link. Never the full text or the abstract.
 * The coach may only use techniques it can cite from here.
 */
export interface ResearchFinding {
  /** Europe PMC "<source>:<id>", e.g. "MED:25386148". Dedupe key. */
  externalId: string;
  title: string;
  authors: string;
  journal: string | null;
  year: number | null;
  doi: string | null;
  technique: Technique;
  /** e.g. mindWandering, metaAwareness, students, exams, stress. */
  tags: string[];
  /** Who was studied, e.g. "college students". "not stated" when unknown. */
  population: string;
  /** Studied patients or a clinical condition. TIDE is wellness only, so the coach prefers false. */
  clinical: boolean;
  sampleSize: number | null;
  studyType: StudyType;
  /** One key-finding sentence. */
  outcome: string;
  /** One or two sentences, shown on the "Why this session" card. */
  summary: string;
  /** "Levinson et al. (2014). Title. Journal." */
  citation: string;
  url: string;
  openAccess: boolean;
  citedByCount: number;
  foundVia: ("europepmc" | "pubmed")[];
}

// ---------- Dev only: raw traces for offline tuning ----------

/**
 * MediaPipe Pose indices we keep: nose, ears, shoulders, elbows, hips.
 * Hips are usually out of frame when seated; their visibility will be low.
 */
export const TRACE_POSE_POINTS = [0, 7, 8, 11, 12, 13, 14, 23, 24] as const;
export const TRACE_BLENDSHAPES = [
  "browDownLeft",
  "browDownRight",
  "browInnerUp",
  "jawOpen",
  "mouthPressLeft",
  "mouthPressRight",
  "eyeBlinkLeft",
  "eyeBlinkRight",
  "eyeSquintLeft",
  "eyeSquintRight",
] as const;

/**
 * One camera frame, reduced to numbers on the phone. No pixels.
 * Used only for our own tap-labelled recordings so the breath pipeline can be
 * tuned offline in numpy against ground truth.
 */
export interface TraceFrame {
  t: SessionMs;
  /** [x, y, z, visibility] per TRACE_POSE_POINTS entry, normalized image coords. */
  pose: number[][];
  /** Values per TRACE_BLENDSHAPES entry. [] if no face was found. */
  blend: number[];
  /** Head pitch in degrees from the face transformation matrix. null if no face. */
  headPitch: number | null;
  /** Candidate breath signal B: mean vertical optical flow in a chest box under the shoulders, px. */
  chestFlowY: number | null;
}

export interface RecordingTrace {
  label: string;
  recordedAt: EpochMs;
  fps: number;
  device: string;
  frames: TraceFrame[];
  /** Ground truth: a second person tapped every inhale. */
  inhaleTaps: SessionMs[];
  /** Set when the recording is a paced-breathing run. */
  pacedRateBpm: number | null;
}
