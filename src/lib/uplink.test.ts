import { describe, expect, it } from 'vitest'
import type { SignalReading as EngineReading } from '../signal/types'
import type { Reading } from './types'
import { ReadingQueue, toSharedReading, type ShareInput } from './uplink'

const reading = (o: Partial<Reading> = {}): Reading => ({
  t: 30, breathPhase: 0.2, rate: 7, regularity: 0.8, stillness: 0.9, posture: 0.95, tension: 0.2, state: 'focused', signalOk: true, ...o,
})

const raw = (o: Partial<EngineReading> = {}): EngineReading => ({
  t: 1000, rate: 6.4, rateSpectral: 6.1, regularity: 0.7, confidence: 0.8, depth: 0.01, motion: 0.01, stillness: 0.9,
  headDrop: 0, lean: 1, tension: 0.3, faceParts: null, flutter: 0.1, inhales: [], state: 'focused',
  breathSource: 'chest', why: [], baselineReady: true, ...o,
})

const input = (o: Partial<ShareInput> = {}): ShareInput => ({
  elapsedSec: 30, reading: reading(), raw: raw(), wave: [0.1, 0.2], breathsMs: [29_400.4], baseline: false, mode: 'real', ...o,
})

describe('toSharedReading', () => {
  it('puts the reading on the session clock in ms with the engine rate', () => {
    const s = toSharedReading(input())
    expect(s.t).toBe(30_000)
    expect(s.phase).toBe('meditation')
    expect(s.breathRate).toBe(6.4)
    expect(s.breaths).toEqual([29_400])
    expect(s.state).toBe('focused')
    expect(s.quality).toBe(1)
    expect(s.tension).toBe(0.3)
    expect(s.flutter).toBe(0.1)
  })

  it('falls back to the spectral rate when there is no peak rate', () => {
    expect(toSharedReading(input({ raw: raw({ rate: null }) })).breathRate).toBe(6.1)
  })

  it('sends no state and no rate when tracking is lost', () => {
    const s = toSharedReading(input({ reading: reading({ signalOk: false }) }))
    expect(s.state).toBeNull()
    expect(s.breathRate).toBeNull()
    expect(s.quality).toBe(0)
    expect(s.confidence).toBe(0)
  })

  it('marks the demo fallback signal as untrustworthy', () => {
    const s = toSharedReading(input({ raw: null, mode: 'demo' }))
    expect(s.quality).toBe(0)
    expect(s.breathRate).toBeNull()
  })

  it('labels the baseline phase and keeps at most one second of wave', () => {
    const s = toSharedReading(input({ baseline: true, wave: Array.from({ length: 14 }, (_, i) => i / 10) }))
    expect(s.phase).toBe('baseline')
    expect(s.wave).toHaveLength(10)
    expect(s.wave[0]).toBe(0.4)
  })
})

describe('ReadingQueue', () => {
  const r = (t: number) => toSharedReading(input({ elapsedSec: t }))

  it('holds readings until attached, then sends them in order', async () => {
    const q = new ReadingQueue()
    const sent: number[][] = []
    q.push(r(1)); q.push(r(2))
    expect(q.pending).toBe(2)
    q.attach(async (b) => { sent.push(b.map((x) => x.t)) })
    await q.drain()
    expect(sent.flat()).toEqual([1000, 2000])
    expect(q.pending).toBe(0)
  })

  it('keeps readings after a failed send and retries them', async () => {
    const q = new ReadingQueue()
    let fail = true
    const sent: number[] = []
    q.attach(async (b) => { if (fail) throw new Error('offline'); sent.push(...b.map((x) => x.t)) })
    q.push(r(1))
    await q.flush()
    expect(q.pending).toBe(1)
    fail = false
    q.push(r(2))
    await q.drain()
    expect(sent).toEqual([1000, 2000])
  })

  it('gives up draining after a few failures instead of hanging the session end', async () => {
    const q = new ReadingQueue()
    q.attach(async () => { throw new Error('offline') })
    q.push(r(1))
    await q.drain(3)
    expect(q.pending).toBe(1)
  })
})
