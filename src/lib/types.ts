// Shared contract between the three lanes. Mirrors the Convex tables in the build plan.

export type MindState = 'settling' | 'focused' | 'drifting' | 'restless'

/** One reading per second from Person 1's signal module. */
export interface Reading {
  t: number            // seconds since session start
  breathPhase: number  // -1..1, latest filtered breath value
  rate: number         // breaths per minute over the last ~30 s
  regularity: number   // 0..1, 1 = perfectly even breaths
  stillness: number    // 0..1, 1 = perfectly still
  posture: number      // 0..1, 1 = upright
  tension: number      // 0..1, 1 = tense brow and jaw
  state: MindState
  signalOk: boolean
}

export type FeelAnswer = 'focused' | 'drifting' | 'unsure' | 'none'

export interface FeelCheck {
  t: number
  spoken?: string
  answer: FeelAnswer
  sensorState: MindState
  match: boolean
}

/** Next-session plan designed by the CREAO coach (Person 3). Times are in seconds. */
export interface Plan {
  lengthSec: number
  cueTimes: number[]
  /** What each cue says, when the coach wrote it. Without it the session uses a default line. */
  cues?: { atSec: number; text: string }[]
  /** Spoken at the start, e.g. "Last time you drifted around minute 4." */
  intro?: string
  feelCheckTimes: number[]
  fadingLevel: number  // 0 = full support, 1 = no cues
  technique: string
  focusArea: string
  reasons: string[]
  /** "Why this session": papers from the research library behind the technique. */
  citations?: { citation: string; url: string; why: string }[]
  /** Designed by the CREAO coach, so its length is part of the plan. The baseline uses the chosen length. */
  fromCoach?: boolean
}

export interface SessionRecord {
  id: string
  date: string        // ISO
  lengthSec: number
  readings: Reading[]
  feelChecks: FeelCheck[]
  calibrationRate?: number
  /** The Convex session this was recorded as, when the backend is on. */
  serverId?: string
}

export interface CoachInsights {
  summary: string
  takeaways: string[]
  patterns: { title: string; detail: string; sessions: string }[]
}

/** Breath-counting focus test (Levinson et al., 2014), checked against camera-detected breaths. */
export interface BreathTest {
  date: string
  reported: number   // breaths the person tapped
  observed: number   // breaths TIDE detected
  lostCount: number  // times they pressed "Lost count"
}

export type Goal ='stress' | 'focus' | 'habit' | 'sleep'
