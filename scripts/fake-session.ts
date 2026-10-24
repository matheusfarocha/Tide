// Prints a fake session summary to sanity-check the fixtures: npx tsx scripts/fake-session.ts
import { fakeReadings } from "../shared/fixtures";
import { matchBreaths, rateFromBreaths } from "../shared/scoring";

const rs = fakeReadings({ seed: 7 });
const cal = rs.filter((r) => r.phase === "calibration").flatMap((r) => r.breaths);
console.log("readings:", rs.length, "t range:", rs[0].t, "→", rs.at(-1)!.t);
console.log("paced-check rate (want ≈6):", rateFromBreaths(cal)?.toFixed(2));
for (const at of [30, 100, 160, 180, 250]) {
  const r = rs.find((x) => x.t === at * 1000)!;
  console.log(`t=${at}s`, r.state, "rate", r.breathRate, "reg", r.regularity, "still", r.stillness);
}
const all = rs.flatMap((r) => r.breaths);
console.log("self-match:", matchBreaths(all, all));
