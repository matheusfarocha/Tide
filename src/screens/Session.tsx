import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChestPanel, LiveBody } from '../components/LiveBody'
import { Screen } from '../components/ui'
import { backendOn, SessionLink } from '../lib/backend'
import { publish } from '../lib/live'
import { fmt } from '../lib/metrics'
import { startOcean, stopOcean } from '../lib/ocean'
import { createSignal } from '../lib/realSignal'
import { useStore } from '../lib/store'
import { useSheerTide, useTide, useTideCtl } from '../lib/tide'
import type { FeelAnswer, FeelCheck, MindState, Reading } from '../lib/types'
import { toSharedReading } from '../lib/uplink'
import { interpret, listen, speak } from '../lib/voice'
import type { SignalReading as EngineReading } from '../signal/types'
import type { SignalReading as SharedReading } from '../../shared/types'

// The plan-driven session runner. The tide on screen is the person's real breath.
// With Convex on, every reading streams to the server (coach view, Calm Map, CREAO coach).

const matches = (a: FeelAnswer, s: MindState) =>
  a === 'focused' ? s === 'focused' || s === 'settling' : a === 'drifting' ? s === 'drifting' || s === 'restless' : false

const STATE_TEXT: Record<MindState, string> = {
  settling: 'settling', focused: 'steady', drifting: 'wandering', restless: 'restless',
}

export function Session() {
  const store = useStore()
  const nav = useNavigate()
  const tide = useTideCtl()
  const length = store.lengthSec
  const plan = store.plan
  const scale = length / plan.lengthSec
  const feelTimes = useMemo(() => plan.feelCheckTimes.map((t) => Math.round(t * scale)).filter((t) => t > 10 && t < length - 5), [plan, scale, length])
  const cueTimes = useMemo(() => (plan.fadingLevel < 0.8 ? plan.cueTimes.map((t) => Math.round(t * scale)) : []), [plan, scale])
  const cueText = useCallback((at: number) => plan.cues?.find((c) => Math.round(c.atSec * scale) === at)?.text ?? 'Come back to your breath.', [plan, scale])

  const signal = useMemo(() => createSignal({ lengthSec: length }), [length])
  const readings = useRef<Reading[]>([])
  const feelChecks = useRef<FeelCheck[]>([])
  const lastV = useRef(0)
  const answered = useRef(true)
  const elapsedRef = useRef(0)
  const pausedRef = useRef(false)
  // Server side of this session. Created once (StrictMode mounts twice in dev, so it lives in a ref).
  const linkRef = useRef<SessionLink | null>(null)
  const endTimer = useRef(0)
  const rawRef = useRef<EngineReading | null>(null)
  const waveBuf = useRef<number[]>([])
  const inhaleBuf = useRef<number[]>([])
  const tickAt = useRef(performance.now())
  const earlyReadings = useRef<SharedReading[]>([])
  const endedRef = useRef(false)
  /** Session clock in ms, with sub-second precision (paused time doesn't count). */
  const sessionMs = () => elapsedRef.current * 1000 + (pausedRef.current ? 0 : Math.min(1000, performance.now() - tickAt.current))

  const [elapsed, setElapsed] = useState(0)
  const [paused, setPaused] = useState(false)
  const [voiceOn, setVoiceOn] = useState(true)
  const [seaOn, setSeaOn] = useState(store.soundOn)
  const [reading, setReading] = useState<Reading | null>(null)
  const [phase, setPhase] = useState<'in' | 'out'>('in')
  const [asking, setAsking] = useState(false)
  const [result, setResult] = useState<FeelCheck | null>(null)
  const [cue, setCue] = useState<string | null>(null)
  const [hud, setHud] = useState(true)
  const hudTimer = useRef(0)
  pausedRef.current = paused

  const lost = reading !== null && !reading.signalOk
  useTide(0.5, reading && !lost ? reading.state : 'settling')
  useSheerTide()

  const showHud = useCallback(() => {
    setHud(true)
    clearTimeout(hudTimer.current)
    hudTimer.current = window.setTimeout(() => setHud(false), 4500)
  }, [])

  const say = useCallback((t: string) => { if (voiceOn) speak(t) }, [voiceOn])

  useEffect(() => {
    clearTimeout(endTimer.current)
    if (store.soundOn) startOcean()
    signal.start()
    publish({ kind: 'start', lengthSec: length })
    const offB = signal.onBreath((v) => {
      if (pausedRef.current) return
      tide.pushBreath(Math.max(-1, Math.min(1, v)))
      waveBuf.current.push(v)
      const p = v > lastV.current ? 'in' : 'out'
      lastV.current = v
      setPhase((old) => (old === p ? old : p))
      publish({ kind: 'breath', v })
    })
    const offRaw = signal.onRaw?.((r) => { rawRef.current = r }) ?? (() => {})
    // Inhale times come on the page's clock (seconds); convert to the session clock.
    const offI = signal.onInhale?.((t) => {
      if (!pausedRef.current) inhaleBuf.current.push(sessionMs() - (performance.now() - t * 1000))
    }) ?? (() => {})
    const offR = signal.onReading((r) => {
      if (pausedRef.current) { waveBuf.current = []; inhaleBuf.current = []; return }
      const rr = { ...r, t: elapsedRef.current }
      readings.current.push(rr)
      setReading(rr)
      publish({ kind: 'reading', r: rr })
      const raw = rawRef.current
      const shared = toSharedReading({
        elapsedSec: elapsedRef.current,
        reading: rr,
        raw,
        wave: waveBuf.current,
        breathsMs: inhaleBuf.current.filter((b) => b >= 0),
        baseline: raw ? !raw.baselineReady : elapsedRef.current < 20,
        mode: signal.mode?.() ?? 'demo',
      })
      if (linkRef.current) linkRef.current.addReading(shared)
      else earlyReadings.current.push(shared)
      waveBuf.current = []
      inhaleBuf.current = []
    })
    // Locking the phone or switching apps pauses the session; the camera can't see you then anyway.
    const onVis = () => { if (document.hidden) setPaused(true) }
    document.addEventListener('visibilitychange', onVis)
    const clock = setInterval(() => {
      if (pausedRef.current) return
      elapsedRef.current += 1
      tickAt.current = performance.now()
      setElapsed(elapsedRef.current)
    }, 1000)
    say(plan.intro || 'Close your eyes. Let your breath settle on its own.')
    showHud()
    return () => {
      offB(); offR(); offRaw(); offI(); clearInterval(clock); signal.stop()
      document.removeEventListener('visibilitychange', onVis)
      // Leaving the screen ends the server session too (deferred: StrictMode's test unmount must not).
      const link = linkRef.current
      endTimer.current = window.setTimeout(() => { void link?.end() }, 1000)
      window.speechSynthesis?.cancel()
      clearTimeout(hudTimer.current)
      tide.setCalm(false)
      stopOcean()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signal])

  const askedAt = useRef(0)
  // Open the server session as soon as the Convex user exists (it may still be being created when
  // the session starts); readings from before that are queued and sent first.
  useEffect(() => {
    if (linkRef.current || endedRef.current || !backendOn || !store.userId) return
    const link = new SessionLink(store.userId, 'training', undefined, store.pacedCheck ?? undefined)
    earlyReadings.current.forEach((r) => link.addReading(r))
    earlyReadings.current = []
    linkRef.current = link
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.userId])

  const record = useCallback((answer: FeelAnswer, spoken?: string) => {
    if (answered.current) return
    answered.current = true
    const sensorState = readings.current[readings.current.length - 1]?.state ?? 'settling'
    const fc: FeelCheck = { t: askedAt.current, spoken, answer, sensorState, match: matches(answer, sensorState) }
    feelChecks.current.push(fc)
    // The server keeps the transcript (never audio) and scores it against ~20 s of readings.
    // When our keywords couldn't tell, Claude reads the answer there ("uh, kind of floaty?").
    void linkRef.current?.feelCheck({ tSec: fc.t, answeredSec: answer === 'none' ? null : elapsedRef.current, answer, spoken }).then((res) => {
      if (res?.answer && fc.answer === 'unsure') {
        fc.answer = res.answer === 'focused' ? 'focused' : 'drifting'
        fc.match = matches(fc.answer, fc.sensorState)
      }
    })
    publish({ kind: 'feel', f: fc })
    navigator.vibrate?.(fc.match ? [12, 60, 12] : 30)
    tide.ripple(window.innerWidth / 2, fc.match ? 2.4 : 1)
    setAsking(false)
    setResult(fc)
    setTimeout(() => { setResult(null); tide.setCalm(false) }, 3600)
  }, [tide])

  const runFeelCheck = useCallback(async () => {
    answered.current = false
    askedAt.current = elapsedRef.current
    tide.setCalm(true)
    setAsking(true)
    publish({ kind: 'asking' })
    say('Focused, or drifting?')
    // No answer after 12 s is logged as quiet (possible drowsiness or deep focus).
    setTimeout(() => record('none'), 12000)
    await new Promise((r) => setTimeout(r, 1800))
    const heard = await listen(9000)
    if (heard) record(interpret(heard), heard)
  }, [record, say, tide])

  // Scheduled events from the coach's plan.
  useEffect(() => {
    if (feelTimes.includes(elapsed)) runFeelCheck()
    if (cueTimes.includes(elapsed)) {
      const text = cueText(elapsed)
      setCue(text)
      say(text)
      setTimeout(() => setCue(null), 6000)
    }
    if (elapsed >= length) end()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed])

  function end() {
    endedRef.current = true
    signal.stop()
    publish({ kind: 'end' })
    void linkRef.current?.end() // flushes queued readings, then hands the session to the coach
    const rec = store.finishSession(readings.current, feelChecks.current, linkRef.current?.id)
    nav('/results', { state: { id: rec.id }, replace: true })
  }

  const toggleSea = () => {
    if (seaOn) stopOcean(); else startOcean()
    setSeaOn(!seaOn)
    store.setSoundOn(!seaOn)
  }

  const cueLine = cue ?? (paused ? 'Paused.' : lost ? 'Finding you… sit back in view of the camera.' : elapsed < 8 ? 'Close your eyes.' : phase === 'in' ? 'in…' : 'out…')

  return (
    <Screen className="session">
      <LiveBody signal={signal} />
      <div className="session__hud" onClick={showHud}>
        <span>{fmt(elapsed)} / {fmt(length)}</span>
        {reading && (lost
          ? <span className="session__state muted"><i style={{ background: 'currentColor' }} />no signal</span>
          : <span className="session__state" style={{ color: `var(--st-${reading.state})` }}><i style={{ background: 'currentColor' }} />{STATE_TEXT[reading.state]}</span>)}
      </div>

      <p className="session__cue" onClick={showHud} aria-live="polite">{cueLine}</p>
      <p className="fine">{store.coachOn ? plan.technique.toLowerCase() : 'free session'}</p>

      <div className="spacer" onClick={showHud} />

      <ChestPanel signal={signal} rate={reading && !lost && reading.rate > 0 ? reading.rate : null} />

      <div className="metrics" onClick={showHud}>
        <div><span>breath</span><strong>{reading && !lost && reading.rate > 0 ? reading.rate.toFixed(1) : '—'}<small>/m</small></strong></div>
        <div><span>still</span><strong>{reading ? Math.round(reading.stillness * 100) : '—'}<small>%</small></strong></div>
        <div><span>posture</span><strong>{reading ? Math.round(reading.posture * 100) : '—'}<small>%</small></strong></div>
      </div>

      <div className={`controls${hud ? '' : ' is-hidden'}`}>
        <button className="ctl" onClick={() => { setVoiceOn((v) => !v); showHud() }}>{voiceOn ? 'voice on' : 'voice off'}</button>
        <button className="ctl" onClick={() => { toggleSea(); showHud() }}>{seaOn ? 'sea on' : 'sea off'}</button>
        <button className="ctl" onClick={() => { setPaused((p) => !p); showHud() }}>{paused ? 'resume' : 'pause'}</button>
        <button className="ctl" onClick={end}>end</button>
      </div>
      {!hud && <p className="tap-hint" onClick={showHud}>tap for controls</p>}

      {(asking || result) && (
        <div className="feel" role="dialog" aria-label="Feel Check">
          <p className="feel__q">Focused,<br />or drifting?<small>{asking ? 'say it out loud · or tap' : ''}</small></p>
          {asking ? (
            <>
              <div className="feel__halves">
                <button className="feel__half feel__half--focus" onClick={() => record('focused')}><b>focused</b><small>present with my breath</small></button>
                <button className="feel__half feel__half--drift" onClick={() => record('drifting')}><b>drifting</b><small>my mind wandered</small></button>
              </div>
              <button className="feel__unsure" onClick={() => record('unsure')}>not sure</button>
            </>
          ) : result && (
            <>
              <div className={`verdict${result.match ? ' is-match' : ''}`}>
                <div className="verdict__line verdict__line--felt" style={{ color: result.answer === 'drifting' ? 'var(--st-drifting)' : 'var(--st-focused)' }}>
                  <i /><span>you felt · <b>{result.answer === 'none' ? 'quiet' : result.answer}</b>{result.spoken ? ` “${result.spoken}”` : ''}</span>
                </div>
                <div className="verdict__line verdict__line--saw" style={{ color: `var(--st-${result.sensorState})` }}>
                  <i /><span>tide saw · <b>{result.sensorState}</b></span>
                </div>
                <p className={`verdict__tag ${result.answer === 'none' ? 'muted' : result.match ? 'ok' : 'miss'}`}>{result.match ? 'You caught it.' : result.answer === 'none' ? 'Logged as quiet.' : 'Not quite. Keep noticing.'}</p>
              </div>
              <span />
            </>
          )}
        </div>
      )}
    </Screen>
  )
}
