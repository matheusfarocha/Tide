# TIDE

A meditation coach that sees when your mind wanders, and teaches you to notice it yourself.
Built at Cal Hacks 13.0. Plan: [docs/PLAN.md](docs/PLAN.md). Data flow: [docs/DATA.md](docs/DATA.md).
Backend API: [docs/BACKEND.md](docs/BACKEND.md). Coach agents: [docs/CREAO.md](docs/CREAO.md).

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

Backend: `npm run convex` (Convex dev deployment), `npm run typecheck`.

## Apify

| Actor | Where it's used |
| --- | --- |
| [TIDE Meditation Research Library](apify/tide-research) (our own, built this weekend). Store link: _TODO after publishing_ | Collects open-access research on breath-focused meditation, mind wandering and breath counting from Europe PMC and PubMed. A daily Convex cron (`convex/crons.ts`) starts it; `convex/research.ts` imports the dataset into the `techniques` table. The CREAO coach searches it through `GET /research` (`convex/http.ts`), so every technique in a plan carries a citation, shown as "Why this session". |
| _TODO: Apify Store app-review scraper_ | Reasons beginners quit meditation apps (counts on Devpost). |

## Convex

Convex is TIDE's nervous system: every reading streams through it, the coach view is a live
query, and it runs the CREAO coach between sessions. All API keys (CREAO, Cartesia, Anthropic,
Apify) live only in Convex environment variables.

| Convex feature | Where | What it does for TIDE |
| --- | --- | --- |
| Real-time mutations | `convex/sessions.ts` (`addReading`) | The phone writes one breath/stillness/state reading per second. Video never leaves the phone; only these numbers do |
| Reactive queries | `convex/live.ts`, `sessions.calmMap`, `history.forUser` | The laptop coach view, the Calm Map and the history screen update by themselves as data arrives, including when the coach's plan lands |
| Scheduled functions | `sessions.end` → `coach.start`, `coach.poll` | Ending a session hands it to CREAO without waiting; runs are polled every 30 s as a fallback to the webhook |
| Cron jobs | `convex/crons.ts` | Daily refresh of the research library from the Apify Actor |
| Actions | `convex/coach.ts`, `voice.ts`, `feel.ts`, `research.ts` | Server-side calls to CREAO, Cartesia (Sonic, Ink 2 tokens), Claude and Apify |
| HTTP endpoints | `convex/http.ts` | Tools for the CREAO agents (`/session`, `/history`, `/research`) and the `/creao/webhook` that receives their results |
| Vector search | `convex/similar.ts`, `sessions.by_features` index | "Find my past sessions that looked like this one" |
| Full-text search | `techniques.search_text` index | The coach searches research to cite a technique |
| File storage | `convex/voice.ts`, `speech` table | Sonic voice cues are generated once and cached, so cues play instantly |
| Schema + validators | `convex/schema.ts`, `convex/validators.ts` | Every write is validated at runtime; `convex/contract.ts` fails the build if validators drift from `shared/types.ts` |

## Claude

Claude (`claude-opus-5-5`, called from `convex/claude.ts`) reads spoken Feel Check answers that
keyword matching can't place, e.g. "uh… kind of floaty?" → drifting. It only returns a label
(focused, drifting, sleepy or unclear), never advice. Known failure modes: it can misread
sarcasm or a mumbled transcript; "unclear" answers are left unscored rather than guessed.

## Known limitations

- No login: users are picked by name, and any client with a session ID can write to it. Fine for a
  supervised demo, not for real users.
- CREAO results arrive as free text; if an agent's JSON doesn't parse, the run is marked failed
  (visible in `coachRuns.error`) and can be retried with `coach.retry`.
