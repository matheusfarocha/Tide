// End-to-end smoke test of the Convex backend, driven like the phone app would.
//   npx tsx scripts/smoke-convex.ts
// Uses the deployment in .env.local. Creates a user named "smoke-test" (safe to delete).
// The coach step uses devCoach:fakeResult, so it runs without CREAO keys.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { fakeReadings } from "../shared/fixtures";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=([^\s#]+)/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => [m[1], m[2]]),
);
const client = new ConvexHttpClient(env.CONVEX_URL);
const site = env.CONVEX_SITE_URL;

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "✔" : "✘"} ${label}${detail === undefined ? "" : `: ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}
const convexRun = (fn: string, args: object) =>
  execFileSync("npx", ["convex", "run", fn, JSON.stringify(args)], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

async function runSession(userId: Id<"users">, kind: "baseline" | "training", seconds: number) {
  const { sessionId, plan } = await client.mutation(api.sessions.start, { userId, kind });
  const readings = fakeReadings({ lengthSec: seconds, seed: Date.now() % 1000 });
  for (let i = 0; i < readings.length; i += 120) {
    await client.mutation(api.sessions.addReadings, { sessionId, readings: readings.slice(i, i + 120) });
  }
  return { sessionId, plan, readings };
}

async function main() {
  console.log(`Deployment: ${env.CONVEX_URL}\n`);
  const userId = await client.mutation(api.users.getOrCreate, { name: "smoke-test" });
  await client.mutation(api.users.setCoachEnabled, { userId, enabled: true });

  // 1. Live path
  const next = await client.query(api.sessions.nextPlan, { userId });
  check("next plan for a brand-new user is the baseline (or a coach plan on reruns)", ["baseline", "coach"].includes(next.source), next.source);
  const s1 = await runSession(userId, "baseline", 200);
  const live = await client.query(api.live.current, {});
  check("coach view sees the live session", live?.session._id === s1.sessionId);
  const recent = await client.query(api.live.recentReadings, { sessionId: s1.sessionId });
  check("recentReadings returns the last 60, oldest first", recent.length === 60 && recent[0].t < recent[59].t);

  // 2. Feel Checks: button, keyword voice, unclear voice (needs Claude)
  const btn = await client.mutation(api.feel.record, {
    sessionId: s1.sessionId, t: 160_000, answeredAt: 161_000, source: "button",
    transcript: null, answer: "drifting", interpretedBy: "button",
  });
  check("button Feel Check is scored against the sensors", btn.sensorState !== null, btn);
  const kw = await client.action(api.feel.answer, { sessionId: s1.sessionId, t: 100_000, answeredAt: 102_000, transcript: "focused" });
  check("spoken 'focused' is read by keyword", kw.answer === "focused", kw);
  const fuzzy = await client.action(api.feel.answer, {
    sessionId: s1.sessionId, t: 190_000, answeredAt: 192_000, transcript: "uh… kind of floaty?",
  });
  console.log(`  unclear answer → ${fuzzy.answer ?? "null (set ANTHROPIC_API_KEY for Claude)"}`);

  // 3. Calibration and breath-count test
  const cal = s1.readings.filter((r) => r.phase === "calibration").flatMap((r) => r.breaths);
  await client.mutation(api.sessions.addCalibration, {
    sessionId: s1.sessionId,
    calibration: { kind: "paced", startT: -30_000, endT: 0, trueRate: 6, measuredRate: 6.2, tapTimes: [], detectedTimes: cal, rateError: null },
  });

  // 4. End → coach. Without CREAO keys the run fails cleanly; then the dev stand-in finishes it.
  await client.mutation(api.sessions.end, { sessionId: s1.sessionId });
  await new Promise((r) => setTimeout(r, 4000));
  const afterEnd = await client.query(api.sessions.get, { sessionId: s1.sessionId });
  check("ending hands the session to the coach", ["analyzing", "coachFailed", "coached"].includes(afterEnd?.status ?? ""), afterEnd?.status);
  convexRun("devCoach:fakeResult", { sessionId: s1.sessionId });
  const map = await client.query(api.sessions.calmMap, { sessionId: s1.sessionId });
  check("Calm Map has readings, Feel Checks, calibration and a summary", !!map && map.readings.length === 230 && map.feelChecks.length === 3 && map.calibrations[0]?.rateError !== null && !!map.session.summary);

  // 5. The next session runs from the coach's plan
  const coached = await client.query(api.sessions.nextPlan, { userId });
  check("next plan now comes from the coach", coached.source === "coach", coached.source);
  const s2 = await runSession(userId, "training", 120);
  check("training session started with the coach plan", s2.plan.intro === coached.plan?.intro);
  await client.mutation(api.sessions.end, { sessionId: s2.sessionId });
  await new Promise((r) => setTimeout(r, 3000));
  convexRun("devCoach:fakeResult", { sessionId: s2.sessionId });

  // 6. History, vector search
  const hist = await client.query(api.history.forUser, { userId });
  check("history lists sessions with summaries", hist.sessions.filter((s) => s.summary).length >= 2, hist.sessions.length);
  const similar = await client.action(api.similar.sessions, { sessionId: s2.sessionId });
  check("vector search finds an earlier similar session", similar.length >= 1, similar.map((s) => s.score.toFixed(3)));

  // 7. Coach off: no plan, just the breathing graph
  await client.mutation(api.users.setCoachEnabled, { userId, enabled: false });
  const off = await client.query(api.sessions.nextPlan, { userId });
  check("coach off → bare plan with no cues or Feel Checks", off.source === "coachOff" && off.plan.cues.length === 0);
  await client.mutation(api.users.setCoachEnabled, { userId, enabled: true });

  // 8. HTTP tools for the agents
  const key = process.env.TIDE_AGENT_KEY ? `&key=${process.env.TIDE_AGENT_KEY}` : "";
  const exp = await fetch(`${site}/session?sessionId=${s1.sessionId}${key}`);
  const expBody = (await exp.json()) as { readings?: unknown[] };
  check("GET /session returns the SessionExport", exp.ok && expBody.readings?.length === 230, exp.status);
  const h = await fetch(`${site}/history?userId=${userId}${key}`);
  check("GET /history returns past sessions", h.ok, h.status);
  const bad = await fetch(`${site}/session?sessionId=nope${key}`);
  check("GET /session rejects a bad id", bad.status === 400, bad.status);
  const wh = await fetch(`${site}/creao/webhook?${key.slice(1)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ runId: "not-ours", status: "completed", result: { text: "{}" } }),
  });
  check("webhook accepts CREAO's shape and ignores unknown runs", wh.ok, wh.status);

  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
