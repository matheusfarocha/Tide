import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { CalmMap, Icon, Legend, Ring, Screen, Tabs, TopBar } from '../components/ui'
import { avgRate, firstDriftSec, fmt, focusPct, moments, postureLabel, selfAwareness, stillnessLabel } from '../lib/metrics'
import { useStore } from '../lib/store'
import { CoachReviewing } from './Home'

function useSession(id?: string) {
  const { history } = useStore()
  return history.find((h) => h.id === id) ?? history[history.length - 1]
}

export function Results() {
  const s = useStore()
  const nav = useNavigate()
  const loc = useLocation() as { state?: { id?: string } }
  const rec = useSession(loc.state?.id)
  if (!rec) return null
  const focus = focusPct(rec.readings)
  const drift = firstDriftSec(rec.readings)
  const aware = selfAwareness(rec.feelChecks)

  return (
    <Screen dim>
      <TopBar close="/" title="Session complete" />
      <p className="muted center">{new Date(rec.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {fmt(rec.lengthSec)}</p>

      <section className="card score">
        <Ring value={focus / 100} size={112}><strong className="num-lg">{focus}%</strong><small>focus</small></Ring>
        <div className="score__side">
          <p>You were focused for <b>{focus}%</b> of the session.</p>
          {drift !== null && <p className="muted">You first drifted at {fmt(drift)}.</p>}
        </div>
      </section>

      <div className="tiles">
        <div className="tile"><span className="tile__k">Breathing</span><strong className="tile__v">{avgRate(rec.readings)}<small>/min</small></strong></div>
        <div className="tile"><span className="tile__k">Stillness</span><strong className="tile__v">{stillnessLabel(rec.readings)}</strong></div>
        <div className="tile"><span className="tile__k">Posture</span><strong className="tile__v">{postureLabel(rec.readings)}</strong></div>
      </div>

      {rec.feelChecks.length > 0 && (
        <div className="card">
          <div className="row-head"><h2 className="h2">Feel Checks</h2><span className="pill">{aware}% matched</span></div>
          {rec.feelChecks.map((f, i) => (
            <div key={i} className="fc-row">
              <span className="muted">{fmt(f.t)}</span>
              <span>You: <b>{f.answer}</b></span>
              <span>TIDE: <b>{f.sensorState}</b></span>
              {f.answer === 'none' ? <span className="muted">–</span> : <span className={f.match ? 'ok' : 'miss'}>{f.match ? '✓' : '✕'}</span>}
            </div>
          ))}
        </div>
      )}

      {s.coachOn ? (
        s.coachStatus === 'reviewing' ? <CoachReviewing /> : (
          <Link to="/insights" className="card coach-card coach-card--ready">
            <Icon name="spark" />
            <div><strong>Your coach has a new plan</strong><p className="muted">See what it found →</p></div>
          </Link>
        )
      ) : (
        <div className="card muted">Coach is off. No insights or next session, just your breathing graph.</div>
      )}

      <button className="btn btn--primary" onClick={() => nav(`/calm-map/${rec.id}`)}>View Calm Map <Icon name="arrow" size={18} /></button>
      <button className="btn btn--ghost" onClick={() => nav('/')}>Done</button>
    </Screen>
  )
}

type Lens = 'all' | 'rate' | 'stillness' | 'posture'

export function CalmMapScreen() {
  const { id } = useParams()
  const rec = useSession(id)
  const [lens, setLens] = useState<Lens>('all')
  if (!rec) return null
  const lanes = lens === 'all' ? undefined : [lens]
  const ms = moments(rec.readings).filter((m) => m.state !== 'focused' || m.to - m.from > 30)

  return (
    <Screen dim>
      <TopBar back title="Calm Map" />
      <Tabs value={lens} onChange={setLens} options={[['all', 'Overview'], ['rate', 'Breathing'], ['stillness', 'Movement'], ['posture', 'Posture']]} />
      <div className="card">
        <CalmMap readings={rec.readings} feelChecks={rec.feelChecks} lanes={lanes as any} />
        <Legend />
      </div>
      <h2 className="h2">Key moments</h2>
      <div className="list">
        {ms.map((m, i) => (
          <div key={i} className="list__row">
            <i className="dot" style={{ background: `var(--st-${m.state})` }} />
            <div>
              <span className="muted">{fmt(m.from)} – {fmt(m.to)}</span>
              <strong>{{ settling: 'Settling in', focused: 'Steady focus', drifting: 'Mind wandered', drowsy: 'Got sleepy', restless: 'Restless' }[m.state]}</strong>
              <small className="muted">{{ settling: 'Learning your baseline.', focused: 'Even breathing, body still.', drifting: 'More movement, irregular breathing.', drowsy: 'Head dropped, breathing slowed.', restless: 'Lots of movement.' }[m.state]}</small>
            </div>
          </div>
        ))}
      </div>
    </Screen>
  )
}
