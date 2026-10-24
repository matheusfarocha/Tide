import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { setOceanBreath } from './ocean'
import type { MindState } from './types'

// The living tide behind every screen. Screens set the water level and mood; the session
// pushes breath values so the water rises and falls with the person's real breathing.
// Touch makes ripples, tilting the phone tilts the water, plankton glows on each inhale.

export type Mood = MindState | 'idle'

interface TideCtl {
  setLevel(level: number): void   // 0 = empty, 1 = full screen of water
  setMood(m: Mood): void
  pushBreath(v: number): void     // -1..1
  surge(v: number): void          // 0..1 extra rise (hold to begin)
  setCalm(on: boolean): void      // flatten the sea (Feel Check)
  pulse(): void                   // a tide sweep, used on page changes
  ripple(x?: number, strength?: number): void
}

interface TideState {
  level: number; mood: Mood; breath: number; lastPush: number; surge: number; calm: boolean
  pulseAt: number; ripples: { x: number; t0: number; s: number }[]; tilt: number
}

const Ctx = createContext<TideCtl | null>(null)

type RGB = [number, number, number]
const MOODS: Record<Mood, { line: RGB; top: RGB; deep: RGB }> = {
  idle:      { line: [127, 231, 255], top: [14, 58, 80],  deep: [3, 9, 18] },
  focused:   { line: [127, 231, 255], top: [14, 62, 84],  deep: [3, 10, 20] },
  settling:  { line: [176, 196, 232], top: [24, 42, 76],  deep: [4, 8, 22] },
  drifting:  { line: [255, 181, 112], top: [66, 46, 46],  deep: [12, 8, 12] },
  restless:  { line: [255, 126, 140], top: [70, 30, 44],  deep: [12, 6, 10] },
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
const rgb = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`

/** iOS only allows motion sensors after a tap, so call this from a pointer handler. */
export function requestTilt() {
  const D = (window as any).DeviceOrientationEvent
  if (D && typeof D.requestPermission === 'function') D.requestPermission().catch(() => {})
}

export function TideProvider({ children }: { children: ReactNode }) {
  const state = useRef<TideState>({ level: 0.4, mood: 'idle', breath: 0, lastPush: -1e9, surge: 0, calm: false, pulseAt: -1e9, ripples: [], tilt: 0 })
  const ctl = useMemo<TideCtl>(() => ({
    setLevel: (l) => { state.current.level = l },
    setMood: (m) => { state.current.mood = m },
    pushBreath: (v) => { state.current.breath = v; state.current.lastPush = performance.now() },
    surge: (v) => { state.current.surge = v },
    setCalm: (on) => { state.current.calm = on },
    pulse: () => { state.current.pulseAt = performance.now() },
    ripple: (x = window.innerWidth / 2, s = 1) => {
      const r = state.current.ripples
      r.push({ x, t0: performance.now(), s })
      if (r.length > 8) r.shift()
    },
  }), [])

  useEffect(() => {
    const down = (e: PointerEvent) => ctl.ripple(e.clientX, 0.8)
    const orient = (e: DeviceOrientationEvent) => { if (e.gamma != null) state.current.tilt = Math.max(-1, Math.min(1, e.gamma / 40)) }
    window.addEventListener('pointerdown', down, { passive: true })
    window.addEventListener('deviceorientation', orient)
    return () => { window.removeEventListener('pointerdown', down); window.removeEventListener('deviceorientation', orient) }
  }, [ctl])

  return (
    <Ctx.Provider value={ctl}>
      <TideCanvas state={state} />
      {children}
    </Ctx.Provider>
  )
}

export function useTideCtl() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useTideCtl outside TideProvider')
  return c
}

/** Declare this screen's water level and mood. */
export function useTide(level: number, mood: Mood = 'idle') {
  const t = useTideCtl()
  useEffect(() => { t.setLevel(level) }, [t, level])
  useEffect(() => { t.setMood(mood) }, [t, mood])
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const STARS = Array.from({ length: 60 }, () => ({ x: Math.random(), y: Math.random() * 0.55, r: rand(0.2, 1.2), p: rand(0, 6) }))
const PLANKTON = Array.from({ length: 70 }, () => ({ x: Math.random(), d: Math.random(), s: rand(-1, 1), p: rand(0, 6), big: Math.random() < 0.12 }))

function TideCanvas({ state }: { state: React.MutableRefObject<TideState> }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current!
    const g = c.getContext('2d')!
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let level = state.current.level
    let breath = 0, surge = 0, calm = 0, tilt = 0
    let col = MOODS.idle
    let lastSound = 0

    const frame = (ms: number) => {
      const s = state.current
      const t = (ms / 1000) * (reduce ? 0.35 : 1)
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const W = c.clientWidth, H = c.clientHeight
      if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr) }
      g.setTransform(dpr, 0, 0, dpr, 0, 0)

      // With no live breath for 1.5 s, the sea breathes on its own at 6 breaths/min.
      const live = ms - s.lastPush < 1500
      const target = live ? s.breath : Math.sin((ms / 1000) * Math.PI * 2 * (6 / 60)) * 0.7
      breath += (target - breath) * 0.08
      level += (s.level - level) * 0.035
      surge += (s.surge - surge) * 0.12
      calm += ((s.calm ? 1 : 0) - calm) * 0.05
      tilt += (s.tilt - tilt) * 0.06
      const pAge = (ms - s.pulseAt) / 1100
      const pulse = pAge >= 0 && pAge < 1 ? Math.sin(Math.PI * pAge) * 0.16 : 0
      const m = MOODS[s.mood]
      col = { line: mix(col.line, m.line, 0.03), top: mix(col.top, m.top, 0.03), deep: mix(col.deep, m.deep, 0.03) }
      const inhale = (breath + 1) / 2

      if (ms - lastSound > 120) { setOceanBreath(breath); lastSound = ms }
      s.ripples = s.ripples.filter((r) => ms - r.t0 < 4500)

      // Sky, stars, moon
      const sky = g.createLinearGradient(0, 0, 0, H)
      sky.addColorStop(0, '#02040a')
      sky.addColorStop(1, rgb(mix([10, 16, 32], col.top, 0.3)))
      g.fillStyle = sky
      g.fillRect(0, 0, W, H)
      for (const st of STARS) {
        g.fillStyle = `rgba(220,235,255,${0.1 + 0.2 * (0.5 + 0.5 * Math.sin(t * 0.7 + st.p))})`
        g.beginPath(); g.arc(st.x * W, st.y * H, st.r, 0, 7); g.fill()
      }
      const mx = W * 0.8, my = Math.max(70, H * 0.11)
      const halo = g.createRadialGradient(mx, my, 0, mx, my, 140)
      halo.addColorStop(0, 'rgba(225,240,255,.16)')
      halo.addColorStop(1, 'rgba(225,240,255,0)')
      g.fillStyle = halo
      g.fillRect(mx - 140, my - 140, 280, 280)
      g.fillStyle = 'rgba(236,244,255,.92)'
      g.beginPath(); g.arc(mx, my, 13, 0, 7); g.fill()
      g.fillStyle = 'rgba(2,4,10,.55)'
      g.beginPath(); g.arc(mx + 5, my - 3, 12, 0, 7); g.fill()

      const base = H * (1 - Math.min(1.05, level + surge * 0.55 + pulse)) - breath * H * 0.04
      const wild = (1 - calm * 0.85) * (1 + Math.abs(breath) * 0.25) * (s.mood === 'drifting' || s.mood === 'restless' ? 1.5 : 1)
      const slope = tilt * 0.32

      const rippleAt = (x: number) => {
        let h = 0
        for (const r of s.ripples) {
          const age = (ms - r.t0) / 1000
          const d = Math.abs(x - r.x)
          if (d > age * 190) continue
          h += 11 * r.s * Math.exp(-age * 0.9) * Math.exp(-d / 240) * Math.sin(d * 0.055 - age * 8)
        }
        return h * (1 - calm * 0.6)
      }

      const layers = [
        { off: -30, amp: 9, k: 0.007, sp: 0.22, ph: 0, a: 0.28, rip: 0.3 },
        { off: -14, amp: 12, k: 0.011, sp: -0.31, ph: 2, a: 0.5, rip: 0.6 },
        { off: 0, amp: 15, k: 0.005, sp: 0.17, ph: 4, a: 1, rip: 1 },
      ]
      const yAt = (L: typeof layers[0], x: number) =>
        base + L.off + (x - W / 2) * slope + rippleAt(x) * L.rip +
        L.amp * wild * (Math.sin(x * L.k + t * L.sp + L.ph) * 0.62 + Math.sin(x * L.k * 2.3 - t * L.sp * 1.7 + L.ph * 2) * 0.38)

      const front = layers[layers.length - 1]
      layers.forEach((L, i) => {
        g.beginPath()
        g.moveTo(0, H)
        for (let x = 0; x <= W + 6; x += 6) g.lineTo(x, yAt(L, x))
        g.lineTo(W, H)
        g.closePath()
        const top = base + L.off - 20
        const fill = g.createLinearGradient(0, top, 0, H)
        fill.addColorStop(0, rgb(col.top, L.a))
        fill.addColorStop(1, rgb(col.deep, Math.min(1, L.a + 0.2)))
        g.fillStyle = fill
        g.fill()
        if (L !== front) {
          g.strokeStyle = rgb(col.line, 0.16)
          g.lineWidth = 1
          g.beginPath()
          for (let x = 0; x <= W + 6; x += 6) x ? g.lineTo(x, yAt(L, x)) : g.moveTo(x, yAt(L, x))
          g.stroke()
        }
        if (i === 1) {
          // Moonlight on the water: a broken column of light under the moon.
          for (let j = 0; j < 20; j++) {
            const y = yAt(front, mx) + 10 + j * j * 1.5
            if (y > H) break
            const w = (14 + j * 3.2) * (0.5 + 0.5 * Math.sin(t * 1.9 + j * 1.7))
            g.fillStyle = `rgba(230,242,255,${0.28 * (1 - j / 20)})`
            g.fillRect(mx - w / 2 + Math.sin(t * 1.3 + j) * 5, y, w, 1.2)
          }
        }
      })

      // Bioluminescent plankton: brighter on each inhale, scattered when the mind drifts.
      const jitter = s.mood === 'drifting' || s.mood === 'restless' ? 6 : 1.5
      for (const p of PLANKTON) {
        const x = ((p.x + t * 0.004 * p.s + 1) % 1) * W + Math.sin(t * 0.6 + p.p) * jitter * 3
        const surfaceY = yAt(front, x)
        const y = surfaceY + 24 + p.d * Math.max(0, H - surfaceY - 30) - inhale * 10 * (1 - p.d) + Math.sin(t * 0.9 + p.p) * jitter
        if (y < surfaceY + 8) continue
        const glow = (0.12 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.4 + p.p))) * (0.45 + 0.75 * inhale) * (1 - p.d * 0.5)
        if (p.big) {
          g.fillStyle = rgb(col.line, glow * 0.18)
          g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill()
        }
        g.fillStyle = rgb(col.line, glow)
        g.beginPath(); g.arc(x, y, p.big ? 1.6 : 0.9, 0, 7); g.fill()
      }

      // The surface line, with a soft glow.
      g.save()
      g.beginPath()
      for (let x = 0; x <= W + 6; x += 6) x ? g.lineTo(x, yAt(front, x)) : g.moveTo(x, yAt(front, x))
      g.strokeStyle = rgb(col.line, 0.95)
      g.lineWidth = 1.4
      g.shadowColor = rgb(col.line, 1)
      g.shadowBlur = 18
      g.stroke()
      g.lineWidth = 4
      g.shadowBlur = 0
      g.strokeStyle = rgb(col.line, 0.08)
      g.stroke()
      g.restore()

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [state])

  return <canvas ref={ref} className="tide-canvas" aria-hidden />
}
