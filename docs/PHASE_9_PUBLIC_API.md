# Phase 9 — Versioned Public Competitive Intelligence API

## Goal
Expose existing engine capabilities through a stable `/api/v1/*` API. Do not implement AI or the React + Vite frontend in this phase.

## First inspect
Review existing internal routes, API-key implementation, ApiKey schema, auth middleware, pagination helpers, error format, CORS configuration, and deployment routing. Reuse rather than duplicate working code.

## Requirements
Expose versioned endpoints for the supported, genuinely implemented resources, as appropriate:
- products/competitors
- sources
- changes
- pricing
- features
- reviews and review topics
- trends
- reports
- authorized scan triggers (only if safely supported)

Use consistent:
- API key authentication
- resource authorization
- input validation
- filtering and stable sorting
- pagination with documented limits
- structured machine-readable errors
- safe response serialization
- rate limits and request bounds
- OpenAPI specification and practical examples

Do not expose internal-only routes unintentionally. Never return key hashes, webhook secrets, raw credentials, stack traces, or internal database details. API keys should be displayed only at creation time, stored hashed, and revocable. Respect `PUBLIC_API_ENABLED` if that configuration is retained; define and test its exact behavior.

Do not promise per-key scopes unless they are actually implemented and enforced. Do not create fake endpoints for future features.

## Tests
Cover missing/invalid/revoked keys, disabled API behavior, authorization, pagination limits, invalid filters, unknown resources, error consistency, secret leakage, rate limiting, and representative endpoint integration tests against a real test DB when available.

## Definition of done
All documented endpoints exist and return real data, OpenAPI matches behavior, examples work, tests and build checks are documented, and Phase 10 has not started.
