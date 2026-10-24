import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { createSignal } from '../lib/realSignal'
import type { Frame } from '../signal/types'
import type { SignalSource } from '../lib/signal'
import {
  checkEyesClosed, checkFidget, checkHeadDrop, checkPaced, checkSignal, checkTension, type Check, type Sample, type Verdict,
} from '../signal/featureCheck'

// TEMPORARY: guided feature tests. You do the thing, it checks the feature reacts, using the same thresholds
// the state model uses. Not part of the product; delete before submitting (with /debug).

type StepId = 'baseline' | 'paced' | 'paced2' | 'fidget' | 'head' | 'tension' | 'eyes'
interface StepDef { id: StepId; title: string; secs: number; prompt: string; detail: string; pace?: number }

const STEPS: StepDef[] = [
  { id: 'baseline', title: '1 · Baseline and signal', secs: 25, prompt: 'Sit still. Breathe normally.', detail: 'Eyes open, both shoulders and your face in frame. This learns your normal for the other steps.' },
  { id: 'paced', title: '2 · Breath rate against a known answer (6 a minute)', secs: 30, pace: 6, prompt: 'Breathe with the circle: in 5 s, out 5 s.', detail: 'The circle moves at exactly 6 breaths a minute, so the reading should land near 6.' },
  { id: 'paced2', title: '3 · Breath rate at a second pace (9 a minute)', secs: 30, pace: 9, prompt: 'Breathe with the circle: in about 3 s, out about 3 s.', detail: 'A different known rate, so a pass cannot be an accident of the measuring range. The reading should land near 9.' },
  { id: 'fidget', title: '4 · Stillness / restlessness', secs: 10, prompt: 'Fidget: shift in your seat, rub your face, move your arms.', detail: 'Motion should jump well above your still baseline and the state should reach restless.' },
  { id: 'head', title: '5 · Head drop', secs: 10, prompt: 'Keep your back straight and just tip your head forward a little, like a small nod. Hold it.', detail: 'Posture stays upright, only the head moves. Head drop should cross the line the state model uses, and the state should go to drifting.' },
  { id: 'tension', title: '6 · Face tension', secs: 8, prompt: 'Frown hard, as if squinting at a bright light, and press your lips together. Hold it.', detail: 'Tension should rise by at least the amount the state model counts.' },
  { id: 'eyes', title: '7 · Face signals, eyes closed', secs: 15, prompt: 'Close your eyes. Sit still.', detail: 'Sessions are done with eyes closed, so tension and flutter must keep reading.' },
]

const color: Record<Verdict, string> = { pass: '#3ddc84', warn: '#ffc857', fail: '#ff6b6b' }
const f2 = (v: number | null | undefined) => (v === null || v === undefined ? '–' : v.toFixed(2))

export function FeatureTest() {
  const sig = useRef<SignalSource | null>(null)
  const video = useRef<HTMLVideoElement>(null)
  const overlay = useRef<HTMLCanvasElement>(null)
  const log = useRef<{ at: number; s: Sample }[]>([])
  const okRef = useRef(false)
  const chestLog = useRef<{ at: number; usable: boolean }[]>([])
  // Everything the signal produced this session, kept so it can be saved and analysed offline.
  const rawLog = useRef<{ frames: Frame[]; chest: { t: number; cum: number; texture: number | null }[]; marks: { t: number; step: string }[]; readings: unknown[] }>({ frames: [], chest: [], marks: [], readings: [] })
  const [saved, setSaved] = useState('')
  const chestBox = useRef<{ roi: { x: number; y: number; w: number; h: number } | null; usable: boolean } | null>(null)
  const abort = useRef(false)
  const startedAt = useRef(0)
  const [ready, setReady] = useState(false)
  const [chestOn, setChestOn] = useState(true)
  const [running, setRunning] = useState<StepId | null>(null)
  const [left, setLeft] = useState(0)
  const [results, setResults] = useState<Partial<Record<StepId, Check>>>({})
  const [live, setLive] = useState<Sample | null>(null)
  const [circle, setCircle] = useState(1)
  const [msg, setMsg] = useState('')
  const [copied, setCopied] = useState<'no' | 'copied' | 'manual'>('no')

  useEffect(() => () => { abort.current = true; sig.current?.stop() }, [])

  const start = async () => {
    sig.current?.stop()
    setMsg('Starting the camera and loading the models…')
    const s = createSignal({ lengthSec: 80, chest: chestOn }) // 80 s session: baseline learns for 20 s
    sig.current = s
    s.onReading((r) => { okRef.current = r.signalOk })
    s.onRaw?.((r) => {
      const smp: Sample = { rate: r.rate, rateSpectral: r.rateSpectral, confidence: r.confidence, motion: r.motion, stillness: r.stillness, headDrop: r.headDrop, tension: r.tension, flutter: r.flutter, faceParts: r.faceParts, breathSource: r.breathSource, state: r.state, why: r.why, baselineReady: r.baselineReady, signalOk: okRef.current, inhaleCount: r.inhales.length }
      log.current.push({ at: performance.now(), s: smp })
      rawLog.current.readings.push({ t: performance.now() / 1000, rate: r.rate, spec: r.rateSpectral, conf: r.confidence, source: r.breathSource, inhales: r.inhales.length, motion: r.motion, state: r.state })
      setLive(smp)
    })
    s.onChest?.((c) => {
      chestLog.current.push({ at: performance.now(), usable: c.texture !== null })
      chestBox.current = { roi: c.roi, usable: c.texture !== null }
      const rl = rawLog.current
      rl.chest.push({ t: performance.now() / 1000, cum: c.cum, texture: c.texture })
      if (rl.chest.length > 20000) rl.chest.shift()
    })
    s.onFrame?.((raw, used) => {
      const rl = rawLog.current
      rl.frames.push(raw) // raw from the model, before smoothing
      if (rl.frames.length > 20000) rl.frames.shift()
      const v = video.current, c = overlay.current
      if (!v || !c || !v.videoWidth) return
      if (c.width !== v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight }
      const aspect = v.videoWidth / v.videoHeight
      const g = c.getContext('2d')!
      g.clearRect(0, 0, c.width, c.height)
      g.fillStyle = '#7fe7ff'
      for (const p of [used.nose, used.shoulderL, used.shoulderR]) { g.beginPath(); g.arc((p.x / aspect) * c.width, p.y * c.height, 5, 0, 7); g.fill() }
      // the chest window the pixel method tracks: green = usable texture, red = too plain to track
      const cb = chestBox.current
      if (cb?.roi) {
        g.strokeStyle = cb.usable ? '#8aff8a' : '#ff6b6b'
        g.lineWidth = 2
        g.strokeRect(cb.roi.x * c.width, cb.roi.y * c.height, cb.roi.w * c.width, cb.roi.h * c.height)
      }
    })
    await s.start()
    const st = s.stream?.()
    if (video.current && st) { video.current.srcObject = st; video.current.play().catch(() => {}) }
    if (s.mode?.() !== 'real') { setMsg('The real camera signal is not available (camera denied or models failed), so these tests cannot run.'); return }
    startedAt.current = performance.now()
    setMsg('')
    setReady(true)
  }

  const slice = (from: number, to: number) => log.current.filter((x) => x.at >= from && x.at <= to).map((x) => x.s)

  const run = async (def: StepDef) => {
    abort.current = false
    setRunning(def.id)
    const t0 = performance.now()
    rawLog.current.marks.push({ t: t0 / 1000, step: def.id })
    await new Promise<void>((resolve) => {
      const id = setInterval(() => {
        const t = (performance.now() - t0) / 1000
        setLeft(Math.max(0, Math.ceil(def.secs - t)))
        if (def.pace) { const cyc = 60 / def.pace, ph = t % cyc, half = cyc / 2; setCircle(1 + 0.8 * (ph < half ? ph / half : 1 - (ph - half) / half)) }
        if (abort.current || t >= def.secs) { clearInterval(id); resolve() }
      }, 80)
    })
    setCircle(1)
    setRunning(null)
    if (abort.current) return
    const win = slice(t0 + 1500, performance.now()) // skip the first moments while you get into position
    const base = slice(logStart('baseline'), logEnd('baseline'))
    let check: Check
    switch (def.id) {
      case 'baseline': {
        const cl = chestLog.current.filter((x) => x.at >= t0 + 1500)
        check = checkSignal(win, { method: chestOn ? 'chest pixels' : 'shoulder landmarks', chestUsablePct: chestOn && cl.length ? (cl.filter((x) => x.usable).length / cl.length) * 100 : null, bufferSec: Math.min(60, (performance.now() - startedAt.current) / 1000) })
        break
      }
      case 'paced': check = checkPaced(win[win.length - 1], 6); break
      case 'paced2': check = checkPaced(win[win.length - 1], 9); break
      case 'fidget': check = checkFidget(base, win); break
      case 'head': check = checkHeadDrop(win); break
      case 'tension': check = checkTension(base, win); break
      case 'eyes': check = checkEyesClosed(win); break
    }
    if (def.id === 'baseline') stamps.current.baseline = { from: t0 + 5000, to: performance.now() } // keep the settled part
    setResults((old) => ({ ...old, [def.id]: check }))
  }

  // Baseline window = the settled part of step 1.
  const stamps = useRef<Partial<Record<StepId, { from: number; to: number }>>>({})
  const logStart = (id: StepId) => stamps.current[id]?.from ?? 0
  const logEnd = (id: StepId) => stamps.current[id]?.to ?? 0

  const current = STEPS.find((s) => !results[s.id])?.id ?? null
  const B = { padding: '10px 14px', font: 'inherit', background: '#123', color: '#7fe7ff', border: '1px solid #2a5', borderRadius: 8 } as const
  const done = STEPS.filter((s) => results[s.id]).length
  // Plain-text report: readable, short, and easy to paste.
  const report = [
    `TIDE feature test · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
    `breath method: ${chestOn ? 'chest pixels' : 'shoulder landmarks'}`,
    `device: ${navigator.userAgent}`,
    '',
    ...STEPS.flatMap((s) => {
      const r = results[s.id]
      return r ? [`${r.verdict.toUpperCase()}  ${s.title}`, ...r.lines.map((l) => `    ${l}`)] : [`—     ${s.title} (not run)`]
    }),
  ].join('\n')
  const saveRaw = () => {
    const name = `tide-features-raw-${Date.now()}.json`
    const rl = rawLog.current
    const blob = new Blob([JSON.stringify({ chestMethod: chestOn, userAgent: navigator.userAgent, ...rl })], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    setSaved(`saved ${name} (${rl.frames.length} frames, ${rl.chest.length} chest samples) to Downloads`)
  }
  const area = useRef<HTMLTextAreaElement>(null)
  const copy = async () => {
    area.current?.focus()
    area.current?.select()
    try {
      await navigator.clipboard.writeText(report)
      setCopied('copied')
    } catch {
      // Clipboard is blocked on non-secure pages; fall back to the old command, else leave it selected.
      let ok = false
      try { ok = document.execCommand('copy') } catch { /* ignore */ }
      setCopied(ok ? 'copied' : 'manual')
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#03050c', padding: 16, font: '13px ui-monospace, monospace', color: '#eaf3f7', overflowY: 'auto' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <h2 style={{ margin: '0 0 4px' }}>/debug/features · feature tests (temporary)</h2>
        <p style={{ opacity: 0.7, marginTop: 0 }}><Link to="/debug" style={{ color: '#7fe7ff' }}>back to /debug</Link> · do these in order. Each one checks that a feature reacts the way the state model needs it to.</p>

        {!ready && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 8 }}><input type="checkbox" checked={chestOn} onChange={(e) => setChestOn(e.target.checked)} /> breath from chest pixels (off = shoulder landmarks)</label>
            <button style={B} onClick={start}>start camera</button> {msg}
          </div>
        )}

        <div style={{ position: 'relative', background: '#000', borderRadius: 8, overflow: 'hidden', minHeight: ready ? 0 : 0, marginBottom: 12, display: ready ? 'block' : 'none' }}>
          <div style={{ transform: 'scaleX(-1)', position: 'relative' }}>
            <video ref={video} muted playsInline autoPlay style={{ width: '100%', display: 'block' }} />
            <canvas ref={overlay} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
          </div>
          {running && <div style={{ position: 'absolute', left: 8, right: 8, top: 8, padding: '6px 10px', borderRadius: 6, background: '#000b', color: '#fff', fontSize: 15 }}>{STEPS.find((s) => s.id === running)!.prompt} <b style={{ color: '#7fe7ff' }}>{left}s</b></div>}
          {STEPS.find((x) => x.id === running)?.pace && <div style={{ position: 'absolute', left: '50%', bottom: 16, width: 60, height: 60, marginLeft: -30, borderRadius: '50%', background: '#2aa', transform: `scale(${circle})`, opacity: 0.5 + 0.5 * ((circle - 1) / 0.8) }} />}
        </div>

        {ready && live && (
          <div style={{ marginBottom: 12, opacity: 0.85 }}>
            live: state <b>{live.state}</b> · breath from <b>{live.breathSource ?? '–'}</b> · rate {f2(live.rate)} · motion {f2(live.motion)} · head drop {live.baselineReady ? f2(live.headDrop) : '(learning)'} · tension {f2(live.tension)} · flutter {f2(live.flutter)} · tracked {live.signalOk ? 'yes' : 'NO'}
            <div style={{ opacity: 0.9, marginTop: 2 }}>why {live.state}: {live.why?.join(' + ') ?? '–'}</div>
          </div>
        )}

        {STEPS.map((s) => {
          const r = results[s.id]
          const isCur = current === s.id
          return (
            <div key={s.id} style={{ border: `1px solid ${r ? color[r.verdict] : isCur ? '#7fe7ff' : '#234'}`, borderRadius: 8, padding: 12, marginBottom: 10, opacity: !r && !isCur ? 0.5 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{s.title}</b>{r && <span style={{ color: color[r.verdict], textTransform: 'uppercase' }}>{r.verdict}</span>}</div>
              {(isCur || !r) && <p style={{ margin: '6px 0' }}><b>{s.prompt}</b> {s.detail}</p>}
              {r && <>{r.lines.map((l, i) => <div key={i}>{l}</div>)}<p style={{ margin: '6px 0', opacity: 0.8 }}>{r.meaning}</p></>}
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                {isCur && !running && <button style={B} disabled={!ready || (s.id !== 'baseline' && !stamps.current.baseline)} onClick={() => run(s)}>run ({s.secs}s)</button>}
                {running === s.id && <button style={B} onClick={() => { abort.current = true }}>stop</button>}
                {r && !running && <button style={B} onClick={() => setResults((old) => { const n = { ...old }; delete n[s.id]; return n })}>redo</button>}
              </div>
            </div>
          )
        })}

        <div style={{ border: '1px solid #234', borderRadius: 8, padding: 12, marginBottom: 40 }}>
          <b>Summary · {done} of {STEPS.length} done</b>
          <div style={{ margin: '6px 0' }}>{STEPS.map((s) => <div key={s.id}><span style={{ color: results[s.id] ? color[results[s.id]!.verdict] : '#789' }}>{results[s.id] ? results[s.id]!.verdict.toUpperCase() : '—'}</span> {s.title}</div>)}</div>
          <textarea ref={area} readOnly value={report} onFocus={(e) => e.currentTarget.select()} rows={Math.min(24, report.split('\n').length + 1)}
            style={{ width: '100%', boxSizing: 'border-box', background: '#071018', color: '#cfe', border: '1px solid #234', borderRadius: 6, font: '12px ui-monospace, monospace', padding: 8 }} />
          <button style={B} onClick={copy} disabled={!done}>copy results</button>{' '}
          <button style={B} onClick={saveRaw} disabled={!ready}>save raw data</button>{' '}
          {saved && <div style={{ margin: '6px 0', color: '#7fe7ff' }}>{saved}</div>}
          {copied === 'copied' && <span style={{ color: '#3ddc84' }}>copied. paste it to Claude</span>}
          {copied === 'manual' && <span style={{ color: '#ffc857' }}>couldn't copy automatically. The text above is selected: use your device's copy.</span>}
        </div>
      </div>
    </div>
  )
}
