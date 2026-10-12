import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEnv, EnvValidationError } from "./env";

test("parseEnv: applies defaults with only DATABASE_URL set", () => {
  const config = parseEnv({ DATABASE_URL: "postgresql://localhost:5432/db" });
  assert.equal(config.databaseUrl, "postgresql://localhost:5432/db");
  assert.equal(config.nodeEnv, "development");
  assert.equal(config.port, 3000);
  assert.equal(config.publicApiEnabled, false);
  assert.equal(config.scrape.useBrowserFallback, false);
  assert.equal(config.scrape.timeoutMs, 15000);
  assert.equal(config.scrape.maxBytes, 5_000_000);
  assert.equal(config.ai.provider, undefined);
});

test("parseEnv: throws EnvValidationError when DATABASE_URL is missing", () => {
  assert.throws(() => parseEnv({}), (err: unknown) => {
    assert.ok(err instanceof EnvValidationError);
    assert.deepEqual(err.missing, ["DATABASE_URL"]);
    return true;
  });
});

test("parseEnv: parses booleans and integers from strings", () => {
  const config = parseEnv({
    DATABASE_URL: "postgresql://localhost:5432/db",
    USE_BROWSER_FALLBACK: "true",
    SCRAPE_TIMEOUT_MS: "9000",
    PUBLIC_API_ENABLED: "1",
    PORT: "8080",
  });
  assert.equal(config.scrape.useBrowserFallback, true);
  assert.equal(config.scrape.timeoutMs, 9000);
  assert.equal(config.publicApiEnabled, true);
  assert.equal(config.port, 8080);
});

test("parseEnv: NODE_ENV falls back to development for unrecognized values", () => {
  const config = parseEnv({
    DATABASE_URL: "postgresql://localhost:5432/db",
    NODE_ENV: "staging",
  });
  assert.equal(config.nodeEnv, "development");
});

test("parseEnv: passes through AI config as undefined when unset (AI-optional)", () => {
  const config = parseEnv({ DATABASE_URL: "postgresql://localhost:5432/db" });
  assert.deepEqual(config.ai, {
    provider: undefined,
    apiKey: undefined,
    model: undefined,
    baseUrl: undefined,
  });
});
