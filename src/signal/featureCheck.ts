import { THRESHOLDS as S } from './state'

// Pass/fail checks for each feature, judged against the same thresholds the state model uses,
// so a PASS means the feature would really trigger. Used by the guided /debug/features page.

export type Verdict = 'pass' | 'warn' | 'fail'

/** One per-second engine reading plus whether the body was being tracked. */
export interface Sample {
  rate: number | null
  rateSpectral: number | null
  confidence: number
  motion: number
  stillness: number
  headDrop: number
  tension: number | null
  flutter: number | null
  state: string
  baselineReady: boolean
  signalOk: boolean
  /** Inhales detected in the analysis buffer (about the last 60 s). */
  inhaleCount: number
  faceParts?: { brow: number; mouth: number; squint: number } | null
  why?: string[]
  breathSource?: 'chest' | 'landmarks'
}

export interface Check { verdict: Verdict; lines: string[]; meaning: string }

const nums = (xs: (number | null)[]) => xs.filter((x): x is number => x !== null)
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const quantile = (xs: number[], q: number) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]
}
const frac = (n: number, d: number) => (d ? n / d : 0)
const f2 = (v: number) => v.toFixed(2)

const noData = (): Check => ({ verdict: 'fail', lines: ['no data was collected'], meaning: 'Nothing was recorded during this step. The signal was not running or no reading came through. Check the camera and retry.' })

export interface SignalExtra {
  method: 'chest pixels' | 'shoulder landmarks'
  /** Share of frames in which the chest patch had usable texture; null when not using chest pixels. */
  chestUsablePct: number | null
  /** Seconds of data the analyzer holds (it keeps at most 60 s). */
  bufferSec: number
}

export function checkSignal(base: Sample[], extra?: SignalExtra): Check {
  if (!base.length) return noData()
  // Judge the later part only: the first ~12 s are warm-up, when no rate can exist yet.
  const late = base.slice(Math.floor(base.length * 0.4))
  const ok = frac(base.filter((s) => s.signalOk).length, base.length)
  const peaks = frac(late.filter((s) => s.rate !== null).length, late.length)
  const spec = frac(late.filter((s) => s.rateSpectral !== null).length, late.length)
  const any = frac(late.filter((s) => s.rate !== null || s.rateSpectral !== null).length, late.length)
  const conf = quantile(late.map((s) => s.confidence), 0.5)
  const inhales = quantile(late.map((s) => s.inhaleCount), 0.5)
  const withSource = late.filter((s) => s.breathSource !== undefined)
  const chestShare = withSource.length ? frac(withSource.filter((s) => s.breathSource === 'chest').length, withSource.length) : null
  const rates = nums(late.map((s) => s.rate ?? s.rateSpectral))
  // What a steady breather at this rate would show in the data we hold; the unconfirmed last breath and the filter edges cost about one.
  const expectedInhales = extra && rates.length ? (quantile(rates, 0.5) * extra.bufferSec) / 60 : null
  const lines = [
    ...(extra ? [`breath method: ${extra.method}${extra.chestUsablePct !== null ? `, chest patch had usable texture in ${Math.round(extra.chestUsablePct)}% of frames` : ''}`] : []),
    ...(extra?.method === 'chest pixels' && chestShare !== null ? [`breath signal actually used: chest ${Math.round(chestShare * 100)}% of the time, shoulders (fallback) ${Math.round((1 - chestShare) * 100)}%`] : []),
    `body tracked: ${Math.round(ok * 100)}% of the time`,
    `breath rate available (after warm-up): ${Math.round(any * 100)}% (peak method ${Math.round(peaks * 100)}%, spectral method ${Math.round(spec * 100)}%)${rates.length ? `, around ${f2(quantile(rates, 0.5))} per minute` : ''}`,
    expectedInhales === null
      ? `inhales found in the buffer: ${inhales}`
      : `inhales found: ${inhales} (about ${Math.round(expectedInhales)} expected for ${Math.round(quantile(rates, 0.5))} breaths a minute over ${Math.round(extra!.bufferSec)} s of data)`,
    `signal quality hint (median): ${f2(conf)}`,
  ]
  if (ok < 0.8) return { verdict: 'fail', lines, meaning: 'The body was lost for much of the time. Fix framing and light first: both shoulders and your face in frame.' }
  if (extra?.chestUsablePct != null && extra.chestUsablePct < 50) {
    return { verdict: 'fail', lines, meaning: 'The chest patch has too little texture to track (plain clothing or flat light), so no breath signal is being produced. Try a patterned top, more side light, or untick chest pixels to use the shoulder landmarks.' }
  }
  if (any < 0.5) return { verdict: 'warn', lines, meaning: 'You were tracked but almost no breath rate was produced. The breath signal is weak or noisy: try the other breath method, a closer-fitting top, or steadier posture.' }
  if (peaks < 0.5 && spec >= 0.5) return { verdict: 'warn', lines, meaning: 'A rate is available from the spectral method but the peak method rarely finds three clear breaths. The rate still works, the breath-by-breath detection (used for regularity and the breath-count test) is the weak part.' }
  if (expectedInhales !== null && expectedInhales >= 4 && inhales < 0.5 * expectedInhales) return { verdict: 'warn', lines, meaning: 'Noticeably fewer inhales were detected than your rate implies. The rate is usable but breath-by-breath detection (regularity, the breath-count test) is missing breaths.' }
  return { verdict: 'pass', lines, meaning: 'You are tracked and a breath rate is being produced. The baseline for the later steps is now learned.' }
}

export function checkPaced(final: Sample | undefined, trueRate = 6): Check {
  const measured = final ? final.rate ?? final.rateSpectral : null
  if (measured === null || measured === undefined) return { verdict: 'fail', lines: ['no breath rate at the end of the 30 s'], meaning: 'No reading came out. Check framing, then retry.' }
  const err = Math.abs(measured - trueRate)
  const verdict: Verdict = err <= 1 ? 'pass' : err <= 2 ? 'warn' : 'fail'
  return {
    verdict,
    lines: [`measured ${f2(measured)} vs true ${trueRate} (error ${f2(err)})`, `peak method ${final!.rate?.toFixed(1) ?? '–'}, spectral method ${final!.rateSpectral?.toFixed(1) ?? '–'}, quality hint ${f2(final!.confidence)}`],
    meaning: verdict === 'pass' ? 'The breath rate is accurate against a known answer.' : 'The reading is off against the known answer. This is the number to fix first.',
  }
}

export function checkFidget(base: Sample[], win: Sample[]): Check {
  if (!win.length || !base.length) return noData()
  const bm = median(base.map((s) => s.motion))
  const wm = quantile(win.map((s) => s.motion), 0.75)
  const ratio = wm / Math.max(bm, S.motionFloor / 3)
  const saw = win.some((s) => s.state === 'restless')
  const lines = [`motion while still ${f2(bm)}, while fidgeting ${f2(wm)} (${ratio.toFixed(1)}x)`, `state reached restless: ${saw ? 'yes' : 'no'}`, `stillness dropped to ${f2(Math.min(...win.map((s) => s.stillness)))}`]
  const verdict: Verdict = ratio >= S.restlessRatio && wm > S.motionFloor ? 'pass' : ratio >= S.driftMotionRatio ? 'warn' : 'fail'
  return { verdict, lines, meaning: verdict === 'pass' ? 'Fidgeting is clearly picked up, past the line where the state model calls it restless.' : 'Fidgeting was not strong enough to cross the restless line. Either move more, or the motion measure is too insensitive.' }
}

export function checkHeadDrop(win: Sample[]): Check {
  if (!win.length) return noData()
  const ready = win.filter((s) => s.baselineReady)
  if (!ready.length) return { verdict: 'fail', lines: ['no baseline yet'], meaning: 'Run the baseline step first so head drop has something to compare against.' }
  const peak = quantile(ready.map((s) => s.headDrop), 0.9)
  const saw = win.some((s) => s.state === 'drifting')
  const verdict: Verdict = peak >= S.headDrop ? 'pass' : peak >= S.headDrop / 2 ? 'warn' : 'fail'
  return { verdict, lines: [`head drop (90th percentile) ${f2(peak)} shoulder widths, the drifting line is ${S.headDrop}`, `state reached drifting: ${saw ? 'yes' : 'no'}`], meaning: verdict === 'pass' ? 'Dropping your head is picked up, crosses the line, and the state goes to drifting.' : 'A head drop did not reach the line. Lower your chin further, or the threshold is too high for this setup.' }
}

export function checkTension(base: Sample[], win: Sample[]): Check {
  if (!win.length) return noData()
  const wt = nums(win.map((s) => s.tension))
  if (frac(wt.length, win.length) < 0.5) return { verdict: 'fail', lines: [`face tracked in only ${Math.round(frac(wt.length, win.length) * 100)}% of the time`], meaning: 'The face is not being tracked, so tension cannot be measured. Check the face model loaded and your face is in frame.' }
  const rise = mean(wt) - mean(nums(base.map((s) => s.tension)))
  const part = (k: 'brow' | 'mouth' | 'squint') => mean(nums(win.map((s) => s.faceParts?.[k] ?? null))) - mean(nums(base.map((s) => s.faceParts?.[k] ?? null)))
  const verdict: Verdict = rise >= S.tensionRise ? 'pass' : rise >= S.tensionRise / 2 ? 'warn' : 'fail'
  return {
    verdict,
    lines: [`tension rose by ${f2(rise)} (the state model counts +${S.tensionRise})`, `by part: brow ${f2(part('brow'))}, lips ${f2(part('mouth'))}, eye squint ${f2(part('squint'))}`],
    meaning: verdict === 'pass' ? 'Brow and lip tension is detected clearly.' : 'Tension barely moved. The by-part line shows which face scores responded, so we can see what this face model actually picks up.',
  }
}

export function checkEyesClosed(win: Sample[]): Check {
  if (!win.length) return noData()
  const ten = frac(nums(win.map((s) => s.tension)).length, win.length)
  const flu = frac(nums(win.map((s) => s.flutter)).length, win.length)
  const lines = [`tension available ${Math.round(ten * 100)}%, flutter available ${Math.round(flu * 100)}%`, `flutter average ${f2(mean(nums(win.map((s) => s.flutter))))}, tension average ${f2(mean(nums(win.map((s) => s.tension))))}`]
  const m = Math.min(ten, flu)
  const verdict: Verdict = m >= 0.8 ? 'pass' : m >= 0.4 ? 'warn' : 'fail'
  return { verdict, lines, meaning: verdict === 'pass' ? 'The face signals keep working with your eyes closed, which is how sessions are done.' : 'The face model loses you with your eyes closed. Tension and flutter would drop out during real sessions.' }
}

function median(xs: number[]) { return quantile(xs, 0.5) }
