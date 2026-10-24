import { useQuery } from 'convex/react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon, Screen, Sparkline, TabBar, Tabs, TopBar, depthOf, type IconName } from '../components/ui'
import { api } from '../../convex/_generated/api'
import { backendOn } from '../lib/backend'
import { demoTable } from '../lib/demo'
import { awarenessTrend, breathAccuracy, driftsCaught, fmt, focusPct, level, LEVELS, streak, totalMinutes } from '../lib/metrics'
import { useStore } from '../lib/store'
import { useTide } from '../lib/tide'

// "Meditation has no scoreboard. TIDE gives it one."

interface Row { key: string; name: string; score: number | null; caught: number; you: boolean }

function Board({ rows }: { rows: Row[] | undefined }) {
  if (rows === undefined) return <p className="muted small">Loading the table…</p>
  if (rows.length === 0) return <p className="muted small">Nobody has finished a session today yet. Be the first.</p>
  return (
    <ol className="board">
      {rows.map((row, i) => (
        <li key={row.key} className={`board__row${row.you ? ' is-you' : ''}`}>
          <span className="board__rank">{i + 1}</span>
          <span className="board__name">{row.name}{row.you && <small> · you</small>}</span>
          <span className="board__caught">{row.caught} caught</span>
          <strong className="board__score">{row.score ?? '–'}</strong>
        </li>
      ))}
    </ol>
  )
}

/** Today's table from Convex: everyone who ran a session today, ranked by self-awareness. */
function ServerBoard({ userId }: { userId: string | null }) {
  const since = useMemo(() => new Date().setHours(0, 0, 0, 0), [])
  const rows = useQuery(api.leaderboard.today, { since })
  return <Board rows={rows?.map((r) => ({ key: r.userId, name: r.name, score: r.score, caught: r.caught, you: r.userId === userId }))} />
}

export function Scores() {
  const s = useStore()
  const nav = useNavigate()
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

  // Log: trends across the chosen window, then each session in it (opens its Calm Map).
  const [range, setRange] = useState<'7' | '14' | '30'>('7')
  const since = Date.now() - Number(range) * 86_400_000
  const logged = s.history.filter((h) => new Date(h.date).getTime() >= since)
  const loggedAware = awarenessTrend(logged)
  const focus = logged.map((h) => focusPct(h.readings))
  const stillness = logged.map((h) => h.readings.reduce((a, r) => a + r.stillness, 0) / Math.max(1, h.readings.length))
  const delta = (xs: number[]) => (xs.length > 1 ? Math.round(xs[xs.length - 1] - xs[0]) : 0)

  // Without a backend: the demo table plus you.
  const localRows: Row[] = [...demoTable.map((r) => ({ key: r.name, name: r.name, score: r.score as number | null, caught: r.caught, you: false })), { key: 'you', name: s.name || 'You', score, caught, you: true }]
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))

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
            <h2 className="h2">Log</h2>
            <span className="muted small">{logged.length} session{logged.length === 1 ? '' : 's'}</span>
          </div>
          <Tabs value={range} onChange={setRange} options={[['7', '7d'], ['14', '14d'], ['30', '30d']]} />
          <div className="tiles">
            <div className="tile"><span className="tile__k">awareness</span><strong className="tile__v up">{delta(loggedAware) >= 0 ? '+' : ''}{delta(loggedAware)}</strong><Sparkline values={loggedAware} h={26} /></div>
            <div className="tile"><span className="tile__k">focus</span><strong className="tile__v up">{delta(focus) >= 0 ? '+' : ''}{delta(focus)}%</strong><Sparkline values={focus} h={26} /></div>
            <div className="tile"><span className="tile__k">still</span><strong className="tile__v up">{Math.round((stillness[stillness.length - 1] ?? 0) * 100)}%</strong><Sparkline values={stillness} h={26} /></div>
          </div>
          <div className="list">
            {s.history.length === 0 && <p className="muted small">No sessions yet. Your first one sets your baseline, and your scores start here.</p>}
            {s.history.length > 0 && logged.length === 0 && <p className="muted small">No sessions in the last {range} days.</p>}
            {[...logged].reverse().map((h) => (
              <button key={h.id} className="list__row list__row--btn" onClick={() => nav(`/calm-map/${h.id}`)}>
                <div><strong>{new Date(h.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</strong><span className="fine">{fmt(h.lengthSec)}</span></div>
                <div className="grow"><Sparkline values={h.readings.map((r) => r.stillness)} h={22} /></div>
                <span className="mono small">{focusPct(h.readings)}%</span>
              </button>
            ))}
          </div>

          <Link to="/breath-test" className="btn btn--ghost">take the breath-count test</Link>
        </>
      ) : (
        <>
          <p className="lede">People who tried TIDE at our table today.</p>
          {backendOn ? <ServerBoard userId={s.userId} /> : <Board rows={localRows} />}
          <p className="fine">Ranked by self-awareness, not by how calm you look.</p>
        </>
      )}
      <TabBar />
    </Screen>
  )
}
