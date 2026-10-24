import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Screen } from '../components/ui'
import { publish } from '../lib/live'
import { fmt } from '../lib/metrics'
import { startOcean, stopOcean } from '../lib/ocean'
import { createFakeSignal } from '../lib/signal'
import { useStore } from '../lib/store'
import { useTide, useTideCtl } from '../lib/tide'
import type { FeelAnswer, FeelCheck, MindState, Reading } from '../lib/types'
import { interpret, listen, speak } from '../lib/voice'

// The plan-driven session runner. The tide on screen is the person's real breath.
// Swap createFakeSignal for Person 1's real SignalSource.

const matches = (a: FeelAnswer, s: MindState) =>
  a === 'focused' ? s === 'focused' || s === 'settling' : a === 'drifting' ? s === 'drifting' || s === 'drowsy' || s === 'restless' : false

const STATE_TEXT: Record<MindState, string> = {
  settling: 'settling', focused: 'steady', drifting: 'wandering', drowsy: 'sleepy', restless: 'restless',
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

  const signal = useMemo(() => createFakeSignal({ lengthSec: length }), [length])
  const readings = useRef<Reading[]>([])
  const feelChecks = useRef<FeelCheck[]>([])
  const lastV = useRef(0)
  const answered = useRef(true)
  const elapsedRef = useRef(0)
  const pausedRef = useRef(false)

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

  useTide(0.5, reading?.state ?? 'settling')

  const showHud = useCallback(() => {
    setHud(true)
    clearTimeout(hudTimer.current)
    hudTimer.current = window.setTimeout(() => setHud(false), 4500)
  }, [])

  const say = useCallback((t: string) => { if (voiceOn) speak(t) }, [voiceOn])

  useEffect(() => {
    if (store.soundOn) startOcean()
    signal.start()
    publish({ kind: 'start', lengthSec: length })
    const offB = signal.onBreath((v) => {
      if (pausedRef.current) return
      tide.pushBreath(Math.max(-1, Math.min(1, v)))
      const p = v > lastV.current ? 'in' : 'out'
      lastV.current = v
      setPhase((old) => (old === p ? old : p))
      publish({ kind: 'breath', v })
    })
    const offR = signal.onReading((r) => {
      if (pausedRef.current) return
      const rr = { ...r, t: elapsedRef.current }
      readings.current.push(rr)
      setReading(rr)
      publish({ kind: 'reading', r: rr })
    })
    const clock = setInterval(() => {
      if (pausedRef.current) return
      elapsedRef.current += 1
      setElapsed(elapsedRef.current)
    }, 1000)
    say('Close your eyes. Let your breath settle on its own.')
    showHud()
    return () => {
      offB(); offR(); clearInterval(clock); signal.stop()
      window.speechSynthesis?.cancel()
      clearTimeout(hudTimer.current)
      tide.setCalm(false)
      stopOcean()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signal])

  const record = useCallback((answer: FeelAnswer, spoken?: string) => {
    if (answered.current) return
    answered.current = true
    const sensorState = readings.current[readings.current.length - 1]?.state ?? 'settling'
    const fc: FeelCheck = { t: elapsedRef.current, spoken, answer, sensorState, match: matches(answer, sensorState) }
    feelChecks.current.push(fc)
    publish({ kind: 'feel', f: fc })
    navigator.vibrate?.(fc.match ? [12, 60, 12] : 30)
    tide.ripple(window.innerWidth / 2, fc.match ? 2.4 : 1)
    setAsking(false)
    setResult(fc)
    setTimeout(() => { setResult(null); tide.setCalm(false) }, 3600)
  }, [tide])

  const runFeelCheck = useCallback(async () => {
    answered.current = false
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
      const text = 'Come back to your breath.'
      setCue(text)
      say(text)
      setTimeout(() => setCue(null), 6000)
    }
    if (elapsed >= length) end()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed])

  function end() {
    signal.stop()
    publish({ kind: 'end' })
    const rec = store.finishSession(readings.current, feelChecks.current)
    nav('/results', { state: { id: rec.id }, replace: true })
  }

  const toggleSea = () => {
    if (seaOn) stopOcean(); else startOcean()
    setSeaOn(!seaOn)
    store.setSoundOn(!seaOn)
  }

  const cueText = cue ?? (paused ? 'Paused.' : elapsed < 8 ? 'Close your eyes.' : phase === 'in' ? 'in…' : 'out…')

  return (
    <Screen className="session">
      <div className="session__hud" onClick={showHud}>
        <span>{fmt(elapsed)} / {fmt(length)}</span>
        {reading && <span className="session__state" style={{ color: `var(--st-${reading.state})` }}><i style={{ background: 'currentColor' }} />{STATE_TEXT[reading.state]}</span>}
      </div>

      <p className="session__cue" onClick={showHud} aria-live="polite">{cueText}</p>
      <p className="fine">{store.coachOn ? plan.technique.toLowerCase() : 'free session'}</p>

      <div className="spacer" onClick={showHud} />

      <div className="metrics" onClick={showHud}>
        <div><span>breath</span><strong>{reading?.rate.toFixed(1) ?? '—'}<small>/m</small></strong></div>
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
