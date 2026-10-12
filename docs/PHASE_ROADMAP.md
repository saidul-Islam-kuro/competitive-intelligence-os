# Phase Roadmap and Checkpoint

This document is a work queue, not evidence that any phase is complete. Update status only after inspecting code and running available verification.

## Current repository checkpoint
- Reported complete: Phases 1–6.
- Phase 6 scope: permitted review-source adapters, normalization, deduplication, deterministic lexicon sentiment, topic extraction, persistence, and review endpoints.
- Current limitations to verify: no `package-lock.json` is present in the supplied checkpoint; no `node_modules` are included; full typecheck/build and DB-backed tests must be run in a local environment with installed dependencies and a reachable test database.
- Existing `index.html` is the legacy vanilla-JS interface. It is not yet the final frontend and is not fully wired to all product functionality.
- Existing Prisma migration directories are present for foundation, pricing/features, and reviews. Validate them against the actual schema/database before deployment.
- `vercel.json` currently invokes `prisma migrate deploy` in the build command. Review whether migrations should run in a separate deployment/release step for the target hosting setup; do not change it without explaining the deployment implications.

## Phase 0 — Takeover audit (required before coding)
1. Inspect the full repository, current schema, migrations, routes, services, tests, and deployment configuration.
2. Install dependencies using the package manager supported by the repository and create/commit a lockfile only after successful installation.
3. Run unit tests, typecheck, build, Prisma validation/generation, and DB-backed tests where a test database is available.
4. Check Phase 6 ingestion routing, source permissions, dedupe correctness, sentiment/topic evidence, pagination, authentication, and migration consistency.
5. Write findings and fix only critical blockers before Phase 7.
6. Update `VERIFY.md` with commands actually run and exact results.

## Phase 7 — Cross-Competitor Trend Intelligence
See `docs/PHASE_7_TRENDS.md`.
Acceptance: deterministic trends built from actual persisted observations; evidence and calculation inputs are traceable; time windows, sample sizes, and minimum thresholds are explicit; no fake trends; API is authenticated and paginated/filtered; tests cover sparse data, duplicates, zero baselines, time boundaries, and idempotency.

## Phase 8 — Reports, Alerts, and Integrations
See `docs/PHASE_8_REPORTS_ALERTS.md`.
Acceptance: useful deterministic reports; configurable alert rules; idempotent alert creation; secure signed webhook delivery with timeout/retry limits and delivery records; no false claims of email delivery unless a real configured provider exists.

## Phase 9 — Public API
See `docs/PHASE_9_PUBLIC_API.md`.
Acceptance: `/api/v1/*` routes are real, authenticated, versioned, paginated, filtered, documented, rate-limited as appropriate, and tested. API keys are never stored or returned in plaintext after creation.

## Phase 10 — Optional AI and engine hardening
See `docs/PHASE_10_AI_AND_HARDENING.md`.
Acceptance: AI is optional, provider-specific logic is isolated, user-supplied keys are handled safely, AI outputs cite existing evidence, and the application remains functional when AI is unavailable. Complete a security/reliability audit and correct documentation before frontend work.

## Phase 11 — React + Vite frontend (do not start until engine sign-off)
Build a dedicated React + Vite + TypeScript frontend using the actual API contracts. It must have real routes/views, responsive navigation, typed API client, robust loading/empty/error states, filters, accessible interactions, and no fake production data. Preserve the engine/backend unless an integration defect is demonstrated. Do not turn the app into one long scrolling page.
