import { describe, expect, it } from 'vitest'
import { BreathAnalyzer } from './breath'
import { OneEuro } from './oneEuro'

function rng(seed: number) {
  let s = seed
  const u = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 }
  return () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u())
}
const std = (x: number[]) => { const m = x.reduce((a, b) => a + b, 0) / x.length; return Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / x.length) }

describe('OneEuro', () => {
  it('cuts jitter on a still point by well over half', () => {
    const g = rng(1), f = new OneEuro()
    const raw: number[] = [], out: number[] = []
    for (let i = 0; i < 900; i++) { const v = 0.5 + 0.003 * g(); raw.push(v); out.push(f.filter(i / 30, v)) }
    expect(std(out.slice(60))).toBeLessThan(std(raw.slice(60)) * 0.5)
  })

  it('keeps a breathing-sized movement (0.25 Hz) nearly intact', () => {
    const f = new OneEuro()
    const out: number[] = []
    for (let i = 0; i < 900; i++) out.push(f.filter(i / 30, 0.004 * Math.sin(2 * Math.PI * 0.25 * (i / 30))))
    expect(std(out.slice(60)) / (0.004 / Math.SQRT2)).toBeGreaterThan(0.9)
  })

  it('follows a fast move quickly (no long lag)', () => {
    const f = new OneEuro()
    let y = 0
    for (let i = 0; i < 60; i++) y = f.filter(i / 30, 0)
    for (let i = 60; i < 75; i++) y = f.filter(i / 30, 0.3) // step of 0.3 image heights
    expect(y).toBeGreaterThan(0.25) // within 0.5 s
  })

  it('makes the breath estimate more reliable on jittery landmarks', () => {
    const run = (smooth: boolean, seed: number) => {
      const g = rng(seed), a = new BreathAnalyzer(), f = new OneEuro()
      for (let i = 0; i < 90 * 30; i++) {
        const t = i / 30
        const v = 0.55 + 0.004 * Math.sin(2 * Math.PI * (14 / 60) * t) + 0.004 * g()
        a.push(t, smooth ? f.filter(t, v) : v)
      }
      return a.read()
    }
    let rawConf = 0, smoothConf = 0
    for (const seed of [1, 2, 3, 4, 5]) { rawConf += run(false, seed).confidence; smoothConf += run(true, seed).confidence }
    console.log('mean confidence raw', (rawConf / 5).toFixed(2), 'smoothed', (smoothConf / 5).toFixed(2))
    expect(smoothConf).toBeGreaterThan(rawConf)
  })
})
