# Competitive Intelligence OS --- Intelligence Engine

## 1. Pipeline

**Fetch → Parse → Normalize → Snapshot → Diff → Extract → Classify →
Aggregate → Trend → Report**

AI is an optional interpretation layer.

## 2. Fetching

Validate URLs, enforce SSRF protection, timeout, response-size limits,
safe User-Agent, HTTP/HTTPS only, content validation, redirect limits,
and rate/concurrency limits.

Return URL, final URL, status, relevant headers, fetchedAt, content,
error, and duration.

## 3. Normalization

Remove or minimize scripts, styles, tracking noise, dynamic counters,
and whitespace noise. Preserve headings, paragraphs, lists, tables,
semantic labels, pricing blocks, feature blocks, relevant links,
JSON-LD, and metadata.

Generate normalized text, DOM representation, headings, links,
structured data, semantic sections, and SHA-256 content hash.

## 4. Snapshot Diff

If normalized hashes match, no meaningful content processing is
required. If different, perform deeper comparison.

Detect: - added/removed text - changed paragraphs - heading
additions/removals/renames - link additions/removals/target changes -
JSON-LD and metadata changes

## 5. Change Classification

Classify changes as: - PRICING - FEATURE - PRODUCT - POSITIONING -
CONTENT - CTA - LEGAL - DOCUMENTATION - CHANGELOG - REVIEW - OTHER

Use source type, section context, keywords, DOM signals, structured
data, headings, and numeric/currency patterns.

## 6. Severity

Suggested levels: - INFO - LOW - MEDIUM - HIGH - CRITICAL

Examples: - tracking copy → INFO - ordinary copy → LOW - feature
addition → MEDIUM - pricing change → HIGH - plan removal → HIGH - major
availability change → HIGH/CRITICAL

Rules must be configurable.

## 7. Confidence

Confidence may depend on source reliability, structured data, semantic
context, parser certainty, consistency, and numeric validation. Avoid
false precision.

## 8. Pricing Extraction

Recognize currency symbols/codes, localized numbers, monthly/annual
terms, per-user/per-seat language.

Extract: - plan name - price - currency - interval - unit - limits -
features - source - evidence

Calculate absolute delta, percentage delta, plan addition/removal,
interval change, included-feature change, and limit change. Never infer
ambiguous prices.

## 9. Feature Extraction

Use headings, lists, cards, tables, changelogs, docs, and metadata.
Normalize case, punctuation, whitespace, and boilerplate. Map obvious
aliases only when sufficiently reliable. Preserve original evidence.

Feature lifecycle: - ACTIVE - REMOVED - UNCERTAIN

Do not mark a feature removed merely because it disappeared from one
non-authoritative page.

## 10. Review Ingestion

Source-specific adapters should retain external ID where available,
source, competitor, title, body, rating, legally appropriate author
metadata, publishedAt, collectedAt, and source URL.

Deduplicate by external ID, canonical URL, or source/timestamp/content
fingerprint.

## 11. Deterministic Sentiment

Use a configurable lexicon.

-   Positive terms add score.
-   Negative terms subtract score.
-   Handle negation such as "not good".
-   Handle intensifiers such as "very" and "extremely".
-   Use rating as an additional signal rather than automatically
    overriding text.

Return sentimentScore, sentimentLabel, and confidence.

Labels may include POSITIVE, NEUTRAL, NEGATIVE, and MIXED.

## 12. Topic Extraction

Use curated dictionaries, n-grams, noun-phrase heuristics, TF-IDF, and
deterministic clustering where practical.

Common topics: pricing, performance, support, reliability, integrations,
UI, onboarding, documentation, security, bugs, mobile, API.

Store normalized topic, source terms, frequency, sentiment, and time
range.

## 13. TF-IDF

Use TF-IDF to identify terms distinguishing competitors, periods, or
review groups. Remove stopwords, normalize case, filter short tokens,
enforce minimum document frequency, and optionally stem/lemmatize.

Do not overclaim semantic meaning from isolated keywords.

## 14. Trend Engine

For terms/topics/features calculate: - frequency - growth - adoption -
acceleration - recency - confidence

Example: `growth = (current - previous) / max(previous, epsilon)`

Feature adoption:
`adoption = competitors_with_feature / eligible_competitors`

Confidence may combine source count, competitor count, evidence
consistency, observation count, and time coverage.

## 15. Cross-Competitor Intelligence

Useful signals include features spreading across competitors, pricing
convergence, new feature categories, repeated complaints, review topics
increasing, anomalies, and adoption chronology.

Use evidence-based language such as "appeared after" or "co-occurred
with" rather than unsupported causal claims.

## 16. Evidence Model

Every intelligence result should point to source URL,
snapshot/review/change ID, timestamp, extracted text, and
section/selector where practical.

The UI must make evidence inspectable.

## 17. AI Interpretation

AI should receive structured evidence where possible.

Tasks: - summarize changes - explain patterns - draft reports - answer
research questions - connect evidence

AI must distinguish evidence from inference, cite evidence IDs, state
uncertainty, and never invent facts.

## 18. Deterministic-First Rule

Calculate reliable results without AI: - price deltas - feature
first-seen dates - adoption - review counts - sentiment - change
frequency - keyword growth

Use AI for synthesis, ambiguous interpretation, and natural-language
explanation.

## 19. Tests

Cover URL validation, normalization, hashing, diffs, pricing, features,
sentiment, negation, topics, TF-IDF, trends, deduplication, evidence
linking, malformed HTML, and edge cases.
