import { defineApp } from "convex/server";
import { v } from "convex/values";

/**
 * Typed env vars, read via `env` from ./_generated/server. Set them with `npx convex env set`.
 * Every secret lives here and nowhere else (never in the app or the repo).
 */
const app = defineApp({
  env: {
    APIFY_TOKEN: v.optional(v.string()),
    /** "<username>~tide-research" or the Actor's ID. */
    APIFY_RESEARCH_ACTOR: v.optional(v.string()),

    /** CREAO Session Analyst: app ID from its agent page, and its capi_ key. */
    CREAO_ANALYST_APP_ID: v.optional(v.string()),
    CREAO_ANALYST_API_KEY: v.optional(v.string()),
    /** CREAO Coach & Plan Designer. If only the coach is set, it must return summary + plan itself. */
    CREAO_COACH_APP_ID: v.optional(v.string()),
    CREAO_COACH_API_KEY: v.optional(v.string()),
    /** Shared secret the agents pass as ?key= on /session and /history, and CREAO on the webhook. */
    TIDE_AGENT_KEY: v.optional(v.string()),

    CARTESIA_API_KEY: v.optional(v.string()),
    /** Sonic voice ID (pick one at play.cartesia.ai). */
    CARTESIA_VOICE_ID: v.optional(v.string()),

    ANTHROPIC_API_KEY: v.optional(v.string()),
  },
});

export default app;
