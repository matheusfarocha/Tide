import { ConvexReactClient } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { PACED_CHECK_SEC, PACED_RATE_BPM, type FeelAnswer as SharedAnswer, type SessionPlan } from '../../shared/types'
import type { FeelAnswer, Plan } from './types'
import { ReadingQueue } from './uplink'
import type { SignalReading as SharedReading } from '../../shared/types'

// The app's one connection to Convex. Without VITE_CONVEX_URL the app runs fully local
// (localStorage + the fake coach), so the demo works even with no backend at all.

const url = import.meta.env.VITE_CONVEX_URL as string | undefined
export const convex = url ? new ConvexReactClient(url) : null
export const backendOn = convex !== null

export type UserId = Id<'users'>
export type SessionId = Id<'sessions'>

const TECHNIQUE: Record<SessionPlan['technique'], string> = {
  breathFocus: 'Breath focus',
  bodyScan: 'Body scan',
  breathCounting: 'Breath counting',
  openAwareness: 'Open awareness',
}

/** The coach's plan (shared contract) in the shape the app's screens already use. */
export function toAppPlan(p: SessionPlan): Plan {
  return {
    lengthSec: p.lengthSec,
    cueTimes: p.cues.map((c) => c.atSec),
    cues: p.cues.map((c) => ({ atSec: c.atSec, text: c.text })),
    feelCheckTimes: p.feelChecks.map((f) => f.atSec),
    fadingLevel: Math.max(0, Math.min(1, p.fadingLevel / 3)),
    technique: TECHNIQUE[p.technique] ?? p.technique,
    focusArea: p.intro,
    intro: p.intro,
    reasons: p.reasons.map((r) => r.claim),
    citations: p.citations.map(({ citation, url, why }) => ({ citation, url, why })),
  }
}

/** The readable part of a Convex error ("Uncaught Error: X at handler…" → "X"). */
function serverMessage(e: unknown): string {
  const m = String((e as { message?: unknown })?.message ?? e)
  const inner = m.match(/Uncaught Error: ([^\n]+?)(?:\s+at |\n|$)/)
  if (inner) return inner[1]
  return /fetch|network|connect|websocket/i.test(m) ? "Can't reach TIDE's server." : m.split('\n')[0]
}

export async function getOrCreateUser(name: string): Promise<UserId | null> {
  if (!convex || !name.trim()) return null
  try {
    return await convex.mutation(api.users.getOrCreate, { name: name.trim() })
  } catch (e) {
    console.warn('Convex: could not create user', e)
    return null
  }
}

export async function setCoachEnabled(userId: UserId, enabled: boolean) {
  try { await convex?.mutation(api.users.setCoachEnabled, { userId, enabled }) } catch (e) { console.warn('Convex: coach switch failed', e) }
}

/** Run the CREAO coach again for a session whose run failed. Returns false if it could not be started. */
export async function retryCoach(sessionId: SessionId): Promise<boolean> {
  try { await convex?.mutation(api.coach.retry, { sessionId }); return true } catch (e) { console.warn('Convex: coach retry failed', e); return false }
}

/** Delete a person and their recorded data on the server. Returns false if it could not be reached. */
export async function deleteUser(userId: UserId): Promise<boolean> {
  try { await convex?.mutation(api.users.remove, { userId }); return true } catch (e) { console.warn('Convex: delete failed', e); return false }
}

/** A paced-breathing check done on the Calibrate screen, before the session existed. */
export interface PacedCheck { measuredRate: number; doneAt: number }

/**
 * One session on the server. Every call is fire-and-forget from the session's point of view:
 * if Convex is slow or unreachable, the meditation carries on and data is sent when it can be.
 */
export class SessionLink {
  readonly readings = new ReadingQueue()
  private sessionId: SessionId | null = null
  private started: Promise<SessionId | null>
  private ended = false
  /** Why the server refused or couldn't be reached, when it did. The session then runs only on this phone. */
  error: string | null = null

  constructor(userId: UserId, kind: 'training' | 'breathCount', onPlan?: (p: SessionPlan) => void, paced?: PacedCheck) {
    this.started = (async () => {
      try {
        const { sessionId, plan } = await convex!.mutation(api.sessions.start, { userId, kind })
        this.sessionId = sessionId
        onPlan?.(plan)
        this.readings.attach((batch) => convex!.mutation(api.sessions.addReadings, { sessionId, readings: batch }))
        // A paced check from the last few minutes belongs to this session (negative t: before eyes closed).
        if (paced && Date.now() - paced.doneAt < 10 * 60_000) {
          void convex!.mutation(api.sessions.addCalibration, {
            sessionId,
            calibration: {
              kind: 'paced', startT: -PACED_CHECK_SEC * 1000, endT: 0, trueRate: PACED_RATE_BPM,
              measuredRate: paced.measuredRate, tapTimes: [], detectedTimes: [], rateError: null,
            },
          }).catch((e) => console.warn('Convex: calibration not saved', e))
        }
        return sessionId
      } catch (e) {
        // e.g. "Your coach is still designing your next session": run locally instead of blocking.
        console.warn('Convex: session not started, running locally', e)
        this.error = serverMessage(e)
        return null
      }
    })()
  }

  get id() { return this.sessionId }
  ready() { return this.started }

  addReading(r: SharedReading) {
    if (!this.ended) this.readings.push(r)
  }

  /**
   * Record a Feel Check. A spoken answer goes to feel.answer (keyword match, Claude if unclear);
   * buttons and silence go to feel.record. Resolves with the server's reading of the answer.
   */
  async feelCheck(f: { tSec: number; answeredSec: number | null; answer: FeelAnswer; spoken?: string }) {
    const sessionId = await this.started
    if (!sessionId) return null
    await this.readings.flush() // the server scores against the readings before the question
    const t = Math.round(f.tSec * 1000)
    const answeredAt = f.answeredSec === null ? null : Math.round(f.answeredSec * 1000)
    try {
      if (f.spoken) return await convex!.action(api.feel.answer, { sessionId, t, answeredAt, transcript: f.spoken })
      const answer: SharedAnswer | null = f.answer === 'focused' || f.answer === 'drifting' ? f.answer : null
      return await convex!.mutation(api.feel.record, {
        sessionId, t, answeredAt,
        source: f.answer === 'none' ? 'timeout' : 'button',
        transcript: null,
        answer,
        interpretedBy: f.answer === 'none' ? null : 'button',
      })
    } catch (e) {
      console.warn('Convex: feel check not saved', e)
      return null
    }
  }

  /** Breath-counting test: the app's test taps once per breath, so n = 1. */
  async breathCount(t: { startT: number; endT: number; tapTimes: number[]; detectedTimes: number[] }) {
    const sessionId = await this.started
    if (!sessionId) return
    try {
      await convex!.mutation(api.sessions.addBreathCountTest, { sessionId, test: { ...t, n: 1 } })
    } catch (e) { console.warn('Convex: breath test not saved', e) }
  }

  /** Flush what's left and end the session; with the coach on, this starts the CREAO run. */
  async end() {
    if (this.ended) return
    this.ended = true
    const sessionId = await this.started
    if (!sessionId) return
    await this.readings.drain()
    try { await convex!.mutation(api.sessions.end, { sessionId }) } catch (e) { console.warn('Convex: end failed', e) }
  }
}
