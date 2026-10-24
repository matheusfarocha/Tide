import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { CalmMap, Counter, Icon, Legend, Screen, Tabs, TopBar, stateColor } from '../components/ui'
import { avgRate, firstDriftSec, fmt, focusPct, moments, postureLabel, selfAwareness, stillnessLabel } from '../lib/metrics'
import { useStore } from '../lib/store'
import { useTide } from '../lib/tide'
import type { FeelCheck, MindState, Reading } from '../lib/types'
import { CoachReviewing } from './Home'

function useSession(id?: string) {
  const { history } = useStore()
  return history.find((h) => h.id === id) ?? history[history.length - 1]
}

const QUALITY: Record<MindState, number> = { focused: 1, settling: 0.7, drifting: 0.26, restless: 0.15 }

/** The session drawn as a tide line: high water when focused, low when you drifted. */
function TideChart({ readings, feelChecks }: { readings: Reading[]; feelChecks: FeelCheck[] }) {
  const W = 320, H = 150, top = 22, bottom = 124
  const T = Math.max(1, readings[readings.length - 1]?.t ?? 1)
  const x = (t: number) => (t / T) * W
  // Smooth the quality so the line reads like water, not a bar chart.
  const q = readings.map((r, i) => {
    const win = readings.slice(Math.max(0, i - 2), i + 3)
    return win.reduce((a, w) => a + QUALITY[w.state] * (0.7 + 0.3 * w.stillness), 0) / win.length
  })
  const pts = readings.map((r, i) => [x(r.t), bottom - q[i] * (bottom - top)] as const)
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  const stops: { o: number; c: string }[] = []
  readings.forEach((r, i) => {
    if (i === 0 || r.state !== readings[i - 1].state) {
      const o = r.t / T
      if (stops.length) stops.push({ o, c: stops[stops.length - 1].c })
      stops.push({ o, c: stateColor[r.state] })
    }
  })
  return (
    <svg className="tidechart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Your session as a tide line">
      <defs>
        <linearGradient id="tc-line" x1="0" x2="1" y1="0" y2="0">
          {stops.map((s, i) => <stop key={i} offset={s.o} stopColor={s.c} />)}
        </linearGradient>
        <linearGradient id="tc-fade" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".35" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="tc-mask"><rect width={W} height={H} fill="url(#tc-fade)" /></mask>
      </defs>
      <path d={`${line} L${W} ${H} L0 ${H} Z`} fill="url(#tc-line)" mask="url(#tc-mask)" />
      <path d={line} fill="none" stroke="url(#tc-line)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" style={{ filter: 'drop-shadow(0 0 4px rgba(127,231,255,.6))' }} />
      {feelChecks.map((f, i) => (
        <g key={i}>
          <line x1={x(f.t)} x2={x(f.t)} y1={10} y2={bottom} stroke="rgba(234,243,247,.25)" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
          <circle cx={x(f.t)} cy={10} r={3} fill={f.answer === 'none' ? 'rgba(234,243,247,.4)' : f.match ? 'var(--ok)' : 'var(--miss)'} />
        </g>
      ))}
      <text x={2} y={H - 4} className="tidechart__lbl">0:00</text>
      <text x={W - 2} y={H - 4} textAnchor="end" className="tidechart__lbl">{fmt(T)}</text>
    </svg>
  )
}

export function Results() {
  const s = useStore()
  const nav = useNavigate()
  const loc = useLocation() as { state?: { id?: string } }
  const rec = useSession(loc.state?.id)
  useTide(0.24)
  if (!rec) return <Navigate to="/" replace />
  const focus = focusPct(rec.readings)
  const drift = firstDriftSec(rec.readings)
  const answered = rec.feelChecks.filter((f) => f.answer === 'focused' || f.answer === 'drifting')

  return (
    <Screen>
      <TopBar close="/" title={`session · ${new Date(rec.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toLowerCase()}`} />

      <div className="readout-big">
        <span className="num-xl"><Counter value={focus} /><small style={{ fontSize: 24 }}>%</small></span>
        <span className="readout-big__meta"><b>focused</b><span className="fine">{fmt(rec.lengthSec)} · {drift !== null ? `first drift ${fmt(drift)}` : 'no drift'}</span></span>
      </div>

      <div className="card">
        <TideChart readings={rec.readings} feelChecks={rec.feelChecks} />
        <Legend />
      </div>

      <div className="telemetry">
        <div><span>breath</span><strong>{avgRate(rec.readings)}</strong></div>
        <div><span>still</span><strong>{stillnessLabel(rec.readings).toLowerCase()}</strong></div>
        <div><span>posture</span><strong>{postureLabel(rec.readings).toLowerCase()}</strong></div>
      </div>

      {rec.feelChecks.length > 0 && (
        <div className="card">
          <div className="row-head"><p className="eyebrow">feel checks</p><span className="pill">{answered.filter((f) => f.match).length}/{answered.length || 0} caught · {selfAwareness(rec.feelChecks)}%</span></div>
          {rec.feelChecks.map((f, i) => (
            <div key={i} className="fc-row">
              <span>{fmt(f.t)}</span>
              <span>felt <b>{f.answer === 'none' ? 'quiet' : f.answer}</b></span>
              <span>saw <b>{f.sensorState}</b></span>
              {f.answer === 'none' ? <span>–</span> : <span className={f.match ? 'ok' : 'miss'}>{f.match ? '✓' : '✕'}</span>}
            </div>
          ))}
        </div>
      )}

      {s.coachOn ? (
        s.coachStatus === 'reviewing' ? <CoachReviewing /> : (
          <Link to="/insights" className="card coach-card coach-card--ready">
            <Icon name="spark" />
            <div><strong>Your coach left you a plan</strong><p className="muted">See what it found →</p></div>
          </Link>
        )
      ) : (
        <p className="fine">coach off · no insights, no next session. just the tide.</p>
      )}

      <div className="spacer" />
      <button className="btn btn--primary" onClick={() => nav(`/calm-map/${rec.id}`)}>open calm map <Icon name="arrow" size={16} /></button>
      <button className="btn btn--ghost" onClick={() => nav('/')}>done</button>
    </Screen>
  )
}

type Lens = 'all' | 'rate' | 'stillness' | 'posture'
const MOMENT: Record<MindState, [string, string]> = {
  settling: ['Settling in', 'Learning your baseline.'],
  focused: ['Steady focus', 'Even breathing, body still.'],
  drifting: ['Mind wandered', 'More movement, uneven breathing, or your head dropped.'],
  restless: ['Restless', 'Lots of movement.'],
}

export function CalmMapScreen() {
  const { id } = useParams()
  const rec = useSession(id)
  const [lens, setLens] = useState<Lens>('all')
  useTide(0.2)
  if (!rec) return <Navigate to="/" replace />
  const lanes = lens === 'all' ? undefined : [lens]
  const ms = moments(rec.readings).filter((m) => m.state !== 'focused' || m.to - m.from > 30)

  return (
    <Screen>
      <TopBar back title="calm map" />
      <Tabs value={lens} onChange={setLens} options={[['all', 'overview'], ['rate', 'breath'], ['stillness', 'movement'], ['posture', 'posture']]} />
      <div className="card">
        <CalmMap readings={rec.readings} feelChecks={rec.feelChecks} lanes={lanes as any} />
        <Legend />
      </div>
      <p className="eyebrow">key moments</p>
      <div className="list">
        {ms.map((m, i) => (
          <div key={i} className="list__row">
            <i className="dot" style={{ background: stateColor[m.state], color: stateColor[m.state] }} />
            <div>
              <span className="fine">{fmt(m.from)} – {fmt(m.to)}</span>
              <strong>{MOMENT[m.state][0]}</strong>
              <small className="muted">{MOMENT[m.state][1]}</small>
            </div>
          </div>
        ))}
      </div>
    </Screen>
  )
}
