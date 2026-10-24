import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, Screen, TopBar, type IconName } from '../components/ui'
import { useStore } from '../lib/store'
import { useTide } from '../lib/tide'
import type { Goal } from '../lib/types'

const GOALS: [Goal, string, IconName][] = [
  ['stress', 'Reduce stress', 'leaf'],
  ['focus', 'Improve focus', 'target'],
  ['habit', 'Build a habit', 'bars'],
  ['sleep', 'Sleep better', 'moon'],
]
const LENGTHS: [number, string][] = [[90, '90 s'], [300, '5 min'], [480, '8 min'], [600, '10 min']]

export function Onboarding() {
  const s = useStore()
  const nav = useNavigate()
  const [name, setName] = useState(s.name)
  const [goal, setGoal] = useState<Goal>(s.goal)
  const [len, setLen] = useState(s.lengthSec)
  useTide(0.16)

  return (
    <Screen>
      <TopBar back="/" title="01 · you" />
      <label className="field">
        <span className="eyebrow">what should we call you</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="given-name" />
      </label>

      <div>
        <p className="eyebrow">what brings you here</p>
        <div className="options">
          {GOALS.map(([g, label, icon]) => (
            <button key={g} className={`option${goal === g ? ' is-on' : ''}`} onClick={() => setGoal(g)} aria-pressed={goal === g}>
              <Icon name={icon} size={20} />
              <span>{label}</span>
              {goal === g && <span className="option__tick"><Icon name="check" size={16} /></span>}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="eyebrow">session length</p>
        <div className="chips">
          {LENGTHS.map(([v, l]) => (
            <button key={v} className={`chip${len === v ? ' is-on' : ''}`} onClick={() => setLen(v)} aria-pressed={len === v}>{l}</button>
          ))}
        </div>
      </div>

      <div className="spacer" />
      <button className="btn btn--primary" onClick={() => { s.setProfile({ name: name.trim(), goal, lengthSec: len }); nav('/') }}>
        continue <Icon name="arrow" size={16} />
      </button>
    </Screen>
  )
}
