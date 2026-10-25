import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ConvexProvider } from 'convex/react'
import { convex } from './lib/backend'
import { StoreProvider } from './lib/store'
import { TideProvider } from './lib/tide'
import { BreathTest } from './screens/BreathTest'
import { Intro, Splash } from './screens/Intro'
import { Scores } from './screens/Scores'
import { Calibrate } from './screens/Calibrate'
import { Insights, PlanScreen, Profile } from './screens/Coach'
import { CoachView } from './screens/CoachView'
import { FeatureTest } from './screens/FeatureTest'
import { Debug } from './screens/Debug'
import { Replay } from './screens/Replay'
import { Home } from './screens/Home'
import { Onboarding } from './screens/Onboarding'
import { CalmMapScreen, Results } from './screens/Results'
import { Session } from './screens/Session'
import { Setup } from './screens/Setup'
import './styles.css'

// With VITE_CONVEX_URL set the app talks to Convex; without it everything stays local.
const WithBackend = ({ children }: { children: React.ReactNode }) =>
  convex ? <ConvexProvider client={convex}>{children}</ConvexProvider> : <>{children}</>

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WithBackend>
    <StoreProvider>
      <TideProvider>
      <Splash />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/intro" element={<Intro />} />
          <Route path="/onboard" element={<Onboarding />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/calibrate" element={<Calibrate />} />
          <Route path="/session" element={<Session />} />
          <Route path="/results" element={<Results />} />
          <Route path="/calm-map/:id?" element={<CalmMapScreen />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/plan" element={<PlanScreen />} />
          <Route path="/progress" element={<Navigate to="/scores" replace />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/coach" element={<CoachView />} />
          <Route path="/replay" element={<Replay />} />
          <Route path="/scores" element={<Scores />} />
          <Route path="/debug" element={<Debug />} />
          <Route path="/debug/features" element={<FeatureTest />} />
          <Route path="/debug/camera" element={<Navigate to="/debug/features" replace />} />
          <Route path="/breath-test" element={<BreathTest />} />
        </Routes>
      </BrowserRouter>
      </TideProvider>
    </StoreProvider>
    </WithBackend>
  </React.StrictMode>,
)
