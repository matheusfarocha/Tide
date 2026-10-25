import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { fmt } from '../lib/metrics'
import { requestTilt, useTideCtl } from '../lib/tide'
import type { FeelCheck, MindState, Reading } from '../lib/types'

/* ---------- Icons (inline, stroke) ---------- */
const P = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  spark: 'M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z',
  chart: 'M5 20V10M12 20V4M19 20v-7',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1-4 4.5-6 8-6s7 2 8 6',
  back: 'M15 5l-7 7 7 7',
  close: 'M6 6l12 12M18 6L6 18',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  check: 'M5 12.5l4.5 4.5L19 7',
  sun: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 1v3M12 20v3M1 12h3M20 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  cloud: 'M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z',
  q: 'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 18h.01',
  leaf: 'M5 19C5 10 11 5 20 4c-1 9-6 15-15 15zM5 19l8-8',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  bars: 'M6 20v-6M12 20V9M18 20V4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
  wave: 'M2 12h4l2-5 4 10 3-7 2 2h5',
  pause: 'M8 5v14M16 5v14',
  play: 'M7 4l13 8-13 8z',
  stop: 'M6 6h12v12H6z',
  vol: 'M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6',
  mute: 'M4 9v6h4l5 4V5L8 9zM17 9l4 6M21 9l-4 6',
  mic: 'M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zM6 11a6 6 0 0 0 12 0M12 17v4',
  lock: 'M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3',
  share: 'M12 3v12M7 8l5-5 5 5M5 14v6h14v-6',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M10 17h4v4h-4z',
  lungs:'M12 4v8M12 12c-2 0-3-2-5-2-2 0-3 3-3 6 0 3 1 4 3 4 3 0 5-2 5-5M12 12c2 0 3-2 5-2 2 0 3 3 3 6 0 3-1 4-3 4-3 0-5-2-5-5',
}
export type IconName = keyof typeof P
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={P[name]} />
    </svg>
  )
}

/* ---------- Brand ---------- */

/** The mark: the moon that pulls the tide, over the water it moves. */
export function Mark({ size = 28, draw = false }: { size?: number; draw?: boolean }) {
  const id = useRef(`m${Math.random().toString(36).slice(2, 8)}`).current
  return (
    <svg className={`mark${draw ? ' mark--draw' : ''}`} width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <defs>
        <mask id={id}><rect width="48" height="48" fill="#fff" /><circle cx="28" cy="13" r="6.6" fill="#000" /></mask>
      </defs>
      <circle className="mark__moon" cx="24" cy="16" r="7" mask={`url(#${id})`} />
      <path className="mark__wave" d="M6 31 C11.5 26.5, 17.5 26.5, 24 31 S36.5 35.5, 42 31" pathLength={1} />
      <path className="mark__wave mark__wave--2" d="M11 38 C15 35, 19.5 35, 24 38 S33 41, 37 38" pathLength={1} />
    </svg>
  )
}

export function Lockup({ size = 22 }: { size?: number }) {
  return (
    <span className="lockup" aria-label="tide">
      <Mark size={size + 6} />
      <span className="lockup__word" style={{ fontSize: size }}>tide</span>
    </span>
  )
}

/* ---------- Layout ---------- */
export function Screen({ children, className = '' }: { children: ReactNode; dim?: boolean; className?: string }) {
  const tide = useTideCtl()
  // Every page change sends a tide sweeping up the screen and back.
  useEffect(() => { tide.pulse() }, [tide])
  return (
    <div className="shell">
      <main className={`screen ${className}`}>{children}</main>
    </div>
  )
}

export function TopBar({ back, close, title, right }: { back?: boolean | string; close?: string; title?: ReactNode; right?: ReactNode }) {
  const nav = useNavigate()
  return (
    <header className="topbar">
      <div className="topbar__side">
        {back && <button className="icon-btn" aria-label="Back" onClick={() => (typeof back === 'string' ? nav(back) : nav(-1))}><Icon name="back" /></button>}
        {close && <button className="icon-btn" aria-label="Close" onClick={() => nav(close)}><Icon name="close" /></button>}
      </div>
      <div className="topbar__title">{title}</div>
      <div className="topbar__side topbar__side--right">{right}</div>
    </header>
  )
}

/** Depth for each top-level screen. Going deeper raises the tide. */
export const DEPTHS: [string, string, number][] = [
  ['/', 'today', 0.42],
  ['/scores', 'scores', 0.6],
  ['/insights', 'coach', 0.66],
  ['/profile', 'you', 0.52],
]
export const depthOf = (path: string) => DEPTHS.find((d) => d[0] === path)?.[2] ?? 0.45

/** Navigation as a tide gauge on the right edge. */
export function TideGauge() {
  const { pathname } = useLocation()
  return (
    <nav className="gauge" aria-label="Sections">
      <span className="gauge__staff" aria-hidden />
      {DEPTHS.map(([to, label]) => (
        <NavLink key={to} to={to} end className={({ isActive }) => `gauge__mark${isActive ? ' is-active' : ''}`} aria-current={pathname === to ? 'page' : undefined}>
          <span className="gauge__label">{label}</span>
          <span className="gauge__tick" aria-hidden />
        </NavLink>
      ))}
    </nav>
  )
}
export const TabBar = TideGauge

/** Press and hold: the tide surges up, then fires. Enter/Space or a screen reader click fires at once. */
export function HoldButton({ label, onDone, ms = 1300 }: { label: string; onDone: () => void; ms?: number }) {
  const tide = useTideCtl()
  const [p, setP] = useState(0)
  const raf = useRef(0)
  const start = useRef(0)

  const stop = () => {
    cancelAnimationFrame(raf.current)
    setP(0)
    tide.surge(0)
  }
  const begin = () => {
    start.current = performance.now()
    const step = () => {
      const v = Math.min(1, (performance.now() - start.current) / ms)
      setP(v)
      tide.surge(v)
      if (v >= 1) {
        navigator.vibrate?.(18)
        tide.ripple(window.innerWidth / 2, 2.2)
        tide.surge(0)
        setP(0)
        onDone()
        return
      }
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
  }
  useEffect(() => () => { cancelAnimationFrame(raf.current); tide.surge(0) }, [tide])

  const C = 2 * Math.PI * 34
  return (
    <button
      className={`hold${p > 0 ? ' is-holding' : ''}`}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); requestTilt(); begin() }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onClick={(e) => { if (e.detail === 0) onDone() /* keyboard or screen reader */ }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg width="80" height="80" viewBox="0 0 80 80" aria-hidden>
        <circle cx="40" cy="40" r="34" className="hold__track" />
        <circle cx="40" cy="40" r="34" className="hold__fill" strokeDasharray={C} strokeDashoffset={C * (1 - p)} transform="rotate(-90 40 40)" />
        <circle cx="40" cy="40" r={6 + p * 10} className="hold__core" />
      </svg>
      <span className="hold__label">{label}</span>
    </button>
  )
}

/** A number that counts up like live telemetry. */
export function Counter({ value, ms = 1400 }: { value: number; ms?: number }) {
  const [v, setV] = useState(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(value); return }
    const t0 = performance.now()
    let raf = 0
    const step = () => {
      const p = Math.min(1, (performance.now() - t0) / ms)
      setV(Math.round(value * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, ms])
  return <>{v}</>
}

/** Text that writes itself in, like the coach is speaking. */
export function Typewriter({ text, speed = 16 }: { text: string; speed?: number }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setN(text.length); return }
    setN(0)
    const id = setInterval(() => setN((v) => (v >= text.length ? (clearInterval(id), v) : v + 1)), speed)
    return () => clearInterval(id)
  }, [text, speed])
  return <span aria-label={text}><span aria-hidden>{text.slice(0, n)}</span><span className="caret" aria-hidden /></span>
}

export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="tablist">
      {options.map(([v, l]) => (
        <button key={v} role="tab" aria-selected={v === value} className={`seg__btn${v === value ? ' is-on' : ''}`} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  )
}

/* ---------- Data marks ---------- */
export function Ring({ value, size = 120, stroke = 9, children }: { value: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id="ringg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8fe3c0" />
            <stop offset="1" stopColor="#8fb3ff" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.12)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke="url(#ringg)" strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))} transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset .8s ease' }} />
      </svg>
      <div className="ring__label">{children}</div>
    </div>
  )
}

export function Sparkline({ values, w = 120, h = 36, color = 'var(--accent)' }: { values: number[]; w?: number; h?: number; color?: string }) {
  if (values.length < 2) return <svg width={w} height={h} />
  const min = Math.min(...values), max = Math.max(...values)
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - ((v - min) / (max - min || 1)) * (h - 6)])
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="spark">
      <path d={`${d} L${w} ${h} L0 ${h} Z`} fill={color} opacity=".12" />
      <path d={d} stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** Scrolling breath wave on a canvas. Feed it with push(v) through the ref'd subscribe fn. */
export function LiveWave({ subscribe, height = 90, seconds = 12, color = '#7fe0ff' }: { subscribe: (cb: (v: number) => void) => () => void; height?: number; seconds?: number; color?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const buf = useRef<number[]>([])
  useEffect(() => {
    const unsub = subscribe((v) => {
      buf.current.push(v)
      if (buf.current.length > seconds * 10) buf.current.shift()
    })
    let raf = 0
    const draw = () => {
      const c = ref.current
      if (c) {
        const dpr = window.devicePixelRatio || 1
        const w = c.clientWidth, h = c.clientHeight
        if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr }
        const g = c.getContext('2d')!
        g.setTransform(dpr, 0, 0, dpr, 0, 0)
        g.clearRect(0, 0, w, h)
        const b = buf.current, n = seconds * 10
        g.beginPath()
        b.forEach((v, i) => {
          const x = ((i + n - b.length) / (n - 1)) * w
          const y = h / 2 - v * (h * 0.38)
          i ? g.lineTo(x, y) : g.moveTo(x, y)
        })
        g.strokeStyle = color
        g.lineWidth = 2.2
        g.shadowColor = color
        g.shadowBlur = 10
        g.stroke()
      }
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => { unsub(); cancelAnimationFrame(raf) }
  }, [subscribe, seconds, color])
  return <canvas ref={ref} className="livewave" style={{ height }} />
}

/* ---------- Calm Map ---------- */
export const stateColor: Record<MindState, string> = {
  settling: '#b0c4e8', focused: '#7fe7ff', drifting: '#ffb570', restless: '#ff7e8c',
}

type Lane = { key: 'rate' | 'stillness' | 'posture' | 'tension'; label: string; color: string; invert?: boolean }
const LANES: Lane[] = [
  { key: 'rate', label: 'Breathing', color: '#7fc4ff' },
  { key: 'stillness', label: 'Movement', color: '#f0a35e', invert: true },
  { key: 'posture', label: 'Posture', color: '#b293f5' },
  { key: 'tension', label: 'Face tension', color: '#f07a8a' },
]

export function CalmMap({ readings, feelChecks = [], lanes = ['rate', 'stillness', 'posture', 'tension'] }: { readings: Reading[]; feelChecks?: FeelCheck[]; lanes?: Lane['key'][] }) {
  const W = 320, laneH = 34, gap = 8, left = 74
  const shown = LANES.filter((l) => lanes.includes(l.key))
  const bandY = shown.length * (laneH + gap)
  const H = bandY + 40
  const T = Math.max(1, readings[readings.length - 1]?.t ?? 1)
  const x = (t: number) => left + (t / T) * (W - left - 6)

  return (
    <svg className="calmmap" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Calm Map of the session">
      {shown.map((l, li) => {
        const vals = readings.map((r) => (l.invert ? 1 - r[l.key] : r[l.key]))
        const min = Math.min(...vals), max = Math.max(...vals)
        const y0 = li * (laneH + gap)
        const pts = readings.map((r, i) => [x(r.t), y0 + laneH - 4 - ((vals[i] - min) / (max - min || 1)) * (laneH - 8)])
        const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
        return (
          <g key={l.key}>
            <text x={0} y={y0 + laneH / 2 + 4} className="calmmap__lbl">{l.label}</text>
            <line x1={left} x2={W - 6} y1={y0 + laneH} y2={y0 + laneH} stroke="rgba(255,255,255,.08)" />
            <path d={`${d} L${x(T)} ${y0 + laneH} L${left} ${y0 + laneH} Z`} fill={l.color} opacity=".14" />
            <path d={d} stroke={l.color} strokeWidth={1.5} fill="none" />
          </g>
        )
      })}
      <text x={0} y={bandY + 12} className="calmmap__lbl">Focus state</text>
      {readings.map((r, i) => {
        const next = readings[i + 1]?.t ?? T
        return <rect key={i} x={x(r.t)} y={bandY + 3} width={Math.max(0.5, x(next) - x(r.t))} height={12} fill={stateColor[r.state]} />
      })}
      {feelChecks.map((f, i) => (
        <g key={i}>
          <line x1={x(f.t)} x2={x(f.t)} y1={0} y2={bandY + 15} stroke="rgba(255,255,255,.5)" strokeDasharray="2 3" />
          <circle cx={x(f.t)} cy={bandY + 9} r={4} fill={f.answer === 'none' || f.unscored ? 'rgba(234,243,247,.4)' : f.match ? '#6fd6a8' : '#f07a8a'} stroke="#0f1428" />
        </g>
      ))}
      {[0, 0.25, 0.5, 0.75, 1].map((p) => (
        <text key={p} x={x(T * p)} y={H - 6} textAnchor={p === 0 ? 'start' : p === 1 ? 'end' : 'middle'} className="calmmap__tick">{fmt(Math.round(T * p))}</text>
      ))}
    </svg>
  )
}

export function Legend() {
  return (
    <div className="legend">
      {(['focused', 'drifting', 'settling'] as MindState[]).map((s) => (
        <span key={s}><i style={{ background: stateColor[s] }} />{s[0].toUpperCase() + s.slice(1)}</span>
      ))}
      <span><i className="dot dot--ok" />Felt it right</span>
      <span><i className="dot dot--miss" />Missed it</span>
    </div>
  )
}
