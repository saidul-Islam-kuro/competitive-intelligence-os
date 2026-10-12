/**
 * Deterministic topic extraction via curated keyword dictionaries
 * (02_INTELLIGENCE_ENGINE.md §12, Phase 6.6). Matches whole words/short
 * phrases against each topic's term list; a topic is only returned when
 * at least one of its terms actually appears, with the matched terms kept
 * as evidence (never just a bare label with no traceable reason).
 *
 * "Sentiment relationship" (Phase 6.6's storage requirement) is handled
 * simply and deliberately not over-engineered: a topic observation
 * carries the review's OVERALL sentiment score, not a separate per-
 * sentence topic-level sentiment model — attributing sentiment to the
 * specific sentence a topic term appeared in would need sentence
 * segmentation and is more machinery than this phase's scope calls for.
 * Documented here as a conscious simplification, not an oversight.
 */

export const REVIEW_TOPICS: ReadonlyArray<{ key: string; label: string; terms: readonly string[] }> = [
  { key: "pricing", label: "Pricing", terms: ["price", "pricing", "expensive", "cheap", "cost", "costly", "affordable", "value for money"] },
  { key: "performance", label: "Performance", terms: ["slow", "fast", "lag", "laggy", "performance", "speed", "sluggish"] },
  { key: "support", label: "Support", terms: ["support", "customer service", "helpdesk", "response time", "help desk"] },
  { key: "reliability", label: "Reliability", terms: ["crash", "crashes", "crashed", "unreliable", "downtime", "outage", "stability", "reliable"] },
  { key: "integrations", label: "Integrations", terms: ["integration", "integrations", "api", "zapier", "webhook", "connects with", "sync"] },
  { key: "ui", label: "User Interface", terms: ["ui", "interface", "design", "layout", "ux", "look and feel"] },
  { key: "onboarding", label: "Onboarding", terms: ["onboarding", "setup", "getting started", "easy to learn", "learning curve"] },
  { key: "documentation", label: "Documentation", terms: ["documentation", "docs", "tutorial", "guide", "instructions"] },
  { key: "security", label: "Security", terms: ["security", "secure", "encryption", "privacy", "breach", "vulnerability"] },
  { key: "bugs", label: "Bugs", terms: ["bug", "bugs", "buggy", "glitch", "broken", "error"] },
  { key: "mobile", label: "Mobile", terms: ["mobile app", "ios app", "android app", "mobile", "phone app"] },
  { key: "api", label: "API", terms: ["api", "sdk", "rest api", "graphql", "developer tools"] },
];

export interface TopicMatch {
  key: string;
  label: string;
  matchedTerms: string[];
  frequency: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractReviewTopics(text: string): TopicMatch[] {
  const lower = text.toLowerCase();
  const matches: TopicMatch[] = [];

  for (const topic of REVIEW_TOPICS) {
    const matchedTerms: string[] = [];
    let frequency = 0;
    for (const term of topic.terms) {
      const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, "g");
      const found = lower.match(pattern);
      if (found && found.length > 0) {
        matchedTerms.push(term);
        frequency += found.length;
      }
    }
    if (matchedTerms.length > 0) {
      matches.push({ key: topic.key, label: topic.label, matchedTerms, frequency });
    }
  }

  return matches;
}
