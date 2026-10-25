import { api } from '../../convex/_generated/api'
import { PACED_RATE_BPM } from '../../shared/types'
import { convex } from './backend'

// Accuracy evidence for the README: every paced-breathing check and every tap-labelled recording
// is saved as a calibration, under a separate "accuracy-checks" user. Its sessions are
// breath-count sessions, which never start a coach run and never touch anyone's history.

const USER = 'accuracy-checks'

interface Check {
  kind: 'paced' | 'tapLabel'
  durationSec: number
  /** Ground truth in breaths/min: the pacer's rate, or the rate implied by the taps. */
  trueRate: number | null
  measuredRate: number | null
  /** Seconds from the start of the check (tapLabel only). */
  tapsSec?: number[]
  detectedSec?: number[]
}

export async function saveAccuracyCheck(c: Check): Promise<boolean> {
  if (!convex) return false
  try {
    const userId = await convex.mutation(api.users.getOrCreate, { name: USER })
    await convex.mutation(api.users.setCoachEnabled, { userId, enabled: false })
    const { sessionId } = await convex.mutation(api.sessions.start, { userId, kind: 'breathCount' })
    const ms = (xs?: number[]) => (xs ?? []).map((s) => Math.round(s * 1000))
    await convex.mutation(api.sessions.addCalibration, {
      sessionId,
      calibration: {
        kind: c.kind, startT: 0, endT: Math.round(c.durationSec * 1000),
        trueRate: c.trueRate, measuredRate: c.measuredRate,
        tapTimes: ms(c.tapsSec), detectedTimes: ms(c.detectedSec), rateError: null,
      },
    })
    await convex.mutation(api.sessions.end, { sessionId })
    return true
  } catch (e) {
    console.warn('Convex: accuracy check not saved', e)
    return false
  }
}

export const savePacedCheck = (measuredRate: number, durationSec: number) =>
  saveAccuracyCheck({ kind: 'paced', durationSec, trueRate: PACED_RATE_BPM, measuredRate })
