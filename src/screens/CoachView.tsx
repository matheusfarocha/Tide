import { useCallback, useEffect, useRef, useState } from 'react'
import { CalmMap, Legend, LiveWave, stateColor } from '../components/ui'
import { subscribe } from '../lib/live'
import { fmt } from '../lib/metrics'
import { useStore } from '../lib/store'
import { useTide, useTideCtl } from '../lib/tide'
import type { FeelCheck, Reading } from '../lib/types'

// Laptop screen at the judging table. Live from the phone.

export function CoachView() {
  const s = useStore()
  const [readings, setReadings] = useState<Reading[]>([])
  const [checks, setChecks] = useState<FeelCheck[]>([])
  const [asking, setAsking] = useState(false)
  const [status, setStatus] = useState<'waiting' | 'live' | 'ended'>('waiting')
  const breathSubs = useRef(new Set<(v: number) => void>())
  const tide = useTideCtl()
  const latest = readings[readings.length - 1]
  // The judge's own breath becomes the tide on the big screen.
  useTide(0.34, latest?.state ?? 'idle')

  useEffect(() => subscribe((m) => {
    if (m.kind === 'start') { setReadings([]); setChecks([]); setStatus('live') }
    if (m.kind === 'breath') { breathSubs.current.forEach((cb) => cb(m.v)); tide.pushBreath(Math.max(-1, Math.min(1, m.v))) }
    if (m.kind === 'reading') setReadings((r) => [...r, m.r])
    if (m.kind === 'asking') setAsking(true)
    if (m.kind === 'feel') { setAsking(false); setChecks((c) => [...c, m.f]) }
    if (m.kind === 'end') setStatus('ended')
  }), [tide])

  const onBreath = useCallback((cb: (v: number) => void) => {
    breathSubs.current.add(cb)
    return () => { breathSubs.current.delete(cb) }
  }, [])

  const r = readings[readings.length - 1]

  return (
    <div className="shell shell--wide">
      <main className="coachview">
        <header className="coachview__head">
          <div className="wordmark">tide · coach view</div>
          <span className={`live-dot ${status}`}>{status === 'live' ? `live · ${fmt(r?.t ?? 0)}` : status === 'ended' ? 'session ended' : 'waiting for phone…'}</span>
          <label className="toggle-inline">
            coach
            <button role="switch" aria-checked={s.coachOn} className={`switch${s.coachOn ? ' is-on' : ''}`} onClick={() => s.setCoachOn(!s.coachOn)}><i /></button>
          </label>
        </header>

        <section className="card coachview__wave">
          <p className="eyebrow">Breathing</p>
          <LiveWave subscribe={onBreath} height={180} seconds={20} />
        </section>

        <section className="coachview__stats">
          <div className="card stat"><span className="muted">Rate</span><strong>{r?.rate.toFixed(1) ?? '–'}<small>/min</small></strong></div>
          <div className="card stat"><span className="muted">Stillness</span><strong>{r ? Math.round(r.stillness * 100) : '–'}<small>%</small></strong></div>
          <div className="card stat"><span className="muted">Posture</span><strong>{r ? Math.round(r.posture * 100) : '–'}<small>%</small></strong></div>
          <div className="card stat"><span className="muted">State</span><strong style={{ color: r ? stateColor[r.state] : undefined }}>{r?.state ?? '–'}</strong></div>
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

        {!s.coachOn && <div className="card coach-off-banner">Coach off: no next session, no insights, no fading plan. Just a breathing graph.</div>}
      </main>
    </div>
  )
}
