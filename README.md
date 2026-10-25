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

- **Try it:** https://tide-eosin.vercel.app (laptop coach view: https://tide-eosin.vercel.app/coach)
- **Demo video:** _TODO_
- **Devpost:** _TODO_

## How we use Convex

- **Live coach view:** the phone streams breath readings through mutations; the laptop updates via realtime `useQuery`.
- **AI coach loop:** scheduled actions start the CREAO agents; HTTP actions give them data and receive their plan by webhook.
- **Cited research and memory:** a daily cron, full text search over the research library, and vector search for similar sessions.
- Details and the files behind each feature: [hackathon.md](hackathon.md).

## Who it's for, and the problem

**Community:** first-year college students under exam stress who tried a meditation app and
gave up. That's us: we built TIDE for ourselves and tested it on each other all weekend.

**The problem, with data:**

- **Students prefer to cope alone.** In a WHO survey of 13,984 first-year college students in
  eight countries, only 24.6% said they would definitely seek treatment for a future emotional
  problem; the most common reason not to was preferring to handle it alone (56.4%)
  ([Ebert et al., 2019](https://doi.org/10.1002/mpr.1782)). A self-guided practice meets them
  where they are. TIDE is a wellness and training tool, not a substitute for care.
- **People quit these apps.** Across 93 popular mental-health apps, median 30-day retention was
  3.3%, and 4.7% for mindfulness and meditation apps
  ([Baumel et al., 2019](https://doi.org/10.2196/14567)).
- **You don't notice your own drifting.** When people count breaths, only 29% of their counting
  errors are self-caught; most lapses go unnoticed. Breath-counting skill goes with more
  meta-awareness and less mind wandering, and 4 weeks of breath-counting training improved
  mindfulness and reduced mind wandering
  ([Levinson et al., 2014](https://doi.org/10.3389/fpsyg.2014.01202)). That blind spot is what
  TIDE trains, with the camera checking what you report.
- **What app users complain about:** our own scrape of 484 one-star reviews (see
  [Apify](#apify)): bugs, paywalls and billing. TIDE has no paywall, no subscription and nothing
  to cancel.

## How we measure impact

TIDE already records, per user and per session, what we would measure in a study:

| Outcome | Measure in TIDE | Where |
| --- | --- | --- |
| Noticing your own drift (the core skill) | Self-awareness: share of Feel Checks where your answer matched the sensors | `shared/scoring.ts`, scores screen |
| Attention | Breath-counting accuracy against camera-detected breaths (the Levinson et al. task) | `/breath-test`, `scoreBreathCount` |
| Needing the app less | Fading level the coach reaches (0 to 3, fewer cues) | each coach plan |
| Sticking with it | Sessions per week, and 30-day retention against the 4.7% baseline | `sessions` table |
| Measurement quality | Breath-rate error on the paced check (true rate 6/min) | `accuracy:summary` |

**Next step:** a 4-week pilot with first-year students at our university, mirroring the 4-week
training in Levinson et al.: breath-counting accuracy and self-awareness at week 0 and week 4,
plus retention. This weekend's numbers are from our own team and are labelled as weekend data.

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
| `/scores` | Scoreboard: level, records, milestones, today's table leaderboard |
| `/breath-test` | 60 s breath-counting focus test (Levinson et al., 2014) |
| `/profile` | Coach on/off switch, privacy, reset demo data |
| `/coach` | **Laptop coach view** for the judging table (live wave, stats, Feel Checks) |
| `/replay` | **Replay mode**: a real recorded session played back on the coach view, then the coach's notes and plan. Bundled into the app, so it works with no connection (our Wi-Fi fallback at the judging table). Always labelled as a replay |

## Accuracy

Every real paced-breathing check and every tap-labelled recording is saved as a calibration
(`src/lib/accuracy.ts`); `npx convex run accuracy:summary` recomputes this table. Checks written
by our test scripts are excluded, and a check where the camera couldn't start (simulated
signal) is never saved.

| Check | Result so far |
| --- | --- |
| Paced-breathing check (true rate 6 breaths/min) | Mean reading **5.29** breaths/min over **2** real runs (SD 0.07); mean absolute error **0.71**; 2/2 within 1 breath/min |
| Breath detection vs. a teammate tapping every inhale | Not yet recorded. Tool: `/debug`, "tap-label recorder" (precision, recall and timing offset via `matchBreaths` in `shared/scoring.ts`) |
| Self-awareness across weekend sessions | Too few sessions to show a trend yet; weekend data only, labelled as such |

These are small samples from one weekend, not a validation study.

## Cost per user

What one coached session costs to run, from our own usage and each provider's published prices
(October 2026). Camera processing is free: it runs on the phone.

| Part | Per session (4 min, 3 Feel Checks) | Source |
| --- | --- | --- |
| **CREAO coach** (Session Analyst + Coach & Plan Designer, on Claude Sonnet 5.5) | _TODO: credits per run, measured in CREAO_ | CREAO credits ($0.15 each as a top-up) |
| **Cartesia** Sonic 3.6 + Ink 2 | ~$0.02: ~310 new characters of speech (~1 credit each; fixed lines are generated once and cached for everyone) + up to 27 s of listening (3 credits/s) | Startup plan overage, $45 per 1M credits |
| **Claude** (unclear spoken answers only) | under $0.01: at most a few short calls, most answers are read by keywords | Claude Opus 5.5 pricing, $4 / $20 per 1M tokens |
| **Convex** | under $0.01: ~1 reading per second plus queries | 1M function calls free per month, then $2.20 per 1M |
| **Apify** research library refresh | ~$0.003 per daily run, shared by all users (~$0.09 a month in total) | Measured on our Actor runs |

The cost levers: the coach runs once per session and never on its own; spoken lines are cached and
shared; Claude only runs when keywords can't read an answer; the research library refreshes daily,
not per session.

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

Your eyes are closed, so voice is the only interface. Cartesia speaks every cue and question,
hears your answer, and tells you the result, all without you opening your eyes. **Without
Cartesia the session is silent and can't hear you:** you would have to open your eyes to read
the cues and tap your answers, which breaks the meditation.

| Feature | Where | How TIDE uses it |
| --- | --- | --- |
| **Sonic 3.6** text-to-speech (`/tts/bytes`) | `convex/voice.ts` (`speak`, `prefetch`) | A slow, calm guide voice (`speed 0.8`, `emotion: calm`) speaks the coach's intro and cues, the "Focused, or drifting?" question, the spoken result ("You caught it.") and the closing line |
| **Cues timed to your breath** | `src/screens/Session.tsx` | Each coach cue carries `onBreath` (inhale or exhale). TIDE waits for that breath, detected by the camera, and speaks the cue as it begins, so the voice follows your body, not a timer |
| **Pre-generated, cached audio** | `convex/voice.ts`, `src/lib/voice.ts` | Every line of the coming session is generated during the 30 s paced-breathing check, stored in Convex file storage and decoded on the phone, so nothing waits on the network once your eyes are closed (Cartesia's "caching audio for stock responses" pattern) |
| **Ink 2** realtime speech-to-text with **turn detection** (`/stt/turns/websocket`) | `src/lib/voice.ts` (`listen`) | Hears the spoken Feel Check answer. Semantic turn detection waits through a hesitant "uh… kind of floaty?" instead of cutting it off, and ends the turn soon after a short answer. Falls back to `/stt/websocket` + `finalize` if needed |
| **Keyterm prompting** | `src/lib/voice.ts` | Biases Ink 2 toward the words people actually answer with (focused, drifting, sleepy, wandering…), for a noisy hall |
| **Access tokens** (`/access-token`) | `convex/voice.ts` (`sttToken`) | Convex mints a 10-minute, STT-only token, so the browser connects to Ink 2 without ever seeing the API key |

After Ink 2 hears an answer, Convex reads it (keywords, then Claude for anything unclear), scores
it against what the sensors saw, and TIDE speaks the result back.

**Edge cases handled:** no answer is logged as "quiet" (possible drowsiness or deep focus) and
acknowledged out loud; an answer nobody can read is left unscored, not guessed; listening starts
only after the question finishes, so Ink 2 never hears TIDE's own voice; audio is unlocked by the
last tap before eyes close (iOS blocks sound otherwise); the mic is requested at that tap too, so
the permission prompt never appears mid-meditation; with no mic, the screen says so and the two
answer buttons stay open.

**Privacy and accessibility:** the microphone is only listened to during the roughly 9 s answer
window and is muted the rest of the session. Audio is streamed to Cartesia for transcription
and never stored; only the transcript is kept. The whole session works eyes-closed, so it is
usable by blind and low-vision users.

**Known limitations:** English only. Streaming speech-to-text needs mic permission and HTTPS.
A very loud room can still garble an answer: a headset mic helps, and the on-screen buttons
remain. There is no browser-speech fallback: if Cartesia can't be reached, the session screen
says "Voice unavailable" and shows cues and questions on screen instead, so it is always clear
what Cartesia contributes.

### Anthropic: Claude

**In development:** TIDE was built with Claude Code (Claude Opus 5.5 and Sonnet 5.5), which wrote and tested
much of the backend, voice and coach integration; commits it helped with are co-authored in the
git history.


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

### Microsoft: a production-minded agent

The agent is TIDE's CREAO coach: after every session it analyses what happened and designs the
next session, without being asked. How TIDE covers the five capabilities:

| Capability | Evidence |
| --- | --- |
| **Customer understanding** | A named community, published data on how first-year students cope and why app users quit, and our own analysis of 484 one-star reviews. See [Who it's for](#who-its-for-and-the-problem) and [Apify](#apify) |
| **Measurable usefulness** | Self-awareness, breath-counting accuracy, fading level and retention are recorded for every user; the paced check measures our own error against a known rate. See [How we measure impact](#how-we-measure-impact) and [Accuracy](#accuracy) |
| **Path to production** | Below |
| **Responsible design** | Video never leaves the phone; audio is never stored; wellness only, not a substitute for care; support fades so users don't depend on it; every plan must cite research; unclear answers are left unscored, not guessed; simulated readings are labelled. See [Privacy and responsible design](#privacy-and-responsible-design) |
| **End-to-end functionality** | Camera → breath signal → voice Feel Checks → Calm Map → CREAO coach (78–135 s) → next session, live at the link above and tested on a phone |

**Path from prototype to production**

- **Already production-shaped:** a deployed web app (installable, no app store) on a managed
  backend; every API key server-side; on-device video; failures handled and shown (coach retry,
  "not saved" notice, labelled simulated signal, offline replay); cost per session measured (see
  [Cost per user](#cost-per-user)); users can delete everything they've recorded (`users.remove`,
  from the profile screen).
- **Before real users:** sign-in (today users are picked by name, see Known limitations), a
  separate production Convex deployment, consent and data-retention settings, and rate limits on
  the public functions.
- **Validation:** the 4-week pilot in [How we measure impact](#how-we-measure-impact), comparing
  breath-counting accuracy and self-awareness at week 0 and week 4, and retention against the
  4.7% baseline for meditation apps.

### Apify

| Actor | Where it's used |
| --- | --- |
| [TIDE Meditation Research Library](apify/tide-research) (our own, built this weekend; runs on our Apify account, source in this repo) | Collects open-access research on breath-focused meditation, mind wandering and breath counting from Europe PMC and PubMed, and keeps only papers about a practice someone can learn (relevance rules in `apify/tide-research/src/extract.js`, with tests). A daily Convex cron (`convex/crons.ts`) starts it; `convex/research.ts` imports the dataset into the `techniques` table and removes papers the latest run no longer returns. The CREAO coach searches it through `GET /research` (`convex/http.ts`), and Convex rejects any plan that cites no paper from it, so every technique in a plan carries a citation, shown as "Why this session". |
| [neatrat/google-play-store-reviews-scraper](https://apify.com/neatrat/google-play-store-reviews-scraper) (Apify Store) | `convex/reviews.ts` runs it on the newest one-star Google Play reviews of five meditation apps, and Claude sorts each into one fixed reason. Results below. Counts only: no review text or reviewer names are kept. |

#### What 484 one-star reviews of meditation apps complain about

![Bar chart: crashes, login or playback bugs 156 (32%); too expensive or paywalled 102 (21%); charged unexpectedly or can't cancel 87 (18%); an update made it worse 67 (14%); other 41 (8%); repetitive or generic content 30 (6%); couldn't tell if it was working 1; hard to keep the habit 0](docs/evidence/quit-reasons.svg)

Data: [`docs/evidence/quit-reasons.json`](docs/evidence/quit-reasons.json) (100 newest one-star reviews each of
Headspace, Calm, Insight Timer, Balance and Medito, collected 2026-10-25).

**What this does and doesn't show.** Angry reviews are about the *app*: bugs, paywalls and billing
make up 71%. Almost none say "I couldn't tell if it was working" or "I couldn't keep the habit",
but that is a selection effect, not evidence that those don't matter: people who quietly drift
away from meditating rarely write a one-star review. So the reviews shape what TIDE avoids (no
account wall, no paywall, no subscription, nothing to cancel), and our case for training
self-awareness rests on the research (Levinson et al., 2014) and on our interviews instead.

## Known limitations

- **No login.** Users are picked by name, and any client with a session ID can write to it.
  Fine for a supervised demo, not for real users.
- **Lighting and clothing matter.** Dim light or baggy clothes weaken the breath signal; the
  framing guide helps, and tracking quality is reported with every reading.
- **Weekend data only.** We can't show weeks of improvement in 36 hours. Trends shown are from
  short sessions recorded this weekend, labelled as such.
- **Agent output is free text.** If an agent's JSON doesn't parse, the run is marked failed
  (visible in `coachRuns.error`) and can be retried with `coach.retry`.
- **CREAO runs take minutes.** In our runs the whole pipeline took 78 to 111 s. The app shows a
  progress card meanwhile, and the next plan arrives reactively when the run finishes. If a run
  fails, the app says so and offers to run it again.
- **Cartesia free plan.** It allows 2 concurrent requests, so a session's lines are generated two
  at a time during the paced check (with retries), not all at once.
- **Replay mode is a recording.** `/replay` plays one real session from this weekend and says so on
  screen; it is a fallback for a dropped connection, not a live reading.

## Developer notes

| Command | What it does |
| --- | --- |
| `npm run dev` / `npm run phone` | Web app (phone mode serves HTTPS for the camera) |
| `npm run typecheck`, `npm test` | Typecheck everything; unit tests (signal, scoring, voice, uplink) |
| `npx convex dev` | Push `convex/` on every save |
| `npx tsx scripts/smoke-convex.ts` | End-to-end test of the backend |
| `npx convex run devCoach:checkCreao` | Check the CREAO app IDs and keys without starting a run |
| `npx convex run accuracy:summary` | The accuracy table above |
| `npx tsx scripts/export-replay.ts <sessionId> [name]` | Snapshot a coached session for `/replay` |
| `npx convex run research:refresh` | Re-run the Research Actor and refresh the library |
| `cd apify/tide-research && npm test` | The Actor's relevance rules |

## Team

_TODO: names, roles, links._
