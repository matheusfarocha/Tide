import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, Screen, TideGauge, Tabs, TopBar, Typewriter, depthOf, type IconName } from '../components/ui'
import { backendOn } from '../lib/backend'
import { fmt } from '../lib/metrics'
import { startOcean, stopOcean } from '../lib/ocean'
import { useStore } from '../lib/store'
import { useTide } from '../lib/tide'
import type { Goal } from '../lib/types'
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
          <div className="card"><p className="eyebrow"><Icon name="spark" size={12} /> coach summary</p><p className="summary"><Typewriter text={s.insights.summary} /></p></div>
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
      <div className="card">
        <div className="row-head"><p className="eyebrow">coach support</p><span className="mono small">{support}%</span></div>
        <div className="meter"><i style={{ width: `${support}%` }} /></div>
        <p className="fine">support fades as you improve, until you notice on your own.</p>
      </div>
      {p.reasons.length > 0 && <ul className="reasons">{p.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
      {p.citations && p.citations.length > 0 && (
        <div className="card">
          <p className="eyebrow">why this session</p>
          {p.citations.map((c) => (
            <p key={c.url} className="fine">
              {c.why}{' '}
              <a href={c.url} target="_blank" rel="noreferrer">{c.citation}</a>
            </p>
          ))}
        </div>
      )}
      <div className="spacer" />
      <button className="btn btn--primary" onClick={() => { if (s.soundOn) startOcean(); nav('/setup') }}>begin <Icon name="arrow" size={16} /></button>
    </Screen>
  )
}

const GOALS: [Goal, string][] = [['stress', 'Stress'], ['focus', 'Focus'], ['habit', 'Habit'], ['sleep', 'Sleep']]
const LENGTHS: [number, string][] = [[90, '90 s'], [300, '5 min'], [480, '8 min'], [600, '10 min']]

export function Profile() {
  const s = useStore()
  const nav = useNavigate()
  const [name, setName] = useState(s.name)
  const [confirm, setConfirm] = useState<'rename' | 'delete' | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  useTide(depthOf('/profile'))

  const renamed = name.trim() !== s.name && name.trim() !== ''
  const run = async (opts: Parameters<typeof s.startFresh>[0]) => {
    setBusy(true)
    setFailed(false)
    const ok = await s.startFresh(opts)
    setBusy(false)
    setConfirm(null)
    if (!ok) setFailed(true)
    else if (opts?.name === '') nav('/')
  }

  return (
    <Screen className="with-tabs">
      <TopBar title="you" />

      <label className="field">
        <span className="eyebrow">name</span>
        <input value={name} onChange={(e) => { setName(e.target.value); setConfirm(null) }} placeholder="Your name" autoComplete="given-name" />
      </label>
      {renamed && (confirm === 'rename' ? (
        <div className="card">
          <p className="muted small">A new name starts a new profile on this phone: this history is cleared here. {s.userId ? 'The old profile stays in the cloud.' : ''}</p>
          <button className="btn btn--primary" disabled={busy} onClick={() => run({ name: name.trim() })}>start as {name.trim()}</button>
        </div>
      ) : <button className="btn btn--ghost" onClick={() => setConfirm('rename')}>use this name</button>)}

      <div>
        <p className="eyebrow">what brings you here</p>
        <div className="chips">
          {GOALS.map(([g, l]) => (
            <button key={g} className={`chip${s.goal === g ? ' is-on' : ''}`} aria-pressed={s.goal === g} onClick={() => s.setPreferences({ goal: g, lengthSec: s.lengthSec })}>{l}</button>
          ))}
        </div>
      </div>
      <div>
        <p className="eyebrow">session length</p>
        <div className="chips">
          {LENGTHS.map(([v, l]) => (
            <button key={v} className={`chip${s.lengthSec === v ? ' is-on' : ''}`} aria-pressed={s.lengthSec === v} onClick={() => s.setPreferences({ goal: s.goal, lengthSec: v })}>{l}</button>
          ))}
        </div>
      </div>

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

      <div className="card">
        <p className="eyebrow">saved</p>
        <p className="muted small">
          {s.history.length} session{s.history.length === 1 ? '' : 's'} on this phone · {backendOn ? (s.userId ? 'synced to the cloud' : 'connecting to the cloud…') : 'cloud off, everything stays here'}
        </p>
      </div>
      <div className="card">
        <p className="eyebrow"><Icon name="lock" size={12} /> privacy</p>
        <p className="muted small">Video is processed on your phone and never stored or uploaded. Only the numbers leave it. Spoken answers are not saved.</p>
      </div>
      <div className="card">
        <p className="eyebrow">not medical advice</p>
        <p className="muted small">TIDE is a wellness and training tool. It doesn’t diagnose or treat anything.</p>
      </div>
      <div className="spacer" />
      {failed && <p className="fine" role="alert">Couldn’t reach the cloud, so nothing was deleted. Try again.</p>}
      {confirm === 'delete' ? (
        <div className="card">
          <p className="muted small">This deletes your sessions, readings and plans{backendOn ? ' here and in the cloud' : ''}. It can’t be undone.</p>
          <button className="btn btn--primary" disabled={busy} onClick={() => run({ deleteServer: true, name: '' })}>{busy ? 'deleting…' : 'yes, delete everything'}</button>
          <button className="btn btn--ghost" disabled={busy} onClick={() => setConfirm(null)}>cancel</button>
        </div>
      ) : (
        <button className="btn btn--ghost" onClick={() => setConfirm('delete')}>delete my data</button>
      )}
      {!backendOn && <button className="btn btn--ghost" onClick={s.resetDemo}>reset demo data</button>}
      <TideGauge />
    </Screen>
  )
}
