/** A point in image-height units (x already scaled by aspect ratio), so distances are isotropic. */
export interface Pt {
  x: number;
  y: number;
}

/** One video frame's worth of tracked landmarks. */
export interface Frame {
  /** seconds */
  t: number;
  nose: Pt;
  shoulderL: Pt;
  shoulderR: Pt;
}

export type MeditationState = 'settling' | 'focused' | 'drifting' | 'restless';

/** The once-per-second reading Person 2's session runner consumes. */
export interface SignalReading {
  t: number;
  /** Breaths per minute (peak-based), null until enough data. */
  rate: number | null;
  rateSpectral: number | null;
  regularity: number | null;
  /** 0..1 trust in the breath rate. */
  confidence: number;
  /** Breath amplitude proxy, in shoulder widths. */
  depth: number;
  /** Mean landmark speed over ~3 s, shoulder-widths per second. */
  motion: number;
  /** 0..1, 1 = very still (motion relative to this session's baseline). */
  stillness: number;
  /** Nose lowering relative to baseline, in shoulder widths (positive = head dropping). */
  headDrop: number;
  /** Shoulder width relative to baseline (1 = same distance from camera; leaning in/out changes it). */
  lean: number;
  /** 0..1 facial tension (brow, mouth, squint); null if no face data. */
  tension: number | null;
  /** Each tension group (brow, mouth, squint), for diagnostics; null if no face data. */
  faceParts: { brow: number; mouth: number; squint: number } | null;
  /** 0..1 eyelid flutter over ~5 s; null if no face data. */
  flutter: number | null;
  /** Detected inhale times (s) still in the analysis buffer. */
  inhales: number[];
  state: MeditationState;
  /** Which breath signal produced the rate: the chest pixels, or the shoulder landmarks (backup). */
  breathSource: 'chest' | 'landmarks';
  /** Plain-language reasons behind the current state, for diagnostics. */
  why: string[];
  baselineReady: boolean;
}
