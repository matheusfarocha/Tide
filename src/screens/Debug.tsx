import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { LiveWave } from '../components/ui'
import { createSignal } from '../lib/realSignal'
import type { ChestInfo, SignalSource } from '../lib/signal'
import type { Reading } from '../lib/types'
import type { Frame, SignalReading } from '../signal/types'
import { scoreTapLabels } from '../signal/validation'

// TEMPORARY debug page for Person 1's signal. Not part of the product; delete before submitting.
// Starts the real signal source and shows every number the engine produces.

const B: CSSProperties = { padding: '10px 14px', font: 'inherit', background: '#123', color: '#7fe7ff', border: '1px solid #2a5', borderRadius: 8 }
const f = (v: number | null | undefined, d = 2) => (v === null || v === undefined ? '–' : v.toFixed(d))

export function Debug() {
  const sig = useRef<SignalSource | null>(null)
  const [raw, setRaw] = useState<SignalReading | null>(null)
  const [reading, setReading] = useState<Reading | null>(null)
  const [mode, setMode] = useState('stopped')
  const [fps, setFps] = useState(0)
  const [inhales, setInhales] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const log = useRef<{ t: number; state: string }[]>([])
  const hist = useRef<(SignalReading & { ok: boolean })[]>([])
  const inhaleTimes = useRef<number[]>([])
  const frames = useRef({ n: 0, t: performance.now() })
  const label = useRef<{ start: number; taps: number[] } | null>(null)
  const [labelMsg, setLabelMsg] = useState('')
  const [labelling, setLabelling] = useState(false)
  const [faceOn, setFaceOn] = useState(true)
  const [smoothOn, setSmoothOn] = useState(true)
  const [chestOn, setChestOn] = useState(true)
  const [chestInfo, setChestInfo] = useState<ChestInfo | null>(null)
  const chestRef = useRef<ChestInfo | null>(null)
  const [poseFps, setPoseFps] = useState(0)
  const [rec, setRec] = useState<string>('')
  const [paced, setPaced] = useState<{ until: number; scale: number } | null>(null)
  const [pacedMsg, setPacedMsg] = useState('')
  const capture = useRef<{ frames: Frame[]; readings: unknown[]; chest: unknown[]; t0: number } | null>(null)
  const vid = useRef<HTMLVideoElement>(null)
  const cvs = useRef<HTMLCanvasElement>(null)
  const lastFrameAt = useRef(0)
  const [tracking, setTracking] = useState<'none' | 'ok' | 'edge'>('none')
  const fpsRef = useRef({ n: 0, t: performance.now() })

  useEffect(() => () => sig.current?.stop(), [])

  // Attach the camera stream to the preview once the source is live.
  useEffect(() => {
    if (mode !== 'real' || !vid.current) return
    const st = sig.current?.stream?.() ?? null
    if (st && vid.current.srcObject !== st) { vid.current.srcObject = st; vid.current.play().catch(() => {}) }
  }, [mode])

  // Show chest tracking quality about twice a second.
  useEffect(() => {
    const id = setInterval(() => setChestInfo(chestRef.current), 500)
    return () => clearInterval(id)
  }, [])

  // 'none' when no pose frame arrived for 1 s.
  useEffect(() => {
    const id = setInterval(() => {
      if (performance.now() - lastFrameAt.current > 1000) setTracking((t) => (t === 'none' ? t : 'none'))
    }, 400)
    return () => clearInterval(id)
  }, [])

  const start = async () => {
    sig.current?.stop()
    log.current = []; hist.current = []; inhaleTimes.current = []; setInhales(0); setErr(null)
    const s = createSignal({ lengthSec: 600, face: faceOn, smooth: smoothOn, chest: chestOn })
    sig.current = s
    s.onBreath(() => {
      frames.current.n++
      const now = performance.now()
      if (now - frames.current.t > 2000) {
        setFps(Math.round((frames.current.n / (now - frames.current.t)) * 1000))
        frames.current = { n: 0, t: now }
      }
    })
    s.onReading((r) => {
      setReading(r)
      setMode(s.mode?.() ?? '?')
      const last = log.current[log.current.length - 1]
      if (!last || last.state !== r.state) log.current = [...log.current.slice(-19), { t: r.t, state: r.state }]
    })
    s.onRaw?.((r) => {
      setRaw(r)
      hist.current.push({ ...r, ok: true })
      capture.current?.readings.push({ t: r.t, rate: r.rate, spec: r.rateSpectral, conf: r.confidence, reg: r.regularity, motion: r.motion, state: r.state })
      if (hist.current.length > 300) hist.current.shift()
    })
    s.onFrame?.((fr, used) => {
      const now = performance.now()
      fpsRef.current.n++
      if (now - fpsRef.current.t > 2000) { setPoseFps(Math.round((fpsRef.current.n / (now - fpsRef.current.t)) * 1000)); fpsRef.current = { n: 0, t: now } }
      const c = capture.current
      if (c) c.frames.push(fr) // raw, so filters can be re-tuned offline
      lastFrameAt.current = now
      drawFrame(fr, used)
    })
    s.onChest?.((c) => {
      chestRef.current = c
      capture.current?.chest.push({ t: performance.now() / 1000, cum: c.cum, texture: c.texture })
    })
    s.onInhale?.((t) => { inhaleTimes.current.push(t); setInhales((n) => n + 1) })
    setMode('starting…')
    try { await s.start() } catch (e) { setErr(String(e)) }
    setMode(s.mode?.() ?? '?')
  }

  const copy = () => {
    const out = { mode, reading, raw: raw && { ...raw, inhales: raw.inhales.length }, states: log.current, last60: hist.current.slice(-60).map((h) => ({ t: +h.t.toFixed(1), rate: h.rate, spec: h.rateSpectral, conf: +h.confidence.toFixed(2), motion: +h.motion.toFixed(3), headDrop: +h.headDrop.toFixed(3), tension: h.tension, state: h.state })) }
    navigator.clipboard?.writeText(JSON.stringify(out, null, 1)).catch(() => {})
  }

  const drawFrame = (fr: Frame, used: Frame) => {
    const v = vid.current, c = cvs.current
    if (!v || !c || !v.videoWidth) return
    if (c.width !== v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight }
    const aspect = v.videoWidth / v.videoHeight
    const px = (p: { x: number; y: number }) => ({ x: (p.x / aspect) * c.width, y: p.y * c.height })
    const g = c.getContext('2d')!
    g.clearRect(0, 0, c.width, c.height)
    const l = px(fr.shoulderL), r = px(fr.shoulderR), n = px(fr.nose)
    g.strokeStyle = '#7fe7ff'; g.lineWidth = 3
    g.beginPath(); g.moveTo(l.x, l.y); g.lineTo(r.x, r.y); g.moveTo((l.x + r.x) / 2, (l.y + r.y) / 2); g.lineTo(n.x, n.y); g.stroke()
    // orange = raw from the model (jittery), cyan = smoothed, what the engine uses
    g.fillStyle = '#ffb570'
    for (const p of [l, r, n]) { g.beginPath(); g.arc(p.x, p.y, 5, 0, 7); g.fill() }
    g.fillStyle = '#7fe7ff'
    for (const p of [px(used.shoulderL), px(used.shoulderR), px(used.nose)]) { g.beginPath(); g.arc(p.x, p.y, 3, 0, 7); g.fill() }
    const ci = chestRef.current
    if (ci?.roi) {
      g.strokeStyle = ci.texture === null ? '#ff6b6b' : '#8aff8a'
      g.lineWidth = 2
      g.strokeRect(ci.roi.x * c.width, ci.roi.y * c.height, ci.roi.w * c.width, ci.roi.h * c.height)
    }
    const m = 0.04
    const edge = [l, r, n].some((p) => p.x < c.width * m || p.x > c.width * (1 - m) || p.y < c.height * m || p.y > c.height * (1 - m))
    setTracking(edge ? 'edge' : 'ok')
  }

  // Known-answer test: breathe with a circle at exactly 6 breaths/min (5 s in, 5 s out) for 30 s.
  // Restarts the signal first so the analysis window holds only the paced breathing.
  const runPaced = async () => {
    setPacedMsg('Restarting the signal…')
    await start()
    if (sig.current?.mode?.() !== 'real') { setPacedMsg('Needs the real camera signal (source was not real).'); return }
    const t0 = performance.now()
    setPacedMsg('Breathe with the circle: in for 5 s, out for 5 s.')
    const id = setInterval(() => {
      const t = (performance.now() - t0) / 1000
      if (t >= 30) return
      const phase = t % 10
      setPaced({ until: t0 + 30000, scale: 1 + 0.8 * (phase < 5 ? phase / 5 : 1 - (phase - 5) / 5) })
    }, 80)
    setTimeout(() => {
      clearInterval(id)
      setPaced(null)
      const last = hist.current[hist.current.length - 1]
      const measured = last?.rate ?? last?.rateSpectral ?? null
      if (measured === null) { setPacedMsg('Paced check: no reading. Check framing and the NO POSE badge, then retry.'); return }
      const err = Math.abs(measured - 6)
      setPacedMsg(`Paced check: measured ${measured.toFixed(1)} (peaks ${last.rate?.toFixed(1) ?? '–'}, spectral ${last.rateSpectral?.toFixed(1) ?? '–'}) vs true 6.0, error ${err.toFixed(1)} → ${err <= 1 ? 'PASS' : err <= 2 ? 'WARN' : 'FAIL'} (confidence ${last.confidence.toFixed(2)})`)
    }, 30000)
  }

  const startCapture = () => {
    capture.current = { frames: [], readings: [], chest: [], t0: performance.now() }
    setRec('recording raw landmarks for 60 s… breathe normally')
    setTimeout(() => {
      const c = capture.current; capture.current = null
      if (!c) return
      const name = `tide-raw-${Date.now()}.json`
      const blob = new Blob([JSON.stringify({ face: faceOn, chest: chestOn, mode, frames: c.frames, chestSeries: c.chest, readings: c.readings })], { type: 'application/json' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click()
      setRec(`saved ${name} (${c.frames.length} frames in 60 s = ${(c.frames.length / 60).toFixed(1)} fps) to Downloads`)
    }, 60000)
  }

  const startLabel = () => { label.current = { start: performance.now() / 1000, taps: [] }; setLabelling(true); setLabelMsg('Tap on every inhale for 60 s…'); setTimeout(endLabel, 60000) }
  const endLabel = () => {
    const l = label.current; if (!l) return
    label.current = null; setLabelling(false)
    const inh = inhaleTimes.current.filter((t) => t >= l.start)
    const r = scoreTapLabels(l.taps, inh)
    setLabelMsg(`${r.tapCount} taps vs ${r.detectedCount} detected, ${r.matched} matched, count error ${r.countErrorFrac === null ? '–' : Math.round(r.countErrorFrac * 100) + '%'}, mean offset ${f(r.meanOffsetSec)} s`)
  }

  const row = (k: string, v: string) => <tr key={k}><td style={{ opacity: 0.6, paddingRight: 16 }}>{k}</td><td style={{ color: '#fff' }}>{v}</td></tr>
  return (
    <div id="debug" style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#03050c', padding: 16, font: '13px ui-monospace, monospace', color: '#eaf3f7', overflowY: 'auto' }}>
     <div style={{ maxWidth: 520, margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 8px' }}>/debug · signal (temporary)</h2>
      <p style={{ margin: '0 0 8px' }}><a href="/debug/features" style={{ color: '#7fe7ff' }}>→ feature tests (guided walkthrough)</a></p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <button style={B} onClick={start}>start signal</button>
        <button style={B} onClick={() => { sig.current?.stop(); setMode('stopped') }}>stop</button>
        <button style={B} onClick={copy}>copy diagnostics</button>
      </div>
      <label style={{ display: 'block', marginBottom: 4 }}><input type="checkbox" checked={faceOn} onChange={(e) => setFaceOn(e.target.checked)} /> face tracking (applies on next start)</label>
      <label style={{ display: 'block', marginBottom: 4 }}><input type="checkbox" checked={chestOn} onChange={(e) => setChestOn(e.target.checked)} /> breath from chest pixels, not landmarks (applies on next start)</label>
      <label style={{ display: 'block', marginBottom: 8 }}><input type="checkbox" checked={smoothOn} onChange={(e) => setSmoothOn(e.target.checked)} /> landmark smoothing (applies on next start)</label>
      <div style={{ marginBottom: 8 }}>
        <button style={B} disabled={!!paced} onClick={runPaced}>paced-breathing check (30 s, known answer = 6)</button>
        {paced && <div style={{ width: 70, height: 70, borderRadius: '50%', background: '#2aa', margin: '16px auto', transform: `scale(${paced.scale})`, opacity: 0.4 + 0.6 * ((paced.scale - 1) / 0.8) }} />}
        <div style={{ margin: '6px 0' }}>{pacedMsg}</div>
        <button style={B} disabled={mode !== 'real' || !!capture.current} onClick={startCapture}>record raw 60 s (downloads json)</button> {rec}
      </div>
      <p>source: <b data-testid="mode">{mode}</b> · pose fps: {poseFps} · chest texture: {chestOn ? (chestInfo?.texture != null ? chestInfo.texture.toFixed(0) : chestInfo?.roi ? 'LOW' : 'no window') : 'off'} · breath events/s: {fps} · inhales seen: {inhales}{err ? ` · error: ${err}` : ''}</p>
      <div style={{ position: 'relative', background: '#000', borderRadius: 8, overflow: 'hidden', minHeight: 60, marginBottom: 6 }}>
        <div style={{ transform: 'scaleX(-1)', position: 'relative' }}>
          <video ref={vid} muted playsInline autoPlay style={{ width: '100%', display: 'block' }} />
          <canvas ref={cvs} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
        </div>
        <div style={{ position: 'absolute', left: 8, top: 8, padding: '3px 8px', borderRadius: 6, background: '#000a', color: tracking === 'ok' ? '#7fe7ff' : '#ffb570' }}>
          {mode !== 'real' ? 'camera off' : tracking === 'ok' ? '● tracking: in frame' : tracking === 'edge' ? '● tracking: too close to the edge' : '● NO POSE: shoulders not found'}
        </div>
      </div>
      {sig.current && <LiveWave subscribe={(cb) => sig.current!.onBreath(cb)} height={80} seconds={20} />}
      <table style={{ marginTop: 8 }}><tbody>
        {row('state', `${raw?.state ?? reading?.state ?? '–'}${raw && !raw.baselineReady ? ' (learning baseline)' : ''}`)}
        {row('signalOk', String(reading?.signalOk ?? '–'))}
        {row('breath from', raw?.breathSource ?? '–')}
        {row('rate (peaks)', f(raw?.rate, 1))}
        {row('rate (spectral)', f(raw?.rateSpectral, 1))}
        {row('confidence', f(raw?.confidence))}
        {row('regularity', f(raw?.regularity))}
        {row('depth (sw)', raw ? raw.depth.toExponential(2) : '–')}
        {row('motion (sw/s)', f(raw?.motion, 3))}
        {row('stillness', f(raw?.stillness))}
        {row('head drop (sw)', raw?.baselineReady ? f(raw.headDrop, 3) : '–')}
        {row('lean', raw?.baselineReady ? f(raw.lean, 3) : '–')}
        {row('tension', f(raw?.tension))}
        {row('flutter', f(raw?.flutter))}
        {row('posture (app)', f(reading?.posture))}
      </tbody></table>
      <p style={{ opacity: 0.6, margin: '8px 0 2px' }}>state changes</p>
      <div>{log.current.map((l) => `${l.t}s ${l.state}`).join(' → ') || '–'}</div>
      <p style={{ opacity: 0.6, margin: '12px 0 2px' }}>tap-label recorder (second person taps every inhale, 60 s)</p>
      <button style={B} disabled={labelling || mode !== 'real'} onClick={startLabel}>start recording</button>
      {labelling && <button style={{ ...B, display: 'block', width: '100%', padding: 28, marginTop: 8 }} onClick={() => label.current?.taps.push(performance.now() / 1000)}>tap on every INHALE</button>}
      <p>{labelMsg}</p>
     </div>
    </div>
  )
}
