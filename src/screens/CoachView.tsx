import { useMutation, useQuery } from 'convex/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../convex/_generated/api'
import type { FeelCheck as SharedFeelCheck, SignalReading as SharedReading } from '../../shared/types'
import { CalmMap, Legend, LiveWave, Mark, stateColor } from '../components/ui'
import { backendOn } from '../lib/backend'
import { subscribe } from '../lib/live'
import { fmt } from '../lib/metrics'
import { useStore } from '../lib/store'
import { useTide, useTideCtl } from '../lib/tide'
import type { FeelCheck, Reading } from '../lib/types'

// Laptop screen at the judging table. With Convex on it's a live query on the phone's session
// (any device, any network); without it, a BroadcastChannel between tabs of one browser.

interface Board {
  readings: Reading[]
  checks: FeelCheck[]
  asking: boolean
  status: 'waiting' | 'live' | 'ended'
  coachOn: boolean
  setCoachOn(v: boolean): void
  who?: string
}

export function CoachView() {
  return backendOn ? <ServerCoachView /> : <LocalCoachView />
}

/** A stored reading in the shape the app's charts use. */
function toAppReading(r: SharedReading): Reading {
  return {
    t: Math.round(r.t / 1000),
    breathPhase: r.wave[r.wave.length - 1] ?? 0,
    rate: r.breathRate ?? 0,
    regularity: r.regularity ?? 0,
    stillness: r.stillness,
    posture: r.posture,
    tension: r.tension,
    state: r.state === null || r.state === 'drowsy' ? (r.state === 'drowsy' ? 'drifting' : 'settling') : r.state,
    signalOk: r.state !== null,
  }
}

function toAppCheck(c: SharedFeelCheck): FeelCheck {
  const answer = c.answer === 'focused' ? 'focused' : c.answer === null ? (c.source === 'timeout' ? 'none' : 'unsure') : 'drifting'
  return {
    t: Math.round(c.t / 1000),
    spoken: c.transcript ?? undefined,
    answer,
    sensorState: c.sensorState === null ? 'settling' : c.sensorState === 'drowsy' ? 'drifting' : c.sensorState,
    match: c.match === true,
  }
}

function ServerCoachView() {
  const current = useQuery(api.live.current)
  const sessionId = current?.session._id
  const shared = useQuery(api.live.recentReadings, sessionId ? { sessionId, n: 600 } : 'skip')
  const fcs = useQuery(api.live.feelChecks, sessionId ? { sessionId } : 'skip')
  const setEnabled = useMutation(api.users.setCoachEnabled)
  // After a session ends live.current returns null; keep showing the last one.
  const seenSession = useRef(false)
  if (sessionId) seenSession.current = true
  const [kept, setKept] = useState<{ readings: Reading[]; checks: FeelCheck[] }>({ readings: [], checks: [] })
  const readings = shared ? shared.map(toAppReading) : kept.readings
  const checks = fcs ? fcs.map(toAppCheck) : kept.checks
  useEffect(() => { if (shared && fcs) setKept({ readings: shared.map(toAppReading), checks: fcs.map(toAppCheck) }) }, [shared, fcs])

  // Each stored reading carries its second of breath wave at 10 Hz: replay it so the wave flows.
  const breathSubs = useRef(new Set<(v: number) => void>())
  const tide = useTideCtl()
  const lastT = useRef(-1)
  useEffect(() => {
    const r = shared?.[shared.length - 1]
    if (!r || r.t === lastT.current) return
    lastT.current = r.t
    const timers = r.wave.map((v, i) => window.setTimeout(() => {
      breathSubs.current.forEach((cb) => cb(v))
      tide.pushBreath(Math.max(-1, Math.min(1, v)))
    }, (i * 1000) / Math.max(1, r.wave.length)))
    return () => timers.forEach(clearTimeout)
  }, [shared, tide])

  const coachOn = current?.coachEnabled ?? true
  return (
    <CoachBoard
      board={{
        readings, checks, asking: false,
        status: current ? 'live' : seenSession.current ? 'ended' : 'waiting',
        coachOn,
        setCoachOn: (v) => { if (current) void setEnabled({ userId: current.session.userId, enabled: v }) },
        who: current?.userName,
      }}
      breathSubs={breathSubs.current}
    />
  )
}

function LocalCoachView() {
  const s = useStore()
  const [readings, setReadings] = useState<Reading[]>([])
  const [checks, setChecks] = useState<FeelCheck[]>([])
  const [asking, setAsking] = useState(false)
  const [status, setStatus] = useState<'waiting' | 'live' | 'ended'>('waiting')
  const breathSubs = useRef(new Set<(v: number) => void>())
  const tide = useTideCtl()

  useEffect(() => subscribe((m) => {
    if (m.kind === 'start') { setReadings([]); setChecks([]); setStatus('live') }
    if (m.kind === 'breath') { breathSubs.current.forEach((cb) => cb(m.v)); tide.pushBreath(Math.max(-1, Math.min(1, m.v))) }
    if (m.kind === 'reading') setReadings((r) => [...r, m.r])
    if (m.kind === 'asking') setAsking(true)
    if (m.kind === 'feel') { setAsking(false); setChecks((c) => [...c, m.f]) }
    if (m.kind === 'end') setStatus('ended')
  }), [tide])

  return <CoachBoard board={{ readings, checks, asking, status, coachOn: s.coachOn, setCoachOn: s.setCoachOn }} breathSubs={breathSubs.current} />
}

function CoachBoard({ board, breathSubs }: { board: Board; breathSubs: Set<(v: number) => void> }) {
  const { readings, checks, asking, status } = board
  const r = readings[readings.length - 1]
  const lost = r !== undefined && !r.signalOk
  // The judge's own breath becomes the tide on the big screen.
  useTide(0.34, r && !lost ? r.state : 'idle')

  const onBreath = useCallback((cb: (v: number) => void) => {
    breathSubs.add(cb)
    return () => { breathSubs.delete(cb) }
  }, [breathSubs])

  return (
    <div className="shell shell--wide">
      <main className="coachview">
        <header className="coachview__head">
          <span className="lockup"><Mark size={30} /><span className="lockup__word" style={{ fontSize: 24 }}>tide</span><span className="fine">· coach view{board.who ? ` · ${board.who}` : ''}</span></span>
          <span className={`live-dot ${status}`}>{status === 'live' ? `live · ${fmt(r?.t ?? 0)}` : status === 'ended' ? 'session ended' : 'waiting for phone…'}</span>
          <label className="toggle-inline">
            coach
            <button role="switch" aria-checked={board.coachOn} className={`switch${board.coachOn ? ' is-on' : ''}`} onClick={() => board.setCoachOn(!board.coachOn)}><i /></button>
          </label>
        </header>

        <section className="card coachview__wave">
          <p className="eyebrow">Breathing</p>
          <LiveWave subscribe={onBreath} height={180} seconds={20} />
        </section>

        <section className="coachview__stats">
          <div className="card stat"><span className="muted">Rate</span><strong>{r && !lost && r.rate > 0 ? r.rate.toFixed(1) : '–'}<small>/min</small></strong></div>
          <div className="card stat"><span className="muted">Stillness</span><strong>{r ? Math.round(r.stillness * 100) : '–'}<small>%</small></strong></div>
          <div className="card stat"><span className="muted">Posture</span><strong>{r ? Math.round(r.posture * 100) : '–'}<small>%</small></strong></div>
          <div className="card stat"><span className="muted">State</span><strong style={{ color: r && !lost ? stateColor[r.state] : undefined }}>{!r ? '–' : lost ? 'no signal' : r.state}</strong></div>
        </section>

        <section className="card">
          <p className="eyebrow">Focus timeline</p>
          {readings.length > 2 ? <CalmMap readings={readings} feelChecks={checks} /> : <p className="muted">Starts when the session does.</p>}
          <Legend />
        </section>

        <section className="card">
          <p className="eyebrow">Feel Checks</p>
          {asking && <p className="asking">Asking “Focused or drifting?”…</p>}
          {checks.map((c, i) => (
            <div key={i} className="fc-row fc-row--big">
              <span className="muted">{fmt(c.t)}</span>
              <span>Felt <b>{c.answer}</b>{c.spoken && <small> “{c.spoken}”</small>}</span>
              <span>Saw <b>{c.sensorState}</b></span>
              {c.answer === 'none' ? <span className="muted">Quiet</span> : <span className={c.match ? 'ok' : 'miss'}>{c.match ? 'Match ✓' : 'Miss ✕'}</span>}
            </div>
          ))}
          {!asking && !checks.length && <p className="muted">None yet.</p>}
        </section>

        {!board.coachOn && <div className="card coach-off-banner">Coach off: no next session, no insights, no fading plan. Just a breathing graph.</div>}
      </main>
    </div>
  )
}
