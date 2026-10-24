import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'

// On-device pose tracking for the camera overlay. Video never leaves the phone.
// Person 1: reuse loadPose() and BreathTracker in the real SignalSource, or replace them.

export interface Landmark { x: number; y: number; z: number; visibility?: number }

export const LM = { nose: 0, lEar: 7, rEar: 8, lShoulder: 11, rShoulder: 12, lElbow: 13, rElbow: 14, lHip: 23, rHip: 24 } as const

const VERSION = '0.10.14' // keep in sync with package.json
let loading: Promise<PoseLandmarker> | null = null

export function loadPose(): Promise<PoseLandmarker> {
  if (!loading) {
    loading = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`)
      const make = (delegate: 'GPU' | 'CPU') => PoseLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
          delegate,
        },
        runningMode: 'VIDEO',
        numPoses: 1,
      })
      try { return await make('GPU') } catch { return await make('CPU') }
    })()
    loading.catch(() => { loading = null })
  }
  return loading
}

export const visible = (l?: Landmark, min = 0.6) => !!l && (l.visibility ?? 1) >= min

/**
 * Breath from shoulder height. Shoulders rise on the inhale, so the signal is the
 * shoulder midpoint's height with slow drift removed, scaled to about -1..1.
 */
export class BreathTracker {
  private s: { t: number; y: number }[] = []
  private armed = true
  private peaks: number[] = []

  push(t: number, y: number) {
    this.s.push({ t, y })
    while (this.s.length && t - this.s[0].t > 30000) this.s.shift()
    const v = this.value()
    if (this.armed && v > 0.35) { this.peaks.push(t); this.armed = false }
    if (v < -0.2) this.armed = true
    while (this.peaks.length && t - this.peaks[0] > 30000) this.peaks.shift()
  }

  /** -1 (exhaled) .. 1 (inhaled). */
  value() {
    const n = this.s.length
    if (n < 10) return 0
    const now = this.s[n - 1].t
    const recent = this.s.filter((p) => now - p.t < 5000)
    const mean = recent.reduce((a, p) => a + p.y, 0) / recent.length
    const last = this.s.slice(-4).reduce((a, p) => a + p.y, 0) / Math.min(4, n)
    const window = this.s.filter((p) => now - p.t < 15000)
    const dev = Math.max(0.0025, ...window.map((p) => Math.abs(p.y - mean)))
    return Math.max(-1, Math.min(1, -(last - mean) / dev)) // y grows downward, so invert
  }

  /** Breaths per minute over the last 30 s, or null until there's enough data. */
  rate() {
    const n = this.s.length
    if (n < 2) return null
    const span = (this.s[n - 1].t - this.s[0].t) / 1000
    if (span < 12) return null
    return +(this.peaks.length / (span / 60)).toFixed(1)
  }

  reset() { this.s = []; this.peaks = []; this.armed = true }
}
