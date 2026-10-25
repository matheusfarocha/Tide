# TIDE Meditation Research Library

Builds a small, cited library of open-access research on **breath-focused meditation, mind wandering and breath counting**. It searches Europe PMC and PubMed and turns each paper into one structured finding:

- **technique**: `breathFocus`, `bodyScan`, `breathCounting` or `openAwareness`
- **who was studied** (population, sample size, and whether it was a clinical sample)
- **study type**: meta-analysis, systematic review, RCT, pilot, review or study
- **key finding** and a 1–2 sentence **summary**
- **citation** and a **link** (DOI, or Europe PMC)

It stores short summaries and links only, never full text or abstracts.

Built at Cal Hacks 13.0 for [TIDE](https://github.com/matheusfarocha/Tide), a meditation coach that trains you to notice when your mind wanders. TIDE's coach agent may only choose techniques it can cite from this library, so every coached session can show "Why this session" with a real paper behind it.

## How it works

1. Runs each query on the Europe PMC REST API (open access, has an abstract, from `fromYear`, protocols excluded).
2. Runs the same query on PubMed (NCBI E-utilities, free full text), then fetches those records from Europe PMC.
3. Merges both sources by Europe PMC ID and records which source(s) found each paper (`foundVia`).
4. Rule-based extraction (no LLM, no API keys): keyword rules for technique and tags, regexes for population and sample size, publication types for study type, and the Conclusions section (or the most result-like sentences) for the summary.
5. **Relevance rules** keep the library on topic. A paper must be about a practice someone can learn (meditation, mindfulness, a breathing practice, body scan, mind wandering, meta-awareness), named in the title or at least twice in the abstract, so a passing mention isn't enough. Papers set in hospital procedures, infants, hypnosis or competitive sport are dropped. Papers that don't map to a TIDE technique are dropped too.
6. Always includes `seedPmids` (default: Levinson et al. 2014, the breath-counting validation study).

## Input

All fields are optional. An empty input `{}` runs the built-in TIDE query set.

| Field | Default | Meaning |
| --- | --- | --- |
| `queries` | built-in set of 9 | Europe PMC query syntax; `TITLE_ABS:` becomes `[tiab]` on PubMed |
| `maxPerQuery` | 25 | Results per query per source (max 100) |
| `openAccessOnly` | true | Only papers anyone can read |
| `includePubMed` | true | Also search PubMed |
| `fromYear` | 2005 | Earliest publication year |
| `seedPmids` | `["25386148"]` | Papers to always include |

## Output

One dataset item per paper:

```json
{
  "externalId": "MED:25386148",
  "title": "A mind you can count on: validating breath counting as a behavioral measure of mindfulness.",
  "technique": "breathCounting",
  "tags": ["mindWandering", "metaAwareness", "attention", "mood"],
  "population": "experienced meditators",
  "clinical": false,
  "sampleSize": 400,
  "studyType": "rct",
  "outcome": "We also found in a randomized online training study that 4 weeks of breath counting training improved mindfulness and decreased mind wandering…",
  "citation": "Levinson et al. (2014). A mind you can count on: … Front Psychol.",
  "url": "https://doi.org/10.3389/fpsyg.2014.01202",
  "citedByCount": 125,
  "foundVia": ["europepmc", "pubmed"]
}
```

The `OUTPUT` record in the default key-value store holds per-query hit counts and totals by technique. A default run takes about a minute and returns about 150 findings.

## Known limitations

- Extraction is keyword-based, so population and study type are sometimes wrong or `"not stated"`. Check the linked paper before quoting a finding.
- `clinical` is a keyword flag. TIDE is a wellness tool and excludes clinical studies by default; it makes no medical claims.

## Use it for

- Grounding an AI coach or chatbot in cited research instead of model memory (this is what TIDE does: its coach may only recommend techniques it can cite from this dataset).
- A quick, structured literature scan of breath-focused meditation for students, researchers or app builders.

## Run locally

```bash
npm install
node src/main.js        # input from storage/key_value_stores/default/INPUT.json, or the defaults
npm test                # relevance and technique rules
```
