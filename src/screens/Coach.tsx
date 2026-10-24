import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, Screen, Sparkline, TabBar, Tabs, TopBar, type IconName } from '../components/ui'
import { awarenessTrend, focusPct, fmt } from '../lib/metrics'
import { useStore } from '../lib/store'
import { CoachReviewing } from './Home'

function CoachOff() {
  const nav = useNavigate()
  return (
    <div className="card empty">
      <Icon name="spark" size={28} />
      <h2 className="h2">Coach is off</h2>
      <p className="muted">No insights, no next session, no fading plan. Just a breathing graph.</p>
      <button className="btn btn--ghost" onClick={() => nav('/profile')}>Turn coach on</button>
    </div>
  )
}

export function Insights() {
  const s = useStore()
  const nav = useNavigate()
  const [tab, setTab] = useState<'insights' | 'patterns'>('insights')

  return (
    <Screen dim className="with-tabs">
      <TopBar title="AI Coach" />
      {!s.coachOn ? <CoachOff /> : s.coachStatus === 'reviewing' ? <CoachReviewing /> : s.insights && (
        <>
          <Tabs value={tab} onChange={setTab} options={[['insights', 'Insights'], ['patterns', 'Patterns']]} />
          {tab === 'insights' ? (
            <>
              <div className="card">
                <p className="eyebrow"><Icon name="spark" size={14} /> Coach summary</p>
                <p className="summary">{s.insights.summary}</p>
              </div>
              <h2 className="h2">Key takeaways</h2>
              <ol className="takeaways">
                {s.insights.takeaways.map((t) => <li key={t}>{t}</li>)}
              </ol>
            </>
          ) : (
            <div className="list">
              {s.insights.patterns.map((p) => (
                <div key={p.title} className="list__row">
                  <Icon name="wave" />
                  <div><strong>{p.title}</strong><small className="muted">{p.detail}</small><small className="cite">Based on {p.sessions}</small></div>
                </div>
              ))}
            </div>
          )}
          <button className="btn btn--primary" onClick={() => nav('/plan')}>See your next session <Icon name="arrow" size={18} /></button>
        </>
      )}
      <TabBar />
    </Screen>
  )
}

export function PlanScreen() {
  const s = useStore()
  const nav = useNavigate()
  if (!s.coachOn) return <Screen dim><TopBar back /><CoachOff /></Screen>
  const p = s.plan
  const rows: [IconName, string, string][] = [
    ['clock', 'Session length', `${Math.round(p.lengthSec / 60)} minutes`],
    ['bell', 'Gentle cue', p.cueTimes.length ? `at ${fmt(p.cueTimes[0])}, just before you usually drift` : 'None. You’re ready.'],
    ['target', 'Focus area', p.focusArea],
    ['wave', 'Exercise', p.technique],
  ]
  return (
    <Screen dim>
      <TopBar back />
      <p className="eyebrow">Designed by your coach</p>
      <h1 className="h1">Your next session</h1>
      <p className="lede">Built from your patterns.</p>
      <div className="list">
        {rows.map(([icon, k, v]) => (
          <div key={k} className="list__row"><Icon name={icon} /><div><small className="muted">{k}</small><strong>{v}</strong></div></div>
        ))}
      </div>
      <div className="card">
        <div className="row-head"><span className="muted">Coach support</span><span className="muted">{Math.round((1 - p.fadingLevel) * 100)}%</span></div>
        <div className="meter"><i style={{ width: `${(1 - p.fadingLevel) * 100}%` }} /></div>
        <p className="fine">Support fades as you improve, so you learn to notice on your own.</p>
      </div>
      {p.reasons.length > 0 && <ul className="reasons">{p.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
      <div className="spacer" />
      <button className="btn btn--primary" onClick={() => nav('/setup')}>Start next session <Icon name="arrow" size={18} /></button>
    </Screen>
  )
}

export function Progress() {
  const s = useStore()
  const nav = useNavigate()
  const [range, setRange] = useState<'7' | '30' | 'all'>('7')
  const aware = awarenessTrend(s.history)
  const focus = s.history.map((h) => focusPct(h.readings))
  const stillness = s.history.map((h) => h.readings.reduce((a, r) => a + r.stillness, 0) / Math.max(1, h.readings.length))
  const delta = (xs: number[]) => (xs.length > 1 ? Math.round(xs[xs.length - 1] - xs[0]) : 0)

  return (
    <Screen dim className="with-tabs">
      <TopBar title="Your progress" />
      <Tabs value={range} onChange={setRange} options={[['7', '7 days'], ['30', '30 days'], ['all', 'All time']]} />
      <div className="tiles">
        <div className="tile"><span className="tile__k">Self-awareness</span><strong className="tile__v up">{delta(aware) >= 0 ? '+' : ''}{delta(aware)}</strong><Sparkline values={aware} h={30} /></div>
        <div className="tile"><span className="tile__k">Focus</span><strong className="tile__v up">{delta(focus) >= 0 ? '+' : ''}{delta(focus)}%</strong><Sparkline values={focus} h={30} /></div>
        <div className="tile"><span className="tile__k">Stillness</span><strong className="tile__v up">{Math.round(stillness[stillness.length - 1] * 100)}%</strong><Sparkline values={stillness} h={30} /></div>
      </div>
      <p className="fine">Weekend data from our own sessions.</p>
      <div className="row-head"><h2 className="h2">Recent sessions</h2></div>
      <div className="list">
        {[...s.history].reverse().map((h) => (
          <button key={h.id} className="list__row list__row--btn" onClick={() => nav(`/calm-map/${h.id}`)}>
            <div><strong>{new Date(h.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</strong><small className="muted">{fmt(h.lengthSec)}</small></div>
            <div className="grow"><Sparkline values={h.readings.map((r) => r.stillness)} h={26} /></div>
            <span className="muted">{focusPct(h.readings)}%</span>
          </button>
        ))}
      </div>
      <TabBar />
    </Screen>
  )
}

export function Profile() {
  const s = useStore()
  return (
    <Screen dim className="with-tabs">
      <TopBar title="Profile" />
      <div className="card toggle-row">
        <div><strong>AI coach</strong><p className="muted">Designs every session after your first.</p></div>
        <button role="switch" aria-checked={s.coachOn} className={`switch${s.coachOn ? ' is-on' : ''}`} onClick={() => s.setCoachOn(!s.coachOn)}><i /></button>
      </div>
      <div className="card">
        <p className="eyebrow"><Icon name="lock" size={14} /> Privacy</p>
        <p className="muted">Video is processed on your phone and never stored or uploaded. Only the numbers leave it. Spoken answers are not saved.</p>
      </div>
      <div className="card">
        <p className="eyebrow">Not medical advice</p>
        <p className="muted">TIDE is a wellness and training tool. It does not diagnose or treat anything.</p>
      </div>
      <button className="btn btn--ghost" onClick={s.resetDemo}>Reset demo data</button>
      <TabBar />
    </Screen>
  )
}
