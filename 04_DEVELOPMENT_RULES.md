# Competitive Intelligence OS --- Development Rules

## 1. Build a Real Product

Do not create fake data, fake metrics, fake integrations, placeholder
intelligence, or UI that implies unsupported functionality.

## 2. Source of Truth

Written project specifications are authoritative. Existing code is
reference material. When code conflicts with documentation, identify the
conflict and follow the written specification unless explicitly
instructed otherwise.

## 3. AI-Optional

Never make AI mandatory for scraping, snapshots, diffs, pricing,
features, reviews, sentiment, topics, trends, or deterministic reports.

## 4. No Hidden Paid Dependencies

Do not introduce paid scraping, AI, proxy, or enrichment services unless
explicitly requested. Optional integrations must be replaceable.

## 5. Code Quality

Use TypeScript strict mode, clear modules, explicit types, focused
functions, meaningful names, and predictable errors. Avoid giant files,
duplicated logic, unnecessary abstractions, and unjustified `any`.

## 6. Pure Intelligence Functions

Core intelligence functions should accept data and return data without
requiring a browser, database, network, or AI API.

Examples: - `normalizeHtml(html)` - `diffSnapshots(previous, current)` -
`extractPricing(document)` - `extractFeatures(document)` -
`analyzeSentiment(text)` - `calculateTrend(observations)`

## 7. Evidence First

Important intelligence must have evidence such as source URL,
snapshot/review/change ID, timestamp, original text, extracted value,
and extraction method.

## 8. Avoid False Precision

Do not claim certainty when extraction is ambiguous, causation without
evidence, or broad conclusions from tiny samples. Expose confidence,
sample size, source count, methodology, and limitations.

## 9. Ethical Scraping

Respect applicable source rules, robots directives where appropriate,
terms, rate limits, licensing, and privacy. Do not bypass
authentication, paywalls, CAPTCHAs, anti-bot controls, or other access
restrictions.

## 10. SSRF Security

Treat all user-supplied URLs as hostile. Validate protocols, block
private/loopback/link-local/metadata targets, validate redirects,
perform safe DNS/IP checks, and enforce timeout and size limits.

## 11. Secrets

Never commit, expose, log, or unnecessarily persist API keys, cookies,
authorization headers, or other secrets.

## 12. Database

Use migrations. Avoid casual destructive schema changes. Add indexes for
foreign keys, timestamps, competitor/source IDs, and common filters. Use
transactions for multi-record logical operations.

## 13. Idempotency

Scheduled jobs may run twice. Prevent duplicate snapshots, reviews,
changes, alerts, and reports through fingerprints and unique
constraints.

## 14. Error Handling

Catch errors at proper boundaries, log safe metadata, return structured
API errors, and never expose secrets or internal stack traces to users.

## 15. Logging

Useful logs include job/source/competitor IDs, duration, status, and
error category. Never log API keys, cookies, authorization headers, or
unnecessary personal data.

## 16. API

Validate input, authenticate, authorize resources, paginate, rate-limit
where appropriate, version endpoints, and return consistent errors.

## 17. Frontend

The UI must feel like a production SaaS application with consistent
spacing, responsive layout, accessible controls, useful
loading/empty/error states, keyboard support, readable tables, and
meaningful charts. Avoid fake dashboards, excessive animation, and
placeholder lorem ipsum.

## 18. UX

Users should understand what is monitored, when it was scanned, what
changed, why it matters, what evidence supports it, and whether the
result is deterministic or AI-generated.

## 19. AI Safety

AI output is untrusted generated content. Validate structure, enforce
timeouts and output limits, identify provider/model, preserve evidence
references, distinguish AI interpretation from deterministic findings,
and never silently alter source data.

## 20. Provider Abstraction

Do not scatter Gemini/OpenAI/Anthropic/OpenRouter calls throughout the
application. Use a common provider interface.

## 21. No-AI Fallback

Without an AI provider, the dashboard, reports, trends, pricing, feature
intelligence, and review intelligence must continue to work. The AI
section should explain configuration instead of breaking.

## 22. Development Workflow

Before coding: 1. Inspect repository. 2. Inspect schema. 3. Inspect API.
4. Inspect frontend. 5. Identify reusable code. 6. Identify broken
assumptions. 7. Produce an implementation plan.

During coding: 1. Implement one coherent phase. 2. Update
schema/migrations. 3. Update tests. 4. Update documentation. 5. Verify
build. 6. Verify affected flows.

Do not rewrite the entire application unnecessarily.

## 23. Recommended Phase Order

1.  Foundation
2.  Crawling
3.  Change intelligence
4.  Pricing
5.  Features
6.  Reviews
7.  Trends
8.  Alerts and reports
9.  Public API
10. Optional AI
11. Frontend polish
12. Production audit

## 24. Verification

Do not say "done" because code was written. Run tests, type checking,
linting if configured, builds, important API checks, database checks,
and relevant UI flows. If the environment prevents a check, state
exactly what was not verified.

Never claim a build passed unless it actually passed.

## 25. Migration Rules

When changing schema: 1. Update Prisma schema. 2. Create migration. 3.
Verify migration. 4. Update queries. 5. Update tests. 6. Update
development fixtures if needed.

Avoid destructive migrations without approval.

## 26. Dependencies

Before adding a dependency, verify necessity, native alternatives,
target deployment compatibility, and whether an existing dependency can
do the job.

## 27. Browser Fallback

Do not make Playwright mandatory for Vercel. Use static fetching first
and browser rendering only when genuinely required and supported.
Degrade gracefully when unavailable.

## 28. Performance

Optimize database queries, crawl concurrency, response sizes, parsing,
trend aggregation, and dashboard requests. Avoid duplicate fetching and
use hashes to skip expensive work when content has not changed.

## 29. Documentation

Maintain README, environment setup, database setup, deployment guide,
crawler limitations, supported review sources, API documentation, AI
setup, and troubleshooting. Documentation must match actual
implementation.

## 30. Final Quality Standard

The system should be functional, secure, evidence-driven, AI-optional,
maintainable, testable, deployable, and visually polished.

Priority: 1. Correctness 2. Security 3. Evidence quality 4. Reliability
5. Maintainability 6. Performance 7. UX polish

When a robust implementation and a shortcut are possible, choose the
robust implementation.
