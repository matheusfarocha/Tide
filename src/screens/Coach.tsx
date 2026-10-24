import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, Screen, Sparkline, TideGauge, Tabs, TopBar, Typewriter, depthOf, type IconName } from '../components/ui'
import { awarenessTrend, focusPct, fmt } from '../lib/metrics'
import { startOcean, stopOcean } from '../lib/ocean'
import { useStore } from '../lib/store'
import { useTide } from '../lib/tide'
import { CoachReviewing } from './Home'

function CoachOff() {
  const nav = useNavigate()
  return (
    <div className="empty">
      <p className="h2">coach is off</p>
      <p className="whisper">No insights. No next session.<br />Just the tide.</p>
      <button className="btn btn--ghost" onClick={() => nav('/profile')}>turn the coach on</button>
    </div>
  )
}

export function Insights() {
  const s = useStore()
  const nav = useNavigate()
  const [tab, setTab] = useState<'insights' | 'patterns'>('insights')
  useTide(depthOf('/insights'))

  return (
    <Screen className="with-tabs">
      <TopBar title="coach" />
      {!s.coachOn ? <CoachOff /> : s.coachStatus === 'reviewing' ? <CoachReviewing /> : s.insights && (
        <>
          <p className="summary"><Typewriter text={s.insights.summary} /></p>
          <Tabs value={tab} onChange={setTab} options={[['insights', 'takeaways'], ['patterns', 'patterns']]} />
          {tab === 'insights' ? (
            <ol className="takeaways">
              {s.insights.takeaways.map((t) => <li key={t}>{t}</li>)}
            </ol>
          ) : (
            <div className="list">
              {s.insights.patterns.map((p) => (
                <div key={p.title} className="list__row">
                  <Icon name="wave" />
                  <div><strong>{p.title}</strong><small className="muted">{p.detail}</small><small className="cite">from {p.sessions}</small></div>
                </div>
              ))}
            </div>
          )}
          <div className="spacer" />
          <button className="btn btn--primary" onClick={() => nav('/plan')}>your next session <Icon name="arrow" size={16} /></button>
        </>
      )}
      <TideGauge />
    </Screen>
  )
}

export function PlanScreen() {
  const s = useStore()
  const nav = useNavigate()
  useTide(0.58)
  if (!s.coachOn) return <Screen><TopBar back /><CoachOff /></Screen>
  const p = s.plan
  const rows: [IconName, string, string][] = [
    ['clock', 'length', `${Math.round(p.lengthSec / 60)} minutes`],
    ['bell', 'gentle cue', p.cueTimes.length ? `at ${fmt(p.cueTimes[0])}, just before you usually drift` : 'none. you’re ready.'],
    ['target', 'focus', p.focusArea],
    ['wave', 'exercise', p.technique],
  ]
  const support = Math.round((1 - p.fadingLevel) * 100)
  return (
    <Screen>
      <TopBar back title="next session" />
      <h1 className="h1">Designed for you,<br /><em>from your tides.</em></h1>
      <div className="list">
        {rows.map(([icon, k, v]) => (
          <div key={k} className="list__row"><Icon name={icon} /><div><span className="fine">{k}</span><strong>{v}</strong></div></div>
        ))}
      </div>
      <div>
        <div className="row-head"><p className="eyebrow">coach support</p><span className="mono small">{support}%</span></div>
        <div className="meter"><i style={{ width: `${support}%` }} /></div>
        <p className="fine">support fades as you improve, until you notice on your own.</p>
      </div>
      {p.reasons.length > 0 && <ul className="reasons">{p.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
      <div className="spacer" />
      <button className="btn btn--primary" onClick={() => { if (s.soundOn) startOcean(); nav('/setup') }}>begin <Icon name="arrow" size={16} /></button>
    </Screen>
  )
}

export function Progress() {
  const s = useStore()
  const nav = useNavigate()
  const [range, setRange] = useState<'7' | '30' | 'all'>('7')
  useTide(depthOf('/progress'))
  const aware = awarenessTrend(s.history)
  const focus = s.history.map((h) => focusPct(h.readings))
  const stillness = s.history.map((h) => h.readings.reduce((a, r) => a + r.stillness, 0) / Math.max(1, h.readings.length))
  const delta = (xs: number[]) => (xs.length > 1 ? Math.round(xs[xs.length - 1] - xs[0]) : 0)

  return (
    <Screen className="with-tabs">
      <TopBar title="log" />
      <Tabs value={range} onChange={setRange} options={[['7', '7 days'], ['30', '30 days'], ['all', 'all']]} />
      <div className="tiles">
        <div className="tile"><span className="tile__k">awareness</span><strong className="tile__v up">{delta(aware) >= 0 ? '+' : ''}{delta(aware)}</strong><Sparkline values={aware} h={26} /></div>
        <div className="tile"><span className="tile__k">focus</span><strong className="tile__v up">{delta(focus) >= 0 ? '+' : ''}{delta(focus)}%</strong><Sparkline values={focus} h={26} /></div>
        <div className="tile"><span className="tile__k">still</span><strong className="tile__v up">{Math.round((stillness[stillness.length - 1] ?? 0) * 100)}%</strong><Sparkline values={stillness} h={26} /></div>
      </div>
      <p className="fine">weekend data from our own sessions</p>
      <div className="list">
        {[...s.history].reverse().map((h) => (
          <button key={h.id} className="list__row list__row--btn" onClick={() => nav(`/calm-map/${h.id}`)}>
            <div><strong>{new Date(h.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</strong><span className="fine">{fmt(h.lengthSec)}</span></div>
            <div className="grow"><Sparkline values={h.readings.map((r) => r.stillness)} h={22} /></div>
            <span className="mono small">{focusPct(h.readings)}%</span>
          </button>
        ))}
      </div>
      <TideGauge />
    </Screen>
  )
}

export function Profile() {
  const s = useStore()
  useTide(depthOf('/profile'))
  return (
    <Screen className="with-tabs">
      <TopBar title="you" />
      <div className="list">
        <div className="list__row toggle-row">
          <div><strong>AI coach</strong><p className="muted">Designs every session after your first.</p></div>
          <button role="switch" aria-checked={s.coachOn} aria-label="AI coach" className={`switch${s.coachOn ? ' is-on' : ''}`} onClick={() => s.setCoachOn(!s.coachOn)}><i /></button>
        </div>
        <div className="list__row toggle-row">
          <div><strong>Sound of the sea</strong><p className="muted">Ocean that breathes with you.</p></div>
          <button role="switch" aria-checked={s.soundOn} aria-label="Sound of the sea" className={`switch${s.soundOn ? ' is-on' : ''}`} onClick={() => { if (s.soundOn) stopOcean(); s.setSoundOn(!s.soundOn) }}><i /></button>
        </div>
      </div>
      <div>
        <p className="eyebrow"><Icon name="lock" size={12} /> privacy</p>
        <p className="muted small">Video is processed on your phone and never stored or uploaded. Only the numbers leave it. Spoken answers are not saved.</p>
      </div>
      <div>
        <p className="eyebrow">not medical advice</p>
        <p className="muted small">TIDE is a wellness and training tool. It doesn’t diagnose or treat anything.</p>
      </div>
      <div className="spacer" />
      <button className="btn btn--ghost" onClick={s.resetDemo}>reset demo data</button>
      <TideGauge />
    </Screen>
  )
}
