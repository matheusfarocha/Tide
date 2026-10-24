import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon, Screen, TabBar, Tabs, TopBar, depthOf, type IconName } from '../components/ui'
import { demoTable } from '../lib/demo'
import { awarenessTrend, breathAccuracy, driftsCaught, focusPct, level, LEVELS, streak, totalMinutes } from '../lib/metrics'
import { useStore } from '../lib/store'
import { useTide } from '../lib/tide'

// "Meditation has no scoreboard. TIDE gives it one."

export function Scores() {
  const s = useStore()
  const [tab, setTab] = useState<'you' | 'table'>('you')
  useTide(depthOf('/scores'))
  const aware = awarenessTrend(s.history)
  const score = aware[aware.length - 1] ?? 0
  const lvl = level(score)
  const caught = driftsCaught(s.history)
  const days = streak(s.history)
  const mins = totalMinutes(s.history)
  const bestFocus = Math.max(0, ...s.history.map((h) => focusPct(h.readings)))
  const lastTest = s.breathTests[s.breathTests.length - 1]

  const records: [IconName, string, string][] = [
    ['cloud', 'Drifts caught', String(caught)],
    ['sun', 'Day streak', String(days)],
    ['clock', 'Minutes', String(mins)],
    ['target', 'Best focus', `${bestFocus}%`],
    ['lungs', 'Breath count', lastTest ? `${breathAccuracy(lastTest)}%` : '–'],
    ['wave', 'Sessions', String(s.history.length)],
  ]

  const milestones: [string, string, boolean][] = [
    ['First session', 'You showed up.', s.history.length >= 1],
    ['First drift caught', 'You noticed your mind wander.', caught >= 1],
    ['3-day streak', 'Three days in a row.', days >= 3],
    ['Caught 5 drifts', 'Noticing is getting easier.', caught >= 5],
    ['Reach Steady', `Self-awareness ${LEVELS[3].min}+.`, score >= LEVELS[3].min],
    ['Coach steps back', 'Support fades below 50%.', s.plan.fadingLevel >= 0.5],
  ]

  const table = [...demoTable, { name: s.name || 'You', score, caught, you: true }].sort((a, b) => b.score - a.score)

  return (
    <Screen className="with-tabs">
      <TopBar title="scores" />
      <Tabs value={tab} onChange={setTab} options={[['you', 'you'], ['table', 'today’s table']]} />

      {tab === 'you' ? (
        <>
          <section className="card level">
            <p className="eyebrow">Self-awareness</p>
            <div className="level__row">
              <strong className="num-xl">{score}</strong>
              <div>
                <p className="level__name">Level {lvl.n} · {lvl.name}</p>
                <p className="muted small">{lvl.next ? `${lvl.toNext} points to ${lvl.next}` : 'Top level'}</p>
              </div>
            </div>
            <div className="meter"><i style={{ width: `${Math.round(lvl.progress * 100)}%` }} /></div>
            <div className="level__steps">
              {LEVELS.map((l, i) => <span key={l.name} className={i < lvl.n ? 'is-on' : ''}>{l.name}</span>)}
            </div>
            <p className="fine">How often what you felt matched what TIDE saw, over your last 3 sessions.</p>
          </section>

          <div className="records">
            {records.map(([icon, k, v]) => (
              <div key={k} className="tile record">
                <Icon name={icon} size={18} />
                <strong className="tile__v">{v}</strong>
                <span className="tile__k">{k}</span>
              </div>
            ))}
          </div>

          <div className="row-head">
            <h2 className="h2">Milestones</h2>
            <span className="muted small">{milestones.filter((m) => m[2]).length}/{milestones.length}</span>
          </div>
          <div className="list">
            {milestones.map(([title, detail, done]) => (
              <div key={title} className={`list__row milestone${done ? ' is-done' : ''}`}>
                <span className="milestone__mark">{done ? <Icon name="check" size={14} /> : <Icon name="lock" size={14} />}</span>
                <div><strong>{title}</strong><small className="muted">{detail}</small></div>
              </div>
            ))}
          </div>

          <Link to="/breath-test" className="btn btn--ghost">take the breath-count test</Link>
        </>
      ) : (
        <>
          <p className="lede">People who tried TIDE at our table today.</p>
          <ol className="board">
            {table.map((row, i) => (
              <li key={row.name + i} className={`board__row${'you' in row ? ' is-you' : ''}`}>
                <span className="board__rank">{i + 1}</span>
                <span className="board__name">{row.name}{'you' in row && <small> · you</small>}</span>
                <span className="board__caught">{row.caught} caught</span>
                <strong className="board__score">{row.score}</strong>
              </li>
            ))}
          </ol>
          <p className="fine">Ranked by self-awareness, not by how calm you look.</p>
        </>
      )}
      <TabBar />
    </Screen>
  )
}
