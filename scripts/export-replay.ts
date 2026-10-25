/**
 * Snapshot one finished, coached session into src/replay/recording.json for replay mode
 * (/replay): readings with their breath wave, Feel Checks, the Session Analyst's summary and the
 * plan the coach designed from it. Bundled into the app, so replay needs no network.
 *   npx tsx scripts/export-replay.ts <sessionId> [label]
 * Numbers only: no video, no audio (transcripts of spoken answers are included).
 */
import { ConvexHttpClient } from "convex/browser";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { api } from "../convex/_generated/api";

const url = readFileSync(".env.local", "utf8").match(/^VITE_CONVEX_URL=(.+)$/m)?.[1]?.trim();
if (!url) throw new Error("VITE_CONVEX_URL missing from .env.local");
const [sessionId, label = "a teammate"] = process.argv.slice(2);
if (!sessionId) throw new Error("usage: npx tsx scripts/export-replay.ts <sessionId> [label]");

const c = new ConvexHttpClient(url);
const map: any = await c.query(api.sessions.calmMap, { sessionId: sessionId as any });
if (!map) throw new Error("Unknown session");
if (!map.session.summary) throw new Error("Session has no coach summary yet");
const hist: any = await c.query(api.history.forUser, { userId: map.session.userId });
const plan = hist.latestPlan?.basedOnSessionId === sessionId ? hist.latestPlan : null;
if (!plan) throw new Error("The user's latest plan wasn't designed from this session; pick their latest coached session");

const strip = ({ _id, _creationTime, sessionId: _s, ...rest }: any) => rest;
const recording = {
  label,
  recordedAt: map.session.startedAt,
  kind: map.session.kind,
  readings: map.readings.filter((r: any) => r.t >= 0),
  feelChecks: map.feelChecks.map(strip),
  summary: map.session.summary,
  plan: {
    technique: plan.technique, lengthSec: plan.lengthSec, fadingLevel: plan.fadingLevel, intro: plan.intro,
    cues: plan.cues, feelChecks: plan.feelChecks, reasons: plan.reasons, citations: plan.citations,
  },
};
mkdirSync("src/replay", { recursive: true });
writeFileSync("src/replay/recording.json", JSON.stringify(recording));
console.log(`readings ${recording.readings.length}, feel checks ${recording.feelChecks.length}, citations ${recording.plan.citations.length}, ${Math.round(JSON.stringify(recording).length / 1024)} KB`);
