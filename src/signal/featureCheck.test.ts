import { describe, expect, it } from 'vitest'
import { checkEyesClosed, checkFidget, checkHeadDrop, checkPaced, checkSignal, checkTension, type Sample } from './featureCheck'

const s = (o: Partial<Sample> = {}): Sample => ({ rate: 12, rateSpectral: 12, confidence: 0.8, motion: 0.01, stillness: 0.9, headDrop: 0, tension: 0.1, flutter: 0.1, state: 'focused', baselineReady: true, signalOk: true, inhaleCount: 12, ...o })
const many = (n: number, o: Partial<Sample> = {}) => Array.from({ length: n }, () => s(o))

describe('checkSignal', () => {
  it('passes when tracked with a rate', () => expect(checkSignal(many(20)).verdict).toBe('pass'))
  it('fails when the body is mostly lost', () => expect(checkSignal(many(20, { signalOk: false })).verdict).toBe('fail'))
  it('warns when tracked but no rate at all', () => expect(checkSignal(many(20, { rate: null, rateSpectral: null })).verdict).toBe('warn'))
  it('a spectral-only rate still counts as available, with a note about the peak method', () => {
    const c = checkSignal(many(20, { rate: null, rateSpectral: 13 }))
    expect(c.verdict).toBe('warn')
    expect(c.meaning).toMatch(/spectral/)
  })
  it('ignores the warm-up period when judging availability', () => {
    const warm = [...many(8, { rate: null, rateSpectral: null }), ...many(12)]
    expect(checkSignal(warm).verdict).toBe('pass')
  })
  it('does not flag few inhales when a slow breather has only ~35 s of data', () => {
    // 11 breaths a minute over 35 s is ~6 expected; 4 found is fine
    const c = checkSignal(many(25, { rate: 11, rateSpectral: 11, inhaleCount: 4 }), { method: 'chest pixels', chestUsablePct: 100, bufferSec: 35 })
    expect(c.verdict).toBe('pass')
  })
  it('flags far fewer inhales than the rate implies', () => {
    const c = checkSignal(many(25, { rate: 15, rateSpectral: 15, inhaleCount: 2 }), { method: 'chest pixels', chestUsablePct: 100, bufferSec: 60 })
    expect(c.verdict).toBe('warn')
    expect(c.meaning).toMatch(/fewer inhales/)
  })
  it('reports how much of the time the chest vs the shoulder fallback was used', () => {
    const smp = [...many(10, { breathSource: 'chest' }), ...many(10, { breathSource: 'landmarks' })]
    const c = checkSignal(smp, { method: 'chest pixels', chestUsablePct: 90, bufferSec: 40 })
    expect(c.lines.join(' ')).toMatch(/chest \d+% of the time, shoulders \(fallback\) \d+%/)
  })
  it('fails with a clear reason when the chest patch has no texture', () => {
    const c = checkSignal(many(20, { rate: null, rateSpectral: null }), { method: 'chest pixels', chestUsablePct: 10, bufferSec: 40 })
    expect(c.verdict).toBe('fail')
    expect(c.meaning).toMatch(/texture/)
  })
})

describe('checkPaced', () => {
  it('passes within 1 of 6', () => expect(checkPaced(s({ rate: 5.9 })).verdict).toBe('pass'))
  it('warns within 2, fails beyond', () => {
    expect(checkPaced(s({ rate: 7.5 })).verdict).toBe('warn')
    expect(checkPaced(s({ rate: 15 })).verdict).toBe('fail')
  })
  it('fails with no reading', () => expect(checkPaced(s({ rate: null, rateSpectral: null })).verdict).toBe('fail'))
  it('falls back to the spectral rate', () => expect(checkPaced(s({ rate: null, rateSpectral: 6.2 })).verdict).toBe('pass'))
})

describe('checkFidget', () => {
  const base = many(20, { motion: 0.01 })
  it('passes on a clear fidget', () => expect(checkFidget(base, many(10, { motion: 0.2, state: 'restless' })).verdict).toBe('pass'))
  it('fails when nothing changes', () => expect(checkFidget(base, many(10, { motion: 0.012 })).verdict).toBe('fail'))
})

describe('checkHeadDrop', () => {
  it('passes past the line', () => expect(checkHeadDrop(many(10, { headDrop: 0.2, state: 'drifting' })).verdict).toBe('pass'))
  it('fails with no drop', () => expect(checkHeadDrop(many(10, { headDrop: 0.01 })).verdict).toBe('fail'))
  it('fails without a baseline', () => expect(checkHeadDrop(many(10, { baselineReady: false })).verdict).toBe('fail'))
})

describe('checkTension', () => {
  const base = many(20, { tension: 0.1 })
  it('passes on a clear rise', () => expect(checkTension(base, many(8, { tension: 0.4 })).verdict).toBe('pass'))
  it('fails with no rise', () => expect(checkTension(base, many(8, { tension: 0.11 })).verdict).toBe('fail'))
  it('fails when the face is not tracked', () => expect(checkTension(base, many(8, { tension: null })).verdict).toBe('fail'))
})

describe('checkEyesClosed', () => {
  it('passes when face signals stay available', () => expect(checkEyesClosed(many(15)).verdict).toBe('pass'))
  it('fails when they drop out', () => expect(checkEyesClosed(many(15, { tension: null, flutter: null })).verdict).toBe('fail'))
})

describe('no data', () => {
  it('every check fails cleanly on empty windows (no NaN or Infinity)', () => {
    const outs = [checkSignal([]), checkFidget([], []), checkFidget(many(5), []), checkHeadDrop([]), checkTension(many(5), []), checkEyesClosed([])]
    for (const o of outs) {
      expect(o.verdict).toBe('fail')
      expect(o.lines.join(' ')).not.toMatch(/NaN|Infinity/)
    }
  })
})
