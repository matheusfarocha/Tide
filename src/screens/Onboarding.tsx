import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, Screen, TopBar, type IconName } from '../components/ui'
import { useStore } from '../lib/store'
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

  return (
    <Screen dim>
      <TopBar back="/" />
      <h1 className="h1">What’s your goal?</h1>
      <p className="lede">We’ll shape your sessions around it.</p>

      <label className="field">
        <span className="eyebrow">Your name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="First name" autoComplete="given-name" />
      </label>

      <div className="options">
        {GOALS.map(([g, label, icon]) => (
          <button key={g} className={`option${goal === g ? ' is-on' : ''}`} onClick={() => setGoal(g)} aria-pressed={goal === g}>
            <Icon name={icon} size={24} />
            <span>{label}</span>
            {goal === g && <span className="option__tick"><Icon name="check" size={14} /></span>}
          </button>
        ))}
      </div>

      <p className="eyebrow">Session length</p>
      <div className="chips">
        {LENGTHS.map(([v, l]) => (
          <button key={v} className={`chip${len === v ? ' is-on' : ''}`} onClick={() => setLen(v)}>{l}</button>
        ))}
      </div>

      <div className="spacer" />
      <button className="btn btn--primary" onClick={() => { s.setProfile({ name: name.trim(), goal, lengthSec: len }); nav('/setup') }}>
        Continue <Icon name="arrow" size={18} />
      </button>
    </Screen>
  )
}
