/**
 * Turns one Europe PMC "core" record into a TIDE research finding.
 * Rule-based on purpose: no LLM key lives in the Actor (all keys stay in Convex).
 * The output shape must match ResearchFinding in shared/types.ts.
 */

/** Ordered most specific first. Title matches beat abstract matches. */
const TECHNIQUES = [
  ["breathCounting", /breath[- ]?count/i],
  ["bodyScan", /body[- ]scan/i],
  ["openAwareness", /open[- ](monitoring|awareness)|choiceless awareness/i],
  [
    "breathFocus",
    /breath(ing)?[- ](focus|awareness|attention|meditation)|mindful(ness of)? breath|focused[- ]attention|anapanasati|(slow|paced|resonan(t|ce)|diaphragmatic) breathing/i,
  ],
];

const TAGS = [
  ["mindWandering", /mind[- ]wander|task[- ]unrelated thought|off[- ]task/i],
  ["metaAwareness", /meta[- ]?awareness|metacogniti|interocepti/i],
  ["attention", /\battention|\bfocus/i],
  ["drowsiness", /drows|sleep/i],
  ["stress", /stress|anxi/i],
  ["mood", /\bmood|affect\b|well-?being/i],
  ["beginners", /novice|beginner|naive|first[- ]time|brief/i],
  ["students", /student|undergrad|college/i],
  ["exams", /\bexams?\b|test anxiety|academic stress/i],
  ["breathRate", /breathing rate|respiration rate|respiratory rate|breaths per minute|\d+ ?bpm/i],
];

const POPULATIONS = [
  ["college students", /(undergrad|college|university)\w*( \w+)? students?|\bundergraduates?\b|\bstudents?\b/i],
  ["adolescents", /adolescen|teen/i],
  ["children", /\bchild(ren)?\b|\bkids\b/i],
  ["older adults", /older adults|elderly|aged \d{2}\+/i],
  ["experienced meditators", /(experienced|long[- ]term|expert) (meditators|practitioners)/i],
  ["adults", /\badults?\b|\bparticipants\b|\bvolunteers\b/i],
];

const CLINICAL =
  /\bpatients?\b|clinical sample|disorder|cancer|tumou?r|\bPTSD\b|chronic pain|hypertension|diabet|schizo|psychiatric|inpatient|outpatient/i;

/** Words that say what a study found. Each distinct one adds a point; p-values and percentages cost one. */
const RESULT_WORDS = [
  /\b(found|find)/i,
  /improv/i,
  /reduc|decreas|lower/i,
  /increas|higher|greater|enhanc/i,
  /associat|predict|correlat/i,
  /benefit|effective/i,
  /no (significant )?(difference|effect|change)/i,
];
const STATS_NOISE = /\bp\s*[<=>]|\d+(\.\d+)?%|\bCI\b|\bSD\b/i;

function resultScore(s) {
  return RESULT_WORDS.filter((re) => re.test(s)).length - (STATS_NOISE.test(s) ? 1 : 0);
}

export function stripHtml(s) {
  return String(s ?? "")
    .replace(/<h4>(.*?)<\/h4>/gi, " $1: ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function sentences(text) {
  return text
    .replace(/\b(e\.g|i\.e|et al|vs|approx)\./gi, (m) => m.replace(".", "\u0000"))
    .split(/(?<=[.!?])\s+(?=[A-Z(])/)
    .map((s) => s.replace(/\u0000/g, ".").trim())
    .filter((s) => s.length > 20);
}

function clip(s, max) {
  return s.length <= max ? s : s.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}

export function classifyTechnique(title, abstract) {
  for (const [name, re] of TECHNIQUES) if (re.test(title)) return name;
  let best = null;
  let bestHits = 0;
  for (const [name, re] of TECHNIQUES) {
    const hits = (abstract.match(new RegExp(re.source, "gi")) ?? []).length;
    if (hits > bestHits) [best, bestHits] = [name, hits];
  }
  return best;
}

export function findPopulation(text) {
  for (const [name, re] of POPULATIONS) if (re.test(text)) return name;
  return "not stated";
}

export function findSampleSize(text) {
  const m =
    text.match(/\b[nN]\s*=\s*(\d{2,5})\b/) ??
    text.match(
      /\b(\d{2,5})\s+(?:\w+\s+){0,2}(?:participants|subjects|students|adults|undergraduates|volunteers|novices|meditators|individuals|people)\b/i,
    );
  return m ? Number(m[1]) : null;
}

export function findStudyType(pubTypes, text) {
  const all = `${pubTypes.join(" ")} ${text}`;
  if (/meta-analy/i.test(all)) return "metaAnalysis";
  if (/systematic review/i.test(all)) return "systematicReview";
  if (/randomi[sz]ed/i.test(all)) return "rct";
  if (/\bpilot\b|feasibility/i.test(all)) return "pilot";
  if (pubTypes.some((p) => /^review$/i.test(p))) return "review";
  return "study";
}

/** Structured abstracts: summary = the Conclusion(s) section. Otherwise the two most result-like sentences. */
export function summarize(abstract) {
  const concl = abstract.match(/\b(?:conclusions?|interpretation|discussion)\s*:\s*(.+)$/i)?.[1];
  const results = abstract.match(/\bresults?\s*:\s*(.+?)(?:\b(?:conclusions?|interpretation|discussion)\s*:|$)/i)?.[1];
  const all = sentences(abstract);
  /** Highest score wins; later sentences win ties (abstracts end on their findings). */
  const best = (pool, n) =>
    pool
      .map((s, i) => ({ s, i, score: resultScore(s) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || b.i - a.i)
      .slice(0, n)
      .sort((a, b) => a.i - b.i)
      .map((x) => x.s);

  const outcome = best(sentences(results ?? ""), 1)[0] ?? best(all, 1)[0] ?? all.at(-1) ?? "";
  const summarySents = concl ? sentences(concl).slice(0, 2) : best(all, 2);
  const summary = summarySents.length ? summarySents.join(" ") : outcome;

  return { outcome: clip(outcome, 300), summary: clip(summary, 420) };
}

/** Prefer the structured last name; "De Filippi E" → "De Filippi" as a fallback. */
function firstAuthor(r) {
  const a = r.authorList?.author?.[0];
  if (a?.lastName) return a.lastName;
  if (a?.collectiveName) return a.collectiveName;
  const first = String(r.authorString ?? "").split(",")[0]?.trim() ?? "";
  return first.replace(/\s+[A-Z]{1,3}$/, "") || "Unknown";
}

export function citationFor(r) {
  const many = String(r.authorString ?? "").split(",").length > 1;
  const journal = r.journalInfo?.journal?.isoabbreviation ?? r.journalInfo?.journal?.title ?? r.bookOrReportDetails?.publisher;
  const year = r.pubYear ?? "n.d.";
  return `${firstAuthor(r)}${many ? " et al." : ""} (${year}). ${stripHtml(r.title)}${journal ? ` ${journal}.` : ""}`;
}

export function urlFor(r) {
  if (r.doi) return `https://doi.org/${r.doi}`;
  if (r.pmcid) return `https://europepmc.org/article/PMC/${r.pmcid}`;
  return `https://europepmc.org/article/${r.source}/${r.id}`;
}

/** @returns a ResearchFinding, or null when the paper has no abstract or no recognised technique. */
export function toFinding(r, foundVia = ["europepmc"]) {
  const title = stripHtml(r.title);
  const abstract = stripHtml(r.abstractText);
  if (!title || abstract.length < 200) return null;

  const technique = classifyTechnique(title, abstract);
  if (!technique) return null;

  const text = `${title} ${abstract}`;
  const pubTypes = r.pubTypeList?.pubType ?? [];
  const { outcome, summary } = summarize(abstract);
  const year = Number(r.pubYear);

  return {
    externalId: `${r.source}:${r.id}`,
    title,
    authors: String(r.authorString ?? "").replace(/\.$/, ""),
    journal: r.journalInfo?.journal?.title ?? null,
    year: Number.isFinite(year) ? year : null,
    doi: r.doi ?? null,
    technique,
    tags: TAGS.filter(([, re]) => re.test(text)).map(([name]) => name),
    population: findPopulation(text),
    clinical: CLINICAL.test(text),
    sampleSize: findSampleSize(abstract),
    studyType: findStudyType(pubTypes, text),
    outcome,
    summary,
    citation: citationFor(r),
    url: urlFor(r),
    openAccess: r.isOpenAccess === "Y",
    citedByCount: Number(r.citedByCount ?? 0),
    foundVia,
  };
}
