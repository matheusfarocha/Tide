import { Link, useNavigate } from 'react-router-dom'
import { Icon, Ring, Screen, Sparkline, TabBar, stateColor } from '../components/ui'
import { awarenessTrend, driftsCaught, fmt, focusPct, level, streak, totalMinutes } from '../lib/metrics'
import { useStore } from '../lib/store'

export function Welcome() {
  const nav = useNavigate()
  return (
    <Screen className="welcome">
      <div className="wordmark">TIDE</div>
      <div className="welcome__body">
        <h1 className="display">A calmer mind, guided by what you don’t see.</h1>
        <p className="lede">A meditation coach that sees when your mind wanders, and teaches you to notice it yourself.</p>
      </div>
      <button className="btn btn--light" onClick={() => nav('/onboard')}>Get started <Icon name="arrow" size={18} /></button>
      <p className="fine"><Icon name="lock" size={14} /> Video stays on your phone. Only numbers leave it.</p>
    </Screen>
  )
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export function Home() {
  const s = useStore()
  const nav = useNavigate()
  if (!s.onboarded) return <Welcome />

  const awareness = awarenessTrend(s.history)
  const score = awareness[awareness.length - 1] ?? 0
  const delta = awareness.length > 1 ? score - awareness[awareness.length - 2] : 0
  const lvl = level(score)
  const days = streak(s.history)
  const last = s.history[s.history.length - 1]
  const p = s.plan

  return (
    <Screen className="with-tabs">
      <header className="home-head">
        <div className="wordmark wordmark--sm">TIDE</div>
        <Link to="/profile" className="avatar" aria-label="Profile">{(s.name || 'You')[0].toUpperCase()}</Link>
      </header>

      <div>
        <h1 className="h1">{greeting()}{s.name ? `, ${s.name}` : ''}</h1>
        {days > 0 && <p className="streak"><span className="streak__dot" />{days}-day streak</p>}
      </div>

      {s.coachStatus === 'reviewing' && <CoachReviewing />}

      <Link to="/scores" className="card score score--link">
        <Ring value={score / 100} size={108}>
          <strong className="num-lg">{score}</strong><small>/100</small>
        </Ring>
        <div className="score__side">
          <p className="eyebrow">Self-awareness</p>
          <p className="score__title">Level {lvl.n} · {lvl.name}</p>
          <p className="muted small">{delta >= 0 ? '+' : ''}{delta} since last session{lvl.next ? ` · ${lvl.toNext} to ${lvl.next}` : ''}</p>
          <Sparkline values={awareness} h={34} />
        </div>
      </Link>

      <section className="card next">
        <div className="row-head">
          <p className="eyebrow">{s.coachOn ? 'Next session · by your coach' : 'Free session'}</p>
          {s.coachOn && <Link to="/plan" className="link small">Why →</Link>}
        </div>
        <p className="next__title">{s.coachOn ? p.technique : 'Breathe and notice'}</p>
        <div className="next__meta">
          <span><Icon name="clock" size={14} />{fmt(s.lengthSec)}</span>
          {s.coachOn && p.cueTimes.length > 0 && <span><Icon name="bell" size={14} />Cue before your usual drift</span>}
          <span><Icon name="sun" size={14} />{p.feelCheckTimes.length} Feel Checks</span>
        </div>
        <button className="btn btn--primary" onClick={() => nav('/setup')}>Start session <Icon name="arrow" size={18} /></button>
      </section>

      <div className="tiles">
        <div className="tile"><span className="tile__k">Drifts caught</span><strong className="tile__v">{driftsCaught(s.history)}</strong></div>
        <div className="tile"><span className="tile__k">Minutes</span><strong className="tile__v">{totalMinutes(s.history)}</strong></div>
        <div className="tile"><span className="tile__k">Sessions</span><strong className="tile__v">{s.history.length}</strong></div>
      </div>

      <div className="quick">
        <Link to="/breath-test" className="card quick__item">
          <Icon name="lungs" size={22} />
          <strong>Breath-count test</strong>
          <small className="muted">60 s focus check</small>
        </Link>
        <Link to="/scores" className="card quick__item">
          <Icon name="trophy" size={22} />
          <strong>Scoreboard</strong>
          <small className="muted">Levels and records</small>
        </Link>
      </div>

      {last && (
        <Link to={`/calm-map/${last.id}`} className="card last">
          <div className="row-head">
            <p className="eyebrow">Last session</p>
            <span className="muted small">{focusPct(last.readings)}% focused →</span>
          </div>
          <div className="strip" aria-label="Focus timeline of your last session">
            {last.readings.map((r, i) => <i key={i} style={{ background: stateColor[r.state] }} />)}
          </div>
        </Link>
      )}

      <TabBar />
    </Screen>
  )
}

export function CoachReviewing() {
  return (
    <div className="card coach-card" role="status">
      <span className="pulse" />
      <div>
        <strong>Your coach is reviewing your session…</strong>
        <p className="muted">Finding patterns and designing your next one.</p>
      </div>
    </div>
  )
}
