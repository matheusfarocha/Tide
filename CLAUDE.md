# TIDE: Cal Hacks 13.0

The full project plan is imported below. Treat it as the source of truth for
what we're building, the architecture, the sponsor-track requirements and who
owns what. Read the relevant section before building any feature.

@docs/PLAN.md

## Hard rules (never break these)
- All API keys (CREAO `capi_`, Cartesia, Anthropic) live ONLY in Convex
  environment variables. Never in client code, never committed to the repo.
- Video never leaves the phone. Only computed metrics are sent to Convex.
- CREAO is only ever called from Convex actions, asynchronously; results come
  back through a Convex HTTP webhook. Never block a request waiting on a run.
- Modules communicate only through the types in `shared/types.ts`. Don't
  change a shared type without saying so explicitly.
- No medical or diagnostic claims in any user-facing text. TIDE is a wellness
  and training tool.

## Layout
- `src/`, `index.html`, `public/`: web app at the repo root (Vite + React +
  TypeScript), opened in the phone browser
- `convex/`: Convex backend (schema, functions, actions, HTTP endpoints)
- `shared/types.ts`: shared data contracts between modules
- `docs/PLAN.md`: the plan

## Commands
- `npm run dev` / `npm run phone`: the web app (phone mode serves HTTPS for the camera)
- `npm run build`: typecheck + Vite build (what Vercel runs)
- `npm run typecheck`: typechecks `src/`, `shared/` and `convex/`; fails if
  `convex/validators.ts` drifts from `shared/types.ts`
- `npx tsx scripts/fake-session.ts`: sanity-check the fake session data
- `npx tsx scripts/smoke-convex.ts`: end-to-end test of the Convex backend (dev deployment)
- `npx convex dev` (or `npm run convex`): keep running in its own terminal; pushes `convex/` on save
  to the cloud dev deployment `tacit-moose-727` (team `param-mans`, project `tide`)
- `cd apify/tide-research && npm install && node src/main.js`: run the
  Research Actor locally (results in its `storage/datasets/default/`)
- `npx convex run research:refresh`: start the Actor on Apify and import its
  results into `techniques` (needs `APIFY_TOKEN`, `APIFY_RESEARCH_ACTOR`)
- Data sources, flow and the clock convention: `docs/DATA.md`
- App-facing Convex functions: `docs/BACKEND.md`; CREAO agent setup: `docs/CREAO.md`

## Working style
- Prefer the simplest thing that works for a live demo by Sunday 8:30 AM.
- Before a larger feature, propose a short plan and wait for approval.
- Keep the README sections required by sponsors up to date (CREAO agent IDs
  and run link, Cartesia features used, Convex features used).

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
