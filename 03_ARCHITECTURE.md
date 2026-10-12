# Competitive Intelligence OS --- Architecture

## 1. Goals

The architecture should be modular, type-safe, database-backed,
Vercel-deployable, Supabase-compatible, self-hostable, AI-provider
agnostic, secure, observable, and testable.

## 2. Recommended Stack

-   Frontend: Next.js or React + TypeScript + Tailwind
-   Backend: TypeScript, native fetch, Cheerio
-   Database: PostgreSQL + Supabase + Prisma
-   Deployment: Vercel + Supabase + Vercel Cron
-   Browser fallback: optional, isolated, and not required for standard
    Vercel deployment

## 3. High-Level Architecture

``` text
Dashboard
   |
API Layer
   |
+-------------------+-------------------+
|                   |                   |
Crawler          Intelligence        AI Adapter
|                   |                   |
+-------------------+-------------------+
                    |
             PostgreSQL / Prisma
                    |
                 Supabase
```

## 4. Suggested Project Structure

``` text
/
├── app/
│   ├── dashboard/
│   ├── competitors/
│   ├── changes/
│   ├── pricing/
│   ├── features/
│   ├── reviews/
│   ├── trends/
│   ├── reports/
│   ├── ai/
│   ├── alerts/
│   ├── api/
│   └── settings/
├── components/
│   ├── ui/
│   ├── charts/
│   ├── tables/
│   ├── evidence/
│   └── dashboard/
├── lib/
│   ├── db/
│   ├── crawler/
│   ├── parser/
│   ├── normalizer/
│   ├── diff/
│   ├── pricing/
│   ├── features/
│   ├── reviews/
│   ├── sentiment/
│   ├── topics/
│   ├── trends/
│   ├── reports/
│   ├── alerts/
│   ├── ai/
│   ├── security/
│   └── utils/
├── prisma/
├── tests/
├── public/
├── scripts/
└── documentation/
```

## 5. Database

Core models should include: - User / Workspace / WorkspaceMember where
multi-tenancy is used - Product - Source - Snapshot - Change -
PricingPlan - PricingPoint - Feature - FeatureObservation -
ReviewSource - Review - ReviewTopic - ReviewTopicObservation - Trend -
Evidence - AlertRule - AlertDelivery - Report - ApiKey

Use timestamps, foreign keys, appropriate indexes, and unique
constraints for idempotency.

## 6. Relationships

``` text
Workspace
 ├── Products
 │    └── Sources
 │         └── Snapshots
 │              └── Changes
 ├── Pricing observations
 ├── Feature observations
 ├── Reviews
 │    └── Topics
 ├── Trends
 ├── Reports
 └── Alert rules
```

## 7. API

Version endpoints such as: `/api/v1/products` `/api/v1/sources`
`/api/v1/snapshots` `/api/v1/changes` `/api/v1/pricing`
`/api/v1/features` `/api/v1/reviews` `/api/v1/trends` `/api/v1/reports`
`/api/v1/scans`

Use consistent pagination and errors.

Example response:

``` json
{
  "data": [],
  "pagination": {"page": 1, "limit": 50, "total": 0}
}
```

Example error:

``` json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "A valid source URL is required."
  }
}
```

## 8. Authentication

Support dashboard sessions, API keys, and cron secrets. API keys should
be shown once, hashed where practical, revocable, and optionally scoped.
Never log raw credentials.

## 9. SSRF Protection

For every user-supplied URL: - allow HTTP/HTTPS only - reject localhost
and loopback - reject private/link-local ranges - reject cloud metadata
endpoints - validate DNS/IP - validate every redirect - limit
redirects - enforce timeout

## 10. Crawler Safety

Use response-size limits, timeouts, concurrency limits, retries,
content-type checks, redirect limits, and rate limiting. Do not download
arbitrary executable files.

## 11. Vercel

Keep serverless work short-lived. Crawl limited sources per invocation,
store state in PostgreSQL, use cron to schedule work, and split larger
jobs. Provide an external worker mode for larger installations.

## 12. Scheduler

A scan should identify due sources, create job state, crawl, normalize,
compare, extract intelligence, store evidence, evaluate alerts, deliver
notifications, and update status.

Design jobs to be idempotent.

## 13. AI Provider Abstraction

Use a common interface:

``` ts
interface AIProvider {
  generate(input: AIRequest): Promise<AIResponse>
}
```

Implement adapters for Gemini, OpenRouter, OpenAI, and Anthropic.
Provider-specific code must stay inside adapters.

## 14. AI Data Flow

``` text
Database Evidence
      ↓
Evidence Selector
      ↓
Structured Prompt
      ↓
Provider Adapter
      ↓
Validated AI Output
      ↓
Research UI / Report
```

AI output is an interpretation layer and must not overwrite
deterministic records.

## 15. Frontend

Reusable components should include AppShell, Sidebar, Topbar, StatCard,
CompetitorCard, ChangeTable, ChangeDetail, PricingTable, FeatureMatrix,
ReviewTable, SentimentChart, TrendChart, EvidencePanel, ReportViewer,
AIResearchPanel, and AlertRuleEditor.

Support desktop, tablet, mobile, keyboard navigation, accessible
contrast, loading, empty, and error states.

## 16. Data Fetching

Prefer server-side fetching where appropriate, typed API clients,
caching, pagination, URL-based filters, and safe optimistic updates. Do
not duplicate business logic in UI components.

## 17. Observability

Track crawl duration/errors, HTTP status, parser errors, change counts,
extraction failures, scheduled job failures, alert delivery failures,
and API latency.

Provide `/api/health` without exposing secrets.

## 18. Environment

Provide `.env.example` containing concepts such as:

``` text
DATABASE_URL
DIRECT_URL
CRON_SECRET
SESSION_SECRET
AI_PROVIDER
AI_API_KEY
AI_MODEL
AI_BASE_URL
USE_BROWSER_FALLBACK
SCRAPE_TIMEOUT_MS
SCRAPE_MAX_BYTES
```

## 19. Testing

Unit-test parser, normalizer, diff, pricing, sentiment, trends, and
security. Integration-test database, scan pipeline, API, and alerts.
E2E-test core user flows.

## 20. Deployment

Document Supabase setup, database migration, Vercel variables,
deployment, cron, initial account/workspace, competitor setup, and first
scan.

AI must not be required for deployment.

## 21. Scalability

For larger installations use queues, workers, batching, safe caching,
indexes, raw-content retention policies, and periodic trend aggregation.

## 22. Source of Truth

Database evidence is authoritative. Frontend is presentation. AI is
interpretation. AI output must never replace deterministic evidence.
