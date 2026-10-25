# TIDE

**Muse tells you when your mind wanders. TIDE teaches you to notice it yourself, then gets out of the way.**

TIDE is a meditation coach that runs on a phone propped on a stand. Its camera reads your
breathing, stillness and posture while your eyes are closed, and a few times per session a
soft voice asks, *"Focused or drifting?"* You answer out loud, and TIDE compares your answer
with what the sensors saw. Over sessions, the gap shrinks: you're learning to feel your own
attention. An AI coach (CREAO agents) designs every session after the first, and removes its
support as you improve.

Built at Cal Hacks 13.0 for first-year college students with exam stress who tried a meditation
app and gave up. That's us.

- **Try it:** _TODO: deployed link_
- **Demo video:** _TODO_
- **Devpost:** _TODO_

> **Status (TODO: delete once wired):** the app and the backend are both built but not yet
> connected. The app currently runs on fake data. See [For the team](#for-the-team).

## What it does

| Feature | What happens |
| --- | --- |
| **Paced-breathing check** | A circle breathes at exactly 6 breaths/min. You follow it for 30 s and TIDE's reading should land near 6, which proves accuracy in front of you |
| **Live breath sensing** | MediaPipe Pose and Face Landmarker run on the phone. Shoulder and upper-chest motion become a breath wave, rate and regularity, plus stillness, posture and face tension |
| **Feel Checks** | Spoken "Focused or drifting?" checks, answered out loud with your eyes closed. Each answer is scored against what the sensors saw in the 20 s before |
| **Calm Map** | A timeline of the session: when you settled, drifted, got sleepy and came back |
| **Coach-designed sessions** | After each session, two CREAO agents analyze it, find patterns across your history ("you usually drift around minute 4") and design the next session, with each claim citing the sessions behind it |
| **Fading support** | As your self-awareness improves, the coach removes cues (fading level 0 → 3), so you don't come to depend on the app |
| **Breath-counting test** | Count breaths silently and tap on every 9th. TIDE's camera checks your count against your real breaths ([Levinson et al., 2014](https://www.frontiersin.org/articles/10.3389/fpsyg.2014.01202/text)) |
| **Live coach view** | A laptop screen (`/coach`) showing the meditator's breath wave, stillness and Feel Check answers live |

## How it works

TIDE runs two loops joined by Convex: a **body loop** during the session (milliseconds) and a
**coach loop** after it (minutes). CREAO never sits in the real-time path.

```
 PHONE (video stays here)                CONVEX                               CREAO
 ───────────────────────                 ──────                               ─────
 camera ─▶ MediaPipe ─▶ signal module
             one SignalReading / s ─────▶ sessions.addReading ─▶ samples ─▶ live coach view (laptop)
 voice cue ◀── Sonic mp3 (cached) ◀────── voice.prefetch / speak
 spoken answer ─▶ Ink 2 (token) ───────▶ feel.answer ─▶ keyword or Claude ─▶ scored vs sensors
 session ends ─────────────────────────▶ sessions.end ─schedule─▶ coach.start ─▶ Session Analyst
                                          GET /session ◀────────────────────── (Python: numpy/scipy)
                                          /creao/webhook ◀── SessionSummary ──┘
                                          coach stage ────────────────────────▶ Coach & Plan Designer
                                          GET /history, /research ◀──────────── finds patterns
                                          /creao/webhook ◀── SessionPlan ─────┘
 next session runs from the plan ◀─────── plans table (reactive)
```

Details: [docs/DATA.md](docs/DATA.md) (data flow, the session clock),
[docs/BACKEND.md](docs/BACKEND.md) (every function the app calls),
[docs/CREAO.md](docs/CREAO.md) (agent prompts and setup), [docs/PLAN.md](docs/PLAN.md) (the full plan).

## Privacy and responsible design

- **Video never leaves the phone.** It is processed on the device and never stored or
  uploaded. Only numbers (breath rate, stillness, state) are sent.
- **Audio is never stored.** Spoken answers become a transcript, and only the transcript is kept.
- **Wellness only.** TIDE is a training tool, not a medical device. It makes no diagnostic or
  treatment claims, and Claude is instructed never to give advice.
- **Built to make itself unnecessary.** Support fades as you improve, instead of keeping you hooked.
- **No secrets in this repo.** Every API key lives in Convex environment variables, and all
  third-party calls happen server-side.
- **Works eyes-closed.** The whole session is voice-driven, so it's usable by blind and
  low-vision users.

## Run it

```bash
npm install
npm run dev
```

Open the printed URL on your laptop.

**On your phone (same Wi-Fi):** run `npm run phone`, open the `https://192.168…` Network URL on the phone, and tap through the certificate warning (Advanced → Proceed). HTTPS is needed for the camera.

**On any phone (deployed):** `npx vercel` from this folder gives a real HTTPS link. `vercel.json` already handles routes like `/coach`.

### Backend (Convex)

```bash
npx convex login
npx convex dev          # leave running; pushes convex/ on every save
```

Then set the keys (they live only in Convex, never in the repo):

| Variable | Used for |
| --- | --- |
| `CREAO_ANALYST_APP_ID`, `CREAO_ANALYST_API_KEY` | Session Analyst agent (API Trigger, `capi_` key) |
| `CREAO_COACH_APP_ID`, `CREAO_COACH_API_KEY` | Coach & Plan Designer agent |
| `TIDE_AGENT_KEY` | Shared secret on the agents' HTTP tools and the webhook (`openssl rand -hex 16`) |
| `CARTESIA_API_KEY`, `CARTESIA_VOICE_ID` | Sonic speech and Ink 2 tokens |
| `ANTHROPIC_API_KEY` | Claude, for unclear spoken answers |
| `APIFY_TOKEN`, `APIFY_RESEARCH_ACTOR` | Research library refresh |

```bash
npx convex env set CARTESIA_API_KEY sk_car_...   # and so on
npx tsx scripts/smoke-convex.ts                  # end-to-end test of the backend
```

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

## Accuracy

_TODO (Saturday night): fill in from the tap-labelled recordings._

| Check | Result |
| --- | --- |
| Paced-breathing check (true rate 6 breaths/min) | _TODO: mean reading ± error over N runs_ |
| Breath detection vs. a teammate tapping every inhale (~20 recordings) | _TODO: precision, recall, mean timing offset (`matchBreaths` in `shared/scoring.ts`)_ |
| Breath-rate error | _TODO: mean absolute error, breaths/min_ |
| Self-awareness across weekend sessions | _TODO: gap from Y to Z (weekend data, labelled as such)_ |

## Sponsor tracks

### CREAO: the coach

CREAO agents are TIDE's coach. Every session after the first is designed by them. Turn the
coach off (`/profile`) and TIDE is just a breathing graph: no next session, no insights, no fading plan.

| Agent | Agent ID | What it does |
| --- | --- | --- |
| Session Analyst | `81845eb1-3a40-41d9-87e5-4f337e3fb2d1` | Fetches the finished session through `GET /session`, runs Python (numpy, scipy) to compute time in each state, drift onsets, self-awareness and breath-count accuracy, and writes the Calm Map highlights |
| Coach & Plan Designer | `3a59c633-38ea-4ec2-8f31-8c88d64b1ad2` | Reads the user's history (`GET /history`) and research (`GET /research`), finds patterns that each cite their sessions, and designs the next session as JSON: cue times, Feel Check times, fading level, technique, length |

- **Example run (share link):** [a Coach & Plan Designer run](https://agent.creao.ai/share/fa3c6c1d352e6edd1a65c57397b4feee)
- **Model:** both agents run on Claude Sonnet 5.5 (each agent's default model on CREAO).
- **Measured on our dev deployment:** a full pipeline run (Analyst 49 s, then Coach 57 s) took
  about 1 min 50 s from the end of a session to a new plan in the app, delivered by webhook.
- **How Convex drives them:** `sessions.end` schedules `coach.start` (`convex/coach.ts`), which
  calls each agent's API Trigger asynchronously. Results come back to the `/creao/webhook` HTTP
  endpoint, with polling every 30 s as a fallback. No request ever waits on a run.
- **Setup and prompts:** [docs/CREAO.md](docs/CREAO.md).

### Convex

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

### Cartesia: voice in both directions

Your eyes are closed, so voice is the only interface.

| Feature | Where | How TIDE uses it |
| --- | --- | --- |
| **Sonic 3.5** text-to-speech (`/tts/bytes`) | `convex/voice.ts` (`speak`, `prefetch`) | Speaks the coach's cues and Feel Check questions in a slow, calm voice (`speed 0.9`, `emotion: calm`). Each cue is generated once, stored in Convex file storage and replayed from there |
| **Ink 2** streaming speech-to-text (WebSocket) | `convex/voice.ts` (`sttToken`), app mic capture | Hears the spoken Feel Check answer. Ink 2's built-in turn detection and noise handling suit a loud hackathon hall |
| **Access tokens** (`/access-token`) | `convex/voice.ts` (`sttToken`) | Convex mints a 10-minute, STT-only token, so the browser connects to Ink 2 without ever seeing the API key |

**Known limitations:** Ink 2 is English-only and streaming-only, so it needs mic permission and
HTTPS on the phone. A very noisy room can still garble an answer: a headset mic helps, unclear
transcripts go to Claude, and two on-screen buttons are the fallback. The first time a new cue
is spoken there is a short generation delay; after that it plays from the cache.

### Anthropic: Claude

Claude (`claude-opus-5-5`, called from `convex/claude.ts`) reads spoken Feel Check answers that
keyword matching can't place, e.g. "uh… kind of floaty?" → drifting. It only returns a label
(focused, drifting, sleepy or unclear), never advice.

Claude is also the coach's model: both CREAO agents (Session Analyst and Coach & Plan Designer)
run on Claude Sonnet 5.5. So Claude analyzes every session and designs every session after the
first, citing the sessions and research papers behind each choice.

**Where it could go wrong, and what we do about it:**
- It can misread sarcasm or a mumbled transcript. Answers it marks "unclear" are left
  unscored rather than guessed.
- Camera-based drift detection is noisy, and calm can be misread as drowsy. That's why the
  spoken Feel Checks and the breath-counting test are the main measures.
- The coach could over-read a few noisy sessions. Every pattern it claims must cite the sessions
  behind it, and the plan shows those reasons to the user.

### Apify

| Actor | Where it's used |
| --- | --- |
| [TIDE Meditation Research Library](apify/tide-research) (our own, built this weekend). Store link: _TODO after publishing_ | Collects open-access research on breath-focused meditation, mind wandering and breath counting from Europe PMC and PubMed. A daily Convex cron (`convex/crons.ts`) starts it; `convex/research.ts` imports the dataset into the `techniques` table. The CREAO coach searches it through `GET /research` (`convex/http.ts`), so every technique in a plan carries a citation, shown as "Why this session". |
| _TODO: Apify Store app-review scraper_ | Reasons beginners quit meditation apps (counts on Devpost). |

## Known limitations

- **No login.** Users are picked by name, and any client with a session ID can write to it.
  Fine for a supervised demo, not for real users.
- **Lighting and clothing matter.** Dim light or baggy clothes weaken the breath signal; the
  framing guide helps, and tracking quality is reported with every reading.
- **Weekend data only.** We can't show weeks of improvement in 36 hours. Trends shown are from
  short sessions recorded this weekend, labelled as such.
- **Agent output is free text.** If an agent's JSON doesn't parse, the run is marked failed
  (visible in `coachRuns.error`) and can be retried with `coach.retry`.
- **CREAO runs take minutes.** The app shows a progress card meanwhile; the next plan arrives
  reactively when the run finishes.

## For the team

**Where each lane plugs in:**

- **Person 1 (signal):** implement `SignalSource` from `src/lib/signal.ts` with MediaPipe, then swap `createFakeSignal` in `src/screens/Session.tsx` and `src/screens/Calibrate.tsx`. Replace the timed checks in `src/screens/Setup.tsx` with real ones.
- **Person 3 (backend):** the Convex side is done ([docs/BACKEND.md](docs/BACKEND.md)). To wire the app:
  - `src/lib/live.ts`: phone → laptop feed. Today it's BroadcastChannel (same browser only). Swap for `sessions.addReading` + the `live.*` queries.
  - `src/lib/store.tsx` `finishSession`: replace the fake 6 s coach run with `sessions.end`; read `plan` and insights from `sessions.nextPlan` and `sessions.calmMap`.
  - `src/lib/voice.ts`: `speak` → `voice.prefetch`/`speak`, `listen` → Ink 2 with `voice.sttToken`, `interpret` → `feel.answer`.

**Commands:** `npm run convex` (Convex dev), `npm run typecheck`, `npx tsx scripts/smoke-convex.ts`.

## Team

_TODO: names, roles, links._
