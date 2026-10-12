import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

/**
 * API keys are high-entropy random secrets, not user-chosen passwords, so a
 * plain SHA-256 digest is the right tool here (same approach GitHub/Stripe
 * use for token storage) — no per-key salt or slow KDF is needed, since
 * there's no low-entropy input to protect against offline guessing.
 *
 * The plaintext key is only ever returned once, at creation time, by
 * generateApiKey(). Only its hash and a short display prefix are meant to
 * be persisted (04_DEVELOPMENT_RULES #11 "Secrets", #15 "Logging" — never
 * log or store the plaintext).
 */

const KEY_PREFIX = "cios";

export interface GeneratedApiKey {
  /** Full secret — show once, never persisted, never logged. */
  plaintext: string;
  /** Short, non-secret prefix safe to display/log for identification. */
  keyPrefix: string;
  /** SHA-256 hex digest of the plaintext — this is what gets stored. */
  hashedKey: string;
}

export function generateApiKey(): GeneratedApiKey {
  const secret = randomBytes(24).toString("base64url");
  const plaintext = `${KEY_PREFIX}_${secret}`;
  return {
    plaintext,
    keyPrefix: plaintext.slice(0, 12),
    hashedKey: hashApiKey(plaintext),
  };
}

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

/** Constant-time comparison against a stored hash. */
export function verifyApiKey(plaintext: string, hashedKey: string): boolean {
  const candidate = Buffer.from(hashApiKey(plaintext), "hex");
  const stored = Buffer.from(hashedKey, "hex");
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}
