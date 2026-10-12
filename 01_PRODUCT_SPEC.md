# Competitive Intelligence OS --- Product Specification

## 1. Product Overview

Competitive Intelligence OS is a self-hostable, SaaS-ready competitive
research platform for tracking software products and turning public
product information into structured competitive intelligence.

The defining principle is **algorithm-first, AI-optional**. The core
product must remain useful without an AI API key. AI is an enhancement
layer for interpretation, synthesis, natural-language research, and
report writing.

## 2. Primary Users

-   Product and growth teams
-   Founders and small teams
-   Researchers and analysts
-   Developers and self-hosters

## 3. Core Workflow

1.  Add competitor products.
2.  Add URLs/pages to monitor.
3.  Configure permitted review sources.
4.  Run manual or scheduled scans.
5.  Fetch and normalize sources.
6.  Store historical snapshots.
7.  Detect and classify changes.
8.  Extract pricing and features.
9.  Analyze reviews deterministically.
10. Aggregate cross-competitor trends.
11. Generate reports.
12. Configure alerts/webhooks.
13. Query intelligence through the API.
14. Optionally connect an AI provider.

## 4. Core Entities

### Product

Represents tracked competitor software.

### Source

Represents a monitored URL or review source. Support source types such
as homepage, pricing, product, feature, changelog, documentation, blog,
comparison, review, and custom.

### Snapshot

Stores the normalized representation of a source at a point in time.

### Change

Represents a difference between snapshots. Examples include text,
heading, link, pricing, feature, CTA, metadata, and plan changes.

### PricingPoint

Historical pricing observation containing plan, price, currency,
interval, limits, features, evidence, and timestamp.

### Feature

Canonical feature identity with aliases and lifecycle.

### Review

Public review record collected through a permitted source adapter.

### Trend

Cross-competitor aggregated market signal.

### Report

Evidence-backed generated report.

### AlertRule / AlertDelivery

Rules and delivery attempts for important changes.

### ApiKey

Credential for the public API.

## 5. Dashboard

Primary navigation: - Overview - Competitors - Changes - Pricing -
Features - Reviews - Trends - Reports - AI Research - Alerts - API -
Settings

### Overview

Show monitored competitors, sources, recent changes, pricing changes,
feature changes, review sentiment, emerging trends, scan health, and
alerts.

### Competitor Detail

Show identity, monitored sources, change timeline, pricing history,
feature history, reviews, trends, and reports.

### Changes

Filter by competitor, source, type, severity, confidence, and date.
Every change should expose evidence and timestamps.

### Pricing

Show current and historical plans, price history, billing intervals,
packaging changes, and feature/limit changes.

### Features

Show discovered features, first/last seen, competitors offering them,
additions/removals, and evidence.

### Reviews

Show rating distribution, sentiment, topics, positive/negative themes,
competitor comparison, and review trends.

### Trends

Show emerging keywords, feature adoption, pricing patterns, complaint
trends, competitor adoption, acceleration, and evidence.

### Reports

Support competitor, pricing, feature, review, market trend, and
executive reports. Reports must remain useful without AI.

### AI Research

Optional AI can summarize changes, synthesize competitors, answer
evidence-grounded questions, and draft reports.

## 6. Monitoring

Support scheduled crawling, manual scans, retries, timeouts, response
limits, normalization, hashing, historical snapshots, deduplication, and
change classification.

Prefer static HTML, structured metadata, semantic HTML, JSON-LD,
headings, pricing tables, visible text, and relevant links. Browser
automation is optional.

## 7. Pricing Intelligence

Extract plan names, price, currency, billing period, free/trial state,
limits, seats, included features, and enterprise/custom pricing.
Calculate absolute/percentage changes and plan additions/removals. Do
not fabricate ambiguous values.

## 8. Feature Intelligence

Discover features from headings, lists, cards, tables, changelogs,
documentation, and structured data. Store canonical name, aliases,
source, competitor, first/last seen, status, evidence, and confidence.

## 9. Review Intelligence

Where permitted, ingest public reviews, normalize text, retain
rating/date, identify topics, calculate deterministic sentiment,
aggregate complaints/praise, and track topic frequency.

Respect source terms, robots directives where applicable, rate limits,
licensing, and privacy.

## 10. Sentiment

Support positive/negative/neutral scoring, negation, intensifiers,
rating weighting, confidence, and topic-level sentiment. Clearly
identify lexicon-based sentiment as an approximation.

## 11. Trend Intelligence

Combine keyword frequency, feature adoption, review topics, pricing
changes, change frequency, competitor count, time windows, growth,
acceleration, and recency. Every trend should expose evidence and
calculation inputs.

## 12. Alerts

Alert on pricing changes, major feature changes, source changes, review
sentiment shifts, trend thresholds, and scan failures. Prevent duplicate
notifications.

## 13. Reports

Reports should contain scope, period, competitors, methodology, key
findings, changes, evidence, trends, and limitations. AI-generated text
never replaces underlying evidence.

## 14. Public API

Support competitors, sources, snapshots, changes, pricing, features,
reviews, trends, reports, and authorized scan triggers. Include
authentication, pagination, filtering, rate limits, versioning, and
machine-readable errors.

## 15. AI Providers

Support Google Gemini, OpenRouter, OpenAI, and Anthropic through a
provider abstraction. AI credentials are user-supplied where required.

## 16. Free / BYOK Principle

The application must work without AI, avoid hidden paid AI dependencies,
allow BYOK, isolate AI calls, and clearly show when AI is unavailable.

## 17. Success Criteria

Users should be able to answer: - What changed on competitor X? - Which
competitors changed pricing? - What features are spreading? - What are
customers complaining about? - Which review topics are increasing? -
What changed since the previous scan? - What evidence supports the
finding? - Can the intelligence be exported or queried?

Every answer should be traceable to stored evidence whenever possible.
