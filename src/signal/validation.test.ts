import { describe, expect, it } from 'vitest';
import { scoreBreathCounting, scoreTapLabels } from './validation';

describe('scoreBreathCounting', () => {
  const inhales = Array.from({ length: 30 }, (_, i) => 5 + i * 5); // every 5 s
  it('perfect counting gives accuracy 1', () => {
    // 9 inhales per cycle: taps right after the 9th and 18th
    const r = scoreBreathCounting(0, [5 + 8 * 5 + 1, 5 + 17 * 5 + 1], inhales);
    expect(r.cycles.map((c) => c.observed)).toEqual([9, 9]);
    expect(r.accuracy).toBe(1);
  });
  it('a lost count shows up as an error', () => {
    const r = scoreBreathCounting(0, [5 + 5 * 5 + 1], inhales); // tapped after 6, not 9
    expect(r.cycles[0].error).toBe(-3);
    expect(r.accuracy).toBe(0);
  });
  it('no taps gives null accuracy', () => expect(scoreBreathCounting(0, [], inhales).accuracy).toBeNull());
});

describe('scoreTapLabels', () => {
  it('matches taps to detections one-to-one', () => {
    const taps = [5.2, 10.1, 15.3, 20.0];
    const inhales = [5, 10, 15, 20.2];
    const r = scoreTapLabels(taps, inhales);
    expect(r.matched).toBe(4);
    expect(r.countErrorFrac).toBe(0);
    expect(r.meanOffsetSec!).toBeLessThan(0.3);
  });
  it('counts a missed detection as count error', () => {
    const r = scoreTapLabels([5, 10, 15, 20], [5, 10, 20]);
    expect(r.matched).toBe(3);
    expect(r.countErrorFrac).toBe(0.25);
  });
});
