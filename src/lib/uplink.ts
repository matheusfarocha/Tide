import type { SessionPhase, SignalReading as SharedReading } from '../../shared/types'
import { WAVE_HZ } from '../../shared/types'
import type { SignalReading as EngineReading } from '../signal/types'
import type { Reading } from './types'

// Turns what the signal module produces on the phone into the shared SignalReading that Convex
// stores (shared/types.ts), and sends those readings without ever blocking the session.
// Only these numbers leave the phone. Video never does.

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

export interface ShareInput {
  /** Session clock: seconds since the eyes closed (Session's elapsed counter). */
  elapsedSec: number
  /** The app's reading for this second. */
  reading: Reading
  /** The engine's full reading, when the real camera signal is running. */
  raw: EngineReading | null
  /** Breath values (-1..1) collected since the previous reading, ~10 Hz. */
  wave: number[]
  /** Inhales detected since the previous reading, already on the session clock (ms). */
  breathsMs: number[]
  /** True while the engine is still learning this session's baseline. */
  baseline: boolean
  /** 'demo' when the camera failed and the fake signal is running: sent with quality 0 so nobody trusts it. */
  mode: 'pending' | 'real' | 'demo'
}

export function toSharedReading(x: ShareInput): SharedReading {
  const { reading: r, raw } = x
  const ok = r.signalOk && x.mode !== 'demo'
  const phase: SessionPhase = x.baseline ? 'baseline' : 'meditation'
  const rate = raw ? raw.rate ?? raw.rateSpectral : r.rate > 0 ? r.rate : null
  return {
    t: Math.round(x.elapsedSec * 1000),
    phase,
    wave: x.wave.slice(-WAVE_HZ).map((v) => +Math.max(-3, Math.min(3, v)).toFixed(3)),
    breaths: x.breathsMs.map(Math.round),
    breathRate: ok && rate !== null ? +rate.toFixed(2) : null,
    // Our depth is in shoulder widths, not relative to a baseline, so we don't claim one.
    depth: null,
    regularity: ok ? (raw ? raw.regularity : r.regularity) : null,
    stillness: clamp01(r.stillness),
    posture: clamp01(r.posture),
    tension: clamp01(raw?.tension ?? r.tension),
    flutter: clamp01(raw?.flutter ?? 0),
    // No state when tracking is lost: the coach must not read "focused" into an empty frame.
    state: r.signalOk ? r.state : null,
    confidence: ok ? clamp01(raw?.confidence ?? 0.5) : 0,
    quality: ok ? 1 : 0,
  }
}

type Send = (readings: SharedReading[]) => Promise<unknown>

/**
 * Queues readings and sends them in order, at most one request in flight. If a send fails
 * (Wi-Fi drop), the readings stay queued and go out with the next batch. Convex dedupes by t.
 */
export class ReadingQueue {
  private queue: SharedReading[] = []
  private inFlight: Promise<void> | null = null
  private send: Send | null = null
  failures = 0

  /** Readings queue up until the session exists on the server; then this starts sending. */
  attach(send: Send) {
    this.send = send
    void this.flush()
  }

  push(r: SharedReading) {
    this.queue.push(r)
    // Keep the last hour at most, if the network never comes back.
    if (this.queue.length > 3600) this.queue.splice(0, this.queue.length - 3600)
    void this.flush()
  }

  get pending() { return this.queue.length }

  flush(): Promise<void> {
    if (this.inFlight) return this.inFlight
    if (!this.send || !this.queue.length) return Promise.resolve()
    const batch = this.queue.slice(0, 120)
    const send = this.send
    this.inFlight = send(batch)
      .then(() => { this.queue.splice(0, batch.length); this.failures = 0 })
      .catch(() => { this.failures++ })
      .finally(() => { this.inFlight = null })
    return this.inFlight
  }

  /** Send everything left (for session end). Gives up after a few failed tries. */
  async drain(tries = 3) {
    for (let i = 0; i < tries + 50 && this.queue.length && this.send; i++) {
      const before = this.failures
      await this.flush()
      if (this.failures > before && this.failures >= tries) return
    }
  }
}
