import { mean, std } from './dsp';

/**
 * MediaPipe blendshape groups that indicate facial tension. A brow scrunch or lip press moves only one
 * or two of these, so tension is the strongest group, not an average that dilutes it.
 */
const GROUPS = {
  brow: [['browDownLeft', 'browDownRight']],
  mouth: [['mouthPressLeft', 'mouthPressRight'], ['mouthRollLower', 'mouthRollUpper']],
  squint: [['eyeSquintLeft', 'eyeSquintRight']],
} as const;
export type FaceParts = { brow: number; mouth: number; squint: number };
const BLINK_KEYS = ['eyeBlinkLeft', 'eyeBlinkRight'];

/** Strongest pair in a group: each pair is left/right or upper/lower of one movement, so it is averaged; the pairs compete. */
function groupValue(b: Record<string, number>, pairs: readonly (readonly string[])[]): number | null {
  const v = pairs.map((p) => avg(b, [...p])).filter((x): x is number => x !== null);
  return v.length ? Math.max(...v) : null;
}

function avg(b: Record<string, number>, keys: string[]): number | null {
  const v = keys.filter((k) => k in b).map((k) => b[k]);
  return v.length ? mean(v) : null;
}

/** Tracks facial tension and eyelid flutter from blendshape scores. */
export class FaceTracker {
  private tension: { t: number; v: number }[] = [];
  private parts: { t: number; p: FaceParts }[] = [];
  private blink: { t: number; v: number }[] = [];

  push(t: number, blendshapes: Record<string, number>): void {
    const brow = groupValue(blendshapes, GROUPS.brow);
    const mouth = groupValue(blendshapes, GROUPS.mouth);
    const squint = groupValue(blendshapes, GROUPS.squint);
    const present = [brow, mouth, squint].filter((x): x is number => x !== null);
    const bl = avg(blendshapes, BLINK_KEYS);
    if (present.length) {
      this.tension.push({ t, v: Math.max(...present) });
      this.parts.push({ t, p: { brow: brow ?? 0, mouth: mouth ?? 0, squint: squint ?? 0 } });
    }
    if (bl !== null) this.blink.push({ t, v: bl });
    const cut = t - 6;
    while (this.tension.length && this.tension[0].t < cut) this.tension.shift();
    while (this.parts.length && this.parts[0].t < cut) this.parts.shift();
    while (this.blink.length && this.blink[0].t < cut) this.blink.shift();
  }

  reset(): void {
    this.tension = [];
    this.parts = [];
    this.blink = [];
  }

  /** Mean tension over the last ~3 s, or null if no recent face data. */
  getTension(now: number): number | null {
    const v = this.tension.filter((s) => s.t >= now - 3).map((s) => s.v);
    return v.length >= 3 ? mean(v) : null;
  }

  /** Mean of each tension group over the last ~3 s, for diagnostics. */
  getParts(now: number): FaceParts | null {
    const v = this.parts.filter((s) => s.t >= now - 3);
    if (v.length < 3) return null;
    return { brow: mean(v.map((x) => x.p.brow)), mouth: mean(v.map((x) => x.p.mouth)), squint: mean(v.map((x) => x.p.squint)) };
  }

  /** Eyelid flutter: variability of the (closed-eye) blink score over ~5 s, scaled 0..1. */
  getFlutter(now: number): number | null {
    const v = this.blink.filter((s) => s.t >= now - 5).map((s) => s.v);
    return v.length >= 8 ? Math.min(1, std(v) / 0.1) : null;
  }
}
