import type { FeelCheck, Reading } from './types'

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

export function focusPct(readings: Reading[]) {
  const live = readings.filter((r) => r.state !== 'settling')
  if (!live.length) return 0
  return Math.round((live.filter((r) => r.state === 'focused').length / live.length) * 100)
}

export const avgRate = (rs: Reading[]) => +avg(rs.map((r) => r.rate)).toFixed(1)

const level = (v: number) => (v > 0.8 ? 'High' : v > 0.6 ? 'Medium' : 'Low')
export const stillnessLabel = (rs: Reading[]) => level(avg(rs.map((r) => r.stillness)))
export const postureLabel = (rs: Reading[]) => (avg(rs.map((r) => r.posture)) > 0.75 ? 'Good' : 'Slumping')

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

export function firstDriftSec(rs: Reading[]) {
  return rs.find((x) => x.state === 'drifting')?.t ?? null
}
