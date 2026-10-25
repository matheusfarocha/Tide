import { useEffect, useMemo, useRef, useState } from 'react'
import type { FeelCheck as SharedFeelCheck, SessionPlan, SessionSummary, SignalReading as SharedReading } from '../../shared/types'
import { fmt } from '../lib/metrics'
import { useTideCtl } from '../lib/tide'
import recording from '../replay/recording.json'
import { CoachBoard, toAppCheck, toAppReading } from './CoachView'

// Replay mode, the Wi-Fi fallback for the judging table: one real recorded session
// (scripts/export-replay.ts) played back in real time on the same coach view, then the CREAO
// coach's notes and the plan it designed from it. The recording is bundled into the app, so once
// the page is open this needs no network. Always labelled as a replay, never passed off as live.

interface Recording {
  label: string
  recordedAt: number
  readings: SharedReading[]
  feelChecks: SharedFeelCheck[]
  summary: SessionSummary
  plan: Pick<SessionPlan, 'technique' | 'lengthSec' | 'fadingLevel' | 'intro' | 'cues' | 'feelChecks' | 'reasons' | 'citations'>
}
const rec = recording as unknown as Recording

const TECHNIQUE: Record<string, string> = {
  breathFocus: 'Breath focus', bodyScan: 'Body scan', breathCounting: 'Breath counting', openAwareness: 'Open awareness',
}
const endSec = Math.ceil((rec.readings[rec.readings.length - 1]?.t ?? 0) / 1000) + 1

export function Replay() {
  const [sec, setSec] = useState(0)
  const [run, setRun] = useState(0)
  const [coachOn, setCoachOn] = useState(true)
  const breathSubs = useRef(new Set<(v: number) => void>())
  const tide = useTideCtl()

  useEffect(() => {
    setSec(0)
    const id = setInterval(() => setSec((s) => Math.min(endSec, s + 1)), 1000)
    return () => clearInterval(id)
  }, [run])

  const shown = useMemo(() => rec.readings.filter((r) => r.t <= sec * 1000), [sec])
  const readings = useMemo(() => shown.map(toAppReading), [shown])
  const answeredBy = (c: SharedFeelCheck) => c.answeredAt ?? c.t + 9000
  const checks = useMemo(() => rec.feelChecks.filter((c) => answeredBy(c) <= sec * 1000).map(toAppCheck), [sec])
  const asking = rec.feelChecks.some((c) => c.t <= sec * 1000 && answeredBy(c) > sec * 1000)

  // Each stored reading carries its second of breath wave (10 Hz): play it over the next second.
  useEffect(() => {
    const r = shown[shown.length - 1]
    if (!r) return
    const timers = r.wave.map((v, i) => window.setTimeout(() => {
      breathSubs.current.forEach((cb) => cb(v))
      tide.pushBreath(Math.max(-1, Math.min(1, v)))
    }, (i * 1000) / Math.max(1, r.wave.length)))
    return () => timers.forEach(clearTimeout)
  }, [shown, tide])

  const done = sec >= endSec
  const when = new Date(rec.recordedAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
  const banner = (
    <div className="card replay-banner" role="status">
      <strong>Replay, not live.</strong> A real session {rec.label} recorded {when}, played back from inside the app,
      so it works with no connection. <button className="link" onClick={() => setRun((n) => n + 1)}>restart</button>
    </div>
  )
  const after = !done ? null : coachOn ? <CoachResult /> : (
    <div className="card coach-off-banner">Coach off: no review, no next session, no fading plan. Just a breathing graph.</div>
  )

  return (
    <CoachBoard
      board={{
        readings, checks, asking, status: done ? 'ended' : 'live', coachOn, setCoachOn, who: rec.label,
        replay: { status: done ? 'replay ended' : `replay · ${fmt(sec)} / ${fmt(endSec)}`, banner, after },
      }}
      breathSubs={breathSubs.current}
    />
  )
}

/** What the CREAO agents made of this session: the Analyst's summary, then the Coach's next plan. */
function CoachResult() {
  const { summary: s, plan: p } = rec
  return (
    <>
      <section className="card">
        <p className="eyebrow">Session Analyst (CREAO)</p>
        <ul className="replay-notes">{s.highlights.map((h) => <li key={h}>{h}</li>)}</ul>
        <p className="fine">
          {s.firstDriftSec !== null ? `First drift ${fmt(s.firstDriftSec)}` : 'No drift'}
          {s.selfAwareness !== null ? ` · self-awareness ${Math.round(s.selfAwareness * 100)}` : ''}
          {s.meanBreathRate !== null ? ` · ${s.meanBreathRate.toFixed(1)} breaths/min` : ''}
        </p>
      </section>
      <section className="card">
        <p className="eyebrow">Next session, designed by the coach (CREAO)</p>
        <p className="summary">{p.intro}</p>
        <p className="fine">
          {TECHNIQUE[p.technique] ?? p.technique} · {Math.round(p.lengthSec / 60)} min · cue at {p.cues.filter((c) => c.kind === 'anchor').map((c) => fmt(c.atSec)).join(', ') || '–'}
          {' · '}Feel Checks at {p.feelChecks.map((f) => fmt(f.atSec)).join(', ')} · support fading level {p.fadingLevel} of 3
        </p>
        <ul className="replay-notes">{p.reasons.map((r) => <li key={r.claim}>{r.claim}</li>)}</ul>
        <p className="eyebrow">Why this session</p>
        {p.citations.map((c) => (
          <p key={c.externalId} className="small"><a href={c.url} target="_blank" rel="noreferrer">{c.citation}</a><br /><span className="muted">{c.why}</span></p>
        ))}
      </section>
    </>
  )
}
