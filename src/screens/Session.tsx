import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Screen } from '../components/ui'
import { backendOn, SessionLink } from '../lib/backend'
import { publish } from '../lib/live'
import { fmt } from '../lib/metrics'
import { startOcean, stopOcean } from '../lib/ocean'
import { createSignal } from '../lib/realSignal'
import { useStore } from '../lib/store'
import { useTide, useTideCtl } from '../lib/tide'
import type { FeelAnswer, FeelCheck, MindState, Reading } from '../lib/types'
import { toSharedReading } from '../lib/uplink'
import { interpret, listen, prepareMic, prepareVoice, releaseMic, speak, stopSpeaking, unlockAudio, useVoiceStatus } from '../lib/voice'
import { feedbackLine, LINES, voiceLines } from '../lib/voiceLines'
import type { SignalReading as EngineReading } from '../signal/types'
import type { SignalReading as SharedReading } from '../../shared/types'

// The plan-driven session runner. The tide on screen is the person's real breath.
// With Convex on, every reading streams to the server (coach view, Calm Map, CREAO coach).
// The user's eyes are closed, so the session runs by voice (Cartesia): cues are spoken on the
// breath the plan asks for, Feel Checks are asked and answered out loud, and the result is spoken back.

const matches = (a: FeelAnswer, s: MindState) =>
  a === 'focused' ? s === 'focused' || s === 'settling' : a === 'drifting' ? s === 'drifting' || s === 'restless' : false

/** The server's reading of a Feel Check, in the app's terms. */
const fromServerAnswer = (a: string | null | undefined): FeelAnswer | null =>
  a === 'focused' ? 'focused' : a === 'drifting' || a === 'sleepy' ? 'drifting' : null
const fromServerState = (s: string | null | undefined): MindState | null =>
  s === 'drowsy' ? 'drifting' : s === 'focused' || s === 'settling' || s === 'drifting' || s === 'restless' ? s : null
/** How long a cue may wait for the breath it should land on before it is spoken anyway. */
const CUE_WAIT_MS = 6000
const ANSWER_WINDOW_MS = 9000
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const STATE_TEXT: Record<MindState, string> = {
  settling: 'settling', focused: 'steady', drifting: 'wandering', restless: 'restless',
}

export function Session() {
  const store = useStore()
  const nav = useNavigate()
  const tide = useTideCtl()
  // The coach's plan sets its own length; the first (baseline) session uses the length chosen at onboarding.
  const length = store.sessionLengthSec
  const plan = store.plan
  const scale = length / plan.lengthSec
  const feelTimes = useMemo(() => plan.feelCheckTimes.map((t) => Math.round(t * scale)).filter((t) => t > 10 && t < length - 5), [plan, scale, length])
  const cueTimes = useMemo(() => (plan.fadingLevel < 0.8 ? plan.cueTimes.map((t) => Math.round(t * scale)) : []), [plan, scale])
  const cueAt = useCallback((at: number) => plan.cues?.find((c) => Math.round(c.atSec * scale) === at) ?? { text: LINES.cue, onBreath: 'any' as const }, [plan, scale])

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
  const voiceOnRef = useRef(true)
  voiceOnRef.current = voiceOn
  const voice = useVoiceStatus()
  const phaseRef = useRef<'in' | 'out'>('in')
  /** A cue waiting for the next inhale or exhale. */
  const pendingCue = useRef<{ text: string; want: 'in' | 'out'; timer: number } | null>(null)
  const [seaOn, setSeaOn] = useState(store.soundOn)
  const [reading, setReading] = useState<Reading | null>(null)
  const [phase, setPhase] = useState<'in' | 'out'>('in')
  const [asking, setAsking] = useState(false)
  const [result, setResult] = useState<FeelCheck | null>(null)
  const [cue, setCue] = useState<string | null>(null)
  const [hud, setHud] = useState(true)
  /** Set when the server refused this session, so it is only kept on this phone. */
  const [refused, setRefused] = useState<string | null>(null)
  const hudTimer = useRef(0)
  pausedRef.current = paused

  const lost = reading !== null && !reading.signalOk
  useTide(0.5, reading && !lost ? reading.state : 'settling')

  const showHud = useCallback(() => {
    setHud(true)
    clearTimeout(hudTimer.current)
    hudTimer.current = window.setTimeout(() => setHud(false), 4500)
  }, [])

  const say = useCallback((t: string): Promise<void> => (voiceOnRef.current ? speak(t) : Promise.resolve()), [])

  const sayCue = useCallback((text: string) => {
    setCue(text)
    void say(text)
    setTimeout(() => setCue((c) => (c === text ? null : c)), 6000)
  }, [say])

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
      // Speak a waiting cue the moment the breath it asked for begins.
      const pc = pendingCue.current
      if (pc && p !== phaseRef.current && p === pc.want) {
        clearTimeout(pc.timer)
        pendingCue.current = null
        sayCue(pc.text)
      }
      phaseRef.current = p
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
    // Usually already generated during the paced-breathing check; then this resolves at once.
    void prepareVoice(voiceLines(plan)).then(() => { if (!endedRef.current) void say(plan.intro || LINES.intro) })
    void prepareMic()
    showHud()
    return () => {
      offB(); offR(); offRaw(); offI(); clearInterval(clock); signal.stop()
      document.removeEventListener('visibilitychange', onVis)
      // Leaving the screen ends the server session too (deferred: StrictMode's test unmount must not).
      const link = linkRef.current
      endTimer.current = window.setTimeout(() => {
        void link?.end()
        // Leaving early: stop talking and give the mic back (a normal end does this after its closing line).
        if (!endedRef.current) { stopSpeaking(); releaseMic() }
      }, 1000)
      if (pendingCue.current) clearTimeout(pendingCue.current.timer)
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
    void link.ready().then((id) => { if (!id) setRefused(link.error ?? "TIDE's server didn't accept this session.") })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.userId])

  const record = useCallback(async (answer: FeelAnswer, spoken?: string) => {
    if (answered.current) return
    answered.current = true
    const sensorState = readings.current[readings.current.length - 1]?.state ?? 'settling'
    const local = spoken && !linkRef.current ? interpret(spoken) : answer
    const fc: FeelCheck = { t: askedAt.current, spoken, answer: local, sensorState, match: matches(local, sensorState) }
    // The server keeps the transcript (never audio) and scores it against ~20 s of readings.
    // When keywords can't tell, Claude reads the answer there ("uh, kind of floaty?").
    const res = await linkRef.current?.feelCheck({ tSec: fc.t, answeredSec: answer === 'none' ? null : elapsedRef.current, answer, spoken })
    if (res) {
      fc.answer = fromServerAnswer(res.answer) ?? (spoken ? 'unsure' : fc.answer)
      fc.sensorState = fromServerState(res.sensorState) ?? fc.sensorState
      fc.match = res.match === true
    }
    feelChecks.current.push(fc)
    publish({ kind: 'feel', f: fc })
    navigator.vibrate?.(fc.match ? [12, 60, 12] : 30)
    tide.ripple(window.innerWidth / 2, fc.match ? 2.4 : 1)
    setAsking(false)
    setResult(fc)
    // Eyes are closed: say the result, not just show it.
    void say(feedbackLine(fc))
    setTimeout(() => { setResult(null); tide.setCalm(false) }, 3600)
  }, [tide, say])

  const runFeelCheck = useCallback(async () => {
    answered.current = false
    askedAt.current = elapsedRef.current
    tide.setCalm(true)
    setAsking(true)
    publish({ kind: 'asking' })
    await say(LINES.question)
    if (answered.current) return
    // Listen only after the question has finished, so Ink 2 never hears TIDE's own voice.
    const t0 = performance.now()
    const heard = voiceOnRef.current ? await listen(ANSWER_WINDOW_MS) : null
    if (answered.current) return
    if (heard) { void record('unsure', heard); return }
    // No mic or nothing heard yet: the buttons stay open for the rest of the window.
    await sleep(Math.max(0, ANSWER_WINDOW_MS - (performance.now() - t0)))
    // Silence is logged as quiet (possible drowsiness or deep focus).
    if (!answered.current) void record('none')
  }, [record, say, tide])

  // Scheduled events from the coach's plan.
  useEffect(() => {
    if (feelTimes.includes(elapsed)) runFeelCheck()
    if (cueTimes.includes(elapsed)) {
      // Land the cue on the breath the coach asked for (start of the next exhale or inhale).
      const c = cueAt(elapsed)
      if (pendingCue.current) clearTimeout(pendingCue.current.timer)
      if (!c.onBreath || c.onBreath === 'any') sayCue(c.text)
      else {
        const want = c.onBreath === 'exhale' ? 'out' : 'in'
        const timer = window.setTimeout(() => { pendingCue.current = null; sayCue(c.text) }, CUE_WAIT_MS)
        pendingCue.current = { text: c.text, want, timer }
      }
    }
    if (elapsed >= length) end()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed])

  function end() {
    endedRef.current = true
    signal.stop()
    publish({ kind: 'end' })
    void linkRef.current?.end() // flushes queued readings, then hands the session to the coach
    void say(LINES.closing).finally(releaseMic)
    const rec = store.finishSession(readings.current, feelChecks.current, linkRef.current?.id)
    nav('/results', { state: { id: rec.id }, replace: true })
  }

  const toggleSea = () => {
    if (seaOn) stopOcean(); else startOcean()
    setSeaOn(!seaOn)
    store.setSoundOn(!seaOn)
  }

  // Say so when nothing reaches the server, instead of quietly running on the phone only.
  const notSaved = !backendOn ? null : refused ?? (!store.userId && elapsed >= 6 ? "Can't reach TIDE's server." : null)
  // The camera couldn't start, so the app is running a simulated breath: never pass that off as real.
  const simulated = signal.mode?.() === 'demo'
  const voiceNote = !voiceOn ? null
    : voice.voice === 'unavailable' ? 'Voice unavailable · cues and questions are shown on screen.'
    : voice.mic === 'denied' ? 'Microphone off · tap your answer when asked.'
    : null

  const cueLine = cue ?? (paused ? 'Paused.' : lost ? 'Finding you… sit back in view of the camera.' : elapsed < 8 ? 'Close your eyes.' : phase === 'in' ? 'in…' : 'out…')

  return (
    <Screen className="session">
      <div className="session__hud" onClick={showHud}>
        <span>{fmt(elapsed)} / {fmt(length)}</span>
        {reading && (lost
          ? <span className="session__state muted"><i style={{ background: 'currentColor' }} />no signal</span>
          : <span className="session__state" style={{ color: `var(--st-${reading.state})` }}><i style={{ background: 'currentColor' }} />{STATE_TEXT[reading.state]}</span>)}
      </div>

      {simulated && <p className="session__unsaved" role="status">Camera not available · this is a simulated breath, not yours.</p>}
      {voiceNote && <p className="session__unsaved" role="status">{voiceNote}</p>}
      {notSaved && <p className="session__unsaved" role="status">Not saved · {notSaved} This session stays on this phone only.</p>}
      <p className="session__cue" onClick={showHud} aria-live="polite">{cueLine}</p>
      <p className="fine">{store.coachOn ? plan.technique.toLowerCase() : 'free session'}</p>

      <div className="spacer" onClick={showHud} />

      <div className="metrics" onClick={showHud}>
        <div><span>breath</span><strong>{reading && !lost && reading.rate > 0 ? reading.rate.toFixed(1) : '—'}<small>/m</small></strong></div>
        <div><span>still</span><strong>{reading ? Math.round(reading.stillness * 100) : '—'}<small>%</small></strong></div>
        <div><span>posture</span><strong>{reading ? Math.round(reading.posture * 100) : '—'}<small>%</small></strong></div>
      </div>

      <div className={`controls${hud ? '' : ' is-hidden'}`}>
        <button className="ctl" onClick={() => { unlockAudio(); if (voiceOn) stopSpeaking(); setVoiceOn((v) => !v); showHud() }}>{voiceOn ? (voice.voice === 'loading' ? 'voice…' : 'voice on') : 'voice off'}</button>
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
