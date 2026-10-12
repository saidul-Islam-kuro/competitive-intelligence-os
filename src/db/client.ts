/**
 * Requires `npm install` + `npm run db:generate` before this resolves —
 * @prisma/client is generated from prisma/schema.prisma and is not checked
 * into the repo. Not verifiable inside the sandbox this was written in
 * (no network access to install packages); see the accompanying message
 * for exactly what was and wasn't run.
 */
import { PrismaClient } from "@prisma/client";
import { loadEnv } from "../config/env";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  const env = loadEnv();
  return new PrismaClient({
    datasources: { db: { url: env.databaseUrl } },
    log: env.nodeEnv === "development" ? ["warn", "error"] : ["error"],
  });
}

// Reuse the client across hot-reloads in dev and across warm serverless
// invocations on Vercel; a fresh client per request/import would exhaust
// the database's connection limit under load.
export const prisma: PrismaClient = global.__prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}
