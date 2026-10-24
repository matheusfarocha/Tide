import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, Mark, Screen, TopBar } from '../components/ui'
import { useTide } from '../lib/tide'

// Launch splash, then a three-card story that explains TIDE before asking anything of you.

export function Splash() {
  const [show, setShow] = useState(() => {
    try { return !sessionStorage.getItem('tide.splash') } catch { return true }
  })
  useEffect(() => {
    if (!show) return
    try { sessionStorage.setItem('tide.splash', '1') } catch { /* fine */ }
    const id = setTimeout(() => setShow(false), 2900)
    return () => clearTimeout(id)
  }, [show])
  if (!show) return null
  return (
    <div className="splash" onClick={() => setShow(false)} aria-hidden>
      <div className="splash__inner">
        <Mark size={96} draw />
        <span className="splash__word">tide</span>
        <span className="splash__tag">learn to feel your mind drift</span>
      </div>
    </div>
  )
}

const CARDS = [
  {
    title: 'It sees your breath.',
    body: 'Prop your phone up. The camera reads your chest and shoulders, on the phone, never uploaded.',
    art: (
      <svg viewBox="0 0 260 190" aria-hidden>
        <ellipse className="art-dim" cx="130" cy="38" rx="22" ry="27" />
        <g className="art-chest">
          <path className="art-line" d="M62 88 L198 88" style={{ strokeWidth: 2.4 }} />
          <path className="art-line" d="M66 106 Q130 116 194 106" opacity=".7" />
          <path className="art-line" d="M70 124 Q130 136 190 124" opacity=".55" />
          <path className="art-line" d="M74 142 Q130 155 186 142" opacity=".4" />
          <path className="art-line" d="M78 160 Q130 172 182 160" opacity=".28" />
          <circle cx="62" cy="88" r="4" fill="#eaf3f7" />
          <circle cx="198" cy="88" r="4" fill="#eaf3f7" />
        </g>
      </svg>
    ),
  },
  {
    title: 'It asks. You answer.',
    body: '“Focused, or drifting?” Eyes closed, you say it out loud. TIDE shows how close your feeling was to what it saw.',
    art: (
      <svg viewBox="0 0 260 190" aria-hidden>
        <g className="art-felt">
          <text x="20" y="66" fill="rgba(234,243,247,.6)" fontFamily="Geist Mono" fontSize="10" letterSpacing="1.5">YOU FELT</text>
          <path className="art-line" d="M20 76 L240 76" style={{ stroke: '#ffb570' }} />
        </g>
        <g className="art-saw">
          <path className="art-line" d="M20 112 L240 112" />
          <text x="20" y="132" fill="rgba(234,243,247,.6)" fontFamily="Geist Mono" fontSize="10" letterSpacing="1.5">TIDE SAW</text>
        </g>
      </svg>
    ),
  },
  {
    title: 'Then it steps back.',
    body: 'As your answers start matching, the coach fades its cues, until you notice drifting on your own.',
    art: (
      <svg viewBox="0 0 260 190" aria-hidden>
        <text x="20" y="80" fill="rgba(234,243,247,.6)" fontFamily="Geist Mono" fontSize="10" letterSpacing="1.5">COACH SUPPORT</text>
        <rect x="20" y="92" width="220" height="3" rx="1.5" fill="rgba(234,243,247,.14)" />
        <rect className="art-fade" x="20" y="92" width="220" height="3" rx="1.5" fill="#7fe7ff" />
        <text x="20" y="128" fill="#eaf3f7" fontFamily="Instrument Serif" fontStyle="italic" fontSize="22">you, on your own.</text>
      </svg>
    ),
  },
]

export function Intro() {
  const nav = useNavigate()
  const track = useRef<HTMLDivElement>(null)
  const [i, setI] = useState(0)
  useTide(0.2)

  const go = (n: number) => {
    const el = track.current
    if (!el) return
    el.scrollTo({ left: n * (el.clientWidth - 40 + 14), behavior: 'smooth' })
  }
  const onScroll = () => {
    const el = track.current
    if (el) setI(Math.round(el.scrollLeft / (el.clientWidth - 40 + 14)))
  }
  const last = i === CARDS.length - 1

  return (
    <Screen>
      <TopBar back="/" title={`how it works · ${i + 1}/3`} right={<button className="link" onClick={() => nav('/onboard')}>skip</button>} />
      <div className="intro__track" ref={track} onScroll={onScroll}>
        {CARDS.map((c, n) => (
          <article key={c.title} className="card intro__card" aria-hidden={n !== i}>
            <div className="intro__art">{c.art}</div>
            <span className="intro__num">0{n + 1}</span>
            <h2 className="h1">{c.title}</h2>
            <p className="lede">{c.body}</p>
          </article>
        ))}
      </div>
      <div className="intro__dots" role="tablist" aria-label="Story progress">
        {CARDS.map((c, n) => <button key={c.title} role="tab" aria-selected={n === i} aria-label={`Card ${n + 1}`} className={n === i ? 'is-on' : ''} onClick={() => go(n)} />)}
      </div>
      <div className="spacer" />
      <button className="btn btn--primary" onClick={() => (last ? nav('/onboard') : go(i + 1))}>
        {last ? 'set up' : 'next'} <Icon name="arrow" size={16} />
      </button>
    </Screen>
  )
}
