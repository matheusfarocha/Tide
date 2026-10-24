import { Link, useNavigate } from 'react-router-dom'
import { Counter, HoldButton, Icon, Screen, Sparkline, TideGauge, depthOf, stateColor } from '../components/ui'
import { awarenessTrend, driftsCaught, fmt, level, streak, totalMinutes } from '../lib/metrics'
import { startOcean } from '../lib/ocean'
import { useStore } from '../lib/store'
import { useTide } from '../lib/tide'

export function Welcome() {
  const nav = useNavigate()
  useTide(0.3)
  return (
    <Screen className="welcome">
      <div className="welcome__top">
        <span className="wordmark">tide</span>
        <span className="fine">v0.1 · cal hacks</span>
      </div>
      <div className="welcome__body">
        <h1 className="display">Your mind drifts.<br /><em>Learn to feel it.</em></h1>
        <p className="lede">A meditation coach that watches your breath, then teaches you to notice your own wandering, and slowly steps back.</p>
      </div>
      <div className="welcome__foot">
        <HoldButton label="hold to begin" onDone={() => nav('/onboard')} />
        <p className="fine"><Icon name="lock" size={12} /> video never leaves your phone</p>
      </div>
    </Screen>
  )
}

function greeting() {
  const h = new Date().getHours()
  return h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export function Home() {
  const s = useStore()
  const nav = useNavigate()
  useTide(s.onboarded ? depthOf('/') : 0.3)
  if (!s.onboarded) return <Welcome />

  const awareness = awarenessTrend(s.history)
  const score = awareness[awareness.length - 1] ?? 0
  const delta = awareness.length > 1 ? score - awareness[awareness.length - 2] : 0
  const lvl = level(score)
  const days = streak(s.history)
  const last = s.history[s.history.length - 1]
  const p = s.plan

  const begin = () => {
    if (s.soundOn) startOcean()
    nav('/setup')
  }

  return (
    <Screen className="with-tabs">
      <header className="home-head">
        <span className="wordmark">tide</span>
      </header>

      <div>
        <h1 className="h1">{greeting()}{s.name ? `, ${s.name}` : ''}.</h1>
        {days > 0 && <p className="streak"><span className="streak__dot" />{days} days in a row</p>}
      </div>

      {s.coachStatus === 'reviewing' && <CoachReviewing />}

      <div className="home-sea">
        <Link to="/scores" className="readout-big">
          <span className="num-xl"><Counter value={score} /></span>
          <span className="readout-big__meta">
            <b>self-awareness</b>
            <span className="fine">lvl {lvl.n} {lvl.name.toLowerCase()} · {delta >= 0 ? '+' : ''}{delta}</span>
          </span>
        </Link>
        <Sparkline values={awareness} h={28} />

        <div className="telemetry">
          <div><span>caught</span><strong>{driftsCaught(s.history)}</strong></div>
          <div><span>minutes</span><strong>{totalMinutes(s.history)}</strong></div>
          <div><span>sessions</span><strong>{s.history.length}</strong></div>
        </div>

        {last && (
          <Link to={`/calm-map/${last.id}`} aria-label="Open your last session">
            <p className="eyebrow">last session</p>
            <div className="strip">{last.readings.map((r, i) => <i key={i} style={{ background: stateColor[r.state] }} />)}</div>
          </Link>
        )}

        <div className="next-line">
          <p className="eyebrow">{s.coachOn ? 'next · designed by your coach' : 'free session'}</p>
          <p className="next-line__title">{s.coachOn ? p.technique : 'Breathe and notice'}</p>
          <span className="next-line__meta">{fmt(s.lengthSec)} · {p.feelCheckTimes.length} feel checks{s.coachOn && p.cueTimes.length ? ' · cue before your usual drift' : ''}</span>
        </div>

        <HoldButton label="hold to begin" onDone={begin} />
        <Link to="/breath-test" className="link center">breath-count test →</Link>
      </div>

      <TideGauge />
    </Screen>
  )
}

export function CoachReviewing() {
  return (
    <div className="card coach-card" role="status">
      <span className="pulse" />
      <div>
        <strong>Your coach is reading the tide…</strong>
        <p className="muted">Finding patterns, designing your next session.</p>
      </div>
    </div>
  )
}
