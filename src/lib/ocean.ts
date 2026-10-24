// Generated ocean sound that breathes with the tide. Brown noise through a low-pass filter;
// the filter opens and the volume swells as the water rises. Must start from a user gesture.

let ctx: AudioContext | null = null
let filter: BiquadFilterNode | null = null
let gain: GainNode | null = null

export function startOcean() {
  if (ctx) return
  try {
    ctx = new AudioContext()
    const len = ctx.sampleRate * 4
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
      data[i] = last * 3.5
    }
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 500
    filter.Q.value = 0.7
    gain = ctx.createGain()
    gain.gain.value = 0
    src.connect(filter).connect(gain).connect(ctx.destination)
    src.start()
  } catch {
    ctx = null
  }
}

/** v is the breath value, -1 (exhaled) .. 1 (inhaled). */
export function setOceanBreath(v: number) {
  if (!ctx || !filter || !gain) return
  const t = ctx.currentTime
  filter.frequency.setTargetAtTime(320 + (v + 1) * 420, t, 0.35)
  gain.gain.setTargetAtTime(0.05 + (v + 1) * 0.07, t, 0.35)
}

export function stopOcean() {
  if (!ctx || !gain) return
  const c = ctx
  gain.gain.setTargetAtTime(0, c.currentTime, 0.4)
  ctx = null
  filter = null
  gain = null
  setTimeout(() => c.close().catch(() => {}), 1500)
}

export const oceanPlaying = () => ctx !== null
