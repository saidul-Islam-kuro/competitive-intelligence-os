/**
 * DEVELOPMENT FIXTURE DATA ONLY.
 *
 * Creates one example Product with one Source so the dashboard has
 * something to point at locally, and (Phase 2 addition) one dev-only API
 * key so the new authenticated scrape endpoint
 * (POST /api/products/:productId/sources/:sourceId/scrape) is actually
 * testable locally — without this there would be no way to obtain a key
 * short of writing one directly into the database by hand. The plaintext
 * key is printed once, here, and nowhere else; it is not recoverable
 * afterwards (by design — see src/lib/apiKey.ts), so re-run this script to
 * mint a new one if it's lost.
 *
 * Refuses to run when NODE_ENV=production so it can never overwrite real
 * data or mint a credential in production by accident
 * (04_DEVELOPMENT_RULES #12 "avoid casual destructive schema/data changes").
 */
import { PrismaClient } from "@prisma/client";
import { generateApiKey } from "../src/lib/apiKey";

const prisma = new PrismaClient();

async function ensureFixtureProduct(): Promise<void> {
  const existing = await prisma.product.findFirst({
    where: { homepageUrl: "https://example.com" },
  });
  if (existing) {
    console.log("Dev fixture product already present — skipping.");
    return;
  }

  const product = await prisma.product.create({
    data: {
      name: "Example Competitor (dev fixture)",
      homepageUrl: "https://example.com",
      notes: "Created by prisma/seed.ts for local development only.",
      sources: {
        create: [
          { type: "HOMEPAGE", url: "https://example.com", label: "Homepage" },
          { type: "PRICING", url: "https://example.com/pricing", label: "Pricing" },
        ],
      },
    },
  });

  console.log(`Created dev fixture product: ${product.name} (${product.id})`);
}

async function ensureDevApiKey(): Promise<void> {
  const existing = await prisma.apiKey.findFirst({ where: { name: "dev-fixture-key" } });
  if (existing) {
    console.log("Dev fixture API key already present — skipping (plaintext was only ever shown once).");
    return;
  }

  const key = generateApiKey();
  await prisma.apiKey.create({
    data: { name: "dev-fixture-key", keyPrefix: key.keyPrefix, hashedKey: key.hashedKey },
  });

  console.log("");
  console.log("Dev API key created — copy it now, it will not be shown again:");
  console.log(`  ${key.plaintext}`);
  console.log("Use it as: x-api-key: <key>  or  Authorization: Bearer <key>");
  console.log("");
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to run the dev seed script with NODE_ENV=production.");
    process.exit(1);
  }

  await ensureFixtureProduct();
  await ensureDevApiKey();
}

main()
  .catch((err) => {
    console.error("Seed failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
