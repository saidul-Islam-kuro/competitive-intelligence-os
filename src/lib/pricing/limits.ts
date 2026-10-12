/**
 * Parses a single list-item line into a structured plan limit, or null.
 *
 * Conservative by design (04_DEVELOPMENT_RULES #8): a line is only a
 * "limit" when it is a quantity (a number or "unlimited") followed by a
 * noun from a fixed whitelist of things plans actually cap (users,
 * projects, storage, ...). Without the whitelist, "2 factor
 * authentication" or "24 hour turnaround" style feature bullets would be
 * misread as limits.
 */
export interface PlanLimit {
  text: string;
  quantity: number | "unlimited";
  unit: string;
}

const LIMIT_NOUNS = new Set([
  "users",
  "user",
  "seats",
  "seat",
  "members",
  "member",
  "projects",
  "project",
  "workspaces",
  "workspace",
  "teams",
  "team",
  "storage",
  "contacts",
  "emails",
  "requests",
  "calls",
  "credits",
  "messages",
  "pages",
  "sites",
  "domains",
  "channels",
  "integrations",
  "records",
  "documents",
  "boards",
  "automations",
  "reports",
  "dashboards",
  "repositories",
  "repos",
  "builds",
  "minutes",
  "hours",
]);

const LIMIT_RE =
  /^(?:up to\s+|max(?:imum)?\s+|includes?\s+)?(unlimited|\d[\d,]*(?:\.\d+)?)\s*(k|m|gb|tb|mb)?\+?\s+([a-z][a-z-]*(?:\s[a-z][a-z-]*){0,3})$/i;

export function parseLimit(line: string): PlanLimit | null {
  const trimmed = line.trim();
  const match = LIMIT_RE.exec(trimmed);
  if (!match) return null;
  const [, rawQuantity, suffix, nounPhrase] = match;
  const words = nounPhrase.toLowerCase().split(/\s+/);
  const lastWord = words[words.length - 1];
  if (!LIMIT_NOUNS.has(lastWord)) return null;

  let quantity: number | "unlimited";
  if (rawQuantity.toLowerCase() === "unlimited") {
    quantity = "unlimited";
  } else {
    const parsed = Number.parseFloat(rawQuantity.replace(/,/g, ""));
    if (!Number.isFinite(parsed)) return null;
    quantity = parsed;
  }

  const unit = [suffix?.toLowerCase(), ...words].filter(Boolean).join(" ");
  return { text: trimmed.slice(0, 200), quantity, unit };
}
