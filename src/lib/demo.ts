import type { BreathTest, CoachInsights, Plan, Reading, SessionRecord } from './types'

// Demo dates are relative to today so streaks and "last 7 days" look right on judging day.
function daysAgo(n: number, h: number, m: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

export const demoBreathTests: BreathTest[] = [
  { date: daysAgo(3, 8, 20), reported: 14, observed: 9, lostCount: 2 },
  { date: daysAgo(1, 8, 15), reported: 11, observed: 10, lostCount: 1 },
]

/** People who tried TIDE at our table. Person 3: back this with a Convex table. */
export const demoTable = [
  { name: 'Maya', score: 83, caught: 4 },
  { name: 'Judge · Convex', score: 75, caught: 3 },
  { name: 'Theo', score: 67, caught: 2 },
  { name: 'Priya', score: 60, caught: 2 },
  { name: 'Sam', score: 50, caught: 1 },
]

// Fake data so the UI works before the signal and the coach are wired up.

export const firstPlan: Plan = {
  lengthSec: 300,
  cueTimes: [],
  feelCheckTimes: [120, 240],
  fadingLevel: 0,
  technique: 'Baseline assessment',
  focusArea: 'Learn your normal',
  reasons: ['Your first session is a fixed baseline, like a fitness test.'],
}

export const demoPlan: Plan = {
  lengthSec: 480,
  cueTimes: [210],
  feelCheckTimes: [150, 300, 420],
  fadingLevel: 0.3,
  technique: 'Breath counting with longer intervals',
  focusArea: 'Posture and breathing consistency',
  reasons: ['You usually drift around minute 4.', 'Your posture slips after minute 6.'],
}

export const demoInsights: CoachInsights = {
  summary:
    'You usually drift around minute 4. Your breathing gets shallower and your posture slips a little. Mornings go better than nights.',
  takeaways: [
    'Focused for 62% of the session.',
    'Your mind often drifts around minute 4.',
    'Breathing turns irregular when you drift.',
    'More focused in the mornings.',
  ],
  patterns: [
    { title: 'Drift at minute 4', detail: 'In 4 of your last 5 sessions.', sessions: 'Oct 19–23' },
    { title: 'Mornings win', detail: '+18% focus before 10 AM.', sessions: '6 sessions' },
    { title: 'Posture slips late', detail: 'Head drops after ~7 min.', sessions: '3 sessions' },
  ],
}

function synth(lengthSec: number, driftAt: number): Reading[] {
  const out: Reading[] = []
  for (let t = 0; t < lengthSec; t += 5) {
    const drifting = t > driftAt && t < driftAt + 80
    out.push({
      t,
      breathPhase: Math.sin(t / 1.4),
      rate: drifting ? 8.6 + Math.random() : 6.4 + Math.random() * 0.6,
      regularity: drifting ? 0.5 + Math.random() * 0.1 : 0.85 + Math.random() * 0.1,
      stillness: drifting ? 0.55 + Math.random() * 0.1 : 0.9 + Math.random() * 0.05,
      posture: t > lengthSec * 0.8 ? 0.65 : 0.9,
      tension: drifting ? 0.45 : 0.2,
      state: t < 50 ? 'settling' : drifting ? 'drifting' : 'focused',
      signalOk: true,
    })
  }
  return out
}

export const demoHistory: SessionRecord[] = [
  { id: 's1', date: daysAgo(3, 8, 10), lengthSec: 600, readings: synth(600, 150), feelChecks: [
    { t: 150, answer: 'focused', sensorState: 'focused', match: true },
    { t: 260, answer: 'focused', sensorState: 'drifting', match: false },
    { t: 420, answer: 'drifting', sensorState: 'focused', match: false },
  ] },
  { id: 's2', date: daysAgo(2, 21, 30), lengthSec: 480, readings: synth(480, 200), feelChecks: [
    { t: 150, answer: 'focused', sensorState: 'focused', match: true },
    { t: 270, answer: 'drifting', sensorState: 'drifting', match: true },
    { t: 400, answer: 'focused', sensorState: 'drowsy', match: false },
  ] },
  { id: 's3', date: daysAgo(1, 8, 5), lengthSec: 600, readings: synth(600, 240), feelChecks: [
    { t: 150, answer: 'focused', sensorState: 'focused', match: true },
    { t: 270, answer: 'drifting', sensorState: 'drifting', match: true },
    { t: 420, answer: 'focused', sensorState: 'focused', match: true },
  ] },
]
