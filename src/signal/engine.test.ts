import { describe, expect, it } from 'vitest';
import { SignalEngine } from './engine';
import { classify, explain, StateSmoother, type Baseline } from './state';

const base: Baseline = { rate: 12, regularity: 0.8, motion: 0.01, headY: -0.6, width: 0.3, tension: 0.1 };
const calm = { rate: 12, regularity: 0.8, motion: 0.01, headDrop: 0, tension: 0.1 };

describe('classify', () => {
  it('calm = focused', () => expect(classify(calm, base)).toBe('focused'));
  it('head drop = drifting', () => expect(classify({ ...calm, headDrop: 0.2 }, base)).toBe('drifting'));
  it('big motion = restless', () => expect(classify({ ...calm, motion: 0.2 }, base)).toBe('restless'));
  it('rate shift + irregular = drifting', () =>
    expect(classify({ ...calm, rate: 18, regularity: 0.4 }, base)).toBe('drifting'));
  it('one weak signal alone is still focused', () =>
    expect(classify({ ...calm, tension: 0.4 }, base)).toBe('focused'));
});

describe('explain', () => {
  it('names both signs when two votes make drifting', () => {
    const why = explain({ ...calm, rate: 24, tension: 0.4 }, base)
    expect(classify({ ...calm, rate: 24, tension: 0.4 }, base)).toBe('drifting')
    expect(why.join(' ')).toMatch(/breath rate/)
    expect(why.join(' ')).toMatch(/tension/)
  })
  it('says when only one sign is present', () => expect(explain({ ...calm, rate: 24 }, base)[0]).toMatch(/only one sign/))
  it('says there is nothing when calm', () => expect(explain(calm, base)).toEqual(['no signs of drifting']))
})

describe('StateSmoother', () => {
  it('needs 3 consecutive ticks to switch and ignores blips', () => {
    const s = new StateSmoother(3);
    s.update('focused');
    s.update('focused');
    s.update('focused');
    expect(s.state).toBe('focused');
    s.update('drifting');
    s.update('focused');
    s.update('drifting');
    s.update('drifting');
    expect(s.state).toBe('focused');
    s.update('drifting');
    expect(s.state).toBe('drifting');
  });
});

function feed(e: SignalEngine, from: number, to: number, o: { nose?: number; jitter?: number } = {}) {
  let last = null;
  for (let i = from * 30; i < to * 30; i++) {
    const t = i / 30;
    const breathY = 0.5 + 0.004 * Math.sin(2 * Math.PI * 0.2 * t);
    const j = o.jitter ? o.jitter * Math.sin(t * 17) : 0;
    e.pushFrame({
      t,
      nose: { x: 0.5 + j, y: breathY - 0.18 + (o.nose ?? 0) },
      shoulderL: { x: 0.35 + j, y: breathY },
      shoulderR: { x: 0.65 + j, y: breathY },
    });
    if (i % 30 === 0) last = e.tick();
  }
  return last;
}

describe('SignalEngine', () => {
  it('settles during baseline, then reports focused for a calm sitter', () => {
    const e = new SignalEngine(20);
    expect(feed(e, 0, 10)!.state).toBe('settling');
    const r = feed(e, 10, 50)!;
    expect(r.baselineReady).toBe(true);
    expect(r.state).toBe('focused');
    expect(r.rate!).toBeGreaterThan(10);
    expect(r.rate!).toBeLessThan(14);
    expect(r.stillness).toBeGreaterThan(0.5);
  });

  it('flags drifting when the head drops after baseline', () => {
    const e = new SignalEngine(20);
    feed(e, 0, 30);
    const r = feed(e, 30, 40, { nose: 0.1 })!;
    expect(r.headDrop).toBeGreaterThan(0.2);
    expect(r.state).toBe('drifting');
  });

  it('flags restless under heavy movement', () => {
    const e = new SignalEngine(20);
    feed(e, 0, 30);
    const r = feed(e, 30, 42, { jitter: 0.05 })!;
    expect(r.motion).toBeGreaterThan(0.1);
    expect(r.state).toBe('restless');
  });
});

describe('breath source: chest with shoulder fallback', () => {
  /**
   * The shoulders carry a 12/min breath and the chest carries an 18/min breath, so the reported rate
   * shows which signal the engine is using. chestOn(t) says whether the chest patch is usable at time t.
   */
  function run(seconds: number, chestOn: (t: number) => boolean, chestEnabled = true) {
    const e = new SignalEngine(20);
    e.setChestEnabled(chestEnabled);
    let last = null;
    for (let i = 0; i < seconds * 30; i++) {
      const t = i / 30;
      const y = 0.5 + 0.004 * Math.sin(2 * Math.PI * (12 / 60) * t);
      e.pushFrame({ t, nose: { x: 0.5, y: y - 0.18 }, shoulderL: { x: 0.35, y }, shoulderR: { x: 0.65, y } });
      if (chestOn(t)) e.pushBreathSample(t, 0.003 * Math.sin(2 * Math.PI * (18 / 60) * t));
      if (i % 30 === 29) last = e.tick();
    }
    return last!;
  }

  it('uses the chest when it is usable all the time', () => {
    const r = run(60, () => true);
    expect(r.breathSource).toBe('chest');
    expect(Math.abs(r.rate! - 18)).toBeLessThan(1.5);
  });

  it('uses the shoulders when the chest is never usable', () => {
    const r = run(60, () => false);
    expect(r.breathSource).toBe('landmarks');
    expect(Math.abs(r.rate! - 12)).toBeLessThan(1.5);
  });

  it('uses the shoulders when chest mode is off, even if chest samples exist', () => {
    const r = run(60, () => true, false);
    expect(r.breathSource).toBe('landmarks');
    expect(Math.abs(r.rate! - 12)).toBeLessThan(1.5);
  });

  it('falls back to the shoulders when the chest is lost, and returns to it on recovery', () => {
    const lost = run(70, (t) => t < 40);
    expect(lost.breathSource).toBe('landmarks');
    expect(Math.abs(lost.rate! - 12)).toBeLessThan(1.5);
    const back = run(120, (t) => t < 40 || t >= 70);
    expect(back.breathSource).toBe('chest');
    expect(Math.abs(back.rate! - 18)).toBeLessThan(2);
  });

  it('does not flap on a brief chest dropout', () => {
    // 2 s of missing chest samples inside a long good run stays on the chest
    const r = run(60, (t) => !(t > 40 && t < 42));
    expect(r.breathSource).toBe('chest');
  });
});
