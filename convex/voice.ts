/**
 * Cartesia voice, server-side only. CARTESIA_API_KEY never reaches the browser.
 *
 * Speaking: `speak` turns a line into Sonic 3.6 audio, caches it in Convex file storage,
 * and returns a URL. The app calls `prefetch` with every line of a session (cues, the Feel
 * Check question, the spoken feedback) before the user closes their eyes, so each one plays
 * the instant it's due, on the user's breath.
 *
 * Listening: Ink 2 is streaming-only (WebSocket). `sttToken` mints a short-lived, STT-only
 * Cartesia access token; the app streams 16 kHz PCM to /stt/turns/websocket (semantic turn
 * detection, with /stt/websocket + "finalize" as the fallback) only while a Feel Check is
 * waiting for an answer, and passes the transcript to feel.answer. Audio is never stored.
 */

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, env, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";

const CARTESIA = "https://api.cartesia.ai";
const API_VERSION = "2026-08-14";
const TTS_MODEL = "sonic-3.6";
const TOKEN_TTL_SEC = 600;

function cartesiaKey() {
  const key = env.CARTESIA_API_KEY;
  if (!key) throw new Error("Set CARTESIA_API_KEY with `npx convex env set`");
  return key;
}

function voiceId() {
  const id = env.CARTESIA_VOICE_ID;
  if (!id) throw new Error("Set CARTESIA_VOICE_ID (pick a calm voice at play.cartesia.ai)");
  return id;
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const cached = internalQuery({
  args: { key: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { key }) => {
    const row = await ctx.db
      .query("speech")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    return row ? await ctx.storage.getUrl(row.storageId) : null;
  },
});

export const saveCached = internalMutation({
  args: { key: v.string(), text: v.string(), storageId: v.id("_storage") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("speech")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (existing) {
      // Lost a race with another prefetch: keep the first file.
      await ctx.storage.delete(args.storageId);
      return await ctx.storage.getUrl(existing.storageId);
    }
    await ctx.db.insert("speech", { ...args, createdAt: Date.now() });
    return await ctx.storage.getUrl(args.storageId);
  },
});

/** A slow, calm guide voice. Part of the cache key, so changing it regenerates every line. */
const GENERATION = { speed: 0.8, emotion: "calm" } as const;
/** Cartesia's concurrency limit on our plan; more parallel requests get HTTP 429. */
const MAX_PARALLEL = 2;
const RETRIES = 4;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function speakOne(ctx: ActionCtx, text: string): Promise<string> {
  const voice = voiceId();
  const key = await sha256(`${TTS_MODEL}|${voice}|${JSON.stringify(GENERATION)}|${text}`);
  const hit: string | null = await ctx.runQuery(internal.voice.cached, { key });
  if (hit) return hit;

  const res = await tts(text, voice);
  const storageId = await ctx.storage.store(new Blob([await res.arrayBuffer()], { type: "audio/mpeg" }));
  const url: string | null = await ctx.runMutation(internal.voice.saveCached, { key, text, storageId });
  if (!url) throw new Error("Stored speech has no URL");
  return url;
}

/** One Sonic request, retried with back-off when Cartesia is busy (429) or briefly failing (5xx). */
async function tts(text: string, voice: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${CARTESIA}/tts/bytes`, {
      method: "POST",
    headers: {
      authorization: `Bearer ${cartesiaKey()}`,
      "cartesia-version": API_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model_id: TTS_MODEL,
      transcript: text,
      voice: { id: voice },
      language: "en",
      output_format: { container: "mp3", sample_rate: 44100, bit_rate: 128000 },
      generation_config: GENERATION,
    }),
    });
    if (res.ok) return res;
    const body = await res.text();
    if ((res.status === 429 || res.status >= 500) && attempt < RETRIES) {
      await sleep(400 * 2 ** attempt + Math.random() * 200);
      continue;
    }
    throw new Error(`Cartesia TTS: HTTP ${res.status} ${body}`);
  }
}

/** Sonic 3.6 audio for one line. Returns a playable mp3 URL. */
export const speak = action({
  args: { text: v.string() },
  returns: v.string(),
  handler: async (ctx, { text }) => {
    const clean = text.trim();
    if (!clean || clean.length > 500) throw new Error("Cue text must be 1–500 characters");
    return await speakOne(ctx, clean);
  },
});

/** Generate (or fetch from cache) every cue in a plan at once. Returns text → URL. */
export const prefetch = action({
  args: { texts: v.array(v.string()) },
  returns: v.record(v.string(), v.string()),
  handler: async (ctx, { texts }) => {
    const unique = [...new Set(texts.map((t) => t.trim()).filter((t) => t && t.length <= 500))].slice(0, 30);
    // At most MAX_PARALLEL generations at once (cached lines return straight away). A line that
    // still fails is left out, and the app generates it on demand, instead of losing every line.
    const out: Record<string, string> = {};
    const queue = [...unique];
    const failures: string[] = [];
    await Promise.all(Array.from({ length: MAX_PARALLEL }, async () => {
      for (let t = queue.shift(); t !== undefined; t = queue.shift()) {
        try { out[t] = await speakOne(ctx, t); } catch (e) { failures.push(`${t}: ${String(e)}`); }
      }
    }));
    if (failures.length) console.warn(`Sonic prefetch: ${failures.length} line(s) failed`, failures);
    if (unique.length && !Object.keys(out).length) throw new Error(failures[0] ?? "Sonic prefetch failed");
    return out;
  },
});

/** Short-lived token for the Ink 2 WebSocket, so the browser never sees the API key. */
export const sttToken = action({
  args: {},
  returns: v.object({ token: v.string(), expiresInSec: v.number() }),
  handler: async () => {
    const res = await fetch(`${CARTESIA}/access-token`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${cartesiaKey()}`,
        "cartesia-version": API_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({ grants: { stt: true }, expires_in: TOKEN_TTL_SEC }),
    });
    if (!res.ok) throw new Error(`Cartesia access token: HTTP ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { token?: unknown };
    if (typeof body.token !== "string") throw new Error("Unexpected Cartesia access-token response");
    return { token: body.token, expiresInSec: TOKEN_TTL_SEC };
  },
});
