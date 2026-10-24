import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, Screen, TopBar } from '../components/ui'

// Camera framing guide. Person 1 replaces the timed checks with real MediaPipe checks
// (face landmarks found, shoulders in frame, brightness, low motion).

const CHECKS = ['Face visible', 'Shoulders and chest visible', 'Good lighting', 'Phone is steady']

export function Setup() {
  const nav = useNavigate()
  const video = useRef<HTMLVideoElement>(null)
  const [cam, setCam] = useState<'asking' | 'on' | 'blocked'>('asking')
  const [passed, setPassed] = useState(0)

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
    const id = setInterval(() => setPassed((p) => Math.min(CHECKS.length, p + 1)), 700)
    return () => clearInterval(id)
  }, [cam])

  return (
    <Screen dim>
      <TopBar back right={<button className="link" onClick={() => nav('/calibrate')}>Skip</button>} />
      <h1 className="h1">Position your phone</h1>
      <p className="lede">About an arm’s length away. Face, shoulders and upper chest in frame.</p>

      <div className="viewfinder">
        <video ref={video} autoPlay playsInline muted />
        {cam !== 'on' && (
          <div className="viewfinder__msg">
            {cam === 'asking' ? 'Allow camera access to continue' : 'Camera blocked. Allow it in your browser settings, or skip for now.'}
          </div>
        )}
        <div className="viewfinder__frame" />
      </div>

      <ul className="checks">
        {CHECKS.map((c, i) => (
          <li key={c} className={i < passed ? 'is-ok' : ''}>
            <span>{c}</span>
            <span className="checks__mark">{i < passed && <Icon name="check" size={14} />}</span>
          </li>
        ))}
      </ul>
      <p className="fine"><Icon name="lock" size={14} /> Video is processed on this phone and never stored.</p>

      <button className="btn btn--primary" disabled={cam === 'on' && passed < CHECKS.length} onClick={() => nav('/calibrate')}>
        Looks good <Icon name="arrow" size={18} />
      </button>
    </Screen>
  )
}
