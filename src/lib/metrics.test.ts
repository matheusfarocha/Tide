import { describe, expect, it } from 'vitest'
import { scorable, selfAwareness } from './metrics'
import { feedbackLine, LINES } from './voiceLines'
import type { FeelCheck } from './types'

const fc = (o: Partial<FeelCheck>): FeelCheck => ({ t: 0, answer: 'focused', sensorState: 'focused', match: true, ...o })

describe('self-awareness', () => {
  it('ignores checks the server could not score', () => {
    const checks = [fc({ match: false, sensorState: 'settling', unscored: true }), fc({}), fc({})]
    expect(selfAwareness(checks)).toBe(100)
    expect(checks.filter(scorable)).toHaveLength(2)
  })
  it('counts real misses', () => {
    expect(selfAwareness([fc({}), fc({ answer: 'drifting', match: false })])).toBe(50)
  })
  it('never praises or corrects an unscored answer out loud', () => {
    expect(feedbackLine(fc({ match: false, unscored: true }))).toBe(LINES.noted)
  })
})
