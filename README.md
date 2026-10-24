# TIDE

A meditation coach that sees when your mind wanders, and teaches you to notice it yourself.

## Run it

```bash
npm install
npm run dev
```

Open the printed URL on your laptop.

**On your phone (same Wi-Fi):** run `npm run phone`, open the `https://192.168…` Network URL on the phone, and tap through the certificate warning (Advanced → Proceed). HTTPS is needed for the camera.

**On any phone (deployed):** `npx vercel` from this folder gives a real HTTPS link. `vercel.json` already handles routes like `/coach`.

## Screens

| Route | Screen |
|---|---|
| `/` | Welcome, then the Home dashboard after onboarding |
| `/onboard` | Name, goal, session length (90 s is the demo length) |
| `/setup` | Camera framing guide |
| `/calibrate` | Paced-breathing check: circle at 6 breaths/min vs. TIDE's reading |
| `/session` | Live meditation, run from the coach's plan, with Feel Checks |
| `/results` | Session complete + coach review card |
| `/calm-map/:id` | Calm Map timeline + key moments |
| `/insights` | AI coach summary, takeaways, patterns |
| `/plan` | Next session designed by the coach, with the fading support meter |
| `/progress` | Self-awareness, focus, stillness trends + session history |
| `/scores` | Scoreboard: level, records, milestones, today's table leaderboard |
| `/breath-test` | 60 s breath-counting focus test (Levinson et al., 2014) |
| `/profile` | Coach on/off switch, privacy, reset demo data |
| `/coach` | **Laptop coach view** for the judging table (live wave, stats, Feel Checks) |

Everything runs on fake data for now, so the whole flow is clickable today.

## Where each lane plugs in

Shared types live in `src/lib/types.ts` and match the Convex tables in the build plan.

**Person 1 (signal):** implement `SignalSource` from `src/lib/signal.ts` with MediaPipe, then swap `createFakeSignal` in `src/screens/Session.tsx` and `src/screens/Calibrate.tsx`. Replace the timed checks in `src/screens/Setup.tsx` with real ones.

**Person 3 (backend):**
- `src/lib/live.ts`: phone → laptop feed. Today it's BroadcastChannel (same browser only). Swap for a Convex mutation + reactive query.
- `src/lib/store.tsx` `finishSession`: replace the fake 6 s coach run with the Convex action that starts CREAO; set `plan` and `insights` from the webhook result.
- `src/lib/voice.ts`: `speak` → Cartesia Sonic, `listen` → Cartesia Ink, `interpret` → the Claude action.

## Privacy

Video is processed on the phone and never stored or uploaded. Only the numbers leave it. No API keys in this repo; keys go in Convex environment variables.
