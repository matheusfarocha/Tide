import type { Frame, SignalReading } from '../signal/types'
import type { MindState, Reading } from './types'

export interface ChestInfo {
  /** Crop window in fractions of the video frame, or null if there is none. */
  roi: { x: number; y: number; w: number; h: number } | null
  /** Usable texture in the crop (higher is better); null if no step was measured. */
  texture: number | null
  /** Accumulated chest displacement, in image heights (positive = down). */
  cum: number
}

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
  /** Optional: a detected inhale, with its time in seconds. Real source only; the fake has none. */
  onInhale?(cb: (t: number) => void): () => void
  /** Optional, real source only: the engine's full per-second reading (confidence, head drop, flutter...). */
  onRaw?(cb: (r: SignalReading) => void): () => void
  /** Optional, real source only: every tracked frame, raw from the model and as fed to the engine (smoothed). */
  onFrame?(cb: (raw: Frame, used: Frame) => void): () => void
  /** Optional, real source only: chest pixel-motion tracking state (crop window, texture quality, displacement). */
  onChest?(cb: (c: ChestInfo) => void): () => void
  /** Optional, real source only: the live camera stream (for a diagnostic preview). */
  stream?(): MediaStream | null
  /** Optional: 'real' once camera and models run, 'demo' if it fell back to the fake signal. */
  mode?(): 'pending' | 'real' | 'demo'
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
    return 'focused'
  }
  const rateFor = (s: MindState) => opts.targetRate ?? (s === 'drifting' ? 8.8 : 6.6)

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
          posture: (s === 'drifting' ? 0.8 : 0.9) + n(),
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
