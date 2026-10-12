# Phase 8 — Reports, Alerts, and Integrations

## Goal
Implement evidence-backed deterministic reports, configurable alert rules, and secure webhook integrations. Do not implement the public API, AI provider layer, or frontend redesign in this phase.

## First inspect
Review current Report, AlertWebhook, AlertDelivery and related schema, migrations, existing trend/change/pricing/feature/review services, authentication, cron route, and scheduler. Reuse existing models where appropriate; migrate safely if a schema change is necessary.

## Reports
Implement deterministic reports from actual persisted evidence, including relevant sections such as:
- report scope, period, and selected competitors
- key changes
- pricing movements
- feature adoption
- review sentiment/topics
- trends (only if Phase 7 produces sufficient data)
- methodology, sample size, evidence references, generated-at timestamp, and limitations

Support machine-usable JSON and useful Markdown/HTML output where appropriate. Persist report metadata/content only if that matches the current schema and use case. Do not imply AI authored a report when it did not. No PDF requirement unless justified and implemented.

## Alerts
Support configurable rules for real events such as:
- pricing changes
- high-impact feature/change events
- review topic/sentiment thresholds when sufficient data exists
- trend threshold crossings
- repeated source/scan failures if reliable scan state exists

Rules must be validated and deterministic. Prevent duplicate alerts using a stable idempotency key. Do not repeatedly fire on every scheduled run for the same unchanged condition. Record why a rule matched and the evidence used.

## Webhooks/integrations
- Use HTTPS by default; explicitly document any local-development exception.
- Validate destinations and protect against SSRF, including redirects.
- Sign payloads with HMAC using a strong secret.
- Store webhook signing secrets encrypted at rest if the application must retrieve them later; never log them.
- Use bounded request timeouts, response-size limits, retries with backoff, and retry limits.
- Persist delivery attempts/status/timestamps and sanitized failure reasons.
- Avoid infinite retries and duplicate deliveries.
- Never claim email delivery unless a real provider is configured and implemented.

## API and cron
Follow existing auth conventions. Cron routes must verify `CRON_SECRET`; user-facing rule management must require the appropriate API key/auth. Ensure expensive work is bounded for Vercel/serverless.

## Tests
Cover rule matching/non-matching, threshold boundaries, duplicate suppression, payload signing verification, invalid/blocked URLs, redirects, timeouts, retry policy, delivery records, report evidence correctness, serialization, authorization, and failure handling.

## Definition of done
Reports and alerts use actual persisted data, webhooks are secured and observable, tests/typecheck/build/migration checks are run where possible, docs are accurate, and Phase 9 has not started.
