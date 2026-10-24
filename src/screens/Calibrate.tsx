import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, LiveWave, Screen, TopBar } from '../components/ui'
import { createFakeSignal } from '../lib/signal'
import { useStore } from '../lib/store'

// Paced-breathing check: the circle moves at exactly 6 breaths/min (5 s in, 5 s out).
// Because the true rate is known, TIDE's reading proves accuracy live.

const DURATION = 30
const PACE = 6

export function Calibrate() {
  const nav = useNavigate()
  const { setCalibration } = useStore()
  const signal = useMemo(() => createFakeSignal({ lengthSec: DURATION, targetRate: PACE + (Math.random() - 0.5) * 0.6 }), [])
  const [left, setLeft] = useState(DURATION)
  const [rate, setRate] = useState<number | null>(null)
  const [inhale, setInhale] = useState(true)

  useEffect(() => {
    signal.start()
    const off = signal.onReading((r) => { if (r.t >= 8) setRate(r.rate) })
    const tick = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000)
    const breathe = setInterval(() => setInhale((v) => !v), 5000)
    return () => { off(); signal.stop(); clearInterval(tick); clearInterval(breathe) }
  }, [signal])

  const done = left === 0
  useEffect(() => { if (done && rate) setCalibration(rate) }, [done, rate, setCalibration])

  return (
    <Screen dim>
      <TopBar back />
      <h1 className="h1">Breathe with the circle</h1>
      <p className="lede">It moves at exactly {PACE} breaths a minute. TIDE should read about the same.</p>

      <div className="pacer">
        <div className={`pacer__orb${inhale ? ' is-in' : ''}`} />
        <div className="pacer__center">
          {done ? <><strong className="num-xl">{rate?.toFixed(1)}</strong><span>breaths / min</span></>
            : <><strong className="num-xl">{left}</strong><span>{inhale ? 'Breathe in' : 'Breathe out'}</span></>}
        </div>
      </div>

      <LiveWave subscribe={signal.onBreath} height={70} />

      <div className="card readout">
        <div><span className="muted">True pace</span><strong>{PACE.toFixed(1)}/min</strong></div>
        <div><span className="muted">TIDE reads</span><strong>{rate ? `${rate.toFixed(1)}/min` : '…'}</strong></div>
        <div><span className="muted">Error</span><strong>{rate ? `${Math.abs(rate - PACE).toFixed(1)}` : '…'}</strong></div>
      </div>

      <div className="spacer" />
      <button className="btn btn--primary" disabled={!done} onClick={() => nav('/session')}>
        {done ? 'Begin meditation' : 'Calibrating…'} {done && <Icon name="arrow" size={18} />}
      </button>
    </Screen>
  )
}
