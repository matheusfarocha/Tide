import type { BreathTest, FeelCheck, Reading, SessionRecord } from './types'

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

export function focusPct(readings: Reading[]) {
  const live = withSignal(readings).filter((r) => r.state !== 'settling')
  if (!live.length) return 0
  return Math.round((live.filter((r) => r.state === 'focused').length / live.length) * 100)
}

// Readings without a signal (shoulders not found) or still warming up (rate 0) must not count as data.
const withSignal = (rs: Reading[]) => rs.filter((r) => r.signalOk)

export const avgRate = (rs: Reading[]) => +avg(withSignal(rs).filter((r) => r.rate > 0).map((r) => r.rate)).toFixed(1)

const band = (v: number) => (v > 0.8 ? 'High' : v > 0.6 ? 'Medium' : 'Low')
export const stillnessLabel = (rs: Reading[]) => band(avg(withSignal(rs).map((r) => r.stillness)))
export const postureLabel = (rs: Reading[]) => (avg(withSignal(rs).map((r) => r.posture)) > 0.75 ? 'Good' : 'Slumping')

/** Self-awareness = share of Feel Checks where what you felt matched what the sensors saw. */
export function selfAwareness(fcs: FeelCheck[]) {
  const answered = fcs.filter((f) => f.answer === 'focused' || f.answer === 'drifting')
  if (!answered.length) return 0
  return Math.round((answered.filter((f) => f.match).length / answered.length) * 100)
}

/** Rolling self-awareness over the last `window` sessions, one value per session. Less noisy than per-session. */
export function awarenessTrend(history: { feelChecks: FeelCheck[] }[], window = 3) {
  return history.map((_, i) => selfAwareness(history.slice(Math.max(0, i - window + 1), i + 1).flatMap((h) => h.feelChecks)))
}

export function fmt(sec: number) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Runs of one state, for the Calm Map key moments. */
export function moments(rs: Reading[]) {
  const out: { state: Reading['state']; from: number; to: number }[] = []
  for (const r of rs) {
    const last = out[out.length - 1]
    if (last && last.state === r.state) last.to = r.t
    else out.push({ state: r.state, from: r.t, to: r.t })
  }
  return out.filter((m) => m.to - m.from >= 8)
}

/** Drifts caught = times you said "drifting" and the sensors agreed. The core skill TIDE trains. */
export const driftsCaught = (h: SessionRecord[]) =>
  h.flatMap((s) => s.feelChecks).filter((f) => f.answer === 'drifting' && f.match).length

export const totalMinutes = (h: SessionRecord[]) => Math.round(h.reduce((a, s) => a + s.lengthSec, 0) / 60)

/** Consecutive days with a session, counting back from today (or yesterday). */
export function streak(h: SessionRecord[]) {
  const days = new Set(h.map((s) => new Date(s.date).toDateString()))
  const d = new Date()
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1)
  let n = 0
  while (days.has(d.toDateString())) { n++; d.setDate(d.getDate() - 1) }
  return n
}

export const breathAccuracy = (t: BreathTest) =>
  t.observed ? Math.max(0, Math.round((1 - Math.abs(t.reported - t.observed) / t.observed) * 100)) : 0

export const LEVELS = [
  { min: 0, name: 'Beginner' },
  { min: 40, name: 'Noticer' },
  { min: 60, name: 'Watcher' },
  { min: 75, name: 'Steady' },
  { min: 90, name: 'Clear' },
]
export function level(score: number) {
  const i = LEVELS.reduce((acc, l, idx) => (score >= l.min ? idx : acc), 0)
  const next = LEVELS[i + 1]
  return { n: i + 1, name: LEVELS[i].name, next: next?.name, toNext: next ? next.min - score : 0, progress: next ? (score - LEVELS[i].min) / (next.min - LEVELS[i].min) : 1 }
}

export function firstDriftSec(rs: Reading[]) {
  return rs.find((x) => x.state === 'drifting')?.t ?? null
}
