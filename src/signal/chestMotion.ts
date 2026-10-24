/**
 * Vertical motion of the chest from image pixels (single-patch Lucas-Kanade).
 *
 * Pose landmarks wobble by several pixels, but the movement of a patch of image can be measured to a
 * small fraction of a pixel. Each call compares the new grayscale crop with the previous one and
 * returns how far the content moved down, in crop pixels. Summing these gives a displacement
 * waveform that follows the breath.
 */
export interface ChestStep {
  /** Vertical motion since the previous frame, crop pixels (positive = content moved down). */
  dy: number
  /** Mean squared vertical gradient: how much usable texture the patch has. */
  texture: number
}

export const MIN_TEXTURE = 4
const MAX_STEP = 2

function boxBlur(src: Float32Array, w: number, h: number): Float32Array {
  const tmp = new Float32Array(w * h)
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = src[y * w + Math.max(0, x - 1)], c = src[y * w + x], r = src[y * w + Math.min(w - 1, x + 1)]
      tmp[y * w + x] = (l + c + r) / 3
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out[y * w + x] = (tmp[Math.max(0, y - 1) * w + x] + tmp[y * w + x] + tmp[Math.min(h - 1, y + 1) * w + x]) / 3
    }
  }
  return out
}

export class ChestMotion {
  private prev: Float32Array | null = null
  private w = 0
  private h = 0

  /** Forget the previous frame (call when the crop window moved, so the next frame starts a new chain). */
  breakChain(): void {
    this.prev = null
  }

  /** Add the next grayscale crop (row-major, values 0..255). Returns null for the first frame of a chain or a textureless patch. */
  push(gray: ArrayLike<number>, w: number, h: number): ChestStep | null {
    const cur = boxBlur(Float32Array.from(gray as ArrayLike<number>), w, h)
    const prev = this.prev
    const sameShape = prev !== null && this.w === w && this.h === h
    this.prev = cur
    this.w = w
    this.h = h
    if (!prev || !sameShape || h < 5 || w < 5) return null

    // Remove a global brightness change (auto exposure) so it isn't mistaken for motion.
    let meanDiff = 0
    for (let i = 0; i < cur.length; i++) meanDiff += cur[i] - prev[i]
    meanDiff /= cur.length

    let num = 0
    let den = 0
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x
        const iy = (cur[i + w] - cur[i - w] + prev[i + w] - prev[i - w]) / 4
        const it = cur[i] - prev[i] - meanDiff
        num -= it * iy
        den += iy * iy
      }
    }
    const n = (w - 2) * (h - 2)
    const texture = den / n
    if (texture < MIN_TEXTURE) return null
    const dy = num / den
    if (!Number.isFinite(dy) || Math.abs(dy) > MAX_STEP) return null
    return { dy, texture }
  }
}

/**
 * Running total of chest motion in fixed units (image heights).
 *
 * Each step is converted with the crop scale in force *when it was measured*, then added. Keeping the
 * total in crop pixels and converting at the end rescales the whole history whenever the crop window
 * changes size, which showed up as giant spikes (3.8 image heights) in a real capture.
 */
export class ChestTotal {
  private total = 0

  /** Add one step (crop pixels) using the scale (image heights per crop pixel) of the crop it came from. */
  add(dyCropPx: number, imageHeightsPerCropPx: number): number {
    this.total += dyCropPx * imageHeightsPerCropPx
    return this.total
  }

  get value(): number {
    return this.total
  }
}
