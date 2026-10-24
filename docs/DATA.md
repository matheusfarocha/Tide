# TIDE data: sources, shapes, flow

The code is the source of truth: `shared/types.ts` (shapes), `convex/schema.ts` (tables),
`shared/scoring.ts` (how scores are computed), `shared/fixtures.ts` (fake data and fixed plans).

## Sources

| Source | Where it's produced | What leaves the device | Rate |
| :-- | :-- | :-- | :-- |
| Camera | Phone: MediaPipe Pose + Face Landmarker | Nothing raw. The signal module reduces it to a `SignalReading` | 30 fps in, 1 Hz out |
| Mic | Phone → Convex action → Cartesia Ink 2 | Transcript only (audio is not stored) | Per Feel Check |
| Spoken answer | Convex action: keyword match, Claude only if unclear | `FeelCheck.answer` | Per Feel Check |
| Taps | Phone | Tap times (`BreathCountTest`, tap-label `Calibration`) | Per test |
| Paced circle | Phone | Known true rate (6 bpm) vs measured | Once per session |
| Coach | CREAO agents → Convex webhook | `SessionSummary` + next `SessionPlan` | Once per session |
| Research | Apify TIDE Research Actor (Europe PMC + PubMed) → `techniques` | `ResearchFinding`: short summary + link, never full text | Daily cron |

## The one clock

`t` = ms since the user closed their eyes (start of the 60 s baseline). The 30 s paced
check runs before that, so its readings have negative `t`. Plan `atSec` uses the same clock.

## Live path (during a session)

```
camera 30fps ─▶ signal module (phone) ─▶ SignalReading @1Hz ─▶ samples table ─▶ coach view (reactive query)
                                          (wave[] holds 10 Hz of breath waveform for a smooth graph)
```

One write per second per session. The coach view queries the last ~60 samples by `by_sessionId_and_t`.

## After the session

```
sessions.end ─▶ scheduled coach.start ─▶ CREAO Session Analyst run (coachRuns row, stage=analyst)
Analyst GETs /session (SessionExport) ─▶ Python ─▶ SessionSummary as the last JSON in its reply
CREAO POSTs /creao/webhook  (or coach.poll every 30 s)  ─▶ sessions.summary + sessions.features
─▶ CREAO Coach run (stage=coach): GETs /history, /research ─▶ SessionPlan as JSON
─▶ plans row, session status "coached" ─▶ app updates reactively
```

Agent replies are free text; `convex/coachParse.ts` pulls out the last JSON object and narrows
it to `SessionSummary` / `SessionPlan` (the same fields as `CoachWebhookPayload`). Agent setup
and prompts: `docs/CREAO.md`. App-facing functions: `docs/BACKEND.md`.

## Research library

```
cron (daily) ─▶ research.refresh starts the Apify Actor ─▶ research.checkRun polls every 30 s
─▶ dataset items narrowed to ResearchFinding ─▶ techniques table (full-text search index)
coach (CREAO) ─▶ GET /research?q=…&technique=… ─▶ cites externalId + url in its plan
```

## Breath signal: decide from data, not guesses

The weakest link is the source of the breath signal. When a seated person breathes, their shoulders
move only a few pixels at arm's length, which is close to the frame-to-frame jitter of
Pose landmarks. So we record two candidates and keep whichever one wins on the data:

- **A: landmark signal.** Mean y of shoulders 11/12 (minus nose y to cancel head sway), detrended.
- **B: chest flow.** Mean vertical optical flow in a box under the shoulders (Pose only places the box).
  This is the usual approach in camera-based respiration work and is usually more sensitive.

Both are stored per frame in `TraceFrame`. Tune offline in numpy against teammate inhale taps
(`RecordingTrace.inhaleTaps`) using `matchBreaths` (precision, recall, timing offset). The
paced 6 bpm runs give a second ground truth. Report the winner's numbers on Devpost.

## Privacy line

Pixels never leave the phone. Traces hold landmark numbers and are recorded only from teammates
for tuning (`recordings` table, dev only). Product sessions send only `SignalReading`s.
