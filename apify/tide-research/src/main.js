/**
 * TIDE Research Actor.
 * Europe PMC + PubMed → one ResearchFinding per paper (technique, population,
 * outcome, short summary, citation link). Never stores full text or abstracts.
 * Convex starts this Actor on a schedule and loads the dataset into `techniques`.
 */

import { Actor, log } from "apify";
import { toFinding } from "./extract.js";

const EPMC = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";
const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";

/** Breath-focused meditation, mind wandering, breath counting, and our community (students, exams). */
const DEFAULT_QUERIES = [
  'TITLE_ABS:"breath counting" AND (mindfulness OR meditation)',
  'TITLE_ABS:"mind wandering" AND (meditation OR mindfulness)',
  'TITLE_ABS:"meta-awareness" AND (meditation OR mindfulness)',
  'TITLE_ABS:"focused attention" AND meditation AND breath',
  'TITLE_ABS:"breath awareness" OR TITLE_ABS:"mindful breathing"',
  'TITLE_ABS:"body scan" AND (meditation OR mindfulness)',
  'TITLE_ABS:"open monitoring" AND meditation',
  'TITLE_ABS:"slow breathing" AND (stress OR relaxation OR anxiety)',
  '(mindfulness OR meditation) AND TITLE_ABS:students AND (breath OR breathing) AND (stress OR exam)',
];

async function getJson(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i >= tries) throw err;
      log.warning(`Retry ${i} for ${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 1000 * i));
    }
  }
}

function epmcUrl(query, pageSize) {
  const p = new URLSearchParams({ query, format: "json", resultType: "core", pageSize: String(pageSize) });
  return `${EPMC}?${p}`;
}

/** Europe PMC fields → PubMed tags. Anything else with a FIELD: prefix is dropped. */
function toPubMedQuery(q) {
  return q.replace(/TITLE_ABS:("[^"]+"|[^\s()]+)/g, "$1[tiab]").replace(/\b[A-Z_]+:/g, "");
}

async function searchEuropePmc(query, { maxPerQuery, openAccessOnly, fromYear }) {
  const full =
    `(${query}) AND HAS_ABSTRACT:y AND PUB_YEAR:[${fromYear} TO 2100] NOT TITLE:protocol` +
    (openAccessOnly ? " AND OPEN_ACCESS:y" : "");
  const data = await getJson(epmcUrl(full, maxPerQuery));
  return { hits: data.hitCount ?? 0, records: data.resultList?.result ?? [] };
}

async function searchPubMed(query, { maxPerQuery, openAccessOnly, fromYear }) {
  const term =
    `(${toPubMedQuery(query)}) AND ${fromYear}:3000[dp] AND hasabstract NOT protocol[ti]` +
    (openAccessOnly ? " AND free full text[sb]" : "");
  const p = new URLSearchParams({ db: "pubmed", term, retmode: "json", retmax: String(maxPerQuery), tool: "tide-research" });
  const data = await getJson(`${EUTILS}?${p}`);
  return { hits: Number(data.esearchresult?.count ?? 0), pmids: data.esearchresult?.idlist ?? [] };
}

/** PubMed gives IDs only; fetch the records (with abstracts) from Europe PMC in batches. */
async function lookupPmids(pmids) {
  const out = [];
  for (let i = 0; i < pmids.length; i += 50) {
    const batch = pmids.slice(i, i + 50);
    const data = await getJson(epmcUrl(`SRC:MED AND EXT_ID:(${batch.join(" OR ")})`, batch.length));
    out.push(...(data.resultList?.result ?? []));
  }
  return out;
}

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const opts = {
  maxPerQuery: Math.min(Math.max(Number(input.maxPerQuery ?? 25), 1), 100),
  openAccessOnly: input.openAccessOnly ?? true,
  fromYear: Number(input.fromYear ?? 2005),
};
const queries = input.queries?.length ? input.queries : DEFAULT_QUERIES;
const includePubMed = input.includePubMed ?? true;
const seedPmids = input.seedPmids ?? ["25386148"];

/** externalId → finding, merging foundVia across sources. */
const findings = new Map();
const add = (record, via) => {
  const f = toFinding(record, [via]);
  if (!f) return false;
  const prev = findings.get(f.externalId);
  if (prev) prev.foundVia = [...new Set([...prev.foundVia, via])];
  else findings.set(f.externalId, f);
  return true;
};

const stats = [];
for (const query of queries) {
  const row = { query, europepmcHits: 0, pubmedHits: 0, kept: 0 };
  try {
    const epmc = await searchEuropePmc(query, opts);
    row.europepmcHits = epmc.hits;
    for (const r of epmc.records) if (add(r, "europepmc")) row.kept++;

    if (includePubMed) {
      const pm = await searchPubMed(query, opts);
      row.pubmedHits = pm.hits;
      for (const r of await lookupPmids(pm.pmids)) if (add(r, "pubmed")) row.kept++;
    }
  } catch (err) {
    row.error = err.message;
    log.exception(err, `Query failed: ${query}`);
  }
  log.info(`${row.kept} kept · Europe PMC ${row.europepmcHits} · PubMed ${row.pubmedHits} · ${query}`);
  stats.push(row);
}

if (seedPmids.length) {
  for (const r of await lookupPmids(seedPmids)) add(r, "europepmc");
}

const items = [...findings.values()].sort((a, b) => b.citedByCount - a.citedByCount);
await Actor.pushData(items);

const byTechnique = Object.fromEntries(
  ["breathFocus", "bodyScan", "breathCounting", "openAwareness"].map((t) => [t, items.filter((f) => f.technique === t).length]),
);
await Actor.setValue("OUTPUT", { total: items.length, byTechnique, queries: stats });
log.info(`Saved ${items.length} findings`, byTechnique);

await Actor.exit();
