import type { MindState, Reading } from './types'

/**
 * The interface Person 1's MediaPipe module implements.
 * The app only talks to this, so the fake and the real one are swappable.
 */
export interface SignalSource {
  start(video?: HTMLVideoElement): Promise<void>
  stop(): void
  /** ~10 Hz breath value for drawing the live wave. */
  onBreath(cb: (value: number) => void): () => void
  /** 1 Hz reading with every score and the state. */
  onReading(cb: (r: Reading) => void): () => void
}

/** Fake breathing person: ~6.5 breaths/min, drifts around minute 4 (scaled for short sessions). */
export function createFakeSignal(opts: { lengthSec: number; targetRate?: number }): SignalSource {
  const breathSubs = new Set<(v: number) => void>()
  const readingSubs = new Set<(r: Reading) => void>()
  let timers: number[] = []
  let t0 = 0
  let phase = 0
  const scale = opts.lengthSec / 480

  const stateAt = (t: number): MindState => {
    const m = t / scale
    if (t < Math.min(60, opts.lengthSec * 0.15)) return 'settling'
    if (m > 225 && m < 320) return 'drifting'
    if (m > 400 && m < 430) return 'drowsy'
    return 'focused'
  }
  const rateFor = (s: MindState) => opts.targetRate ?? (s === 'drifting' ? 8.8 : s === 'drowsy' ? 5.2 : 6.6)

  return {
    async start() {
      t0 = performance.now()
      let last = t0
      timers.push(window.setInterval(() => {
        const now = performance.now()
        const s = stateAt((now - t0) / 1000)
        phase += ((now - last) / 1000) * (rateFor(s) / 60) * Math.PI * 2
        last = now
        const jitter = (Math.random() - 0.5) * (s === 'drifting' ? 0.5 : 0.12)
        const v = Math.sin(phase) * (s === 'drifting' ? 0.6 : 1) + jitter
        breathSubs.forEach((cb) => cb(v))
      }, 100))
      timers.push(window.setInterval(() => {
        const t = Math.round((performance.now() - t0) / 1000)
        const s = stateAt(t)
        const n = () => (Math.random() - 0.5) * 0.06
        const r: Reading = {
          t,
          breathPhase: Math.sin(phase),
          rate: +(rateFor(s) + n() * 4).toFixed(1),
          regularity: (s === 'drifting' ? 0.55 : 0.88) + n(),
          stillness: (s === 'drifting' ? 0.6 : s === 'settling' ? 0.75 : 0.92) + n(),
          posture: (s === 'drowsy' ? 0.55 : 0.9) + n(),
          tension: (s === 'drifting' ? 0.45 : 0.2) + n(),
          state: s,
          signalOk: true,
        }
        readingSubs.forEach((cb) => cb(r))
      }, 1000))
    },
    stop() {
      timers.forEach(clearInterval)
      timers = []
    },
    onBreath(cb) { breathSubs.add(cb); return () => { breathSubs.delete(cb) } },
    onReading(cb) { readingSubs.add(cb); return () => { readingSubs.delete(cb) } },
  }
}
