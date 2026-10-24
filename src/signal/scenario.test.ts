import { describe, expect, it } from 'vitest';
import { SignalEngine } from './engine';
import type { MeditationState } from './types';

function rng(seed: number) {
  let s = seed;
  const u = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  // Box-Muller
  return () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u());
}

interface Phase {
  until: number;
  bpm?: number;
  /** extra nose y offset (shoulder widths) */
  nose?: number;
  /** body sway amplitude in image-height units */
  sway?: number;
  /** breathing amplitude noise (irregularity) */
  irregular?: number;
}

/** Simulate a whole session at 30 fps with landmark noise; returns the state at each second. */
function simulate(phases: Phase[], seed = 1): { t: number; state: MeditationState }[] {
  const g = rng(seed);
  const e = new SignalEngine(60);
  const out: { t: number; state: MeditationState }[] = [];
  let phase = 0;
  let breathPhase = 0;
  const end = phases[phases.length - 1].until;
  for (let i = 0; i < end * 30; i++) {
    const t = i / 30;
    while (t >= phases[phase].until) phase++;
    const p = phases[phase];
    const bpm = (p.bpm ?? 12) * (1 + 0.04 * Math.sin(t * 0.13)); // natural rate wander
    breathPhase += (2 * Math.PI * (bpm / 60)) / 30 + (p.irregular ?? 0) * 0.05 * g();
    const breath = 0.004 * (1 + 0.15 * Math.sin(t * 0.07)) * Math.sin(breathPhase);
    const sway = (p.sway ?? 0) * (Math.sin(t * 2.3) + 0.5 * Math.sin(t * 5.1));
    const n = () => 0.0015 * g(); // landmark jitter
    const sy = 0.55 + breath;
    e.pushFrame({
      t,
      nose: { x: 0.667 + sway + n(), y: sy - 0.2 + (p.nose ?? 0) * 0.3 + 0.3 * breath + n() },
      shoulderL: { x: 0.5 + sway + n(), y: sy + n() },
      shoulderR: { x: 0.833 + sway + n(), y: sy + n() },
    });
    if (i % 30 === 29) {
      const r = e.tick();
      if (r) out.push({ t: Math.round(t), state: r.state });
    }
  }
  return out;
}

const frac = (xs: { t: number; state: MeditationState }[], from: number, to: number, s: MeditationState) => {
  const w = xs.filter((x) => x.t >= from && x.t < to);
  return w.filter((x) => x.state === s).length / w.length;
};

describe('simulated sessions', () => {
  it.each([1, 2, 3, 4, 5])('calm sitter rarely flips out of focused (seed %i)', (seed) => {
    const s = simulate([{ until: 240 }], seed);
    expect(frac(s, 0, 60, 'settling')).toBe(1);
    expect(frac(s, 60, 240, 'focused')).toBeGreaterThan(0.9);
  });

  it('detects restless and drifting episodes (fidget, head drop, faster irregular breathing) after a calm start', () => {
    const s = simulate([
      { until: 100 },
      { until: 120, sway: 0.06 }, // fidgeting
      { until: 160 },
      { until: 180, nose: 0.5 }, // head drop
      { until: 220 },
      { until: 250, bpm: 20, irregular: 6 }, // faster, irregular breathing
    ]);
    console.log(
      'restless', frac(s, 105, 120, 'restless').toFixed(2),
      'headDropDrifting', frac(s, 168, 180, 'drifting').toFixed(2),
      'drifting', frac(s, 238, 250, 'drifting').toFixed(2),
      'focused-calm', frac(s, 125, 160, 'focused').toFixed(2),
    );
    expect(frac(s, 105, 120, 'restless')).toBeGreaterThan(0.5);
    expect(frac(s, 168, 180, 'drifting')).toBeGreaterThan(0.5);
    expect(frac(s, 238, 250, 'drifting')).toBeGreaterThan(0.3);
  });
});
