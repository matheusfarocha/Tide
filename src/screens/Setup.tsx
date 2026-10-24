import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, TopBar } from '../components/ui'
import { BreathTracker, LM, loadPose, visible, type Landmark } from '../lib/pose'

// Full-screen camera with a live chest overlay. MediaPipe finds the shoulders on the phone;
// a mesh over the chest expands with each breath. If the camera is blocked, a demo body runs.

type Status = 'starting' | 'loading' | 'searching' | 'adjust' | 'locked' | 'demo' | 'no-tracking'
const CHECKS = ['face', 'shoulders', 'light', 'steady'] as const
type Check = typeof CHECKS[number]

const TEAL = '127,231,255'

export function Setup() {
  const nav = useNavigate()
  const video = useRef<HTMLVideoElement>(null)
  const overlay = useRef<HTMLCanvasElement>(null)
  const wave = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<Status>('starting')
  const [checks, setChecks] = useState<Record<Check, boolean>>({ face: false, shoulders: false, light: false, steady: false })
  const [rate, setRate] = useState<number | null>(null)
  const [inhale, setInhale] = useState<boolean | null>(null)

  useEffect(() => {
    let stream: MediaStream | null = null
    let raf = 0
    let alive = true
    let demo = false
    let landmarker: Awaited<ReturnType<typeof loadPose>> | null = null
    const tracker = new BreathTracker()
    const waveBuf: number[] = []
    const mids: { t: number; x: number; y: number }[] = []
    let light = false
    let lastLight = 0
    let lastUi = 0
    const probe = document.createElement('canvas')
    probe.width = 16; probe.height = 12

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
        if (!alive) return
        video.current!.srcObject = stream
        await video.current!.play().catch(() => {})
        setStatus('loading')
        try {
          landmarker = await loadPose()
          if (alive) setStatus('searching')
        } catch {
          if (alive) setStatus('no-tracking')
        }
      } catch {
        demo = true
        light = true
        if (alive) setStatus('demo')
      }
      raf = requestAnimationFrame(loop)
    }

    // A breathing body for when the camera isn't available (previews, denied permission).
    const fakeBody = (t: number): Landmark[] => {
      const b = Math.sin((t / 1000) * Math.PI * 2 * (6.5 / 60))
      const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0 }))
      const sway = Math.sin(t / 2300) * 0.004
      lm[LM.nose] = { x: 0.5 + sway, y: 0.22, z: 0, visibility: 0.99 }
      lm[LM.lEar] = { x: 0.43 + sway, y: 0.21, z: 0, visibility: 0.9 }
      lm[LM.rEar] = { x: 0.57 + sway, y: 0.21, z: 0, visibility: 0.9 }
      lm[LM.lShoulder] = { x: 0.29, y: 0.39 - b * 0.006, z: 0, visibility: 0.98 }
      lm[LM.rShoulder] = { x: 0.71, y: 0.39 - b * 0.006, z: 0, visibility: 0.98 }
      lm[LM.lElbow] = { x: 0.2, y: 0.64, z: 0, visibility: 0.7 }
      lm[LM.rElbow] = { x: 0.8, y: 0.64, z: 0, visibility: 0.7 }
      lm[LM.lHip] = { x: 0.36, y: 0.98, z: 0, visibility: 0.4 }
      lm[LM.rHip] = { x: 0.64, y: 0.98, z: 0, visibility: 0.4 }
      return lm
    }

    const loop = (now: number) => {
      if (!alive) return
      const c = overlay.current, v = video.current
      if (!c || !v) { raf = requestAnimationFrame(loop); return }
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const W = c.clientWidth, H = c.clientHeight
      if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr) }
      const g = c.getContext('2d')!
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.clearRect(0, 0, W, H)

      let lms: Landmark[] | null = null
      if (demo) lms = fakeBody(now)
      else if (landmarker && v.readyState >= 2 && v.videoWidth) {
        try { lms = landmarker.detectForVideo(v, now).landmarks[0] ?? null } catch { lms = null }
        if (now - lastLight > 1000) {
          const p = probe.getContext('2d', { willReadFrequently: true })!
          p.drawImage(v, 0, 0, 16, 12)
          const d = p.getImageData(0, 0, 16, 12).data
          let sum = 0
          for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
          light = sum / (d.length / 4) > 55
          lastLight = now
        }
      }

      // Map normalized landmarks to screen space (video is object-fit: cover and mirrored).
      const map = (l: Landmark) => {
        if (demo || !v.videoWidth) return { x: l.x * W, y: l.y * H }
        const s = Math.max(W / v.videoWidth, H / v.videoHeight)
        const dx = (W - v.videoWidth * s) / 2, dy = (H - v.videoHeight * s) / 2
        return { x: W - (l.x * v.videoWidth * s + dx), y: l.y * v.videoHeight * s + dy }
      }

      const ls = lms?.[LM.lShoulder], rs = lms?.[LM.rShoulder], nose = lms?.[LM.nose]
      const haveShoulders = visible(ls) && visible(rs)
      let b = 0
      if (lms && haveShoulders) {
        const midY = (ls!.y + rs!.y) / 2, midX = (ls!.x + rs!.x) / 2
        tracker.push(now, midY)
        b = tracker.value()
        mids.push({ t: now, x: midX, y: midY })
        while (mids.length && now - mids[0].t > 1500) mids.shift()
        drawChest(g, lms, map, b, now)
      } else {
        drawGuide(g, W, H, now)
      }
      waveBuf.push(b)
      if (waveBuf.length > 300) waveBuf.shift()
      drawWave(wave.current, waveBuf)

      if (now - lastUi > 250) {
        lastUi = now
        const inFrame = haveShoulders && [ls!, rs!].every((l) => l.x > 0.03 && l.x < 0.97 && l.y > 0.05 && l.y < 0.92)
        const spread = mids.length > 5 ? Math.max(...mids.map((m) => Math.hypot(m.x - mids[0].x, m.y - mids[0].y))) : 1
        const next = { face: visible(nose), shoulders: inFrame, light, steady: inFrame && spread < 0.03 }
        setChecks((old) => (CHECKS.every((k) => old[k] === next[k]) ? old : next))
        setRate(tracker.rate())
        setInhale(haveShoulders ? b > 0.05 : null)
        if (!demo && landmarker) setStatus(!lms ? 'searching' : CHECKS.every((k) => next[k]) ? 'locked' : 'adjust')
      }
      raf = requestAnimationFrame(loop)
    }

    start()
    return () => { alive = false; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()) }
  }, [])

  const allOk = CHECKS.every((k) => checks[k])
  const firstMissing = CHECKS.find((k) => !checks[k])
  const statusText: Record<Status, string> = {
    starting: 'opening camera…',
    loading: 'warming up the lens…',
    searching: 'finding you…',
    adjust: firstMissing === 'face' ? 'bring your face into view' : firstMissing === 'shoulders' ? 'step back so both shoulders show' : firstMissing === 'light' ? 'find a brighter spot' : 'hold still for a moment',
    locked: 'locked on · breathe normally',
    demo: 'demo body · camera unavailable',
    'no-tracking': 'camera on · tracking unavailable',
  }

  return (
    <div className="cam">
      <video ref={video} className="cam__video" autoPlay playsInline muted />
      <canvas ref={overlay} className="cam__overlay" aria-hidden />
      <div className="cam__shade" aria-hidden />

      <div className="cam__ui">
        <TopBar back title="02 · frame" right={<button className="link" onClick={() => nav('/calibrate')}>skip</button>} />

        <div className={`glass cam__status${status === 'locked' ? ' is-locked' : ''}`} role="status">
          <span className="cam__dot" />{statusText[status]}
        </div>

        <div className="spacer" />

        <div className="glass cam__panel">
          <div className="cam__breath-head">
            <span className="eyebrow">chest</span>
            <span className={`cam__phase${inhale ? ' is-in' : ''}`}>{inhale === null ? '—' : inhale ? 'rising ↑' : 'falling ↓'}</span>
            <span className="mono small">{rate ? `${rate.toFixed(1)}/min` : 'reading…'}</span>
          </div>
          <canvas ref={wave} className="cam__wave" aria-label="Live chest movement" />
          <div className="cam__checks">
            {CHECKS.map((k) => (
              <span key={k} className={checks[k] ? 'is-ok' : ''}><i>{checks[k] && <Icon name="check" size={9} />}</i>{k}</span>
            ))}
          </div>
        </div>
        <p className="fine center"><Icon name="lock" size={12} /> processed on this phone · never stored</p>
        <button className="btn btn--primary" onClick={() => nav('/calibrate')}>
          {allOk || status === 'demo' || status === 'no-tracking' ? 'looks good' : 'continue anyway'} <Icon name="arrow" size={16} />
        </button>
      </div>
    </div>
  )
}

/* ---------- Drawing ---------- */

type Pt = { x: number; y: number }

function drawGuide(g: CanvasRenderingContext2D, W: number, H: number, now: number) {
  const cx = W / 2, cy = H * 0.36, r = Math.min(W, H) * 0.11
  g.save()
  g.strokeStyle = `rgba(${TEAL},${0.35 + 0.25 * Math.sin(now / 400)})`
  g.setLineDash([6, 8])
  g.lineWidth = 1.5
  g.beginPath(); g.ellipse(cx, cy, r * 0.8, r, 0, 0, 7); g.stroke()
  g.beginPath()
  g.moveTo(cx - W * 0.36, H * 0.72)
  g.quadraticCurveTo(cx - W * 0.3, cy + r * 1.6, cx - r * 0.5, cy + r * 1.35)
  g.moveTo(cx + W * 0.36, H * 0.72)
  g.quadraticCurveTo(cx + W * 0.3, cy + r * 1.6, cx + r * 0.5, cy + r * 1.35)
  g.stroke()
  g.restore()
}

function drawChest(g: CanvasRenderingContext2D, lm: Landmark[], map: (l: Landmark) => Pt, b: number, now: number) {
  const L = map(lm[LM.lShoulder]), R = map(lm[LM.rShoulder])
  const sw = Math.hypot(R.x - L.x, R.y - L.y)
  const down = { x: -(R.y - L.y) / sw, y: (R.x - L.x) / sw }
  if (down.y < 0) { down.x *= -1; down.y *= -1 }
  const hipsOk = visible(lm[LM.lHip], 0.5) && visible(lm[LM.rHip], 0.5)
  const depth = hipsOk ? Math.hypot(map(lm[LM.lHip]).y - L.y, 0) * 0.55 : sw * 0.78
  const lift = b * sw * 0.035 // the chest rises and widens on the inhale
  const widen = 1 + b * 0.03
  const mid = { x: (L.x + R.x) / 2, y: (L.y + R.y) / 2 }
  const at = (u: number, v: number): Pt => {
    // u: -1 (left) .. 1 (right) across the chest, v: 0 (shoulders) .. 1 (lower chest)
    const half = (sw / 2) * (1 - v * 0.18) * widen
    const bulge = Math.sin(v * Math.PI) * lift * (1 - u * u * 0.6)
    const dirX = (R.x - L.x) / sw, dirY = (R.y - L.y) / sw
    return {
      x: mid.x + dirX * u * half + down.x * (v * depth) - down.x * bulge,
      y: mid.y + dirY * u * half + down.y * (v * depth) - down.y * (bulge + lift * 0.4),
    }
  }

  g.save()
  g.lineCap = 'round'

  // Chest zone fill
  g.beginPath()
  for (let i = 0; i <= 20; i++) { const p = at(-1 + (i / 20) * 2, 0); i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y) }
  for (let i = 0; i <= 20; i++) { const p = at(1, i / 20); g.lineTo(p.x, p.y) }
  for (let i = 20; i >= 0; i--) { const p = at(-1 + (i / 20) * 2, 1); g.lineTo(p.x, p.y) }
  for (let i = 20; i >= 0; i--) { const p = at(-1, i / 20); g.lineTo(p.x, p.y) }
  g.closePath()
  const fill = g.createLinearGradient(mid.x, mid.y, mid.x + down.x * depth, mid.y + down.y * depth)
  fill.addColorStop(0, `rgba(${TEAL},${0.16 + Math.max(0, b) * 0.12})`)
  fill.addColorStop(1, `rgba(${TEAL},0.02)`)
  g.fillStyle = fill
  g.fill()
  g.strokeStyle = `rgba(${TEAL},0.55)`
  g.lineWidth = 1.2
  g.stroke()

  // Breathing mesh: rows spread apart and bow outward as the chest fills.
  g.strokeStyle = `rgba(${TEAL},${0.28 + Math.max(0, b) * 0.3})`
  g.lineWidth = 1
  for (let r = 1; r < 7; r++) {
    const v = (r / 7) * (1 + b * 0.04)
    g.beginPath()
    for (let i = 0; i <= 16; i++) { const p = at(-1 + (i / 16) * 2, v); i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y) }
    g.stroke()
  }
  for (let cIdx = 1; cIdx < 6; cIdx++) {
    const u = -1 + (cIdx / 6) * 2
    g.beginPath()
    for (let i = 0; i <= 12; i++) { const p = at(u, i / 12); i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y) }
    g.stroke()
  }

  // Scan line sweeping down the chest
  const sv = (now / 2200) % 1
  g.strokeStyle = `rgba(${TEAL},0.7)`
  g.lineWidth = 1.5
  g.shadowColor = `rgba(${TEAL},1)`
  g.shadowBlur = 10
  g.beginPath()
  for (let i = 0; i <= 16; i++) { const p = at(-1 + (i / 16) * 2, sv); i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y) }
  g.stroke()

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
  if (visible(lm[LM.nose])) {
    const N = map(lm[LM.nose])
    g.setLineDash([3, 5])
    g.strokeStyle = 'rgba(234,243,247,0.45)'
    g.lineWidth = 1
    g.beginPath(); g.moveTo(mid.x, mid.y - lift); g.lineTo(N.x, N.y + sw * 0.12); g.stroke()
    g.setLineDash([])
    g.beginPath(); g.ellipse(N.x, N.y - sw * 0.04, sw * 0.24, sw * 0.3, 0, 0, 7); g.stroke()
  }

  // Elbows, if in view
  g.strokeStyle = 'rgba(234,243,247,0.35)'
  g.lineWidth = 1
  for (const [s, e] of [[LM.lShoulder, LM.lElbow], [LM.rShoulder, LM.rElbow]] as const) {
    if (!visible(lm[e], 0.5)) continue
    const S = map(lm[s]), E = map(lm[e])
    g.beginPath(); g.moveTo(S.x, S.y - lift); g.lineTo(E.x, E.y); g.stroke()
    g.fillStyle = 'rgba(234,243,247,0.7)'
    g.beginPath(); g.arc(E.x, E.y, 3, 0, 7); g.fill()
  }

  // Tag
  g.font = '500 10px "Geist Mono", monospace'
  g.fillStyle = `rgba(${TEAL},0.95)`
  const tag = `${b > 0 ? 'rise' : 'fall'} ${Math.abs(b * 100).toFixed(0)}%`
  g.fillText(tag, R.x + 16, R.y - lift + 4)
  g.restore()
}

function drawWave(c: HTMLCanvasElement | null, buf: number[]) {
  if (!c) return
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const W = c.clientWidth, H = c.clientHeight
  if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr) }
  const g = c.getContext('2d')!
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, W, H)
  g.strokeStyle = 'rgba(234,243,247,0.1)'
  g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke()
  g.beginPath()
  buf.forEach((v, i) => {
    const x = (i / 299) * W, y = H / 2 - v * H * 0.4
    i ? g.lineTo(x, y) : g.moveTo(x, y)
  })
  g.strokeStyle = `rgba(${TEAL},0.95)`
  g.lineWidth = 1.8
  g.shadowColor = `rgba(${TEAL},1)`
  g.shadowBlur = 8
  g.stroke()
}
