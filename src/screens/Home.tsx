import { Link, useNavigate } from 'react-router-dom'
import { Icon, Ring, Screen, Sparkline, TabBar } from '../components/ui'
import { avgRate, awarenessTrend, focusPct } from '../lib/metrics'
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
  const last = s.history[s.history.length - 1]
  const score = awareness[awareness.length - 1] ?? 0
  const delta = awareness.length > 1 ? score - awareness[awareness.length - 2] : 0

  return (
    <Screen className="with-tabs">
      <div className="wordmark wordmark--sm">TIDE</div>
      <h1 className="h1">{greeting()}{s.name ? `, ${s.name}` : ''}</h1>
      <p className="lede">A calmer mind, backed by your data.</p>

      {s.coachStatus === 'reviewing' && <CoachReviewing />}

      <section className="card score">
        <div>
          <p className="eyebrow">Self-awareness</p>
          <Ring value={score / 100} size={104}>
            <strong className="num-lg">{score}</strong><small>/100</small>
          </Ring>
        </div>
        <div className="score__side">
          <p className="score__title">{delta >= 0 ? 'Improving' : 'Dipped'}</p>
          <p className="muted">{delta >= 0 ? '+' : ''}{delta} since last session</p>
          <Sparkline values={awareness} h={44} />
          <p className="fine">How often what you felt matched what TIDE saw.</p>
        </div>
      </section>

      <div className="row-head"><h2 className="h2">Last session</h2><Link to="/progress" className="link">View all →</Link></div>
      {last && (
        <div className="tiles">
          <div className="tile"><span className="tile__k">Focus</span><strong className="tile__v">{focusPct(last.readings)}%</strong></div>
          <div className="tile"><span className="tile__k">Breathing</span><strong className="tile__v">{avgRate(last.readings)}<small>/min</small></strong></div>
          <div className="tile"><span className="tile__k">Sessions</span><strong className="tile__v">{s.history.length}</strong></div>
        </div>
      )}

      <button className="btn btn--primary" onClick={() => nav(s.coachOn ? '/plan' : '/setup')}>
        {s.coachOn ? 'Start your next session' : 'Start a session'} <Icon name="arrow" size={18} />
      </button>
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
