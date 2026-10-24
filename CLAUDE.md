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
- `app/`: web app (Vite + React + TypeScript), opened in the phone browser
- `convex/`: Convex backend (schema, functions, actions, HTTP endpoints)
- `shared/types.ts`: shared data contracts between modules
- `docs/PLAN.md`: the plan

## Commands
(fill in once the scaffold exists, e.g. `npm run dev`, `npx convex dev`)

## Working style
- Prefer the simplest thing that works for a live demo by Sunday 8:30 AM.
- Before a larger feature, propose a short plan and wait for approval.
- Keep the README sections required by sponsors up to date (CREAO agent IDs
  and run link, Cartesia features used, Convex features used).