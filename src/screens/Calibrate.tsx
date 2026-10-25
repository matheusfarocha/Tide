import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, Screen, TopBar } from '../components/ui'
import { createSignal } from '../lib/realSignal'
import { useStore } from '../lib/store'
import { useTide, useTideCtl } from '../lib/tide'

// Paced-breathing check. The tide itself is the pacer: it rises for 5 s and falls for 5 s,
// exactly 6 breaths/min. Because the true rate is known, TIDE's reading proves accuracy live.
// If the camera can't start, the app falls back to a simulated signal: the screen says so, and a
// simulated reading is never saved as a calibration.

const DURATION = 30
const PACE = 6

export function Calibrate() {
  const nav = useNavigate()
  const { setCalibration } = useStore()
  const tide = useTideCtl()
  useTide(0.42)
  const signal = useMemo(() => createSignal({ lengthSec: DURATION, targetRate: PACE + (Math.random() - 0.5) * 0.6 }), [])
  const [left, setLeft] = useState(DURATION)
  const [rate, setRate] = useState<number | null>(null)
  const [inhale, setInhale] = useState(true)
  const [simulated, setSimulated] = useState(false)
  const done = left === 0

  useEffect(() => {
    signal.start()
    const off = signal.onReading((r) => {
      setSimulated(signal.mode?.() === 'demo')
      if (r.t >= 8) setRate(r.rate)
    })
    const t0 = performance.now()
    const pace = setInterval(() => {
      const t = (performance.now() - t0) / 1000
      tide.pushBreath(-Math.cos((t / 10) * Math.PI * 2))
      setInhale(t % 10 < 5)
    }, 80)
    const tick = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000)
    return () => { off(); signal.stop(); clearInterval(pace); clearInterval(tick) }
  }, [signal, tide])

  useEffect(() => { if (done && rate && !simulated) setCalibration(rate) }, [done, rate, simulated, setCalibration])

  return (
    <Screen>
      <TopBar back title="03 · calibrate" />
      <div className="sea-top">
        <span className="sea-count">{done ? 'calibrated' : `00:${String(left).padStart(2, '0')}`}</span>
        <p className="sea-phase">{done ? 'Still water.' : inhale ? 'Breathe in…' : 'and out…'}</p>
        <p className="lede">{simulated
          ? "Camera not available, so this reading is simulated and won't be saved. Allow camera access and try again."
          : !done ? 'Breathe with the tide. It moves at exactly 6 breaths a minute.'
          : rate && Math.abs(rate - PACE) <= 1 ? 'TIDE matched your breathing.'
          : 'TIDE read you a little off the pace. Sit square to the camera with your shoulders in view.'}</p>
      </div>

      <div className="sea-low">
        <div className="readout">
          <div><span>true pace</span><strong>{PACE.toFixed(1)}</strong></div>
          <div><span>{simulated ? 'simulated' : 'tide reads'}</span><strong>{rate ? rate.toFixed(1) : '—'}</strong></div>
          <div><span>error</span><strong>{rate ? Math.abs(rate - PACE).toFixed(1) : '—'}</strong></div>
        </div>
        <button className="btn btn--primary" disabled={!done} onClick={() => nav('/session')}>
          {done ? <>begin <Icon name="arrow" size={16} /></> : 'calibrating…'}
        </button>
      </div>
    </Screen>
  )
}
