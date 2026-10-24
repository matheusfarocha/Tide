import { describe, expect, it } from 'vitest';
import { BreathAnalyzer } from './breath';

/** Deterministic PRNG so tests are repeatable. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296 - 0.5;
  };
}

interface Opts {
  bpm: number;
  seconds?: number;
  fps?: number;
  noise?: number;
  drift?: number;
  dropRate?: number;
  jitter?: number;
}

function run(o: Opts) {
  const { bpm, seconds = 60, fps = 30, noise = 0, drift = 0, dropRate = 0, jitter = 0 } = o;
  const rand = rng(42);
  const a = new BreathAnalyzer();
  for (let i = 0; i < seconds * fps; i++) {
    if (rand() + 0.5 < dropRate) continue;
    const t = i / fps + jitter * rand() / fps;
    const v =
      3 * Math.sin(2 * Math.PI * (bpm / 60) * t) + drift * t + noise * rand() * 2 + 0.2 * Math.sin(t * 0.3);
    a.push(t, v);
  }
  return a.read();
}

describe('BreathAnalyzer', () => {
  it.each([6, 10, 15, 22, 30])('recovers %i bpm from a clean signal', (bpm) => {
    const r = run({ bpm });
    expect(r.rate).not.toBeNull();
    expect(Math.abs(r.rate! - bpm)).toBeLessThan(1);
    expect(Math.abs(r.rateSpectral! - bpm)).toBeLessThan(1.5);
    expect(r.regularity!).toBeGreaterThan(0.8);
    expect(r.confidence).toBeGreaterThan(0.5);
  });

  it('tolerates noise, linear drift, dropped and jittered frames at 6 bpm', () => {
    const r = run({ bpm: 6, noise: 1.2, drift: 0.05, dropRate: 0.3, jitter: 0.8 });
    expect(Math.abs(r.rate! - 6)).toBeLessThan(1.5);
  });

  it('works at a low camera frame rate', () => {
    const r = run({ bpm: 15, fps: 12, noise: 0.5 });
    expect(Math.abs(r.rate! - 15)).toBeLessThan(1.5);
  });

  it('returns null until warmed up', () => {
    const r = run({ bpm: 15, seconds: 5 });
    expect(r.rate).toBeNull();
    expect(r.confidence).toBe(0);
  });

  it('reports low confidence on pure noise', () => {
    const rand = rng(7);
    const a = new BreathAnalyzer();
    for (let i = 0; i < 60 * 30; i++) a.push(i / 30, rand() * 4);
    expect(a.read().confidence).toBeLessThan(0.3);
  });

  it('tracks a change in breathing rate', () => {
    const a = new BreathAnalyzer();
    for (let i = 0; i < 90 * 30; i++) {
      const t = i / 30;
      const bpm = t < 45 ? 8 : 18;
      // integrate phase so frequency changes are continuous
      a.push(t, 3 * Math.sin(2 * Math.PI * (t < 45 ? (bpm / 60) * t : (8 / 60) * 45 + (bpm / 60) * (t - 45))));
    }
    expect(Math.abs(a.read().rate! - 18)).toBeLessThan(2);
  });

  it('is not fooled by a double-bump waveform and jitter (counts breaths, not bumps)', () => {
    const rand = rng(3);
    const a = new BreathAnalyzer();
    for (let i = 0; i < 60 * 30; i++) {
      const t = i / 30;
      const f = 10 / 60;
      const v = 3 * Math.sin(2 * Math.PI * f * t) + 1.6 * Math.sin(2 * Math.PI * 2 * f * t + 1) + 1.5 * rand();
      a.push(t, v);
    }
    const r = a.read();
    expect(Math.abs(r.rate! - 10)).toBeLessThan(1.5);
    expect(r.confidence).toBeGreaterThan(0.4);
  });

  it.each([6, 9])('reads a paced %i breaths/min from only 30 s of data, away from the scan edge', (bpm) => {
    const a = new BreathAnalyzer()
    for (let i = 0; i < 30 * 30; i++) {
      const t = i / 30
      a.push(t, 0.004 * Math.sin(2 * Math.PI * (bpm / 60) * t))
    }
    const r = a.read()
    const best = r.rateSpectral ?? r.rate
    expect(best).not.toBeNull()
    expect(Math.abs(best! - bpm)).toBeLessThan(1.2)
  })

  it('does not report a value pinned to the edge of the scan for a signal with no breath', () => {
    // a slow drift only: energy slopes toward the lowest frequencies, which used to read as 6.0
    const a = new BreathAnalyzer()
    for (let i = 0; i < 40 * 30; i++) {
      const t = i / 30
      a.push(t, 0.02 * Math.sin(2 * Math.PI * 0.03 * t) + 0.0005 * Math.sin(t * 7.3))
    }
    const r = a.read()
    const edge = (v: number | null) => v !== null && (Math.abs(v - 3.6) < 0.7 || Math.abs(v - 40) < 0.7)
    expect(edge(r.rateSpectral)).toBe(false)
  })
});

