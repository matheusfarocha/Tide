import { ChestMotion, ChestTotal } from '../signal/chestMotion'
import { SignalEngine } from '../signal/engine'
import { OneEuro } from '../signal/oneEuro'
import type { Frame, SignalReading } from '../signal/types'
import { blendshapes, loadFace } from './face'
import { BreathTracker, LM, loadPose, visible } from './pose'
import { createFakeSignal, type ChestInfo, type SignalSource } from './signal'
import type { Reading } from './types'

// Person 1's real SignalSource: MediaPipe pose + face on the phone's camera, run through the signal engine.
// Video never leaves the phone; only the numbers below are produced. If the camera or the pose model
// is unavailable it falls back to the fake signal, so the demo flow keeps working.

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

/** posture: 1 = upright. Penalises the head dropping and leaning in or out versus the session baseline. */
function posture(r: SignalReading) {
  const drop = Math.max(0, r.headDrop) / 0.2
  const lean = Math.abs(r.lean - 1) / 0.4
  return clamp01(1 - Math.max(drop, lean))
}

function toReading(r: SignalReading, t: number, breathPhase: number, signalOk: boolean): Reading {
  return {
    t,
    breathPhase,
    rate: r.rate ?? r.rateSpectral ?? 0,
    regularity: r.regularity ?? 0,
    stillness: r.stillness,
    posture: posture(r),
    tension: r.tension ?? 0,
    state: r.state,
    signalOk,
  }
}

const emptyReading = (t: number): Reading => ({
  t, breathPhase: 0, rate: 0, regularity: 0, stillness: 1, posture: 1, tension: 0, state: 'settling', signalOk: false,
})

// chest (default on): breath from chest pixel motion, falling back to the shoulder landmarks when the chest is unusable.
export function createSignal(opts: { lengthSec: number; targetRate?: number; face?: boolean; smooth?: boolean; chest?: boolean }): SignalSource {
  const breathSubs = new Set<(v: number) => void>()
  const readingSubs = new Set<(r: Reading) => void>()
  const inhaleSubs = new Set<(t: number) => void>()
  const rawSubs = new Set<(r: SignalReading) => void>()
  const frameSubs = new Set<(raw: Frame, used: Frame) => void>()
  const chestSubs = new Set<(c: ChestInfo) => void>()
  let mode: 'pending' | 'real' | 'demo' = 'pending'
  let liveStream: MediaStream | null = null
  let stopRun: () => void = () => {}
  // Each start() gets a generation; stop() or a newer start() invalidates older, still-loading runs
  // (React StrictMode runs start, stop, start; a stale run must not keep feeding the shared pose model).
  let generation = 0

  // The first 60 s (or a quarter of a short demo session, min 20 s) teach TIDE this person's normal.
  const baselineSec = Math.min(60, Math.max(20, opts.lengthSec * 0.25))

  async function startReal(gen: number) {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-10px;top:-10px'
    document.body.appendChild(video)
    let stream: MediaStream | null = null
    const cleanupVideo = () => {
      if (liveStream === stream) liveStream = null
      stream?.getTracks().forEach((t) => t.stop())
      video.remove()
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
      video.srcObject = stream
      liveStream = stream
      await video.play()
      if (gen !== generation) { cleanupVideo(); return }
      const [pose, face] = await Promise.all([loadPose(), opts.face === false ? Promise.resolve(null) : loadFace().catch(() => null)])
      if (gen !== generation) { cleanupVideo(); return }

      const engine = new SignalEngine(baselineSec)
      // One Euro per landmark coordinate: steady while still (kills tracker jitter), quick when you move.
      const smooth = opts.smooth !== false
      // Chest pixel motion: track how a patch of image below the shoulders moves, instead of the landmarks.
      const useChest = opts.chest !== false
      engine.setChestEnabled(useChest)
      const chest = new ChestMotion()
      const crop = document.createElement('canvas')
      const cropCtx = crop.getContext('2d', { willReadFrequently: true })!
      let roi: { x: number; y: number; w: number; h: number } | null = null
      const total = new ChestTotal() // running chest motion in image heights
      const CROP_W = 96
      const filters = Array.from({ length: 6 }, () => new OneEuro())
      const smoothFrame = (f: Frame): Frame => {
        if (!smooth) return f
        const s = (p: { x: number; y: number }, i: number) => ({ x: filters[i].filter(f.t, p.x), y: filters[i + 1].filter(f.t, p.y) })
        return { t: f.t, nose: s(f.nose, 0), shoulderL: s(f.shoulderL, 2), shoulderR: s(f.shoulderR, 4) }
      }
      // Two wave trackers, one per breath signal. Chest pixel motion is about 0.001 of the image height per
      // breath, so its wave needs a matching range. The wave follows whichever signal the engine is using.
      const trackerLm = new BreathTracker()
      const trackerChest = new BreathTracker(0.0003)
      const tracker = () => (engine.breathSource() === 'chest' ? trackerChest : trackerLm)
      let raf = 0
      let lastVideoTime = -1
      let frameNo = 0
      let lastBreath = 0
      let lastTick = 0
      let lastFrameAt = 0
      let lastInhale = -Infinity
      const t0 = performance.now()

      const stepChest = (frame: Frame, aspect: number, nowMs: number) => {
        const vw = video.videoWidth, vh = video.videoHeight
        const toPx = (p: { x: number; y: number }) => ({ x: (p.x / aspect) * vw, y: p.y * vh })
        const L = toPx(frame.shoulderL), R = toPx(frame.shoulderR)
        const span = Math.hypot(L.x - R.x, L.y - R.y)
        const cx = (L.x + R.x) / 2
        const top = (L.y + R.y) / 2 + 0.15 * span
        const want = {
          x: Math.max(0, Math.round(cx - 0.35 * span)),
          y: Math.max(0, Math.round(top)),
          w: 0,
          h: Math.round(0.6 * span),
        }
        want.w = Math.min(vw - want.x, Math.round(0.7 * span))
        want.h = Math.min(vh - want.y, want.h)
        if (want.w < 40 || want.h < 24) { roi = null; chest.breakChain(); chestSubs.forEach((cb) => cb({ roi: null, texture: null, cum: total.value })); return }
        // Keep the window fixed unless the body moved a lot, so consecutive crops line up exactly.
        const moved = !roi || Math.abs(want.x + want.w / 2 - (roi.x + roi.w / 2)) > 0.08 * span || Math.abs(want.y - roi.y) > 0.08 * span || Math.abs(want.w - roi.w) > 0.2 * roi.w
        if (moved) {
          roi = want
          chest.breakChain()
          crop.width = CROP_W
          crop.height = Math.max(8, Math.round((CROP_W * roi.h) / roi.w))
        }
        const r = roi!
        cropCtx.drawImage(video, r.x, r.y, r.w, r.h, 0, 0, crop.width, crop.height)
        const px = cropCtx.getImageData(0, 0, crop.width, crop.height).data
        const gray = new Float32Array(crop.width * crop.height)
        for (let i = 0, j = 0; i < px.length; i += 4, j++) gray[j] = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
        const step = chest.push(gray, crop.width, crop.height)
        const toIh = (r.h / crop.height) / vh // crop pixels -> image heights
        if (step) {
          const cumIh = total.add(step.dy, toIh) // convert with this frame's scale, never rescale history
          const width = Math.hypot(frame.shoulderL.x - frame.shoulderR.x, frame.shoulderL.y - frame.shoulderR.y)
          engine.pushBreathSample(frame.t, cumIh / width)
          trackerChest.push(nowMs, cumIh)
        }
        chestSubs.forEach((cb) => cb({ roi: { x: r.x / vw, y: r.y / vh, w: r.w / vw, h: r.h / vh }, texture: step?.texture ?? null, cum: total.value }))
      }

      const loop = (nowMs: number) => {
        if (video.readyState >= 2 && video.videoWidth && video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime
          frameNo++
          let lms: ReturnType<typeof pose.detectForVideo>['landmarks'][number] | undefined
          try { lms = pose.detectForVideo(video, nowMs).landmarks[0] } catch { lms = undefined }
          const l = lms?.[LM.lShoulder], r = lms?.[LM.rShoulder], nose = lms?.[LM.nose]
          if (lms && visible(l, 0.5) && visible(r, 0.5) && nose) {
            const aspect = video.videoWidth / video.videoHeight
            const pt = (p: { x: number; y: number }) => ({ x: p.x * aspect, y: p.y })
            const raw: Frame = { t: nowMs / 1000, nose: pt(nose), shoulderL: pt(l!), shoulderR: pt(r!) }
            const frame = smoothFrame(raw)
            engine.pushFrame(frame)
            frameSubs.forEach((cb) => cb(raw, frame))
            if (useChest) stepChest(frame, aspect, nowMs)
            trackerLm.push(nowMs, (frame.shoulderL.y + frame.shoulderR.y) / 2)
            lastFrameAt = nowMs
          }
          if (face && frameNo % 3 === 0) {
            try {
              const b = blendshapes(face, video, nowMs)
              if (b) engine.pushBlendshapes(nowMs / 1000, b)
            } catch { /* face is optional */ }
          }
        }
        if (nowMs - lastBreath >= 100) {
          lastBreath = nowMs
          const v = tracker().value()
          breathSubs.forEach((cb) => cb(v))
        }
        if (nowMs - lastTick >= 1000) {
          lastTick = nowMs
          const t = Math.round((nowMs - t0) / 1000)
          const ok = nowMs - lastFrameAt < 2000
          const sr = engine.tick()
          if (sr) rawSubs.forEach((cb) => cb(sr))
          readingSubs.forEach((cb) => cb(sr ? toReading(sr, t, tracker().value(), ok) : emptyReading(t)))
          for (const it of sr?.inhales ?? []) {
            if (it > lastInhale + 0.8 && it * 1000 >= t0) { lastInhale = it; inhaleSubs.forEach((cb) => cb(it)) }
          }
        }
        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)
      mode = 'real'
      stopRun = () => { cancelAnimationFrame(raf); cleanupVideo() }
    } catch (e) {
      cleanupVideo()
      throw e
    }
  }

  return {
    async start() {
      const gen = ++generation
      mode = 'pending'
      try {
        await startReal(gen)
      } catch (e) {
        if (gen !== generation) return
        console.warn('Real signal unavailable, using the demo signal', e)
        mode = 'demo'
        const fake = createFakeSignal(opts)
        const offs = [
          fake.onBreath((v) => breathSubs.forEach((cb) => cb(v))),
          fake.onReading((r) => readingSubs.forEach((cb) => cb(r))),
        ]
        await fake.start()
        stopRun = () => { offs.forEach((o) => o()); fake.stop() }
      }
    },
    stop() {
      generation++
      stopRun()
      stopRun = () => {}
    },
    onBreath(cb) { breathSubs.add(cb); return () => { breathSubs.delete(cb) } },
    onReading(cb) { readingSubs.add(cb); return () => { readingSubs.delete(cb) } },
    onChest(cb) { chestSubs.add(cb); return () => { chestSubs.delete(cb) } },
    onFrame(cb) { frameSubs.add(cb); return () => { frameSubs.delete(cb) } },
    onRaw(cb) { rawSubs.add(cb); return () => { rawSubs.delete(cb) } },
    mode: () => mode,
    stream: () => liveStream,
    onInhale(cb) { inhaleSubs.add(cb); return () => { inhaleSubs.delete(cb) } },
  }
}
