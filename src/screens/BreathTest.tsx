import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, Screen, TopBar } from '../components/ui'
import { breathAccuracy } from '../lib/metrics'
import { createFakeSignal } from '../lib/signal'
import { useStore } from '../lib/store'
import type { BreathTest as Result } from '../lib/types'

// Breath-counting focus test (Levinson et al., 2014). You tap on each exhale while counting silently;
// TIDE checks your taps against the breaths the camera actually saw. Swap the fake signal for Person 1's.

const DURATION = 60

export function BreathTest() {
  const nav = useNavigate()
  const { addBreathTest } = useStore()
  const [stage, setStage] = useState<'intro' | 'run' | 'done'>('intro')
  const [left, setLeft] = useState(DURATION)
  const [taps, setTaps] = useState(0)
  const [lost, setLost] = useState(0)
  const [ripple, setRipple] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const observed = useRef(0)
  const signal = useMemo(() => createFakeSignal({ lengthSec: DURATION, targetRate: 9 + Math.random() * 3 }), [])

  useEffect(() => {
    if (stage !== 'run') return
    observed.current = 0
    let armed = true
    signal.start()
    // Count a breath on each rising crossing, with hysteresis so noise doesn't double-count.
    const off = signal.onBreath((v) => {
      if (armed && v > 0.4) { observed.current++; armed = false }
      if (v < -0.4) armed = true
    })
    const id = setInterval(() => setLeft((l) => l - 1), 1000)
    return () => { off(); signal.stop(); clearInterval(id) }
  }, [stage, signal])

  useEffect(() => {
    if (stage !== 'run' || left > 0) return
    const r: Result = { date: new Date().toISOString(), reported: taps, observed: observed.current, lostCount: lost }
    addBreathTest(r)
    setResult(r)
    setStage('done')
  }, [left, stage, taps, lost, addBreathTest])

  if (stage === 'intro') return (
    <Screen dim>
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
        <p className="muted small">TIDE sees your real breaths, so it can check your count. People who lose count miss it about two-thirds of the time. That’s the blind spot this trains.</p>
        <p className="fine">Based on Levinson et al., Frontiers in Psychology, 2014.</p>
      </div>
      <div className="spacer" />
      <button className="btn btn--primary" onClick={() => setStage('run')}>Start <Icon name="arrow" size={18} /></button>
    </Screen>
  )

  if (stage === 'run') return (
    <Screen className="tapper-screen">
      <TopBar close="/" title={<span>{left}s</span>} />
      <button className="tapper" onClick={() => { setTaps((t) => t + 1); setRipple((r) => r + 1) }} aria-label="Tap on each exhale">
        <span key={ripple} className="tapper__ripple" />
        <span className="tapper__label">Tap on each exhale</span>
      </button>
      <button className="btn btn--ghost" onClick={() => setLost((l) => l + 1)}>Lost count</button>
    </Screen>
  )

  const acc = result ? breathAccuracy(result) : 0
  return (
    <Screen dim>
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
