/**
 * Research library: the Apify TIDE Research Actor → `techniques` table.
 *
 * refresh (cron or `npx convex run research:refresh`) starts an Actor run and
 * returns at once; checkRun polls every 30 s and imports the dataset when the run
 * succeeds, then removes papers that run no longer returns (the Actor's relevance rules
 * decide what belongs). Plans keep their citations: applyCoach copies citation and link.
 * The coach searches the library through GET /research (convex/http.ts).
 *
 * Env: APIFY_TOKEN, APIFY_RESEARCH_ACTOR (e.g. "yourname~tide-research").
 */

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { env, internalAction, internalMutation, query } from "./_generated/server";
import { researchFindingFields, vResearchFinding, vTechnique } from "./validators";
import type { ResearchFinding, StudyType, Technique } from "../shared/types";

const APIFY = "https://api.apify.com/v2";
const POLL_MS = 30_000;
const MAX_POLLS = 20;
const BATCH = 50;
/** A run with fewer findings than this is treated as broken: import it, but don't prune. */
const MIN_FOR_PRUNE = 30;

function apifyEnv() {
  const token = env.APIFY_TOKEN;
  const actor = env.APIFY_RESEARCH_ACTOR;
  return token && actor ? { token, actor } : null;
}

async function apify(path: string, token: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${APIFY}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  });
  if (!res.ok) throw new Error(`Apify ${path}: HTTP ${res.status} ${await res.text()}`);
  return await res.json();
}

type RunInfo = { id: string; status: string; defaultDatasetId: string };

function runInfo(body: unknown): RunInfo {
  const d = (body as { data?: Partial<RunInfo> } | null)?.data;
  if (!d || typeof d.id !== "string" || typeof d.status !== "string" || typeof d.defaultDatasetId !== "string") {
    throw new Error("Unexpected Apify run response");
  }
  return { id: d.id, status: d.status, defaultDatasetId: d.defaultDatasetId };
}

/** Starts the Actor with its default input. Returns immediately; checkRun does the rest. */
export const refresh = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const env = apifyEnv();
    if (!env) {
      console.warn("research.refresh skipped: set APIFY_TOKEN and APIFY_RESEARCH_ACTOR");
      return null;
    }
    const run = runInfo(
      await apify(`/acts/${encodeURIComponent(env.actor)}/runs`, env.token, { method: "POST", body: "{}" }),
    );
    console.log(`Started Apify run ${run.id}`);
    await ctx.scheduler.runAfter(POLL_MS, internal.research.checkRun, { runId: run.id, attempt: 1 });
    return null;
  },
});

export const checkRun = internalAction({
  args: { runId: v.string(), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, { runId, attempt }) => {
    const env = apifyEnv();
    if (!env) return null;
    const run = runInfo(await apify(`/actor-runs/${runId}`, env.token));

    if (run.status === "READY" || run.status === "RUNNING") {
      if (attempt >= MAX_POLLS) throw new Error(`Apify run ${runId} still ${run.status} after ${attempt} checks`);
      await ctx.scheduler.runAfter(POLL_MS, internal.research.checkRun, { runId, attempt: attempt + 1 });
      return null;
    }
    if (run.status !== "SUCCEEDED") throw new Error(`Apify run ${runId} ended ${run.status}`);

    const items = await apify(`/datasets/${run.defaultDatasetId}/items?clean=true&format=json&limit=2000`, env.token);
    const findings = (Array.isArray(items) ? items : []).map(asFinding).filter((f) => f !== null);
    const fetchedAt = Date.now();
    for (let i = 0; i < findings.length; i += BATCH) {
      await ctx.runMutation(internal.research.upsertBatch, { items: findings.slice(i, i + BATCH), fetchedAt });
    }
    let pruned = 0;
    if (findings.length >= MIN_FOR_PRUNE) {
      for (let n = -1; n !== 0; ) {
        n = await ctx.runMutation(internal.research.pruneStale, { fetchedAt });
        pruned += n;
      }
    } else {
      console.warn(`Apify run ${runId} returned only ${findings.length} findings; not pruning the library`);
    }
    console.log(`Imported ${findings.length} findings from Apify run ${runId}, removed ${pruned} no longer returned`);
    return null;
  },
});

/** Deletes up to 100 papers not refreshed by the run at `fetchedAt`. Returns how many it deleted. */
export const pruneStale = internalMutation({
  args: { fetchedAt: v.number() },
  returns: v.number(),
  handler: async (ctx, { fetchedAt }) => {
    // The library is a few hundred rows, so a scan is fine.
    const stale = (await ctx.db.query("techniques").take(2000)).filter((r) => r.fetchedAt < fetchedAt).slice(0, 100);
    for (const r of stale) await ctx.db.delete("techniques", r._id);
    return stale.length;
  },
});

export const upsertBatch = internalMutation({
  args: { items: v.array(vResearchFinding), fetchedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, { items, fetchedAt }) => {
    for (const f of items) {
      const row = { ...f, searchText: searchTextFor(f), fetchedAt };
      const existing = await ctx.db
        .query("techniques")
        .withIndex("by_externalId", (q) => q.eq("externalId", f.externalId))
        .unique();
      if (existing) await ctx.db.replace("techniques", existing._id, row);
      else await ctx.db.insert("techniques", row);
    }
    return null;
  },
});

export type FindingDoc = Omit<Doc<"techniques">, "searchText">;
const vFindingDoc = v.object({
  _id: v.id("techniques"),
  _creationTime: v.number(),
  ...researchFindingFields,
  fetchedAt: v.number(),
});
const strip = ({ searchText: _, ...rest }: Doc<"techniques">): FindingDoc => rest;

/**
 * Search the library. With `q`: full-text over title, summary, outcome, population, tags.
 * Without: the most-cited findings for `technique`. Clinical studies are excluded unless asked for.
 */
export const search = query({
  args: {
    q: v.optional(v.string()),
    technique: v.optional(vTechnique),
    includeClinical: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  returns: v.array(vFindingDoc),
  handler: async (ctx, { q, technique, includeClinical, limit }) => {
    const n = Math.min(Math.max(limit ?? 8, 1), 25);
    const text = q?.trim();
    if (text) {
      const rows = await ctx.db
        .query("techniques")
        .withSearchIndex("search_text", (s) => {
          let f = s.search("searchText", text);
          if (technique) f = f.eq("technique", technique);
          if (!includeClinical) f = f.eq("clinical", false);
          return f;
        })
        .take(n);
      return rows.map(strip);
    }
    if (!technique) return [];
    const rows = await ctx.db
      .query("techniques")
      .withIndex("by_technique_and_citedByCount", (i) => i.eq("technique", technique))
      .order("desc")
      .take(n * 3);
    return rows
      .filter((r) => includeClinical || !r.clinical)
      .slice(0, n)
      .map(strip);
  },
});

/** For the "Why this session" card: look up the findings a plan cites. */
export const byExternalIds = query({
  args: { externalIds: v.array(v.string()) },
  returns: v.array(vFindingDoc),
  handler: async (ctx, { externalIds }) => {
    const out: FindingDoc[] = [];
    for (const externalId of externalIds.slice(0, 20)) {
      const row = await ctx.db
        .query("techniques")
        .withIndex("by_externalId", (q) => q.eq("externalId", externalId))
        .unique();
      if (row) out.push(strip(row));
    }
    return out;
  },
});

function searchTextFor(f: ResearchFinding) {
  return [f.title, f.summary, f.outcome, f.population, f.tags.join(" ")].join(" ");
}

// ---------- Narrow untrusted Apify dataset items to ResearchFinding ----------

const TECHNIQUES: readonly Technique[] = ["breathFocus", "bodyScan", "breathCounting", "openAwareness"];
const STUDY_TYPES: readonly StudyType[] = ["metaAnalysis", "systematicReview", "rct", "pilot", "review", "study"];

const str = (x: unknown) => (typeof x === "string" ? x : null);
const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
const oneOf = <T extends string>(xs: readonly T[], x: unknown) => (xs as readonly unknown[]).includes(x) ? (x as T) : null;

function asFinding(x: unknown): ResearchFinding | null {
  if (typeof x !== "object" || x === null) return null;
  const r = x as Record<string, unknown>;
  const externalId = str(r.externalId);
  const title = str(r.title);
  const url = str(r.url);
  const technique = oneOf(TECHNIQUES, r.technique);
  if (!externalId || !title || !url || !technique) return null;
  const strings = (a: unknown) => (Array.isArray(a) ? a.filter((t): t is string => typeof t === "string") : []);
  return {
    externalId,
    title,
    authors: str(r.authors) ?? "",
    journal: str(r.journal),
    year: num(r.year),
    doi: str(r.doi),
    technique,
    tags: strings(r.tags),
    population: str(r.population) ?? "not stated",
    clinical: r.clinical === true,
    sampleSize: num(r.sampleSize),
    studyType: oneOf(STUDY_TYPES, r.studyType) ?? "study",
    outcome: str(r.outcome) ?? "",
    summary: str(r.summary) ?? "",
    citation: str(r.citation) ?? title,
    url,
    openAccess: r.openAccess === true,
    citedByCount: num(r.citedByCount) ?? 0,
    foundVia: strings(r.foundVia).filter((s): s is "europepmc" | "pubmed" => s === "europepmc" || s === "pubmed"),
  };
}
