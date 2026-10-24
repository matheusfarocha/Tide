import { BreathAnalyzer } from './breath';
import { mean } from './dsp';
import { FaceTracker } from './face';
import { classify, explain, StateSmoother, THRESHOLDS, trustedRate, type Baseline } from './state';
import type { Frame, SignalReading } from './types';

const DEFAULT_MOTION = 0.03;
/** Seconds over which landmark displacement is measured for the motion score. */
const MOTION_LAG = 0.33;
/** Seconds of frames over which chest usability is judged. */
const CHEST_WINDOW = 10;
/** Use the chest once at least this share of recent frames produced a chest sample, and leave below the lower share. */
const CHEST_ENTER = 0.8;
const CHEST_LEAVE = 0.5;
/** A gap in chest samples longer than this restarts the chest analyzer. */
const CHEST_GAP_RESET = 3;

function median(x: number[]): number {
  if (!x.length) return 0;
  const s = [...x].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * Turns raw per-frame landmarks and blendshapes into one SignalReading per second.
 * Usage: engine.pushFrame(frame) on every frame; engine.tick() once per second.
 */
export class SignalEngine {
  private breath = new BreathAnalyzer(); // from the shoulder landmarks, always fed
  private chestBreath = new BreathAnalyzer(); // from chest pixel motion, fed when the chest patch is usable
  private face = new FaceTracker();
  private smoother = new StateSmoother(3);
  private hist: { t: number; pts: number[] }[] = [];
  private speeds: { t: number; v: number }[] = [];
  private last: { t: number; width: number; headY: number } | null = null;
  private startT: number | null = null;
  private lastT = 0;
  private baseline: Baseline | null = null;
  private chestEnabled = false;
  private useChestNow = false;
  private frameTimes: number[] = [];
  private chestTimes: number[] = [];
  private baseSamples: { rate: number | null; reg: number | null; motion: number; headY: number; width: number; tension: number | null }[] = [];

  constructor(private baselineSec = 60) {}

  reset(): void {
    this.breath.reset();
    this.chestBreath.reset();
    this.frameTimes = [];
    this.chestTimes = [];
    this.useChestNow = false;
    this.face.reset();
    this.smoother.reset();
    this.hist = [];
    this.speeds = [];
    this.last = null;
    this.startT = null;
    this.baseline = null;
    this.baseSamples = [];
  }

  /**
   * Allow the chest pixel signal (see pushBreathSample) to be the main breath signal. The shoulder
   * landmarks keep running as a backup: the engine uses the chest while it has usable data and falls
   * back to the shoulders when the patch goes plain or is lost.
   */
  setChestEnabled(on: boolean): void {
    this.chestEnabled = on;
  }

  /** Which breath signal the latest reading came from. */
  breathSource(): 'chest' | 'landmarks' {
    return this.useChestNow ? 'chest' : 'landmarks';
  }

  /** One sample of chest pixel motion (same clock as frames). Gaps mean the patch had no usable texture. */
  pushBreathSample(t: number, value: number): void {
    const lastT = this.chestTimes[this.chestTimes.length - 1];
    // After a long gap the old chest data no longer lines up with the new: start that analyzer afresh.
    if (lastT !== undefined && t - lastT > CHEST_GAP_RESET) this.chestBreath.reset();
    this.chestBreath.push(t, value);
    this.chestTimes.push(t);
  }

  /** Share of recent frames (last ~10 s) in which a chest sample was produced. */
  private chestUsable(t: number): number {
    const cut = t - CHEST_WINDOW;
    while (this.frameTimes.length && this.frameTimes[0] < cut) this.frameTimes.shift();
    while (this.chestTimes.length && this.chestTimes[0] < cut) this.chestTimes.shift();
    return this.frameTimes.length < 15 ? 0 : this.chestTimes.length / this.frameTimes.length;
  }

  pushFrame(f: Frame): void {
    if (this.startT === null) this.startT = f.t;
    this.lastT = f.t;
    const midY = (f.shoulderL.y + f.shoulderR.y) / 2;
    const width = Math.hypot(f.shoulderL.x - f.shoulderR.x, f.shoulderL.y - f.shoulderR.y);
    if (width < 1e-3) return;

    this.breath.push(f.t, midY / width);
    this.frameTimes.push(f.t);
    this.last = { t: f.t, width, headY: (f.nose.y - midY) / width };

    // Speed of nose and shoulders' x (shoulder y carries breathing, so it is excluded).
    // Measured as displacement over MOTION_LAG seconds, not frame to frame: per-frame
    // differences turn landmark jitter into a large fake speed.
    const pts = [f.nose.x, f.nose.y, f.shoulderL.x, f.shoulderR.x];
    this.hist.push({ t: f.t, pts });
    while (this.hist.length && this.hist[0].t < f.t - 2 * MOTION_LAG) this.hist.shift();
    const ref = this.hist.find((h) => h.t >= f.t - MOTION_LAG);
    if (ref && f.t - ref.t > MOTION_LAG * 0.7) {
      const d = pts.map((p, i) => Math.abs(p - ref.pts[i]) / width);
      this.speeds.push({ t: f.t, v: mean(d) / (f.t - ref.t) });
    }
    while (this.speeds.length && this.speeds[0].t < f.t - 5) this.speeds.shift();
  }

  pushBlendshapes(t: number, blendshapes: Record<string, number>): void {
    this.face.push(t, blendshapes);
  }

  /** Call about once per second. Returns null until the first frame arrives. */
  tick(): SignalReading | null {
    if (!this.last || this.startT === null) return null;
    const t = this.lastT;
    // Choose the breath signal. Switch to the chest once it is usable (with hysteresis) and has an
    // estimate of its own; fall back to the shoulders when it is not.
    let br: ReturnType<BreathAnalyzer['read']> | null = null;
    if (this.chestEnabled) {
      const frac = this.chestUsable(t);
      if (this.useChestNow && frac < CHEST_LEAVE) this.useChestNow = false;
      if (!this.useChestNow && frac >= CHEST_ENTER) {
        const c = this.chestBreath.read();
        if (c.rate !== null || c.rateSpectral !== null) { this.useChestNow = true; br = c; }
      }
      if (this.useChestNow && !br) br = this.chestBreath.read();
    } else {
      this.useChestNow = false;
    }
    br = br ?? this.breath.read();
    const recent = this.speeds.filter((s) => s.t >= t - 3).map((s) => s.v);
    const motion = recent.length ? median(recent) : 0;
    const tension = this.face.getTension(t);
    const flutter = this.face.getFlutter(t);
    const faceParts = this.face.getParts(t);

    const inBaseline = t - this.startT < this.baselineSec;
    if (inBaseline) {
      this.baseSamples.push({
        rate: br.confidence > 0.3 ? br.rate : null,
        reg: br.confidence > 0.3 ? br.regularity : null,
        motion,
        headY: this.last.headY,
        width: this.last.width,
        tension,
      });
    } else if (!this.baseline) {
      this.baseline = this.buildBaseline();
    }

    const b = this.baseline;
    const headDrop = b ? this.last.headY - b.headY : 0;
    const lean = b ? this.last.width / b.width : 1;
    const ratio = motion / Math.max(b?.motion ?? DEFAULT_MOTION, THRESHOLDS.motionFloor / 3);
    const stillness = 1 / (1 + ratio / 2);

    // Only feed the smoother once the baseline exists; feeding 'settling' every tick
    // would keep resetting its debounce counter.
    const feats = { rate: trustedRate(br.rate, br.rateSpectral), regularity: br.regularity, motion, headDrop, tension };
    const state = b ? this.smoother.update(classify(feats, b)) : 'settling';
    const why = b ? explain(feats, b) : ['still learning your baseline'];

    return {
      t,
      rate: br.rate,
      rateSpectral: br.rateSpectral,
      regularity: br.regularity,
      confidence: br.confidence,
      depth: br.depth,
      motion,
      stillness,
      headDrop,
      lean,
      tension,
      faceParts,
      breathSource: this.useChestNow ? 'chest' : 'landmarks',
      flutter,
      inhales: br.inhales,
      state,
      why,
      baselineReady: b !== null,
    };
  }

  private buildBaseline(): Baseline {
    const s = this.baseSamples;
    const nums = (k: 'rate' | 'reg' | 'tension') => s.map((x) => x[k]).filter((v): v is number => v !== null);
    return {
      rate: nums('rate').length ? median(nums('rate')) : 12,
      regularity: nums('reg').length ? median(nums('reg')) : 0.7,
      motion: Math.max(median(s.map((x) => x.motion)), THRESHOLDS.motionFloor / 3),
      headY: median(s.map((x) => x.headY)),
      width: median(s.map((x) => x.width)) || 1,
      tension: nums('tension').length ? median(nums('tension')) : 0,
    };
  }
}
