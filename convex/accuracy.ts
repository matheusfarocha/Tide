/**
 * The README's accuracy table, computed from saved checks (src/lib/accuracy.ts):
 *   npx convex run accuracy:summary
 * Paced: the 6 breaths/min circle is the ground truth. Tap-labelled: a second person tapped
 * every inhale; detected inhales are matched to taps with shared/scoring matchBreaths.
 * Only real camera readings are saved (simulated readings never are). Checks written by our
 * test scripts (smoke-test, signal-integration-test…) are excluded: they are scripted, not measured.
 */

import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { matchBreaths } from "../shared/scoring";

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sd = (xs: number[]) => {
  const m = mean(xs);
  return m === null || xs.length < 2 ? null : Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};
const r2 = (x: number | null) => (x === null ? null : Math.round(x * 100) / 100);
const TEST_USER = /test|smoke|debug|range-check/i;

export const summary = internalQuery({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const all = [];
    let excluded = 0;
    for (const c of await ctx.db.query("calibrations").take(1000)) {
      const session = await ctx.db.get("sessions", c.sessionId);
      const user = session && (await ctx.db.get("users", session.userId));
      if (!user || TEST_USER.test(user.name)) excluded++;
      else all.push(c);
    }
    const paced = all.filter((c) => c.kind === "paced" && c.measuredRate !== null && c.trueRate !== null);
    const taps = all.filter((c) => c.kind === "tapLabel" && c.tapTimes.length >= 3);

    const readings = paced.map((c) => c.measuredRate!);
    const errors = paced.map((c) => Math.abs(c.measuredRate! - c.trueRate!));
    const matches = taps.map((c) => matchBreaths(c.tapTimes, c.detectedTimes));
    const tp = matches.reduce((a, m) => a + m.tp, 0);
    const detected = taps.reduce((a, c) => a + c.detectedTimes.length, 0);
    const tapped = taps.reduce((a, c) => a + c.tapTimes.length, 0);
    const rateErrors = taps
      .filter((c) => c.trueRate !== null && c.measuredRate !== null)
      .map((c) => Math.abs(c.measuredRate! - c.trueRate!));
    const offsets = matches.map((m) => m.meanOffsetMs).filter((x): x is number => x !== null);

    return {
      excludedTestChecks: excluded,
      paced: {
        runs: paced.length,
        trueRate: 6,
        meanReading: r2(mean(readings)),
        sdReading: r2(sd(readings)),
        meanAbsError: r2(mean(errors)),
        within1bpm: paced.length ? `${errors.filter((e) => e <= 1).length}/${paced.length}` : null,
      },
      tapLabel: {
        recordings: taps.length,
        tappedInhales: tapped,
        detectedInhales: detected,
        precision: r2(detected ? tp / detected : null),
        recall: r2(tapped ? tp / tapped : null),
        rateMeanAbsErrorBpm: r2(mean(rateErrors)),
        meanTimingOffsetSec: r2(mean(offsets) === null ? null : mean(offsets)! / 1000),
      },
    };
  },
});
