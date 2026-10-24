import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, Screen, TopBar } from '../components/ui'
import { publish } from '../lib/live'
import { fmt } from '../lib/metrics'
import { createFakeSignal } from '../lib/signal'
import { useStore } from '../lib/store'
import type { FeelAnswer, FeelCheck, MindState, Reading } from '../lib/types'
import { interpret, listen, speak } from '../lib/voice'

// The plan-driven session runner. Swap createFakeSignal for Person 1's real SignalSource.

const matches = (a: FeelAnswer, s: MindState) =>
  a === 'focused' ? s === 'focused' || s === 'settling' : a === 'drifting' ? s === 'drifting' || s === 'drowsy' || s === 'restless' : false

export function Session() {
  const store = useStore()
  const nav = useNavigate()
  const length = store.lengthSec
  const plan = store.plan
  const scale = length / plan.lengthSec
  const feelTimes = useMemo(() => plan.feelCheckTimes.map((t) => Math.round(t * scale)).filter((t) => t > 10 && t < length - 5), [plan, scale, length])
  const cueTimes = useMemo(() => (plan.fadingLevel < 0.8 ? plan.cueTimes.map((t) => Math.round(t * scale)) : []), [plan, scale])

  const signal = useMemo(() => createFakeSignal({ lengthSec: length }), [length])
  const readings = useRef<Reading[]>([])
  const feelChecks = useRef<FeelCheck[]>([])
  const orb = useRef<HTMLDivElement>(null)
  const lastV = useRef(0)

  const [elapsed, setElapsed] = useState(0)
  const [paused, setPaused] = useState(false)
  const [voiceOn, setVoiceOn] = useState(true)
  const [reading, setReading] = useState<Reading | null>(null)
  const [phase, setPhase] = useState<'in' | 'out'>('in')
  const [asking, setAsking] = useState(false)
  const [result, setResult] = useState<FeelCheck | null>(null)
  const [cue, setCue] = useState<string | null>(null)
  const pausedRef = useRef(false)
  pausedRef.current = paused
  const elapsedRef = useRef(0)

  const say = useCallback((t: string) => { if (voiceOn) speak(t) }, [voiceOn])

  useEffect(() => {
    signal.start()
    publish({ kind: 'start', lengthSec: length })
    const offB = signal.onBreath((v) => {
      if (pausedRef.current) return
      orb.current?.style.setProperty('--b', String(v))
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
    return () => { offB(); offR(); clearInterval(clock); signal.stop(); window.speechSynthesis?.cancel() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signal])

  const answered = useRef(true)

  const record = useCallback((answer: FeelAnswer, spoken?: string) => {
    if (answered.current) return
    answered.current = true
    const sensorState = readings.current[readings.current.length - 1]?.state ?? 'settling'
    const fc: FeelCheck = { t: elapsedRef.current, spoken, answer, sensorState, match: matches(answer, sensorState) }
    feelChecks.current.push(fc)
    publish({ kind: 'feel', f: fc })
    setAsking(false)
    setResult(fc)
    setTimeout(() => setResult(null), 3200)
  }, [])

  const runFeelCheck = useCallback(async () => {
    answered.current = false
    setAsking(true)
    publish({ kind: 'asking' })
    say('Focused, or drifting?')
    // No answer after 12 s is logged as quiet (possible drowsiness or deep focus).
    setTimeout(() => record('none'), 12000)
    await new Promise((r) => setTimeout(r, 1800))
    const heard = await listen(9000)
    if (heard) record(interpret(heard), heard)
  }, [record, say])

  // Scheduled events from the coach's plan.
  useEffect(() => {
    if (feelTimes.includes(elapsed)) runFeelCheck()
    if (cueTimes.includes(elapsed)) {
      const text = 'Gently bring your attention back to your breath.'
      setCue(text)
      say(text)
      setTimeout(() => setCue(null), 5000)
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

  const stateText: Record<MindState, string> = {
    settling: 'Settling in', focused: 'Steady', drifting: 'Wandering', drowsy: 'Getting sleepy', restless: 'Restless',
  }

  return (
    <Screen className="session">
      <TopBar close="/" title={<><small className="muted">{store.coachOn ? plan.technique : 'Free session'}</small><span>{fmt(elapsed)} / {fmt(length)}</span></>} />

      <div className="orb-wrap">
        <div ref={orb} className="orb">
          <svg className="orb__wave" viewBox="0 0 200 60" preserveAspectRatio="none">
            <path d="M0 30 Q25 10 50 30 T100 30 T150 30 T200 30" />
          </svg>
        </div>
        <p className="orb__text">{cue ?? (elapsed < 8 ? 'Close your eyes.' : phase === 'in' ? 'Breathe in' : 'Breathe out')}</p>
        {reading && <p className="state-pill"><i style={{ background: `var(--st-${reading.state})` }} />{stateText[reading.state]}</p>}
      </div>

      <div className="card metrics">
        <div><span className="muted">Breathing</span><strong>{reading?.rate.toFixed(1) ?? '–'}<small>/min</small></strong></div>
        <div><span className="muted">Stillness</span><strong>{reading ? (reading.stillness > 0.8 ? 'High' : reading.stillness > 0.6 ? 'Medium' : 'Low') : '–'}</strong></div>
        <div><span className="muted">Posture</span><strong>{reading ? (reading.posture > 0.75 ? 'Good' : 'Slumping') : '–'}</strong></div>
      </div>

      <div className="controls">
        <button className="ctl" onClick={() => setVoiceOn((v) => !v)} aria-label={voiceOn ? 'Mute voice' : 'Unmute voice'}>
          <Icon name={voiceOn ? 'vol' : 'mute'} /><span>{voiceOn ? 'Voice on' : 'Muted'}</span>
        </button>
        <button className="ctl ctl--main" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Resume' : 'Pause'}>
          <Icon name={paused ? 'play' : 'pause'} size={26} />
        </button>
        <button className="ctl" onClick={end} aria-label="End session"><Icon name="stop" /><span>End</span></button>
      </div>

      {(asking || result) && (
        <div className="sheet" role="dialog" aria-label="Feel Check">
          <div className="sheet__orb" />
          <h2 className="h1 center">Feel Check</h2>
          {asking ? (
            <>
              <p className="lede center"><Icon name="mic" size={16} /> Say it out loud, eyes closed. Or tap.</p>
              <div className="options">
                <button className="option" onClick={() => record('focused')}><Icon name="sun" size={26} /><span><b>Focused</b><small>Present with my breath</small></span></button>
                <button className="option" onClick={() => record('drifting')}><Icon name="cloud" size={26} /><span><b>Drifting</b><small>My mind wandered</small></span></button>
                <button className="option" onClick={() => record('unsure')}><Icon name="q" size={26} /><span><b>Not sure</b><small>Hard to tell</small></span></button>
              </div>
            </>
          ) : result && (
            <div className="verdict">
              <div><span className="muted">You felt</span><strong>{result.answer === 'none' ? 'No answer' : result.answer}</strong>{result.spoken && <small>“{result.spoken}”</small>}</div>
              <div><span className="muted">TIDE saw</span><strong>{result.sensorState}</strong></div>
              <p className={`verdict__tag ${result.match ? 'ok' : 'miss'}`}>{result.match ? 'You caught it ✓' : result.answer === 'none' ? 'Logged as quiet' : 'Not quite. Keep noticing.'}</p>
            </div>
          )}
        </div>
      )}
    </Screen>
  )
}
