import { describe, expect, it } from 'vitest';
import { classify, trustedRate, type Baseline } from './state';

const base: Baseline = { rate: 6, regularity: 0.8, motion: 0.01, headY: 0, width: 1, tension: 0.2 };

describe('trustedRate', () => {
  it('passes the peak rate when it agrees with the spectral rate', () => {
    expect(trustedRate(6.4, 6.1)).toBe(6.4);
    expect(trustedRate(14, 12)).toBe(14); // within 20% at higher rates
  });

  it('drops the rate when the two disagree, or one is missing', () => {
    expect(trustedRate(11, 6.2)).toBeNull();
    expect(trustedRate(null, 6)).toBeNull();
    expect(trustedRate(6, null)).toBeNull();
  });

  it('stops a glitchy peak rate from tipping the state into drifting', () => {
    // Uneven breathing is one sign; a glitchy peak rate (11 vs spectral 6.2) must not be the second.
    const f = { regularity: 0.4, motion: 0.01, headDrop: 0, tension: 0.2 };
    expect(classify({ ...f, rate: 11 }, base)).toBe('drifting');
    expect(classify({ ...f, rate: trustedRate(11, 6.2) }, base)).toBe('focused');
  });
});
