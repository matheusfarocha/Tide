import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, Screen, TopBar } from '../components/ui'
import { backendOn, SessionLink } from '../lib/backend'
import { breathAccuracy } from '../lib/metrics'
import { createSignal } from '../lib/realSignal'
import { useStore } from '../lib/store'
import { useTide } from '../lib/tide'
import type { BreathTest as Result } from '../lib/types'

// Breath-counting focus test (Levinson et al., 2014). You tap on each exhale while counting silently;
// TIDE checks your taps against the breaths the camera actually saw. With Convex on, the taps and the
// detected breaths are stored as a breathCount session and scored server-side (shared/scoring.ts).

const DURATION = 60

export function BreathTest() {
  const nav = useNavigate()
  const { addBreathTest, userId } = useStore()
  const [stage, setStage] = useState<'intro' | 'run' | 'done'>('intro')
  const [left, setLeft] = useState(DURATION)
  const [taps, setTaps] = useState(0)
  const [lost, setLost] = useState(0)
  const [ripple, setRipple] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const observed = useRef(0)
  const tapTimes = useRef<number[]>([])
  const inhaleTimes = useRef<number[]>([])
  const t0 = useRef(0)
  const link = useRef<SessionLink | null>(null)
  const signal = useMemo(() => createSignal({ lengthSec: DURATION, targetRate: 9 + Math.random() * 3 }), [])
  useTide(stage === 'run' ? 0.12 : 0.3)

  useEffect(() => {
    if (stage !== 'run') return
    observed.current = 0
    tapTimes.current = []
    inhaleTimes.current = []
    t0.current = performance.now()
    if (!link.current && backendOn && userId) link.current = new SessionLink(userId, 'breathCount')
    let armed = true
    signal.start()
    // Real source: count detected inhales. Otherwise (demo signal) count rising crossings,
    // with hysteresis so noise doesn't double-count.
    const off = signal.onInhale
      ? signal.onInhale((t) => { observed.current++; inhaleTimes.current.push(Math.round(t * 1000 - t0.current)) })
      : signal.onBreath((v) => {
          if (armed && v > 0.4) { observed.current++; armed = false }
          if (v < -0.4) armed = true
        })
    const id = setInterval(() => setLeft((l) => l - 1), 1000)
    return () => {
      off(); signal.stop(); clearInterval(id)
      // Left mid-test: close the server session (no score is posted for an unfinished test).
      const l = link.current
      link.current = null
      void l?.end()
    }
  }, [stage, signal])

  useEffect(() => {
    if (stage !== 'run' || left > 0) return
    const r: Result = { date: new Date().toISOString(), reported: taps, observed: observed.current, lostCount: lost }
    addBreathTest(r)
    setResult(r)
    const l = link.current
    link.current = null
    if (l) void l.breathCount({ startT: 0, endT: DURATION * 1000, tapTimes: tapTimes.current, detectedTimes: inhaleTimes.current }).then(() => l.end())
    setStage('done')
  }, [left, stage, taps, lost, addBreathTest])

  if (stage === 'intro') return (
    <Screen>
      <TopBar back />
      <p className="eyebrow">Focus test · 60 seconds</p>
      <h1 className="h1">Count your breaths</h1>
      <ol className="steps">
        <li>Close your eyes and breathe normally.</li>
        <li>Count each breath silently, 1 to 9, then start again.</li>
        <li><b>Tap anywhere</b> on each exhale.</li>
        <li>Lost count? Tap <b>Lost count</b> and restart at 1.</li>
      </ol>
      <div className="card">
        <p className="muted small">TIDE sees your real breaths, so it can check your count. People who lose count notice only about 3 in 10 of their slips (Levinson et al., 2014). That’s the blind spot this trains.</p>
        <p className="fine">Based on Levinson et al., Frontiers in Psychology, 2014.</p>
      </div>
      <div className="spacer" />
      <button className="btn btn--primary" onClick={() => setStage('run')}>Start <Icon name="arrow" size={18} /></button>
    </Screen>
  )

  if (stage === 'run') return (
    <Screen className="tapper-screen">
      <TopBar close="/" title={<span>{left}s</span>} />
      <button className="tapper" onClick={() => { setTaps((t) => t + 1); setRipple((r) => r + 1); tapTimes.current.push(Math.round(performance.now() - t0.current)) }} aria-label="Tap on each exhale">
        <span key={ripple} className="tapper__ripple" />
        <span className="tapper__label">Tap on each exhale</span>
      </button>
      <button className="btn btn--ghost" onClick={() => setLost((l) => l + 1)}>Lost count</button>
    </Screen>
  )

  const acc = result ? breathAccuracy(result) : 0
  return (
    <Screen>
      <TopBar close="/" title="Breath-count test" />
      <section className="card score">
        <div className="big-acc"><strong className="num-xl">{acc}%</strong><span className="muted">accuracy</span></div>
      </section>
      <div className="tiles">
        <div className="tile"><span className="tile__k">You counted</span><strong className="tile__v">{result?.reported}</strong></div>
        <div className="tile"><span className="tile__k">TIDE saw</span><strong className="tile__v">{result?.observed}</strong></div>
        <div className="tile"><span className="tile__k">Lost count</span><strong className="tile__v">{result?.lostCount}</strong></div>
      </div>
      <p className="lede">{acc >= 85 ? 'Your count matched your breathing. Strong focus.' : acc >= 60 ? 'Close. A few breaths slipped past you.' : 'Your count drifted from your breathing. That’s normal early on.'}</p>
      <div className="spacer" />
      <button className="btn btn--primary" onClick={() => nav('/scores')}>See scoreboard <Icon name="arrow" size={18} /></button>
      <button className="btn btn--ghost" onClick={() => { setTaps(0); setLost(0); setLeft(DURATION); setStage('intro') }}>Try again</button>
    </Screen>
  )
}
