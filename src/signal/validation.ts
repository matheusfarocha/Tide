export const COUNT_TARGET = 9;

export interface CountCycle {
  /** Inhales TIDE saw between the previous tap (or start) and this tap. */
  observed: number;
  /** observed - target */
  error: number;
}

/**
 * Breath-counting focus test: the user silently counts breaths and taps on every `target`-th.
 * Each tap closes a cycle; TIDE checks how many inhales it actually saw in that cycle.
 */
export function scoreBreathCounting(
  startT: number,
  tapTimes: number[],
  inhaleTimes: number[],
  target = COUNT_TARGET,
): { cycles: CountCycle[]; accuracy: number | null } {
  const cycles: CountCycle[] = [];
  let from = startT;
  for (const tap of tapTimes) {
    const observed = inhaleTimes.filter((t) => t > from && t <= tap).length;
    cycles.push({ observed, error: observed - target });
    from = tap;
  }
  // Counting 9 vs the camera seeing 8 or 10 is within normal slack on both sides.
  const accuracy = cycles.length ? cycles.filter((c) => Math.abs(c.error) <= 1).length / cycles.length : null;
  return { cycles, accuracy };
}

export interface TapLabelResult {
  tapCount: number;
  detectedCount: number;
  matched: number;
  /** |detected - taps| / taps */
  countErrorFrac: number | null;
  /** Mean |tap time - nearest matched detection|, seconds. */
  meanOffsetSec: number | null;
}

/** Tap-labelled recording: a second person taps on every inhale; compare with TIDE's detected inhales. */
export function scoreTapLabels(tapTimes: number[], inhaleTimes: number[], tolerance = 1.2): TapLabelResult {
  const used = new Set<number>();
  const offsets: number[] = [];
  for (const tap of tapTimes) {
    let best = -1;
    let bestD = tolerance;
    inhaleTimes.forEach((t, i) => {
      const d = Math.abs(t - tap);
      if (!used.has(i) && d <= bestD) {
        best = i;
        bestD = d;
      }
    });
    if (best >= 0) {
      used.add(best);
      offsets.push(bestD);
    }
  }
  return {
    tapCount: tapTimes.length,
    detectedCount: inhaleTimes.length,
    matched: offsets.length,
    countErrorFrac: tapTimes.length ? Math.abs(inhaleTimes.length - tapTimes.length) / tapTimes.length : null,
    meanOffsetSec: offsets.length ? offsets.reduce((a, b) => a + b, 0) / offsets.length : null,
  };
}
