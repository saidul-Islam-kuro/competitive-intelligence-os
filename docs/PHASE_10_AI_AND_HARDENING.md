# Phase 10 — Optional AI Research Assistant and Final Engine Hardening

## Goal
Add optional evidence-grounded AI interpretation and finish a production-readiness audit of the engine. The deterministic product must continue working when AI is disabled or every provider fails.

## First inspect
Review actual Phase 7–9 outputs, provider/environment conventions, source evidence models, API auth, logs, timeout handling, and deployment constraints. Do not assume those phases are complete merely because their docs say so.

## AI provider architecture
Create or complete one provider interface with isolated adapters for:
- Google Gemini
- OpenRouter
- OpenAI
- Anthropic

Use only providers/models available through documented APIs. Keep provider-specific request/response handling inside adapters. Avoid unnecessary dependencies and paid-only assumptions.

## BYOK and secret handling
- Prefer per-request user-supplied credentials when feasible; do not persist them by default.
- If stored configuration is required, encrypt secrets at rest using an explicit server-side encryption key and document rotation.
- Never log credentials, prompts containing secrets, or authorization headers.
- Validate provider URL/base URL to prevent SSRF if custom endpoints are supported.
- Add strict timeouts, input/output limits, retry bounds, and cost/usage safeguards.
- Treat provider responses as untrusted input; validate structured output.

## Evidence-first research
- Select real database evidence before calling an AI provider.
- Include evidence identifiers, URLs, timestamps, and factual excerpts in the prompt.
- Require the model to distinguish observed facts from hypotheses.
- Answers must reference evidence IDs from the supplied evidence set; reject or flag invented references.
- Do not allow AI to mutate canonical snapshots, prices, features, reviews, or trend calculations.
- Identify provider/model and make uncertainty/limitations visible.
- If AI is not configured or unavailable, return a clear actionable error and preserve all non-AI functionality.

## Research capabilities
Implement a bounded research endpoint that asks questions about the user's tracked competitors using evidence retrieved from the database. Apply authorization, input limits, rate/cost safeguards, and structured response validation. Do not implement an ungrounded general chatbot that invents market facts.

## Final hardening checklist
- URL/SSRF/redirect protection and request timeouts
- Authentication/authorization boundaries
- API key and webhook secret handling
- Input validation, response limits, rate limiting
- SQL/Prisma query efficiency and indexes
- transaction boundaries and idempotency
- cron and serverless execution limits
- log redaction and structured errors
- migration/deployment strategy
- environment validation and secure defaults
- dependency audit and reproducible lockfile
- honest README, API docs, setup guide, deployment guide, and VERIFY report

## Verification
Run tests, typecheck, lint if configured, build, Prisma validation/generation, migration checks, and relevant API integration tests. Use a real isolated test database for DB-dependent tests. Report anything that cannot be verified and why.

## Definition of done
AI is optional, evidence-grounded, secret-safe, tested, and isolated; core features work without AI; the production audit has a prioritized resolved/deferred findings list; documentation matches the implementation. Stop before frontend work.
