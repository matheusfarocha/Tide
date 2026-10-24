import { describe, expect, it } from 'vitest'
import { BreathAnalyzer } from './breath'
import { ChestMotion, ChestTotal } from './chestMotion'

function rng(seed: number) {
  let s = seed
  const u = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 }
  return () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u())
}

const W = 96
const H = 60
// A smooth, textured "shirt": a few sinusoids. Evaluated analytically so any sub-pixel shift is exact.
const WAVES = [[0.31, 0.22, 0.4], [0.17, 0.41, 2.1], [0.46, 0.13, 4.0], [0.09, 0.28, 5.3], [0.37, 0.35, 1.2]]
const texture = (x: number, y: number) => 128 + WAVES.reduce((a, [kx, ky, p]) => a + 22 * Math.sin(kx * x + ky * y + p), 0)

function frame(shiftY: number, noise: number, g: () => number, gain = 1): number[] {
  const out: number[] = []
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out.push(gain * texture(x, y - shiftY) + noise * g())
  return out
}

function corr(a: number[], b: number[]) {
  const m = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length
  const ma = m(a), mb = m(b)
  let sab = 0, saa = 0, sbb = 0
  for (let i = 0; i < a.length; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2 }
  return sab / Math.sqrt(saa * sbb)
}

function track(amp: number, bpm: number, noise: number, seconds = 40, gainDrift = false) {
  const g = rng(5), cm = new ChestMotion()
  const truth: number[] = [], est: number[] = []
  let cum = 0
  for (let i = 0; i < seconds * 30; i++) {
    const t = i / 30
    const d = amp * Math.sin(2 * Math.PI * (bpm / 60) * t)
    const gain = gainDrift ? 1 + 0.05 * Math.sin(t * 0.5) : 1
    const s = cm.push(frame(d, noise, g, gain), W, H)
    if (s) cum += s.dy
    truth.push(d); est.push(cum)
  }
  return { truth, est }
}

describe('ChestMotion', () => {
  it('recovers a 0.3 px breathing movement with high correlation', () => {
    const { truth, est } = track(0.3, 15, 2)
    expect(corr(truth.slice(60), est.slice(60))).toBeGreaterThan(0.95)
  })

  it('recovers amplitude within 25%', () => {
    const { truth, est } = track(0.3, 15, 2)
    const range = (v: number[]) => Math.max(...v) - Math.min(...v)
    const ratio = range(est.slice(60)) / range(truth.slice(60))
    expect(ratio).toBeGreaterThan(0.75)
    expect(ratio).toBeLessThan(1.25)
  })

  it('ignores a slow global brightness drift (auto exposure)', () => {
    const { truth, est } = track(0.3, 15, 2, 40, true)
    expect(corr(truth.slice(60), est.slice(60))).toBeGreaterThan(0.9)
  })

  it('returns null for a textureless patch and for the first frame', () => {
    const cm = new ChestMotion()
    expect(cm.push(new Array(W * H).fill(100), W, H)).toBeNull()
    expect(cm.push(new Array(W * H).fill(100), W, H)).toBeNull()
  })

  it('breakChain starts a fresh chain', () => {
    const g = rng(1), cm = new ChestMotion()
    cm.push(frame(0, 0, g), W, H)
    cm.breakChain()
    expect(cm.push(frame(0.2, 0, g), W, H)).toBeNull()
  })

  it('gives a breath-rate estimate that beats jittery landmarks', () => {
    const g = rng(9)
    const cm = new ChestMotion()
    const chest = new BreathAnalyzer(), marks = new BreathAnalyzer()
    let cum = 0
    for (let i = 0; i < 90 * 30; i++) {
      const t = i / 30
      const d = 0.3 * Math.sin(2 * Math.PI * (14 / 60) * t) // true chest motion, px
      const s = cm.push(frame(d, 2, g), W, H)
      if (s) cum += s.dy
      chest.push(t, cum)
      // landmarks: the same breath buried in several px of per-frame snapping + slow wobble
      marks.push(t, d + 1.5 * g() + 2 * Math.sin(2 * Math.PI * 0.2 * t + 1) * Math.sin(t * 0.3))
    }
    const c = chest.read(), m = marks.read()
    console.log('chest  rate', c.rate?.toFixed(1), 'spec', c.rateSpectral?.toFixed(1), 'conf', c.confidence.toFixed(2))
    console.log('marks  rate', m.rate?.toFixed(1), 'spec', m.rateSpectral?.toFixed(1), 'conf', m.confidence.toFixed(2))
    expect(Math.abs(c.rate! - 14)).toBeLessThan(1.5)
    expect(c.confidence).toBeGreaterThan(0.5)
    expect(c.confidence).toBeGreaterThan(m.confidence)
  })
})

describe('ChestTotal', () => {
  it('does not jump when the crop scale changes (history is never rescaled)', () => {
    const total = new ChestTotal()
    let before = 0
    for (let i = 0; i < 100; i++) before = total.add(0.1, 0.002) // 100 steps at one scale
    const after = total.add(0, 0.125) // the crop window changes size; no motion this frame
    expect(after).toBeCloseTo(before, 9)
  })

  it('shows why the old approach spiked: converting the pixel total at the end rescales history', () => {
    let cumPx = 0
    for (let i = 0; i < 100; i++) cumPx += 0.1
    const oldBefore = cumPx * 0.002
    const oldAfter = cumPx * 0.125 // scale changed
    expect(oldAfter - oldBefore).toBeGreaterThan(1) // a jump of over one image height
  })

  it('adds up motion measured at different scales in consistent units', () => {
    const total = new ChestTotal()
    total.add(1, 0.002)
    total.add(1, 0.004)
    expect(total.value).toBeCloseTo(0.006, 9)
  })
})
