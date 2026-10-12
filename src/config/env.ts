/**
 * Environment configuration.
 *
 * `parseEnv` is a pure function over a plain string-map so it can be unit
 * tested without dotenv, without @prisma/client, and without a real
 * process.env — see env.test.ts. `loadEnv` is the thin, side-effecting
 * wrapper actually used by the app: it loads `.env` (local dev only; Vercel
 * injects real env vars directly) and then calls `parseEnv`.
 *
 * Only DATABASE_URL is required. Everything else is optional so the app
 * boots with zero configuration beyond a database — AI, the public API,
 * and webhooks all degrade gracefully when unset (see 04_DEVELOPMENT_RULES
 * #3 "AI-Optional" and #21 "No-AI Fallback").
 */

export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  port: number;
  databaseUrl: string;
  directUrl: string | undefined;
  cronSecret: string | undefined;
  publicApiEnabled: boolean;
  ai: {
    provider: string | undefined;
    apiKey: string | undefined;
    model: string | undefined;
    baseUrl: string | undefined;
  };
  scrape: {
    useBrowserFallback: boolean;
    timeoutMs: number;
    maxBytes: number;
  };
}

export class EnvValidationError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Missing required environment variable(s): ${missing.join(", ")}`);
    this.name = "EnvValidationError";
  }
}

type EnvSource = Record<string, string | undefined>;

function toBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return value.toLowerCase() === "true" || value === "1";
}

function toInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNodeEnv(value: string | undefined): AppConfig["nodeEnv"] {
  if (value === "production" || value === "test") return value;
  return "development";
}

/** Pure: given an env-like object, returns a validated AppConfig or throws. */
export function parseEnv(env: EnvSource): AppConfig {
  const missing: string[] = [];

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) missing.push("DATABASE_URL");

  if (missing.length > 0) {
    throw new EnvValidationError(missing);
  }

  return {
    nodeEnv: toNodeEnv(env.NODE_ENV),
    port: toInt(env.PORT, 3000),
    databaseUrl: databaseUrl as string,
    directUrl: env.DIRECT_URL || undefined,
    cronSecret: env.CRON_SECRET || undefined,
    publicApiEnabled: toBool(env.PUBLIC_API_ENABLED, false),
    ai: {
      provider: env.AI_PROVIDER || undefined,
      apiKey: env.AI_API_KEY || undefined,
      model: env.AI_MODEL || undefined,
      baseUrl: env.AI_BASE_URL || undefined,
    },
    scrape: {
      useBrowserFallback: toBool(env.USE_BROWSER_FALLBACK, false),
      timeoutMs: toInt(env.SCRAPE_TIMEOUT_MS, 15000),
      maxBytes: toInt(env.SCRAPE_MAX_BYTES, 5_000_000),
    },
  };
}

let cached: AppConfig | undefined;

/** Side-effecting: loads .env (local dev) then parses process.env. Cached. */
export function loadEnv(): AppConfig {
  if (cached) return cached;
  if (toNodeEnv(process.env.NODE_ENV) !== "production") {
    // Local/dev only — Vercel provides real env vars directly and has no
    // .env file to load, so this is a no-op there beyond the require cost.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("dotenv").config();
  }
  cached = parseEnv(process.env as EnvSource);
  return cached;
}

/** Test-only: clears the cache so tests can reload with different env. */
export function _resetEnvCacheForTests(): void {
  cached = undefined;
}
