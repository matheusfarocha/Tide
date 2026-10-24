import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { demoBreathTests, demoHistory, demoInsights, demoPlan, firstPlan } from './demo'
import type { BreathTest, CoachInsights, FeelCheck, Goal, Plan, Reading, SessionRecord } from './types'

// App-wide state. Person 3 replaces the fake coach run and localStorage with Convex queries/mutations.

type CoachStatus = 'idle' | 'reviewing' | 'ready'

interface Store {
  name: string
  goal: Goal
  lengthSec: number
  onboarded: boolean
  coachOn: boolean
  soundOn: boolean
  setSoundOn(v: boolean): void
  plan: Plan
  history: SessionRecord[]
  breathTests: BreathTest[]
  insights: CoachInsights | null
  coachStatus: CoachStatus
  calibrationRate?: number
  setProfile(p: { name: string; goal: Goal; lengthSec: number }): void
  setLength(sec: number): void
  setCoachOn(v: boolean): void
  setCalibration(rate: number): void
  finishSession(readings: Reading[], feelChecks: FeelCheck[]): SessionRecord
  resetDemo(): void
  addBreathTest(t: BreathTest): void
}

const Ctx = createContext<Store | null>(null)
const KEY = 'tide.v2'

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const saved = useRef(load()).current
  const [name, setName] = useState<string>(saved?.name ?? '')
  const [goal, setGoal] = useState<Goal>(saved?.goal ?? 'focus')
  const [lengthSec, setLengthSec] = useState<number>(saved?.lengthSec ?? 90)
  const [onboarded, setOnboarded] = useState<boolean>(saved?.onboarded ?? false)
  const [coachOn, setCoachOn] = useState<boolean>(saved?.coachOn ?? true)
  const [history, setHistory] = useState<SessionRecord[]>(saved?.history ?? demoHistory)
  const [insights, setInsights] = useState<CoachInsights | null>(saved?.insights ?? demoInsights)
  const [breathTests, setBreathTests] = useState<BreathTest[]>(saved?.breathTests ?? demoBreathTests)
  const [plan, setPlan] = useState<Plan>(saved?.plan ?? demoPlan)
  const [soundOn, setSoundOn] = useState<boolean>(saved?.soundOn ?? true)
  const [coachStatus, setCoachStatus] = useState<CoachStatus>('idle')
  const [calibrationRate, setCalibration] = useState<number | undefined>()

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ name, goal, lengthSec, onboarded, coachOn, soundOn, history: history.slice(-12), breathTests: breathTests.slice(-12), insights, plan }))
    } catch { /* storage is a convenience only */ }
  }, [name, goal, lengthSec, onboarded, coachOn, soundOn, history, breathTests, insights, plan])

  const store = useMemo<Store>(() => ({
    name, goal, lengthSec, onboarded, coachOn, soundOn, setSoundOn, history, breathTests, insights, coachStatus, calibrationRate,
    plan: coachOn ? plan : firstPlan,
    setProfile(p) {
      setName(p.name)
      setGoal(p.goal)
      setLengthSec(p.lengthSec)
      setOnboarded(true)
    },
    setLength: setLengthSec,
    setCoachOn,
    setCalibration,
    finishSession(readings, feelChecks) {
      const rec: SessionRecord = {
        id: `s${Date.now()}`,
        date: new Date().toISOString(),
        lengthSec: readings.length ? readings[readings.length - 1].t : 0,
        readings,
        feelChecks,
        calibrationRate,
      }
      setHistory((h) => [...h, rec])
      if (coachOn) {
        // Fake CREAO run. Real one: Convex action starts the pipeline, plan arrives by webhook.
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
  }), [name, goal, lengthSec, onboarded, coachOn, soundOn, history, breathTests, insights, plan, coachStatus, calibrationRate])

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside StoreProvider')
  return s
}
