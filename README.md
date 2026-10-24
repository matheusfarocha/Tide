# TIDE

A meditation coach that sees when your mind wanders and trains you to notice it yourself.
Built at Cal Hacks 13.0. Plan: [docs/PLAN.md](docs/PLAN.md). Data flow: [docs/DATA.md](docs/DATA.md).
Backend API: [docs/BACKEND.md](docs/BACKEND.md). Coach agents: [docs/CREAO.md](docs/CREAO.md).

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
