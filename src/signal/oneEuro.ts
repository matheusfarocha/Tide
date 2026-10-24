/**
 * One Euro filter (Casiez et al. 2012): a low-pass filter whose cutoff rises with signal speed.
 * Heavy smoothing while still (kills landmark jitter), light smoothing while moving (no lag on fidgets).
 */
export interface OneEuroConfig {
  /** Cutoff (Hz) at rest. Must stay above the fastest breathing frequency (~0.7 Hz) to keep the breath intact. */
  minCutoff: number
  /** How fast the cutoff grows with speed (Hz per unit/second). */
  beta: number
  /** Cutoff (Hz) for the speed estimate. */
  dCutoff: number
}

export const DEFAULT_ONE_EURO: OneEuroConfig = { minCutoff: 1.2, beta: 20, dCutoff: 1 }

const alpha = (cutoff: number, dt: number) => {
  const tau = 1 / (2 * Math.PI * cutoff)
  return 1 / (1 + tau / dt)
}

export class OneEuro {
  private x: number | null = null
  private dx = 0
  private lastT = 0
  constructor(private cfg: OneEuroConfig = DEFAULT_ONE_EURO) {}

  /** Filter one sample taken at time t (seconds). */
  filter(t: number, v: number): number {
    if (this.x === null || t <= this.lastT) {
      this.x = v
      this.dx = 0
      this.lastT = t
      return v
    }
    const dt = t - this.lastT
    this.lastT = t
    const rawDx = (v - this.x) / dt
    this.dx += alpha(this.cfg.dCutoff, dt) * (rawDx - this.dx)
    const cutoff = this.cfg.minCutoff + this.cfg.beta * Math.abs(this.dx)
    this.x += alpha(cutoff, dt) * (v - this.x)
    return this.x
  }

  reset(): void {
    this.x = null
    this.dx = 0
  }
}
