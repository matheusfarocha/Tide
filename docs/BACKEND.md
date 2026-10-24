# Convex API for the app

Deployment URL: `VITE_CONVEX_URL` in `app/.env.local` (from the root `.env.local`).
Types for every call come from `convex/_generated/api`. Shapes are in `shared/types.ts`.

## Session runner (phone)

| When | Call | Notes |
| :-- | :-- | :-- |
| Pick user | `users.getOrCreate({ name })` → `userId` | No login for the hackathon |
| Before a session | `sessions.nextPlan({ userId })` (query) | `source`: `baseline` (first ever), `coach`, `waiting` (coach still working: show the progress card), `coachOff` |
| Start | `sessions.start({ userId, kind })` → `{ sessionId, plan }` | `kind`: `"training"` (the app runs whatever `nextPlan` says) or `"breathCount"` |
| Preload cue audio | `voice.prefetch({ texts: plan.cues.map(c => c.text) })` → `{ text: mp3Url }` | Cached in Convex storage, so repeat cues are instant |
| Every second | `sessions.addReading({ sessionId, reading })` | `reading` is a `SignalReading`. After a Wi-Fi drop, flush with `sessions.addReadings` (≤120) |
| Feel Check, voice | `voice.sttToken()` → Ink 2 WebSocket (see `convex/voice.ts`) → `feel.answer({ sessionId, t, answeredAt, transcript })` | Returns `{ answer, sensorState, match }` to show right away |
| Feel Check, buttons / no answer | `feel.record({ sessionId, t, answeredAt, source, transcript: null, answer, interpretedBy })` | `source: "timeout"`, `answer: null` for silence |
| Paced check done | `sessions.addCalibration({ sessionId, calibration })` | `rateError` is computed server-side |
| Breath-count test done | `sessions.addBreathCountTest({ sessionId, test })` | Scored server-side |
| End | `sessions.end({ sessionId })` | Starts the CREAO coach if it's on. Returns at once |

## Screens (all reactive queries: they update by themselves)

| Screen | Query |
| :-- | :-- |
| Live coach view (laptop) | `live.current()`, then `live.recentReadings({ sessionId })` and `live.feelChecks({ sessionId })` |
| Calm Map | `sessions.calmMap({ sessionId })`. `session.status` goes `analyzing` → `coached` / `coachFailed`; `session.summary` appears when the Analyst finishes |
| Progress card | `session.status === "analyzing"`; `coachRuns` (in `calmMap`) shows which agent is running |
| History | `history.forUser({ userId })`: sessions oldest first with summaries, `selfAwareness`, `latestPlan` (with `reasons`) |
| "Sessions like this one" | `similar.sessions({ sessionId })` (action) |
| Coach off switch | `users.setCoachEnabled({ userId, enabled })` |
| Retry a failed coach run | `coach.retry({ sessionId })` |

## Testing without CREAO

`npx tsx scripts/smoke-convex.ts` runs the whole loop against the dev deployment.
`npx convex run devCoach:fakeResult '{"sessionId":"..."}'` fakes a coach result for one
session (dev only, labelled `[dev]`, never for demo history).
