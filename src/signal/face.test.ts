import { describe, expect, it } from 'vitest'
import { FaceTracker } from './face'

const calm = { browDownLeft: 0.05, browDownRight: 0.05, mouthPressLeft: 0.05, mouthPressRight: 0.05, mouthRollLower: 0.02, mouthRollUpper: 0.02, eyeSquintLeft: 0.05, eyeSquintRight: 0.05, eyeBlinkLeft: 0.1, eyeBlinkRight: 0.1 }

function run(shape: Record<string, number>, seconds = 4) {
  const f = new FaceTracker()
  for (let i = 0; i < seconds * 10; i++) f.push(i / 10, shape)
  return { tension: f.getTension(seconds - 0.1), parts: f.getParts(seconds - 0.1) }
}

describe('FaceTracker tension', () => {
  it('a brow scrunch alone registers clearly (not diluted by other scores)', () => {
    const base = run(calm).tension!
    const frown = run({ ...calm, browDownLeft: 0.6, browDownRight: 0.6 })
    expect(frown.tension! - base).toBeGreaterThan(0.4)
    expect(frown.parts!.brow).toBeGreaterThan(0.5)
  })
  it('a lip press alone registers too', () => {
    const base = run(calm).tension!
    expect(run({ ...calm, mouthPressLeft: 0.5, mouthPressRight: 0.5 }).tension! - base).toBeGreaterThan(0.35)
  })
  it('a calm face stays low', () => expect(run(calm).tension!).toBeLessThan(0.1))
  it('returns null with no face data', () => expect(new FaceTracker().getTension(1)).toBeNull())
})
