import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { SignalSource } from '../lib/signal'
import type { Frame } from '../signal/types'

// The live camera as the background of a breathing screen, with the chest overlay drawn from the
// signal's own tracked points. It reuses the signal's camera stream, so there is only ever one camera.
// Pair with useSheerTide() so the tide becomes a clear layer over the video.

const TEAL = '127,231,255'
type P = { x: number; y: number }

export function LiveBody({ signal }: { signal: SignalSource }) {
  const video = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [hasVideo, setHasVideo] = useState(false)

  useEffect(() => {
    let frame: Frame | null = null
    let frameAt = 0
    let roi: { x: number; y: number; w: number; h: number } | null = null
    let b = 0
    let raf = 0
    const t0 = performance.now()
    const offs = [
      signal.onFrame?.((_raw, used) => { frame = used; frameAt = performance.now() }),
      signal.onChest?.((c) => { roi = c.roi }),
      signal.onBreath((v) => { b = v }),
    ]
    // The signal opens the camera asynchronously; attach its stream once it exists.
    const poll = setInterval(() => {
      const s = signal.stream?.() ?? null
      const v = video.current
      if (!v) return
      if (s && v.srcObject !== s) { v.srcObject = s; v.play().catch(() => {}); setHasVideo(true) }
      if (!s && v.srcObject) { v.srcObject = null; setHasVideo(false) }
    }, 300)

    const loop = (now: number) => {
      const c = canvas.current, v = video.current
      if (c && v) {
        const dpr = Math.min(2, window.devicePixelRatio || 1)
        const W = c.clientWidth, H = c.clientHeight
        if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr) }
        const g = c.getContext('2d')!
        g.setTransform(dpr, 0, 0, dpr, 0, 0)
        g.clearRect(0, 0, W, H)

        const live = frame && now - frameAt < 600 && v.videoWidth > 0
        const mode = signal.mode?.() ?? 'demo'
        if (live) {
          // Frame points are in image heights with x scaled by aspect; the video is cover-fit and mirrored.
          const vw = v.videoWidth, vh = v.videoHeight, aspect = vw / vh
          const s = Math.max(W / vw, H / vh)
          const dx = (W - vw * s) / 2, dy = (H - vh * s) / 2
          const toScreen = (p: P) => ({ x: W - ((p.x / aspect) * vw * s + dx), y: p.y * vh * s + dy })
          if (roi) {
            const a = toScreen({ x: roi.x * aspect, y: roi.y }), z = toScreen({ x: (roi.x + roi.w) * aspect, y: roi.y + roi.h })
            drawRoi(g, Math.min(a.x, z.x), a.y, Math.abs(z.x - a.x), z.y - a.y)
          }
          drawChest(g, toScreen(frame!.shoulderL), toScreen(frame!.shoulderR), toScreen(frame!.nose), b, now)
        } else if (mode === 'demo' || (!signal.stream?.() && now - t0 > 2500)) {
          // No camera: a demo body breathing with the fake signal, so the screen still reads.
          const lift = b * H * 0.006
          drawChest(g, { x: W * 0.29, y: H * 0.4 - lift }, { x: W * 0.71, y: H * 0.4 - lift }, { x: W * 0.5, y: H * 0.23 }, b, now)
        } else {
          drawGuide(g, W, H, now)
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); clearInterval(poll); offs.forEach((o) => o?.()) }
  }, [signal])

  // Portalled to <body> so it sits behind the tide canvas instead of inside the page layer.
  return createPortal(
    <div className={`livebody${hasVideo ? ' has-video' : ''}`} aria-hidden>
      <video ref={video} className="livebody__video" autoPlay playsInline muted />
      <canvas ref={canvas} className="livebody__overlay" />
      <div className="livebody__shade" />
    </div>,
    document.body,
  )
}

/** Compact glass panel: the live chest wave, which way the chest is moving, and the rate. */
export function ChestPanel({ signal, rate }: { signal: SignalSource; rate?: number | null }) {
  const wave = useRef<HTMLCanvasElement>(null)
  const [rising, setRising] = useState<boolean | null>(null)
  const [source, setSource] = useState<'chest' | 'landmarks' | null>(null)

  useEffect(() => {
    const buf: number[] = []
    let last = 0
    let raf = 0
    const offB = signal.onBreath((v) => {
      buf.push(v)
      if (buf.length > 120) buf.shift()
      const up = v > last + 0.01 ? true : v < last - 0.01 ? false : null
      if (up !== null) setRising((old) => (old === up ? old : up))
      last = v
    })
    const offRaw = signal.onRaw?.((r) => setSource((old) => (old === r.breathSource ? old : r.breathSource))) ?? (() => {})
    const draw = () => {
      const c = wave.current
      if (c) {
        const dpr = Math.min(2, window.devicePixelRatio || 1)
        const W = c.clientWidth, H = c.clientHeight
        if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr) }
        const g = c.getContext('2d')!
        g.setTransform(dpr, 0, 0, dpr, 0, 0)
        g.clearRect(0, 0, W, H)
        g.strokeStyle = 'rgba(234,243,247,0.1)'
        g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke()
        g.beginPath()
        buf.forEach((v, i) => { const x = (i / 119) * W, y = H / 2 - v * H * 0.4; i ? g.lineTo(x, y) : g.moveTo(x, y) })
        g.strokeStyle = `rgba(${TEAL},0.95)`
        g.lineWidth = 1.8
        g.shadowColor = `rgba(${TEAL},1)`
        g.shadowBlur = 8
        g.stroke()
        g.shadowBlur = 0
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf); offB(); offRaw() }
  }, [signal])

  const mode = signal.mode?.()
  return (
    <div className="chest-panel">
      <div className="chest-panel__head">
        <span className="eyebrow">{mode === 'demo' ? 'chest · demo' : source === 'landmarks' ? 'chest · shoulders' : 'chest'}</span>
        <span className={`chest-panel__phase${rising ? ' is-in' : ''}`}>{rising === null ? '—' : rising ? 'rising ↑' : 'falling ↓'}</span>
        <span className="mono small">{rate ? `${rate.toFixed(1)}/min` : 'reading…'}</span>
      </div>
      <canvas ref={wave} className="chest-panel__wave" aria-label="Live chest movement" />
    </div>
  )
}

/* ---------- Drawing ---------- */

function drawGuide(g: CanvasRenderingContext2D, W: number, H: number, now: number) {
  const cx = W / 2, cy = H * 0.3, r = Math.min(W, H) * 0.1
  g.save()
  g.strokeStyle = `rgba(${TEAL},${0.35 + 0.25 * Math.sin(now / 400)})`
  g.setLineDash([6, 8])
  g.lineWidth = 1.5
  g.beginPath(); g.ellipse(cx, cy, r * 0.8, r, 0, 0, 7); g.stroke()
  g.beginPath()
  g.moveTo(cx - W * 0.36, H * 0.62)
  g.quadraticCurveTo(cx - W * 0.3, cy + r * 1.6, cx - r * 0.5, cy + r * 1.35)
  g.moveTo(cx + W * 0.36, H * 0.62)
  g.quadraticCurveTo(cx + W * 0.3, cy + r * 1.6, cx + r * 0.5, cy + r * 1.35)
  g.stroke()
  g.restore()
}

/** The chest-tracking window the signal reads pixel motion from, as corner brackets. */
function drawRoi(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const k = Math.min(14, w / 4, h / 4)
  g.save()
  g.strokeStyle = 'rgba(234,243,247,0.75)'
  g.lineWidth = 1.2
  g.beginPath()
  for (const [px, py, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
    g.moveTo(px + sx * k, py); g.lineTo(px, py); g.lineTo(px, py + sy * k)
  }
  g.stroke()
  g.font = '500 9px "Geist Mono", monospace'
  g.fillStyle = 'rgba(234,243,247,0.8)'
  g.fillText('CHEST TRACKING', x, y - 6)
  g.restore()
}

function drawChest(g: CanvasRenderingContext2D, L: P, R: P, N: P | null, b: number, now: number) {
  const sw = Math.hypot(R.x - L.x, R.y - L.y)
  if (sw < 20) return
  const dirX = (R.x - L.x) / sw, dirY = (R.y - L.y) / sw
  let down = { x: -dirY, y: dirX }
  if (down.y < 0) down = { x: -down.x, y: -down.y }
  const depth = sw * 0.78
  const lift = b * sw * 0.035 // the chest rises and widens on the inhale
  const widen = 1 + b * 0.03
  const mid = { x: (L.x + R.x) / 2, y: (L.y + R.y) / 2 }
  // u: -1..1 across the chest, v: 0 (shoulders) .. 1 (lower chest)
  const at = (u: number, v: number): P => {
    const half = (sw / 2) * (1 - v * 0.18) * widen
    const bulge = Math.sin(v * Math.PI) * lift * (1 - u * u * 0.6)
    return {
      x: mid.x + dirX * u * half + down.x * (v * depth) - down.x * bulge,
      y: mid.y + dirY * u * half + down.y * (v * depth) - down.y * (bulge + lift * 0.4),
    }
  }
  const row = (v: number) => { g.beginPath(); for (let i = 0; i <= 16; i++) { const p = at(-1 + (i / 16) * 2, v); i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y) } }

  g.save()
  g.lineCap = 'round'

  // Chest zone
  g.beginPath()
  for (let i = 0; i <= 20; i++) { const p = at(-1 + (i / 20) * 2, 0); i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y) }
  for (let i = 0; i <= 20; i++) { const p = at(1, i / 20); g.lineTo(p.x, p.y) }
  for (let i = 20; i >= 0; i--) { const p = at(-1 + (i / 20) * 2, 1); g.lineTo(p.x, p.y) }
  for (let i = 20; i >= 0; i--) { const p = at(-1, i / 20); g.lineTo(p.x, p.y) }
  g.closePath()
  const fill = g.createLinearGradient(mid.x, mid.y, mid.x + down.x * depth, mid.y + down.y * depth)
  fill.addColorStop(0, `rgba(${TEAL},${0.18 + Math.max(0, b) * 0.14})`)
  fill.addColorStop(1, `rgba(${TEAL},0.02)`)
  g.fillStyle = fill
  g.fill()
  g.strokeStyle = `rgba(${TEAL},0.6)`
  g.lineWidth = 1.2
  g.stroke()

  // Breathing mesh: rows spread and bow outward as the chest fills.
  g.strokeStyle = `rgba(${TEAL},${0.3 + Math.max(0, b) * 0.3})`
  g.lineWidth = 1
  for (let r = 1; r < 7; r++) { row((r / 7) * (1 + b * 0.04)); g.stroke() }
  for (let ci = 1; ci < 6; ci++) {
    const u = -1 + (ci / 6) * 2
    g.beginPath()
    for (let i = 0; i <= 12; i++) { const p = at(u, i / 12); i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y) }
    g.stroke()
  }

  // Scan line sweeping down the chest
  g.strokeStyle = `rgba(${TEAL},0.75)`
  g.lineWidth = 1.5
  g.shadowColor = `rgba(${TEAL},1)`
  g.shadowBlur = 10
  row((now / 2200) % 1); g.stroke()

  // Shoulder line and joints
  g.lineWidth = 2.5
  g.shadowBlur = 16
  g.strokeStyle = `rgba(${TEAL},0.95)`
  g.beginPath(); g.moveTo(L.x, L.y - lift); g.lineTo(R.x, R.y - lift); g.stroke()
  g.shadowBlur = 0
  for (const p of [L, R]) {
    g.fillStyle = '#eaf3f7'
    g.beginPath(); g.arc(p.x, p.y - lift, 4.5, 0, 7); g.fill()
    g.strokeStyle = `rgba(${TEAL},0.6)`
    g.lineWidth = 1
    g.beginPath(); g.arc(p.x, p.y - lift, 11 + Math.max(0, b) * 5, 0, 7); g.stroke()
  }

  // Rise arrows on the inhale
  if (b > 0.15) {
    g.fillStyle = `rgba(${TEAL},${Math.min(1, b)})`
    for (const p of [L, R]) {
      const y = p.y - lift - 26 - b * 8
      g.beginPath(); g.moveTo(p.x, y - 7); g.lineTo(p.x - 6, y + 3); g.lineTo(p.x + 6, y + 3); g.closePath(); g.fill()
    }
  }

  // Neck and head ring
  if (N) {
    g.setLineDash([3, 5])
    g.strokeStyle = 'rgba(234,243,247,0.5)'
    g.lineWidth = 1
    g.beginPath(); g.moveTo(mid.x, mid.y - lift); g.lineTo(N.x, N.y + sw * 0.12); g.stroke()
    g.setLineDash([])
    g.beginPath(); g.ellipse(N.x, N.y - sw * 0.04, sw * 0.24, sw * 0.3, 0, 0, 7); g.stroke()
  }

  // Live tag beside the outer shoulder
  const outer = L.x > R.x ? L : R
  g.font = '500 10px "Geist Mono", monospace'
  g.fillStyle = `rgba(${TEAL},0.95)`
  g.fillText(`${b >= 0 ? 'rise' : 'fall'} ${Math.abs(b * 100).toFixed(0)}%`, outer.x + 16, outer.y - lift + 4)
  g.restore()
}
