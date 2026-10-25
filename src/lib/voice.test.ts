import { describe, expect, it } from 'vitest'
import { toPcm16 } from './voice'
import { feedbackLine, LINES, voiceLines } from './voiceLines'
import type { Plan } from './types'

describe('toPcm16', () => {
  it('downsamples 48 kHz to 16 kHz', () => {
    expect(toPcm16(new Float32Array(4800), 48000).length).toBe(1600)
  })
  it('clips and scales to 16-bit', () => {
    const out = toPcm16(new Float32Array([2, 2, 2, -2, -2, -2]), 48000)
    expect([...out]).toEqual([0x7fff, -0x8000])
  })
})

describe('spoken feedback', () => {
  it('says what happened, eyes closed', () => {
    expect(feedbackLine({ answer: 'focused', match: true })).toBe(LINES.caught)
    expect(feedbackLine({ answer: 'drifting', match: false })).toBe(LINES.miss)
    expect(feedbackLine({ answer: 'none', match: false })).toBe(LINES.quiet)
    expect(feedbackLine({ answer: 'unsure', match: false })).toBe(LINES.unclear)
  })
  it('prepares every line a plan can say', () => {
    const plan = { intro: 'Hello.', cues: [{ atSec: 90, text: 'Count your exhales.' }] } as Plan
    const lines = voiceLines(plan)
    expect(lines).toContain('Hello.')
    expect(lines).toContain('Count your exhales.')
    expect(lines).toContain(LINES.question)
    expect(lines).toContain(LINES.closing)
  })
})
