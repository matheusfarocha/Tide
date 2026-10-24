import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { StoreProvider } from './lib/store'
import { TideProvider } from './lib/tide'
import { BreathTest } from './screens/BreathTest'
import { Intro, Splash } from './screens/Intro'
import { Scores } from './screens/Scores'
import { Calibrate } from './screens/Calibrate'
import { Insights, PlanScreen, Profile, Progress } from './screens/Coach'
import { CoachView } from './screens/CoachView'
import { Home } from './screens/Home'
import { Onboarding } from './screens/Onboarding'
import { CalmMapScreen, Results } from './screens/Results'
import { Session } from './screens/Session'
import { Setup } from './screens/Setup'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
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
          <Route path="/progress" element={<Progress />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/coach" element={<CoachView />} />
          <Route path="/scores" element={<Scores />} />
          <Route path="/breath-test" element={<BreathTest />} />
        </Routes>
      </BrowserRouter>
      </TideProvider>
    </StoreProvider>
  </React.StrictMode>,
)
