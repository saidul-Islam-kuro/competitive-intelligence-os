# Competitive Intelligence OS — Agent Instructions

## Mission
Continue the existing Competitive Intelligence OS repository from the Phase 6 checkpoint. Build a reliable, self-hostable, algorithm-first competitive intelligence product. The deterministic engine must work without an AI provider or paid service. AI is optional and evidence-grounded.

## Source of truth
Read these files before implementation:
1. `01_PRODUCT_SPEC.md`
2. `02_INTELLIGENCE_ENGINE.md`
3. `03_ARCHITECTURE.md`
4. `04_DEVELOPMENT_RULES.md`
5. `README.md`
6. `VERIFY.md`
7. `docs/PHASE_ROADMAP.md` and the phase-specific brief for the current task

The repository code and migrations are the implementation truth. Do not assume that documentation or prior agent claims prove a feature works. If specs conflict with the existing implementation, report the conflict and choose the smallest safe path; do not silently rewrite architecture.

## Current checkpoint
The supplied repository is reported as Phase 6 complete (Review Intelligence). The next intended work is:
- Phase 7: cross-competitor trend intelligence
- Phase 8: deterministic reports, alert rules, webhook delivery and integrations
- Phase 9: versioned public API
- Phase 10: optional AI research assistant and final engine hardening
- After the engine is audited and verified: separate React + Vite + TypeScript frontend project within this repository (not a one-page scrolling dashboard)

Treat this status as a claim to verify, not a guarantee.

## Non-negotiable principles
- Do not replace real functionality with hardcoded mock data or fake success responses.
- Do not claim a test, build, migration, or deployment passed unless it was actually run and passed.
- Keep the deterministic core usable with all AI environment variables unset.
- No mandatory paid API, scraper, proxy, or enrichment service.
- Respect source terms, rate limits, privacy, and access restrictions. Never bypass paywalls, authentication, CAPTCHAs, or anti-bot controls.
- Treat every user-supplied URL as hostile. Preserve SSRF protection and validate redirects.
- Never log or commit secrets, tokens, authorization headers, or raw API keys.
- Use Prisma migrations for schema changes. Do not use `prisma db push` in production.
- Preserve the existing repository, working behavior, API contracts, and migration history unless a verified defect requires a change.
- Keep pure deterministic intelligence logic separated from HTTP, database, and AI-provider code.
- Every meaningful finding should be traceable to source/evidence, timestamp, extraction method, and confidence/limitations where appropriate.
- Do not make a feature appear available in the UI/API until the underlying behavior exists.
- Keep Vercel/serverless limits in mind. Browser automation must not be required for the default Vercel path.
- Future frontend choice is React + Vite + TypeScript. Do not start frontend reconstruction during Phases 7–10 unless explicitly asked.

## Required workflow for every task
1. Inspect the current implementation and relevant tests before editing.
2. State a short plan and list the exact files expected to change.
3. Implement only the requested phase/task. Do not silently start the next phase.
4. Add/update tests for success cases, edge cases, idempotency, invalid input, authorization, and failure paths.
5. Update Prisma schema and add a migration if schema changes are required.
6. Update README/VERIFY and relevant phase docs so they accurately reflect reality.
7. Run applicable tests, typecheck, lint if configured, build, Prisma validation/generation/migration checks, and API/database checks where possible.
8. If a check cannot run, explain the exact reason and give the command needed to run it locally. Never label an unrun check as passed.
9. End with: changed files, behavior implemented, commands actually run, pass/fail results, environment limitations, remaining risks, and the next recommended step.

## Scope control
- Do not combine multiple phases into one huge implementation unless explicitly instructed.
- Do not do broad refactors, framework migrations, or unrelated cleanup while implementing a phase.
- If the context or Copilot Free allowance is running low, stop at a safe checkpoint, update `VERIFY.md` and the relevant phase status, and provide a concise handoff.
- If a task reveals a blocker in an earlier phase, stop and report it before building dependent functionality.
