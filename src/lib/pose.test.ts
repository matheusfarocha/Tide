import { describe, expect, it } from 'vitest'
import { BreathTracker } from './pose'

/** Peak-to-peak of the wave value over a steady 14/min breath of the given size (image heights). */
function waveRange(amp: number, minDev?: number) {
  const t = new BreathTracker(minDev)
  const vals: number[] = []
  for (let i = 0; i < 40 * 30; i++) {
    const ms = (i / 30) * 1000
    t.push(ms, amp * Math.sin(2 * Math.PI * (14 / 60) * (i / 30)))
    if (i > 15 * 30) vals.push(t.value())
  }
  return Math.max(...vals) - Math.min(...vals)
}

describe('BreathTracker wave', () => {
  it('fills most of the -1..1 range for landmark-sized breath movement', () => {
    expect(waveRange(0.004)).toBeGreaterThan(1.2)
  })
  it('with the default range, a chest-pixel-sized breath (about 0.001) shows only a flat-ish line', () => {
    expect(waveRange(0.001)).toBeLessThan(1) // the bug: wave barely moves
  })
  it('with a range matched to chest-pixel units the same breath fills the wave', () => {
    expect(waveRange(0.001, 0.0003)).toBeGreaterThan(1.2)
  })
})
