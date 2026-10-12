# Phase 7 — Cross-Competitor Trend Intelligence

## Goal
Build a deterministic trend engine over real persisted data from Phases 1–6. Do not add AI, reports, alerts, public API, or frontend work in this phase.

## First inspect
- `prisma/schema.prisma`, existing Trend/TrendProduct models and all migrations
- change, pricing, feature, and review persistence/query logic
- current API pagination/filter conventions
- test utilities and current `VERIFY.md`

Do not add duplicate models if existing schema models can support the use case. If schema changes are needed, create a proper migration and test it.

## Required inputs
Use actual observations from:
- detected changes and categories
- feature observations/lifecycle
- pricing points and pricing changes
- review topic observations and sentiment
Do not invent records or count missing observations as zero adoption without documenting the denominator.

## Trend types
At minimum, support deterministic trend types where real data exists:
1. Feature adoption across competitors
2. Increasing/decreasing review-topic frequency
3. Repeated pricing movements or packaging changes
4. Repeated change categories/keywords across competitors

Each trend should store or return:
- stable key/type and human-readable title/summary
- time window and computed-at timestamp
- number of relevant observations
- number of distinct competitors and sources
- current and previous window counts
- growth/absolute delta only when mathematically valid
- adoption/share denominator where applicable
- confidence/strength derived from documented deterministic rules
- evidence references to underlying changes, feature observations, pricing points, or reviews/topics
- limitations and minimum sample threshold

## Correctness rules
- Use explicit, consistent time windows (UTC internally).
- Handle zero previous-window baselines without infinite percentages; report absolute change or “newly observed” instead.
- Do not call correlation causation.
- Do not call a signal a market trend from one competitor or a tiny sample; enforce documented minimums.
- Deduplicate observations before aggregation.
- Make recomputation idempotent and deterministic.
- Keep expensive aggregations bounded and database queries indexed.
- Return empty states honestly when there is insufficient data.

## API
Add an authenticated trend read endpoint following the repository's established conventions, with filters, cursor/page pagination, stable sorting, validation, and consistent errors. Decide route shape after inspecting current conventions; document it in README/API docs. Do not create a second inconsistent API style.

## Tests
Cover:
- empty/sparse datasets
- one competitor versus multiple competitors
- current/previous time-window boundaries
- UTC/date edge cases
- zero baselines
- repeated/duplicate evidence
- feature adoption denominators
- trend recomputation/idempotency
- invalid filters, pagination, and authentication
- DB query behavior where a real test database is available

## Definition of done
- Real deterministic calculations and persistence/query path exist.
- Every displayed trend can be traced to evidence and calculation inputs.
- Tests, typecheck, build, Prisma checks, and available DB-backed tests run and results are documented.
- README and VERIFY accurately describe the implementation and limitations.
- Stop after Phase 7; do not begin Phase 8.
