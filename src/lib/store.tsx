import { useQuery } from 'convex/react'
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api } from '../../convex/_generated/api'
import { backendOn, deleteUser, getOrCreateUser, setCoachEnabled as saveCoachEnabled, toAppPlan, type PacedCheck, type SessionId, type UserId } from './backend'
import { demoBreathTests, demoHistory, demoInsights, demoPlan, firstPlan } from './demo'
import type { BreathTest, CoachInsights, FeelCheck, Goal, Plan, Reading, SessionRecord } from './types'

// App-wide state. With VITE_CONVEX_URL set, the coach's plan, its status and its insights come
// from Convex (ServerSync below); finished sessions are also kept locally so the Calm Map is instant.
// Without it, everything is local and a fake coach run stands in for CREAO.

type CoachStatus = 'idle' | 'reviewing' | 'ready' | 'failed'

interface Store {
  name: string
  goal: Goal
  lengthSec: number
  onboarded: boolean
  coachOn: boolean
  soundOn: boolean
  setSoundOn(v: boolean): void
  plan: Plan
  /** How long the next session runs: the coach's planned length, or the chosen length for the baseline. */
  sessionLengthSec: number
  history: SessionRecord[]
  breathTests: BreathTest[]
  insights: CoachInsights | null
  coachStatus: CoachStatus
  /** The server session whose coach run failed, so it can be retried. */
  failedSessionId: SessionId | null
  calibrationRate?: number
  /** Convex user, once created. null when the backend is off or unreachable. */
  userId: UserId | null
  /** The last paced-breathing check, attached to the next session on the server. */
  pacedCheck: PacedCheck | null
  setProfile(p: { name: string; goal: Goal; lengthSec: number }): void
  /** Update goal and length without touching who you are. */
  setPreferences(p: { goal: Goal; lengthSec: number }): void
  setLength(sec: number): void
  setCoachOn(v: boolean): void
  setCalibration(rate: number): void
  finishSession(readings: Reading[], feelChecks: FeelCheck[], serverId?: string | null): SessionRecord
  resetDemo(): void
  /** Start over as someone else (or no one): clears local history, and the server's copy of the old person when asked. */
  startFresh(opts?: { deleteServer?: boolean; name?: string }): Promise<boolean>
  addBreathTest(t: BreathTest): void
}

const Ctx = createContext<Store | null>(null)
const KEY = 'tide.v2'

// With a backend, pages show only real sessions: the seeded demo history is for offline and replay.
const isDemo = (r: { id: string }) => demoHistory.some((d) => d.id === r.id)

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

interface ServerState {
  plan: Plan | null
  status: CoachStatus
  insights: CoachInsights | null
  failedSessionId: SessionId | null
  /** The user's coach switch as the server has it: the laptop's coach view can flip it mid-demo. */
  coachOn: boolean | null
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const saved = useRef(load()).current
  const [name, setName] = useState<string>(saved?.name ?? '')
  const [goal, setGoal] = useState<Goal>(saved?.goal ?? 'focus')
  const [lengthSec, setLengthSec] = useState<number>(saved?.lengthSec ?? 90)
  const [onboarded, setOnboarded] = useState<boolean>(saved?.onboarded ?? false)
  const [coachOn, setCoachOn] = useState<boolean>(saved?.coachOn ?? true)
  const [history, setHistory] = useState<SessionRecord[]>(backendOn ? ((saved?.history ?? []) as SessionRecord[]).filter((r) => !isDemo(r)) : saved?.history ?? demoHistory)
  const [insights, setInsights] = useState<CoachInsights | null>(backendOn ? null : saved?.insights ?? demoInsights)
  const [breathTests, setBreathTests] = useState<BreathTest[]>(backendOn ? ((saved?.breathTests ?? []) as BreathTest[]).filter((t) => !demoBreathTests.some((d) => d.date === t.date)) : saved?.breathTests ?? demoBreathTests)
  const [plan, setPlan] = useState<Plan>(backendOn ? firstPlan : saved?.plan ?? demoPlan)
  const [soundOn, setSoundOn] = useState<boolean>(saved?.soundOn ?? true)
  const [coachStatus, setCoachStatus] = useState<CoachStatus>('idle')
  const [calibrationRate, setCalibrationRate] = useState<number | undefined>()
  const [pacedCheck, setPacedCheck] = useState<PacedCheck | null>(null)
  const [userId, setUserId] = useState<UserId | null>(saved?.userId ?? null)
  const [userName, setUserName] = useState<string>(saved?.userName ?? '')
  const [server, setServer] = useState<ServerState | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ name, goal, lengthSec, onboarded, coachOn, soundOn, history: history.slice(-12), breathTests: breathTests.slice(-12), insights, plan, userId, userName }))
    } catch { /* storage is a convenience only */ }
  }, [name, goal, lengthSec, onboarded, coachOn, soundOn, history, breathTests, insights, plan, userId, userName])

  // One Convex user per name (no login for the hackathon). Re-create if the name changed.
  useEffect(() => {
    if (!backendOn || !name.trim() || (userId && userName === name.trim())) return
    let live = true
    getOrCreateUser(name).then((id) => {
      if (!live || !id) return
      setUserId(id)
      setUserName(name.trim())
      void saveCoachEnabled(id, coachOn)
    })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, userId, userName])

  const store = useMemo<Store>(() => {
    const fromServer = backendOn && userId !== null && server !== null
    const coachOnNow = fromServer && server.coachOn !== null ? server.coachOn : coachOn
    const nextPlan = !coachOnNow ? firstPlan : fromServer && server.plan ? server.plan : plan
    return {
      name, goal, lengthSec, onboarded, coachOn: coachOnNow, soundOn, setSoundOn, history, breathTests, calibrationRate, userId, pacedCheck,
      insights: fromServer && server.insights ? server.insights : insights,
      coachStatus: fromServer ? server.status : coachStatus,
      failedSessionId: fromServer ? server.failedSessionId : null,
      plan: nextPlan,
      sessionLengthSec: coachOnNow && nextPlan.fromCoach ? nextPlan.lengthSec : lengthSec,
      setProfile(p) {
        setName(p.name)
        setGoal(p.goal)
        setLengthSec(p.lengthSec)
        setOnboarded(true)
      },
      setPreferences(p) {
        setGoal(p.goal)
        setLengthSec(p.lengthSec)
      },
      setLength: setLengthSec,
      setCoachOn(v) {
        setCoachOn(v)
        if (userId) void saveCoachEnabled(userId, v)
      },
      setCalibration(rate) {
        setCalibrationRate(rate)
        setPacedCheck({ measuredRate: rate, doneAt: Date.now() })
      },
      finishSession(readings, feelChecks, serverId) {
        const rec: SessionRecord = {
          id: `s${Date.now()}`,
          date: new Date().toISOString(),
          lengthSec: readings.length ? readings[readings.length - 1].t : 0,
          readings,
          feelChecks,
          calibrationRate,
          serverId: serverId ?? undefined,
        }
        setHistory((h) => [...h, rec])
        setPacedCheck(null)
        if (coachOn && !backendOn) {
          // No backend: a fake coach run. With Convex, sessions.end starts the real CREAO run.
          setCoachStatus('reviewing')
          setTimeout(() => {
            setInsights(demoInsights)
            setPlan({ ...demoPlan, fadingLevel: Math.min(1, demoPlan.fadingLevel + 0.1) })
            setCoachStatus('ready')
          }, 6000)
        }
        return rec
      },
      addBreathTest(t) { setBreathTests((b) => [...b, t]) },
      resetDemo() {
        setHistory(demoHistory)
        setBreathTests(demoBreathTests)
        setInsights(demoInsights)
        setPlan(demoPlan)
        setCoachStatus('idle')
      },
      async startFresh(opts) {
        // Server first: if it can't be reached, keep everything so nothing is half deleted.
        if (opts?.deleteServer && userId && !(await deleteUser(userId))) return false
        setHistory(backendOn ? [] : demoHistory)
        setBreathTests(backendOn ? [] : demoBreathTests)
        setInsights(backendOn ? null : demoInsights)
        setPlan(backendOn ? firstPlan : demoPlan)
        setCoachStatus('idle')
        setCalibrationRate(undefined)
        setPacedCheck(null)
        setServer(null)
        setUserId(null)
        setUserName('')
        if (opts?.name !== undefined) {
          setName(opts.name)
          // No name left means back to the welcome screen (this also avoids re-finding a user that is being deleted).
          if (!opts.name) setOnboarded(false)
        }
        return true
      },
    }
  }, [name, goal, lengthSec, onboarded, coachOn, soundOn, history, breathTests, insights, plan, coachStatus, calibrationRate, userId, pacedCheck, server])

  return (
    <Ctx.Provider value={store}>
      {backendOn && userId && <ServerSync userId={userId} onChange={setServer} />}
      {children}
    </Ctx.Provider>
  )
}

/** Reactive Convex queries for this user. Whenever the coach finishes, the app updates by itself. */
function ServerSync({ userId, onChange }: { userId: UserId; onChange(s: ServerState): void }) {
  const next = useQuery(api.sessions.nextPlan, { userId })
  const hist = useQuery(api.history.forUser, { userId })
  const user = useQuery(api.users.get, { userId })

  useEffect(() => {
    if (next === undefined || hist === undefined || user === undefined) return
    const sessions = hist.sessions.filter((s) => s.kind !== 'breathCount')
    const last = sessions[sessions.length - 1]
    const status: CoachStatus = !last ? 'idle'
      : last.status === 'analyzing' ? 'reviewing'
      : last.status === 'coached' ? 'ready'
      : last.status === 'coachFailed' ? 'failed'
      : 'idle'
    const plan = next.plan && next.source !== 'coachOff' ? { ...toAppPlan(next.plan), fromCoach: next.source === 'coach' } : null

    // Insights: the latest coached session's highlights, and the patterns behind the latest plan.
    const coached = [...sessions].reverse().find((s) => s.summary)
    const lp = hist.latestPlan
    const insights: CoachInsights | null = coached?.summary || lp ? {
      summary: lp?.intro || coached?.summary?.highlights[0] || 'Your coach reviewed your last session.',
      takeaways: coached?.summary?.highlights ?? [],
      patterns: (lp?.reasons ?? []).map((r) => ({
        title: r.claim,
        detail: '',
        sessions: `based on ${r.sessionIds.length} session${r.sessionIds.length === 1 ? '' : 's'}`,
      })),
    } : null

    onChange({
      plan, status, insights,
      failedSessionId: status === 'failed' && last ? last.sessionId : null,
      coachOn: user ? user.coachEnabled : null,
    })
  }, [next, hist, user, onChange])

  return null
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside StoreProvider')
  return s
}
