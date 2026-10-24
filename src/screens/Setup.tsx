import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, Screen, TopBar } from '../components/ui'
import { useTide } from '../lib/tide'

// Camera framing guide. Person 1 replaces the timed checks with real MediaPipe checks
// (face landmarks found, shoulders in frame, brightness, low motion).

const CHECKS = ['face', 'shoulders', 'light', 'steady']

export function Setup() {
  const nav = useNavigate()
  const video = useRef<HTMLVideoElement>(null)
  const [cam, setCam] = useState<'asking' | 'on' | 'blocked'>('asking')
  const [passed, setPassed] = useState(0)
  useTide(0.18)

  useEffect(() => {
    let stream: MediaStream | null = null
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((s) => {
        stream = s
        if (video.current) video.current.srcObject = s
        setCam('on')
      })
      .catch(() => setCam('blocked'))
    return () => stream?.getTracks().forEach((t) => t.stop())
  }, [])

  useEffect(() => {
    if (cam !== 'on') return
    const id = setInterval(() => setPassed((p) => Math.min(CHECKS.length, p + 1)), 650)
    return () => clearInterval(id)
  }, [cam])

  return (
    <Screen>
      <TopBar back title="02 · frame" right={<button className="link" onClick={() => nav('/calibrate')}>skip</button>} />
      <h1 className="h1">Prop your phone<br /><em>an arm’s length away.</em></h1>

      <div className="porthole">
        <video ref={video} autoPlay playsInline muted />
        {cam !== 'on' && (
          <div className="porthole__msg">{cam === 'asking' ? 'Allow the camera to continue.' : 'Camera blocked. Allow it in your browser settings, or skip for now.'}</div>
        )}
        {cam === 'on' && <div className="porthole__scan" />}
      </div>

      <ul className="checks">
        {CHECKS.map((c, i) => (
          <li key={c} className={i < passed ? 'is-ok' : ''}>
            {c}
            <span className="checks__mark">{i < passed && <Icon name="check" size={9} />}</span>
          </li>
        ))}
      </ul>
      <p className="fine"><Icon name="lock" size={12} /> processed on this phone · never stored</p>

      <div className="spacer" />
      <button className="btn btn--primary" disabled={cam === 'on' && passed < CHECKS.length} onClick={() => nav('/calibrate')}>
        looks good <Icon name="arrow" size={16} />
      </button>
    </Screen>
  )
}
