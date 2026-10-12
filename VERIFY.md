# Verification — Phases 1–6 (Foundation through Review Intelligence)

Only what was actually executed is reported as passed. Everything else is
NOT RUN, with the reason. This file is reorganized each phase to stay
navigable; earlier phases are condensed but nothing is dropped.

# CHECKPOINT: Phase 6 complete. Phases 7–10 NOT started.

Phase numbering (authoritative): 1 Foundation · 2 Scraping/Snapshots (2.1
hardening) · 3 Change Intelligence · 4 Pricing · 5 Features · **6 Review
Intelligence (done)** · 7 Cross-Competitor Trends · 8 Reports/Alerts/
Integrations · 9 Public `/api/v1` API · 10 Optional AI Research Assistant +
final hardening. **The next session resumes at Phase 7.**

## Phase 6 — what was actually run and passed

| Module | Tests | Result |
|---|---|---|
| `src/lib/reviews/normalizeReview.ts` | 9 | ✅ passed |
| `src/lib/reviews/dedupe.ts` | 10 | ✅ passed |
| `src/lib/reviews/sentiment.ts` (positive, negative, neutral, mixed, negation, intensifiers, diminishers, rating-as-support, rating-never-overrides, confidence) | 16 | ✅ passed — **caught a real bug in this module** (below) |
| `src/lib/reviews/topics.ts` | 9 | ✅ passed |
| `src/lib/reviews/adapters.ts` (real local HTTP server; malformed feed data; **SSRF-blocked-by-default**) | 11 | ✅ passed |
| `src/lib/http/queryParams.ts` (validation, **bounded pagination**, date boundaries) | 10 | ✅ passed |
| `src/services/ingestReviews.ts` (via the in-memory fake tx, which **mirrors the real DB unique constraints** so a dedup bug throws instead of silently passing) | 14 | ✅ passed |
| **Phase 6 new tests** | **79** | ✅ **79/79** |
| Carried forward from Phases 1–5 | 251 | ✅ 251/251 |
| **Full suite** | **331 tests** | **330 passed; 1 test file (htmlParser) NOT RUN** |
| `src/lib/parser/htmlParser.test.ts` | 11 | ❌ NOT RUN — `Cannot find module 'cheerio'` (unchanged environment limitation) |

Run with `node --import tsx --test "src/**/*.test.ts"` (sandbox's global tsx).

**Real bug found and fixed (sentiment):** `score = (pos − neg) / (pos + neg)`
is invariant to a lone word's weight (a single negative match scores −1 at
weight 1 *or* 1.6), so "extremely disappointing" == "disappointing". Caught
by the intensifier/diminisher tests failing; fixed with a damping constant.

**The nullable-unique trap (Phase 6.3), verified:** with no externalId and
no URL, re-ingesting identical content produces one review (fingerprint),
not two — tested against a fake that enforces the real constraints. A shared
listing-page URL, or one equal to the source's own URL, is *not* treated as a
permalink (otherwise many distinct reviews would collapse into one) — also
tested.

## Phase 6 — NOT RUN / unverified here

- `src/services/ingestReviewSource.ts`, `src/routes/reviews.ts`,
  `src/routes/reviewSources.ts`, `src/app.ts` — probe-confirmed to fail only
  on `Cannot find module '@prisma/client'` / `'express'`; never a syntax
  error. `ingestReviews.ts` (the logic they call) loads and runs for real.
- `tests/reviews.test.ts` — needs `@prisma/client` + a real Postgres + express.
- Migration `20260103000000_phase6_reviews` — hand-authored, cross-checked
  against `schema.prisma` by hand, **not** validated by Prisma or a database.
- `npm install`, `db:generate`, `db:migrate:dev`, `typecheck`, `build`, `lint`
  — **NOT RUN**: no network (registry 403), no Postgres, wrong global TS,
  no lint configured. `package-lock.json` — **NOT generated** (needs the
  registry).
- Query-validator code is duplicated in the older changes/pricing/features
  routes (they weren't refactored onto `queryParams.ts` to avoid touching
  working Phase 3–5 routes) — a noted cleanup item.
- Concurrency: review dedup is check-then-insert in one (non-serializable)
  transaction. externalId/fingerprint duplicates are caught by DB unique
  constraints; permalink-only duplicates under truly concurrent ingests are
  not (deliberately no unique index on `sourceUrl`).

## Phase 6 — limitations (honest)

Only two generic adapters exist; **no platform-specific adapters**, by
design. Lexicon sentiment misses sarcasm/slang/non-English. Topic sentiment
is the review's overall sentiment, not per-sentence. The ingest endpoint
fetches through the real SSRF policy, so a local/loopback feed can only be
ingested via the service-level test hook, never the route. Max 200 reviews
per ingest call (bounded for serverless).

---

## Environment constraints (unchanged across every phase — read first)

This sandbox has **no network access**. Consequences, true in every phase
so far:
- `express`, `cors`, `dotenv`, `cheerio`, `@prisma/client`, `prisma` are
  **not installed** and could not be installed (npm registry returns 403).
- The only TypeScript compiler available is a global `typescript@6.0.3`
  with no `@types/node` — wrong major version vs. this project's pinned
  `^5.6.2`, can't resolve the project's own type dependencies.
- `prisma generate`/`validate`/`migrate dev`/`migrate deploy` could not
  run (no CLI, no network, no reachable Postgres instance).
- No lint configured. No `package-lock.json` (can't honestly generate one
  without registry access — see README's "Reproducible dependencies").

## Phase 4 + 5: what was actually run and passed

**A genuinely new, stronger verification result this phase:** the two
persistence services (`persistPricing.ts`, `persistFeatures.ts`) use
`import type { Prisma }` — a type-only import, fully erased at compile
time — so they have **zero runtime dependency on `@prisma/client`**.
Built a narrow in-memory fake Prisma transaction client
(`src/services/testUtils/fakePrismaTx.ts`, documented as test-only, not a
general Prisma emulation) and wrote real, executing tests against the
actual idempotency and conservative-lifecycle logic — not just a
parse-check. This is real coverage of exactly the two things this phase
cared about most: idempotency and conservative lifecycle rules.

| Module | Tests | Result |
|---|---|---|
| `src/lib/pricing/currency.ts` | 4 | ✅ passed |
| `src/lib/pricing/parseNumber.ts` | 3 | ✅ passed |
| `src/lib/pricing/planIdentity.ts` | 5 | ✅ passed |
| `src/lib/pricing/limits.ts` | 7 | ✅ passed |
| `src/lib/pricing/extractPricing.ts` (incl. every example pattern from the spec: `$10/month`, `€29/mo`, `USD 49/month`, `£20 per user/month`, free, custom, "Save $100" rejection, "Starting at $20" approximate-flagging, multi-plan, multi-currency, limits/features section-scoping) | 25 | ✅ passed — **caught and fixed 3 real bugs in this module itself during testing** (see below) |
| `src/lib/pricing/comparePricing.ts` | 16 | ✅ passed |
| `src/lib/pricing/planLifecycle.ts` | 6 | ✅ passed |
| `src/lib/pricing/pricingHistory.ts` | 6 | ✅ passed |
| `src/lib/features/normalizeFeature.ts` | 5 | ✅ passed |
| `src/lib/features/extractFeatures.ts` | 14 | ✅ passed |
| `src/lib/features/featureLifecycle.ts` (incl. the CRITICAL non-authoritative-source test) | 8 | ✅ passed |
| `src/services/persistPricing.ts` (real, via fake tx — idempotency, "Pro"/"PRO"/"Pro Plan" merging, disappearance scoping) | 10 | ✅ passed |
| `src/services/persistFeatures.ts` (real, via fake tx — idempotency, conservative lifecycle wiring, source scoping) | 10 | ✅ passed |
| Carried-forward Phases 1–3 suites (env, errors, apiKey, ipRange, ssrf, httpFetcher, normalizeContent incl. new `listItems` tests, contentHash, textDiff, structuralDiff incl. new `listItem` field, classifyChange) | 161 | ✅ passed |
| **Total** | **251** | **✅ 251/251 passed, for real** |
| `src/lib/parser/htmlParser.ts` | 11 | ❌ NOT RUN — `Cannot find module 'cheerio'` (confirmed via direct probe) |

Run via `node --import tsx --test "src/**/*.test.ts"` using this
sandbox's global `tsx`; the shipped `npm test` resolves `tsx` normally
from `node_modules` once `npm install` has run.

### Three real bugs found and fixed in `extractPricing.ts` during testing

1. **"Team" was in the non-plan-heading denylist**, rejecting the
   extremely common plan name "Team" (meant to catch "Our Team"/"Meet the
   Team" about-page headings; the bare word was too broad). Fixed by
   replacing with the specific phrases.
2. **Regex group ordering bug**: "`per`" in "per user/month" was
   consumed by the generic separator alternative before the unit group
   got a chance to match "per user", leaving "user/month" unmatched.
   Fixed by checking the unit group first with a negative lookahead on
   the separator.
3. **Confidence boundary**: an approximate ("Starting at") match with
   full currency+period evidence computed to exactly 0.7, not strictly
   below the "confident" threshold the test (correctly) expected. Fixed
   the approximate penalty.

All three were caught by the test suite failing, not discovered by
inspection — exactly what the tests are for.

## What was written but NOT verified here

- `src/lib/parser/htmlParser.ts` and its tests (needs cheerio) —
  confirmed via probe to fail only on the missing module.
- `src/services/scrapeSource.ts`, `src/routes/{sources,changes,pricing,
  features}.ts`, `src/app.ts`, `prisma/seed.ts`, `src/scheduler/runOnce.ts`
  — each confirmed via direct import probe to fail ONLY on
  `Cannot find module '@prisma/client'` / `'express'` — never a syntax or
  reference error.
- `tests/{scrapeSource,sources,changes,pricing,features}.test.ts` — need
  `@prisma/client` **and** a real, reachable Postgres database. Same
  probe-confirmed parse-clean status.
- Both migration files — cross-checked by hand against `schema.prisma`
  (every model's columns, every `@@index`/`@@unique`, every
  `@relation(fields:...)` counted and matched against the SQL's `FOREIGN
  KEY` constraints for migration 1 — 19/19 tables, 7/7 enums, 21/21 FKs).
  This is careful manual review, **not** validation by Prisma's engine or
  a real database — each migration's own header says so prominently.
- `npm run typecheck` / `npm run build` — same environment gap as every
  prior phase.
- Any lint pass (still none configured).
- Any live HTTP round-trip against a running server + live database for
  the pricing/features endpoints.

**Before deploying or building further on this:** run
`npm install && npm run db:generate && npm run db:migrate:dev && npm run typecheck && npm test && npm run build`
against a real `DATABASE_URL`, and treat everything above as unconfirmed
until that's done.

## Database changes (Phase 4 + 5, all additive/widening — no real data existed to migrate)

New migration: `prisma/migrations/20260102000000_phase4_5_pricing_features/`
- `Snapshot.listItems` (new `Json?` column)
- `PricingPlan.normalizedName` (new column) + `@@unique([productId, normalizedName])`
- `PricingPoint.observationKey`, `.extractionMethod` (new columns) +
  `@@unique([pricingPlanId, snapshotId, observationKey])`
- `FeatureObservation`: `@@unique([featureId, productId])` (no new columns)

`Feature`/`FeatureObservation`/`PricingPlan`/`PricingPoint` models
**reused as-is** otherwise, per the instructions — no model recreation.

## Idempotency — verified directly, with the honest nuance carried forward

Pricing and feature idempotency are now tested for REAL against actual
upsert logic (via the fake tx), not just asserted. The same nuance from
Phase 3 still applies structurally: `scrapeSource.ts`'s normal single-call
path always creates a fresh snapshot, so the unique-constraint collision
is exercised by direct re-processing calls (as the tests do) and by any
future reprocessing/backfill path, not by calling the public scrape
endpoint twice in immediate succession against unchanged content (which
instead correctly produces zero new pricing/feature writes a different
way — `contentChanged` stays false, so extraction doesn't even run).

## Phase 4 scope — implemented

- [x] Deterministic extraction: currency symbols/codes, monthly/yearly,
      per-user, free, custom/contact-sales, "starting at" (flagged
      approximate), limits ("Up to N X"), included features
- [x] Stable plan identity (conservative normalization)
- [x] Full price history, never overwritten; monthly/yearly as separate
      series
- [x] Deterministic comparison: price/currency/billing/unit/limit/
      feature deltas; zero-base, missing-price, and cross-currency deltas
      explicitly skipped with a reason
- [x] Conservative, source-scoped plan-disappearance detection
- [x] Idempotent persistence (verified directly)
- [x] `GET /api/pricing`
- [x] Pipeline integration, gated on `contentChanged`

## Phase 5 scope — implemented

- [x] Deterministic extraction from headings + short list items only
      (never paragraph prose)
- [x] Conservative aliasing (case/punctuation/pluralization only)
- [x] Reuses `Feature`/`FeatureObservation` as designed (global canonical
      Feature, no new models)
- [x] Conservative lifecycle: observed → ACTIVE; missing + authoritative
      source → UNCERTAIN; missing + non-authoritative source → UNCHANGED
      (never REMOVED from this); explicit removal evidence → REMOVED
      (mechanism exists, nothing currently supplies that evidence — see
      README's "What Phases 4/5 still deliberately do NOT do")
- [x] Idempotent persistence (verified directly), source-scoped lifecycle
      reconsideration
- [x] `GET /api/features`
- [x] Pipeline integration, gated on `contentChanged`

## Infra fix found while building Phase 4/5 (not a Phase 2.1 bug)

`htmlParser.ts`'s visible-text extraction never inserted line breaks
between block-level elements (cheerio's `.text()` is plain
`textContent`-style concatenation). Harmless before Phase 4 (hashing/
diffing only need consistency, not line structure); pricing/feature
extraction need headings on their own line to anchor a price/feature to
the right section. Fixed by inserting a newline after every block-level
element. Also added list-item (`<li>`) extraction as a new structural
signal, which now participates in `contentHash` (necessary so a
feature-list-only change isn't invisible to the `contentChanged` gate
pricing/feature extraction run on).

## Explicitly out of scope for Phase 4/5 (per instructions) — NOT implemented

- [ ] AI, LLM-based extraction
- [ ] Review ingestion, sentiment, cross-competitor trends, reports, alerts
- [ ] Browser automation
- [ ] Frontend changes (index.html untouched)
- [ ] European-style numeric formats ("1.234,56") — documented limitation
- [ ] Table-based pricing/feature layout extraction — documented scope boundary
- [ ] DNS-rebinding TCP pinning (carried-forward documented limitation)
