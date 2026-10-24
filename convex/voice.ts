/**
 * Cartesia voice, server-side only. CARTESIA_API_KEY never reaches the browser.
 *
 * Speaking: `speak` turns cue text into Sonic 3.5 audio, caches it in Convex file
 * storage, and returns a URL. The app can call `prefetch` with every cue in a plan
 * at session start, so cues play the instant they're due.
 *
 * Listening: Ink 2 is streaming-only (WebSocket). `sttToken` mints a short-lived
 * Cartesia access token; the app opens
 *   wss://api.cartesia.ai/stt/websocket?model=ink-2&encoding=pcm_s16le&sample_rate=16000
 *     &cartesia_version=2026-08-14&access_token=<token>
 * sends ~100 ms PCM chunks, then "finalize", and passes the final transcript to feel.answer.
 */

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, env, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";

const CARTESIA = "https://api.cartesia.ai";
const TTS_VERSION = "2026-03-01";
const AUTH_VERSION = "2026-08-14";
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

async function speakOne(ctx: ActionCtx, text: string): Promise<string> {
  const voice = voiceId();
  const key = await sha256(`sonic-3.5|${voice}|${text}`);
  const hit: string | null = await ctx.runQuery(internal.voice.cached, { key });
  if (hit) return hit;

  const res = await fetch(`${CARTESIA}/tts/bytes`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cartesiaKey()}`,
      "cartesia-version": TTS_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model_id: "sonic-3.5",
      transcript: text,
      voice: { mode: "id", id: voice },
      output_format: { container: "mp3", sample_rate: 44100, bit_rate: 128000 },
      // A slow, calm guide voice.
      generation_config: { speed: 0.9, emotion: "calm" },
    }),
  });
  if (!res.ok) throw new Error(`Cartesia TTS: HTTP ${res.status} ${await res.text()}`);
  const storageId = await ctx.storage.store(new Blob([await res.arrayBuffer()], { type: "audio/mpeg" }));
  const url: string | null = await ctx.runMutation(internal.voice.saveCached, { key, text, storageId });
  if (!url) throw new Error("Stored speech has no URL");
  return url;
}

/** Sonic 3.5 audio for one cue. Returns a playable mp3 URL. */
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
    const urls = await Promise.all(unique.map((t) => speakOne(ctx, t)));
    const out: Record<string, string> = {};
    unique.forEach((t, i) => (out[t] = urls[i]));
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
        "cartesia-version": AUTH_VERSION,
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
