# Competitive Intelligence OS

A self-hostable, algorithm-first, AI-optional platform for monitoring
competitor websites, detecting product and pricing changes, analyzing
reviews, finding cross-competitor trends, generating reports, sending
alerts, and exposing a read API.

## Current status: Phases 1–6 built — **CHECKPOINT: Phase 6 (Review Intelligence) is the last completed phase; Phases 7–10 have NOT been started** — see `VERIFY.md`

> **Resume point for the next session:** begin at **Phase 7 — Cross-
> Competitor Trend Intelligence**. Nothing from Phases 7–10 exists in this
> repo (no trend engine, no reports/alerts/webhooks, no `/api/v1/*`, no AI
> provider code, no dashboard wiring). The `Trend`/`TrendProduct`/`Report`/
> `AlertWebhook`/`AlertDelivery` tables exist in the schema (Phase 1) but
> nothing reads or writes them yet.

**Phase 6 (Review Intelligence) — what's new:**
- **Pluggable adapters** (`src/lib/reviews/adapters.ts`): a `ReviewAdapter`
  interface plus two deliberately *generic* adapters — `json-feed` (any
  public/permitted JSON feed or API you have access to, fetched through
  the **same SSRF-protected fetcher** as page scraping) and an in-memory
  fixture adapter. **No adapters for specific platforms (G2, Capterra,
  Trustpilot, …) are included, on purpose** — those need a partner API or
  HTML scraping that commonly violates their terms/anti-bot measures, which
  this project's rules forbid bypassing. Unknown platforms are an explicit
  error, never a silent no-op.
- **Normalization** (`normalizeReview.ts`): NFC, line endings, whitespace
  (paragraph breaks preserved), repeated punctuation capped at 3, empty
  rejected, oversize truncated with a visible marker. Never rewords.
- **Deduplication** (`dedupe.ts` + `services/ingestReviews.ts`): externalId
  → per-review permalink → content fingerprint. **The existing
  `@@unique([reviewSourceId, externalId])` does not stop duplicates when
  externalId is NULL** (Postgres treats NULLs as distinct), so dedup is done
  in application code, with the DB constraints as a backstop. Two
  safeguards stop a shared listing-page URL from being mistaken for a
  permalink and collapsing distinct reviews into one.
- **Sentiment** (`sentiment.ts`): lexicon + negation window + intensifiers/
  diminishers; POSITIVE/NEUTRAL/NEGATIVE/MIXED; star rating only nudges a
  *weak* text signal and never overrides a clear one; confidence drops when
  rating and text disagree. Lexicon-based — **not** human-level
  understanding (sarcasm, domain slang, non-English text will be missed).
- **Topics** (`topics.ts`): 12 curated dictionaries, whole-word matching,
  matched terms stored as evidence. A topic observation carries the
  *review's overall* sentiment — no per-sentence topic sentiment (a
  documented simplification).
- **Endpoints:** `GET /api/reviews`, `GET /api/review-topics`, and an
  authenticated `POST /api/products/:productId/review-sources/:reviewSourceId/ingest`
  (needed so ingestion is reachable at all; it wasn't in the Phase 6 read
  list).

**Bug found and fixed while building Phase 6:** the first sentiment
normalization (`score = (pos − neg) / (pos + neg)`) made a single
sentiment word's score independent of its intensifier weight, so
"extremely disappointing" scored identically to "disappointing". Caught by
the intensifier/diminisher tests failing; fixed with a damping constant.

**Environment incident worth knowing about:** mid-session the sandbox
container was reset (its ephemeral filesystem was wiped). The repo was
recovered from the persisted Phase 4/5 zip and the Phase 6 files already
written that turn were re-created and re-verified (full suite re-run
afterwards). Nothing in the delivered state depends on unrecovered work.

**Phases 4 and 5** (below) are unchanged:

**Phases 1–3 are done** (Foundation, Web Scraping & Snapshot Engine, Change
Intelligence — Phase 2.1 fixed five real bugs found by re-auditing Phase 2's
own code; see "Phase 2.1 fixes" below). **Phases 4 and 5 add deterministic
pricing and feature extraction**, wired into the existing scrape pipeline.
As always, this section states plainly what's real, not what was planned.

**Phase 4 (Pricing Intelligence) — what's new:**
- **Deterministic pricing extraction** (`src/lib/pricing/`) — currency
  symbols/codes, billing periods (monthly/yearly), per-user pricing, free
  plans, custom/contact-sales pricing, and plan limits ("Up to 5 users",
  "100GB storage") and included features, all from already-normalized
  content (headings + list items + text). A price is only ever extracted
  when it has BOTH a currency marker AND plan-name context — "Save $100"
  and a bare price with no plan context are never extracted. See
  `src/lib/pricing/extractPricing.ts`'s doc comment for the full
  conservative-design rationale.
- **Stable plan identity** (`planIdentity.ts`) — "Pro"/"PRO"/"Pro Plan"
  resolve to one `PricingPlan`, never aggressively merging distinct plans.
- **Full price history** (`pricingHistory.ts`) — every observation stored,
  never overwritten; monthly and yearly prices for the same plan are
  separate, never-cross-compared series.
- **Deterministic comparison** (`comparePricing.ts`) — price/currency/
  billing/unit/limit/included-feature deltas; percentage deltas are never
  computed from a zero base, a missing price, or across currencies.
- **Conservative plan-disappearance detection** (`planLifecycle.ts`) — a
  plan is only marked inactive when the SAME pricing-authoritative source
  that showed it before no longer does; never from a non-authoritative
  page or a likely-JS-shell page.
- **`GET /api/pricing`** — authenticated, filterable (product/plan/date),
  cursor-paginated.

**Phase 5 (Feature Intelligence) — what's new:**
- **Deterministic feature extraction** (`src/lib/features/`) — two
  structural signals only: headings (h2+, excluding known non-feature
  section titles like FAQ/Pricing/Contact/a bare "Features" header) and
  short, non-sentence list items. Deliberately does NOT scan paragraph
  prose — that's exactly the "hundreds of fake features from marketing
  copy" failure mode the project's own rules warn against.
- **Conservative aliasing** (`normalizeFeature.ts`) — case/punctuation/
  pluralization variants merge ("Slack integration" / "Slack
  Integrations"); genuinely different features never do.
- **Reuses the existing `Feature`/`FeatureObservation` models** exactly as
  designed in Phase 1 (global canonical `Feature`, per-product
  `FeatureObservation`) — no new models.
- **Conservative lifecycle rules** (`featureLifecycle.ts`) — the single
  most important rule: **a feature missing from one non-authoritative
  page (e.g. a homepage) never flips to REMOVED, or even UNCERTAIN — its
  status is left unchanged.** Only an authoritative source (a `FEATURE`-
  or `CHANGELOG`-type source) moves a missing feature to `UNCERTAIN`;
  `REMOVED` requires explicit removal evidence (not yet wired to any
  classifier — see "Known limitations"). See the module's doc comment for
  the exact documented rule.
- **`GET /api/features`** — authenticated, filterable (product/status/
  feature/date), cursor-paginated.

**Pipeline, updated:** Fetch → Parse → Normalize → Snapshot → Diff →
Classify → **Extract Pricing → Extract Features** → Persist → Return.
Pricing/feature extraction only run when `contentChanged` is true (this is
also why list items now participate in `contentHash` — see
`contentHash.ts`'s doc comment for why that's a correctness requirement,
not just symmetry).

**Phase 2.1 fixes (bugs that existed in the actual Phase 2 code, each
confirmed by inspection and, where feasible, by reverting the fix and
watching a regression test fail before restoring it):**
- **JSON-LD was always empty.** `src/lib/parser/htmlParser.ts` removed
  `<script>` tags before querying for
  `script[type="application/ld+json"]` — the query always ran against an
  already-emptied DOM. Fixed the ordering; JSON-LD is now genuinely
  extracted.
- **A body-stream timeout could escape as a raw, unrecognized error.**
  `src/lib/crawler/httpFetcher.ts` only converted an aborted-request error
  into `FetchTimeoutError` around the header fetch, not around body
  reading — a server that sent headers then stalled mid-body would leak a
  bare `DOMException` past every structured-error check, surfacing as a
  generic 500 instead of a 504. Fixed by wrapping body reading in the same
  abort-aware handling.
- **The diff didn't cover everything the hash covered.** The content hash
  (`src/lib/utils/contentHash.ts`) is built from title + description +
  canonical URL + headings + text + links + structured data, but the
  stored diff only ever compared visible text — a title-only change would
  correctly flip the hash and create a Change record, but that record
  would claim "no line differences," which was simply false. Fixed with a
  new field-level diff (`src/lib/diff/structuralDiff.ts`) that covers
  every field the hash does.
- **Hashed content and stored content could silently diverge on large
  pages.** Phase 2 hashed the *full* normalized content but stored a
  *separately, differently* truncated version — so a later diff against
  the stored (truncated) previous snapshot could report a false change at
  the truncation boundary, on every large page, forever. Fixed by capping
  once (`capNormalizedContent` in `src/lib/normalizer/normalizeContent.ts`)
  and using that exact same object for both hashing and storage.
- **`Snapshot` never persisted title/description/canonical URL at all** —
  discovered while fixing the diff bug above: there was no way to
  reconstruct a previous snapshot's full content to diff against, only its
  text/headings/links/structuredData. Added the three missing columns
  (additive schema change, see "Database changes" below).

**New infra requirement found while building Phase 4/5 (not a Phase 2.1
bug — nothing before Phase 4 depended on this):** cheerio's `.text()` is a
plain `textContent`-style concatenation — it never inserted line breaks
between block-level elements. Harmless for hashing/diffing (same content
always produced the same output), but pricing/feature extraction anchor a
price or feature to the *nearest preceding heading line*, which requires
headings to actually be on their own line. Fixed in
`src/lib/parser/htmlParser.ts` by inserting a newline after every
block-level element before extracting text. One-time side effect if this
ever runs against a real previously-scraped database: the very next scrape
of every source will show a diff due to the improved extraction algorithm
— expected, not a bug (and moot right now: no real deployment exists yet).

**Phase 3 (Change Intelligence) — what's new:**
- **Deterministic change classification**
  (`src/lib/classification/classifyChange.ts`) — rule-based, no LLM.
  Checked in priority order: the source's configured `type` (strongest —
  e.g. a `PRICING`-type source's change is `PRICING`), then the source
  URL's path (e.g. `/changelog`), then keyword matches against headings or
  the title *that actually changed in this diff* (never arbitrary body
  text — see the module's doc comment for why). No match → `UNKNOWN`,
  never a forced guess. Confidence is graduated (1.0 / 0.7 / 0.5 / null),
  not binary.
- **A resolved category taxonomy.** Three different `ChangeCategory` lists
  existed across this project's own instructions; see the "Taxonomy
  resolution" note at the top of `prisma/schema.prisma` for the three
  lists and why the current ten values (`FEATURE`, `PRICING`, `PRODUCT`,
  `DOCUMENTATION`, `CHANGELOG`, `INTEGRATION`, `LEGAL_POLICY`, `CONTENT`,
  `MARKETING`, `UNKNOWN`) were adopted.
- **Idempotent Change persistence.** `Change` now has a unique constraint
  on `(fromSnapshotId, toSnapshotId)`; persistence uses an upsert keyed on
  it. Verified directly at the database level (see `VERIFY.md` for the
  honest nuance on when this natural code path does vs. doesn't currently
  exercise that exact collision).
- **`GET /api/changes`** — authenticated, filterable (product/source/
  category/date range), cursor-paginated.

**What Phase 3 still deliberately does NOT do:** claim *what a change
means* beyond its category grouping (no "competitor launched an AI
feature", no severity/urgency judgment beyond the existing default), run
any AI, interpret pricing numbers, analyze sentiment, or touch the
dashboard. Those are later phases.

**What Phases 4/5 still deliberately do NOT do:** call any AI/LLM for
extraction (everything is regex/structural-signal based); handle
non-US/UK numeric formats ("1.234,56" European style — documented
limitation in `parseNumber.ts`); extract from `<table>` pricing/feature
layouts specifically (only headings + list items — a documented scope
boundary, not an oversight); set `REMOVED` on a feature without explicit
removal evidence being wired up (nothing currently sets
`explicitRemovalEvidence: true` — every disappearance currently resolves
to `UNCERTAIN` at most, which is the conservative, safe default; wiring a
real "explicit removal" detector, e.g. from changelog language, is future
work, not a broken promise — the module supports it, nothing calls it yet).

**Known limitations, unchanged from Phase 2.1 unless noted:** the SSRF
policy re-validates every redirect hop's DNS resolution but doesn't pin
the TCP connection to the validated IP (narrow DNS-rebinding TOCTOU
window on a single hop — see `src/lib/security/ssrf.ts`). Content-type
detection assumes UTF-8. `renderRequired` is a heuristic. Copyright-year
boilerplate isn't special-cased. Classification (Phase 3) only ever looks
at source type, URL path, and changed heading/title text — it will
correctly return `UNKNOWN` for a real category change not signaled by any
of those three things. **New (Phase 4):** a bare currency symbol ("$") is
always read as USD — genuinely ambiguous against CAD/AUD/etc., documented
in `currency.ts` rather than silently guessed differently per context.

## Roadmap (Phase numbering — the authoritative scheme; an older "V1–V7"
## list used to live here and didn't match the Phase 1–10 terminology
## used everywhere else in this repo and in VERIFY.md — replaced for
## consistency, nothing about the plan itself changed)

- **Phase 1 — Foundation:** database, auth, error handling. ✅ Built.
- **Phase 2 — Web Scraping & Snapshot Engine:** SSRF-protected fetch, parse, normalize, hash, snapshot. ✅ Built.
- **Phase 2.1 — Hardening:** fixed real bugs found in Phase 2 (see VERIFY.md). ✅ Built.
- **Phase 3 — Change Intelligence:** structural diff, deterministic classification, idempotent persistence. ✅ Built.
- **Phase 4 — Pricing Intelligence:** deterministic price/plan extraction, history, comparison. ✅ Built.
- **Phase 5 — Feature Intelligence:** deterministic feature extraction, conservative lifecycle tracking. ✅ Built.
- **Phase 6 — Review Intelligence:** pluggable review ingestion, deterministic sentiment and topics. ✅ Built (**last completed phase — resume at Phase 7**).
- **Phase 7 — Cross-Competitor Trend Intelligence:** adoption, growth, pricing convergence, topic trends. ⬜ Not yet.
- **Phase 8 — Reports, Alerts & Integrations:** evidence-based reports, generic webhook alerts. ⬜ Not yet.
- **Phase 9 — Public Competitive Intelligence API:** versioned, read-only `/api/v1/*`. ⬜ Not yet.
- **Phase 10 — Optional AI Research Assistant + final production hardening:** BYOK, evidence-first prompting — the *only* phase where AI is used anywhere in the system. ⬜ Not yet.

The core product principle is **algorithm-first, AI-optional**: every one
of the above must work with zero AI provider keys configured.

## Architecture

- **Frontend:** static HTML/CSS/JS dashboard (`index.html`), kept as the
  baseline UI shell — unchanged since Phase 1, not touched by any later phase.
- **Backend:** Express + TypeScript, deployed as a single Vercel
  serverless function (`api/index.ts`) sharing its app setup with the
  local dev entrypoint (`src/index.ts`).
- **Database:** PostgreSQL, via Supabase. Schema in `prisma/schema.prisma`.
- **ORM:** Prisma. **Migrations, not `db push`, are now the deployment
  mechanism** — see "Database & migrations" below; this changed in Phase 2.1.
- **Scraping:** HTTP + Cheerio (`src/lib/crawler/`, `src/lib/parser/`);
  Playwright fallback still not implemented, never required on Vercel.
- **Change intelligence:** `src/lib/diff/structuralDiff.ts` (what
  changed) + `src/lib/classification/classifyChange.ts` (which category,
  deterministically).
- **Pricing intelligence (Phase 4):** `src/lib/pricing/` (extraction,
  plan identity, comparison, history, lifecycle) +
  `src/services/persistPricing.ts` (idempotent persistence).
- **Feature intelligence (Phase 5):** `src/lib/features/` (extraction,
  normalization, lifecycle) + `src/services/persistFeatures.ts`.
- **Review intelligence (Phase 6):** `src/lib/reviews/` (adapters, normalization, dedup, sentiment, topics) + `src/services/ingestReviews.ts` / `ingestReviewSource.ts`.
- **Scheduling:** `npm run scrape:once` loops all enabled sources
  sequentially. `/api/cron` remains a deliberate no-op.
- **AI (not yet built):** optional BYOK providers — OpenRouter, Gemini,
  Anthropic, OpenAI.

**Single-tenant for V1.** The schema is deliberately shaped so a
`workspaceId` column could later be added to `Product` without
restructuring anything beneath it.

## Database & migrations

**Phase 2.1 change: production no longer uses `prisma db push`.**
`vercel.json`'s build command is now
`prisma generate && prisma migrate deploy && tsc -p .`.

Three migrations exist, all hand-authored with the same caveat (**read
each one's own header comment before trusting it** — this sandbox has no
network to install the Prisma CLI and no reachable database to
generate/verify a migration the normal way, and neither has been run
against a real database or validated by Prisma's own engine):
- `prisma/migrations/20260101000000_init/` — the schema as of the end of
  Phase 3.
- `prisma/migrations/20260102000000_phase4_5_pricing_features/` —
  `PricingPlan.normalizedName` (+ unique constraint), `PricingPoint.
  observationKey`/`extractionMethod` (+ unique constraint),
  `FeatureObservation` unique constraint, `Snapshot.listItems`. All
  additive/widening.

- `prisma/migrations/20260103000000_phase6_reviews/` — `Review.fingerprint`
  (+ unique + `(productId, sentimentLabel)` index), `ReviewTopicObservation.
  matchedTerms` (+ `(reviewId, reviewTopicId)` unique). Additive.

Each migration's header explains:
- The **recommended, safer path**: delete both and run
  `npx prisma migrate dev --name init` yourself against a real database,
  letting Prisma generate and verify an authoritative migration from the
  current `schema.prisma` directly.
- What to do **if you already ran `db push`** against a real database
  before now (so the tables already exist there): baseline it with
  `npx prisma migrate resolve --applied <migration_name>` for each
  migration in order, rather than running the SQL, which would otherwise
  fail loudly (not silently) with "relation/column already exists."

Local development:

```bash
npm run db:generate        # prisma generate
npm run db:migrate:dev     # apply/create migrations locally (prisma migrate dev)
```

Production (via `vercel.json`):

```bash
npm run db:generate
npm run db:migrate:deploy  # prisma migrate deploy — applies committed migrations only, never resets
```

`npm run db:push` still exists as a script for quick local prototyping
only — it is no longer used anywhere in the deployment path.

### Reproducible dependencies (`package-lock.json`)

**No `package-lock.json` exists, and one could not be honestly generated
in this environment.** A real lockfile requires resolving the full
dependency tree against the actual npm registry and recording each
package's exact resolved version and SHA-512 integrity hash — both
require network access this sandbox doesn't have. Fabricating one with
invented hashes would be worse than having none (it could fail `npm ci` or
silently misrepresent what was actually verified). **Run `npm install`
once, locally or in CI, and commit the resulting `package-lock.json`** —
after that, `npm ci` gives reproducible installs going forward.

## Vercel + Supabase setup

1. Create a Supabase project.
2. Copy the PostgreSQL connection strings: the **pooled** connection goes
   in `DATABASE_URL`, the **direct** (non-pooled) connection goes in
   `DIRECT_URL`.
3. Push this repository to GitHub, import into Vercel.
4. Copy `.env.example` to your Vercel project's environment variables.
5. Deploy — see "Database & migrations" above for what happens on first
   deploy and what to check beforehand.
6. Set `CRON_SECRET`. Vercel sends it back as `Authorization: Bearer
   <CRON_SECRET>` on scheduled invocations; the app verifies it. The
   endpoint authenticates correctly and does nothing else — it does not
   trigger scraping. Use `npm run scrape:once` or the authenticated scrape
   endpoint to actually scrape something.

### Vercel scraping limitation

Keep `USE_BROWSER_FALLBACK=false` on Vercel — unconsumed by any code path
yet; the fetcher only ever does normal HTTP fetching. `Snapshot.renderRequired`
is set as a best-effort heuristic flag for likely-JS-only pages, but
nothing currently acts on it.

## Local development

```bash
npm install
cp .env.example .env
npm run db:generate
npm run db:migrate:dev     # or: npm run db:push for quick prototyping only
npm run seed                # optional — dev-fixture competitor + prints a dev API key
npm run dev
```

Then check `curl http://localhost:3000/api/health`, and try a scrape:

```bash
curl -X POST http://localhost:3000/api/products/<productId>/sources/<sourceId>/scrape \
  -H "x-api-key: <the key npm run seed printed>"

curl http://localhost:3000/api/changes -H "x-api-key: <the key>"
```

### Scripts

```text
npm run dev               # local dev server (tsx watch)
npm run build             # tsc -p .
npm run start             # run the compiled build
npm run typecheck         # tsc --noEmit
npm test                  # node's built-in test runner (no test framework dependency)
npm run scrape:once       # scrapes every enabled source once, sequentially
npm run db:generate       # prisma generate
npm run db:migrate:dev    # create/apply a migration locally
npm run db:migrate:deploy # apply committed migrations — used in production
npm run db:push           # quick local prototyping only — NOT used in production anymore
npm run db:studio         # prisma studio
npm run seed              # dev fixtures only — refuses to run with NODE_ENV=production
```

## BYOK privacy model (for when AI is built)

None of the AI layer is implemented yet.

## API

Not implemented yet (the versioned public API):

```text
GET /api/v1/competitors
GET /api/v1/changes?limit=100
GET /api/v1/pricing?limit=200
GET /api/v1/trends?days=30
GET /api/v1/openapi.json
```

Currently working (all `x-api-key` / `Authorization: Bearer ...`
protected except health):

```text
GET  /api/health                                                 # process + database reachability
     /api/cron                                                    # CRON_SECRET-protected, still a no-op
POST /api/products/:productId/sources/:sourceId/scrape             # trigger a scrape
GET  /api/changes                                                    # list changes — Phase 3
GET  /api/pricing                                                      # list pricing observations — Phase 4
GET  /api/features                                                      # list feature observations — Phase 5
GET  /api/reviews                                                        # list reviews — Phase 6
GET  /api/review-topics                                                  # per-topic aggregates — Phase 6
POST /api/products/:productId/review-sources/:reviewSourceId/ingest        # ingest a review source — Phase 6
```

`GET /api/changes` query params: `product`, `source`, `category` (one of
the ten resolved `ChangeCategory` values), `from`/`to` (ISO date, filters
`detectedAt`), `limit` (default 25, max 100), `cursor` (from a previous
response's `pagination.nextCursor`). Response:

```json
{
  "data": [
    {
      "id": "...", "productId": "...", "sourceId": "...",
      "fromSnapshotId": "...", "toSnapshotId": "...",
      "category": "PRICING", "severity": "INFO", "confidence": 1.0,
      "summary": "Pricing page content changed. Visible text: 1 line added, 1 line removed.",
      "diff": { "fields": [...], "fieldsTruncated": false, "text": { "added": [...], "removed": [...] } },
      "evidenceText": "Source is configured with type PRICING.",
      "detectedAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "pagination": { "limit": 25, "nextCursor": "... or null" }
}
```

`GET /api/pricing` query params: `product`, `plan` (a `PricingPlan` id),
`from`/`to` (ISO date, filters `capturedAt`), `limit`/`cursor`. Returns raw
observation history (every captured price point, never overwritten), plan
joined in:

```json
{
  "data": [
    {
      "id": "...", "productId": "...",
      "plan": { "id": "...", "name": "Pro", "normalizedName": "pro", "active": true },
      "price": 29, "currency": "USD", "billingPeriod": "MONTHLY", "unit": null,
      "isCustomPricing": false, "limits": [...], "includedFeatures": [...],
      "observationKey": "MONTHLY|NONE|PAID",
      "sourceId": "...", "snapshotId": "...", "evidenceText": "$29/month",
      "extractionMethod": "regex-line-match", "capturedAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "pagination": { "limit": 25, "nextCursor": "... or null" }
}
```

`GET /api/features` query params: `product`, `status` (`ACTIVE`/
`REMOVED`/`UNCERTAIN`), `feature` (a `Feature` id), `from`/`to` (filters
`lastSeenAt`), `limit`/`cursor`:

```json
{
  "data": [
    {
      "id": "...", "productId": "...",
      "feature": { "id": "...", "canonicalName": "sso", "aliases": ["SSO"] },
      "status": "ACTIVE", "confidence": 0.8,
      "firstSeenAt": "2026-01-01T00:00:00.000Z", "lastSeenAt": "2026-01-10T00:00:00.000Z",
      "sourceId": "...", "snapshotId": "...", "evidenceText": "SSO"
    }
  ],
  "pagination": { "limit": 25, "nextCursor": "... or null" }
}
```

`GET /api/reviews` query params: `product`, `source`, `sentiment`
(`POSITIVE`/`NEUTRAL`/`NEGATIVE`/`MIXED`), `topic` (one of the 12 topic
keys), `minRating`/`maxRating` (0–5), `from`/`to` (filters `publishedAt`),
`limit` (default 25, **max 50**), `cursor`. Ordered by `collectedAt` (not
`publishedAt`, which is nullable — cursor pagination over a nullable sort
key is a correctness trap). Each review includes `sentiment`
`{label, score, confidence}` and `topics` with `matchedTerms` as evidence;
the internal dedup fingerprint is never returned. Invalid params → `400
{error:{code,message}}`.

`GET /api/review-topics` query params: `product`, `source`, `from`/`to`,
`limit` (max 50). Returns `{topic:{key,label}, reviewCount, totalMentions,
averageSentiment}` per topic.

The scrape endpoint's response shape adds two Phase 4/5 count fields:

```json
{
  "sourceId": "...", "snapshotId": "...", "finalUrl": "https://...",
  "httpStatus": 200, "contentHash": "sha256 hex", "contentChanged": true,
  "previousSnapshotId": "... or null", "changeId": "... or null",
  "category": "... or null", "pricingPointsExtracted": 2,
  "featuresExtracted": 5, "durationMs": 1234
}
```

## Review sources

Not implemented yet.

## License

MIT. See `LICENSE`.
