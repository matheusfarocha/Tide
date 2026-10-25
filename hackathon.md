# Hackathon log

- **Project:** TIDE
- **Event:** Cal Hacks 13.0
- **What it does:** A phone-camera meditation coach that reads your breathing, asks "Focused or drifting?" out loud, and has CREAO agents design your next session.
- **Live app:** https://tide-eosin.vercel.app
- **Repo:** https://github.com/matheusfarocha/Tide
- **Frontend:** Vercel
- **Convex deployment:** https://tacit-moose-727.convex.cloud
- **Components:** none
- **Convex features:** schema, indexes, queries, mutations, actions, HTTP actions, crons, scheduled functions, file storage, full text search, vector search, realtime useQuery
- **Auth:** none
- **AI models:** claude-opus-5-5, sonic-3.6, ink-2
- **Started:** 2026-10-24T08:55:51Z
- **Last updated:** 2026-10-25T09:42:21Z

## How we use Convex

- **Live coach view** (`/coach`): the phone writes breath readings each second through mutations; the laptop's breath wave, stats and Feel Checks update live via realtime `useQuery`. `convex/sessions.ts`, `convex/live.ts`, `src/screens/CoachView.tsx`
- **AI coach between sessions:** ending a session schedules an action that starts the CREAO agents; HTTP actions serve them session data and receive their plan by webhook. `convex/coach.ts`, `convex/http.ts`
- **Next session appears by itself:** Home, the coach tab, the plan screen and the Calm Map's coach notes are realtime queries, so the new plan shows without a refresh. `src/lib/store.tsx`, `convex/plans.ts`, `src/screens/Results.tsx`
- **Cited research:** a daily cron refreshes the library from our Apify Actor; the coach searches it with a full text search index. `convex/crons.ts`, `convex/research.ts`, `convex/schema.ts`
- **"Sessions like this one":** vector search over each session's features. `convex/similar.ts`, `convex/schema.ts`
- **Instant voice cues:** Cartesia audio is cached in file storage, generated once per line. `convex/voice.ts`

## Log

Oldest first, times UTC.

- 10-24 08:55 `3b89f66` Repo created: `README.md`
- 10-24 09:19 `91f9fb7` App screens and flow on fake data: `src/screens/Session.tsx`, `src/lib/store.tsx`
- 10-24 09:34 `f7025f7` Scores, breath-count test: `src/screens/Scores.tsx`, `src/screens/BreathTest.tsx`
- 10-24 10:06 `1534976` Breath-driven tide UI: `src/lib/tide.tsx`
- 10-24 10:15 `722e015` Camera and chest overlay: `src/lib/pose.ts`
- 10-24 18:49 `743d996` Shared contracts, research Actor: `shared/types.ts`, `apify/tide-research`
- 10-24 18:49 `727dd1d` Convex backend, coach loop, voice: `convex/coach.ts`, `convex/sessions.ts`, `convex/http.ts`
- 10-24 19:20 `c36d08a` README for judges: `README.md`
- 10-24 20:34 `430a25a` Real signal engine, app on Convex: `src/signal/engine.ts`, `src/lib/backend.ts`
- 10-24 21:15 `73524cb` Plans cite research: `convex/coach.ts`, `shared/types.ts`
- 10-24 22:42 `0b0ecc4` Leaderboard on real data: `convex/leaderboard.ts`
- 10-24 23:02 `254fa90` CREAO reply parsing: `convex/coach.ts`, `convex/http.ts`
- 10-25 00:58 `cee1d29` Vercel deploy: `.vercelignore`
- 10-25 01:21 `6731914` Fix sessions refused after a failed run: `convex/plans.ts`
- 10-25 03:09 `08622af` Plan-driven sessions, retry, citation rule: `convex/coach.ts`, `src/lib/store.tsx`
- 10-25 04:10 `3b71da1` Voice sessions: `convex/voice.ts`, `src/lib/voice.ts`
- 10-25 04:45 `d11196b` Voice retries: `convex/voice.ts`
- 10-25 06:44 `af8723b` Library cleanup, review evidence: `convex/research.ts`, `convex/reviews.ts`
- 10-25 07:35 `d0bb371` Accuracy capture: `convex/accuracy.ts`
- 10-25 07:41 `a4bd644` Replay mode: `src/screens/Replay.tsx`
- 10-25 09:08 `f954df1` This log: `hackathon.md`
- 10-25 09:14 `a6570cd` Community, data, impact plan: `README.md`
