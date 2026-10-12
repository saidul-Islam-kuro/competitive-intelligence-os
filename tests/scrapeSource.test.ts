/**
 * Requires `npm install` (@prisma/client generated) AND a real, reachable
 * DATABASE_URL — this hits an actual Postgres database, not a mock. Not
 * runnable in the sandbox this was written in (no network, no database).
 * See VERIFY.md.
 *
 * Uses a real local `http` server (via node:http) to serve mutable
 * fixture content across the scrapes below, and passes a permissive
 * `urlValidator` override into scrapeSource() so the loopback test server
 * isn't rejected by the real SSRF policy (which is exactly what it should
 * do in production — see the doc comment on this override in
 * scrapeSource.ts / httpFetcher.ts). The SSRF policy's own correctness is
 * covered separately and realistically in ssrf.test.ts.
 *
 * Every test cleans up the Product/Source/Snapshot/Change rows it creates.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { prisma } from "../src/db/client";
import { scrapeSource } from "../src/services/scrapeSource";
import { SourceNotFoundError, ProductSourceMismatchError } from "../src/lib/errors";
import type { UrlValidator } from "../src/lib/crawler/httpFetcher";

const permissiveValidator: UrlValidator = {
  validateUrl: async (rawUrl) => {
    const url = new URL(rawUrl);
    return { url, hostname: url.hostname, resolvedAddresses: ["127.0.0.1"] };
  },
  validateRedirectTarget: async (location, fromUrl) => {
    const url = new URL(location, fromUrl);
    return { url, hostname: url.hostname, resolvedAddresses: ["127.0.0.1"] };
  },
};

let server: Server;
let baseUrl: string;
let currentHtml = "<html><body><h1>Original</h1><p>Nothing has changed yet.</p></body></html>";

before(async () => {
  server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(currentHtml);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
});

async function createTestProductAndSource() {
  const product = await prisma.product.create({
    data: { name: `Phase2 Test Product ${Date.now()}`, homepageUrl: baseUrl },
  });
  const source = await prisma.source.create({
    data: { productId: product.id, type: "HOMEPAGE", url: baseUrl },
  });
  return { product, source };
}

async function cleanup(productId: string) {
  // Change/Snapshot cascade-delete via onDelete: Cascade on their FKs to
  // Source/Product, so deleting the product is sufficient.
  await prisma.product.delete({ where: { id: productId } }).catch(() => undefined);
}

test("scrapeSource: first scrape creates a snapshot and no Change record", async () => {
  const { product, source } = await createTestProductAndSource();
  try {
    currentHtml = "<html><body><h1>First Version</h1></body></html>";
    const result = await scrapeSource(source.id, product.id, { urlValidator: permissiveValidator });

    assert.equal(result.contentChanged, true); // first scrape: nothing to compare against
    assert.equal(result.previousSnapshotId, null);
    assert.equal(result.changeId, null); // no prior state to have "changed" from
    assert.ok(result.contentHash);
    assert.equal(result.httpStatus, 200);

    const snapshot = await prisma.snapshot.findUnique({ where: { id: result.snapshotId } });
    assert.ok(snapshot);
    assert.equal(snapshot?.contentHash, result.contentHash);
  } finally {
    await cleanup(product.id);
  }
});

test("scrapeSource: a second identical scrape does not create a false change", async () => {
  const { product, source } = await createTestProductAndSource();
  try {
    currentHtml = "<html><body><h1>Stable Content</h1></body></html>";
    const first = await scrapeSource(source.id, product.id, { urlValidator: permissiveValidator });
    const second = await scrapeSource(source.id, product.id, { urlValidator: permissiveValidator });

    assert.equal(second.contentChanged, false);
    assert.equal(second.changeId, null);
    assert.equal(second.contentHash, first.contentHash);
    assert.equal(second.previousSnapshotId, first.snapshotId);

    const changeCount = await prisma.change.count({ where: { sourceId: source.id } });
    assert.equal(changeCount, 0);
  } finally {
    await cleanup(product.id);
  }
});

test("scrapeSource: changed content creates a deterministic Change record (unclassified for a generic HOMEPAGE source)", async () => {
  const { product, source } = await createTestProductAndSource();
  try {
    currentHtml = "<html><body><h1>Before</h1><p>Line A</p></body></html>";
    const first = await scrapeSource(source.id, product.id, { urlValidator: permissiveValidator });

    currentHtml = "<html><body><h1>After</h1><p>Line A</p><p>Line B</p></body></html>";
    const second = await scrapeSource(source.id, product.id, { urlValidator: permissiveValidator });

    assert.equal(second.contentChanged, true);
    assert.equal(second.previousSnapshotId, first.snapshotId);
    assert.ok(second.changeId);
    assert.equal(second.category, "UNKNOWN"); // generic HOMEPAGE source, no classification signal

    const change = await prisma.change.findUnique({ where: { id: second.changeId as string } });
    assert.ok(change);
    assert.equal(change?.category, "UNKNOWN");
    assert.equal(change?.severity, "INFO");
    assert.equal(change?.confidence, null);
    assert.ok(change?.diff);
    const diff = change?.diff as { fields: unknown[]; text: { addedCount: number } };
    assert.ok(diff.text.addedCount > 0);
  } finally {
    await cleanup(product.id);
  }
});

test("REGRESSION (Phase 2.1 fix): a title-only change (no visible-text change) still creates a Change with a correct summary", async () => {
  const { product, source } = await createTestProductAndSource();
  try {
    currentHtml = "<html><head><title>Old Title</title></head><body><p>Same body text.</p></body></html>";
    await scrapeSource(source.id, product.id, { urlValidator: permissiveValidator });

    currentHtml = "<html><head><title>New Title</title></head><body><p>Same body text.</p></body></html>";
    const second = await scrapeSource(source.id, product.id, { urlValidator: permissiveValidator });

    assert.equal(second.contentChanged, true); // hash differs (title participates)
    assert.ok(second.changeId, "expected a Change record even though visible text is identical");

    const change = await prisma.change.findUnique({ where: { id: second.changeId as string } });
    assert.match(change?.summary ?? "", /title changed/i);
    const diff = change?.diff as { fields: Array<{ field: string }>; text: { addedCount: number; removedCount: number } };
    assert.ok(diff.fields.some((f) => f.field === "title"));
    assert.equal(diff.text.addedCount, 0); // this is exactly what the old bug got wrong
    assert.equal(diff.text.removedCount, 0);
  } finally {
    await cleanup(product.id);
  }
});

test("classifies a change against a PRICING-type source with high confidence", async () => {
  const { product } = await createTestProductAndSource();
  const pricingSource = await prisma.source.create({
    data: { productId: product.id, type: "PRICING", url: `${baseUrl}pricing` },
  });
  try {
    currentHtml = "<html><body><h1>Plans</h1><p>Basic $9/mo</p></body></html>";
    await scrapeSource(pricingSource.id, product.id, { urlValidator: permissiveValidator });
    currentHtml = "<html><body><h1>Plans</h1><p>Basic $19/mo</p></body></html>";
    const second = await scrapeSource(pricingSource.id, product.id, { urlValidator: permissiveValidator });

    assert.equal(second.category, "PRICING");
    const change = await prisma.change.findUnique({ where: { id: second.changeId as string } });
    assert.equal(change?.confidence, 1.0);
    assert.match(change?.summary ?? "", /pricing/i);
  } finally {
    await cleanup(product.id);
  }
});

test("REGRESSION (Phase 2.1 fix): two identical scrapes of oversized content do not report a false change", async () => {
  const { product, source } = await createTestProductAndSource();
  try {
    // Comfortably larger than MAX_NORMALIZED_TEXT_LENGTH so both scrapes
    // exercise the capping path; identical content both times.
    const bigParagraph = `<p>${"stable content ".repeat(200_000)}</p>`;
    currentHtml = `<html><body><h1>Big Page</h1>${bigParagraph}</body></html>`;

    const first = await scrapeSource(source.id, product.id, { urlValidator: permissiveValidator, maxBytes: 10_000_000 });
    const second = await scrapeSource(source.id, product.id, { urlValidator: permissiveValidator, maxBytes: 10_000_000 });

    assert.equal(second.contentHash, first.contentHash);
    assert.equal(second.contentChanged, false);
    assert.equal(second.changeId, null); // the old bug would have produced a spurious Change here
  } finally {
    await cleanup(product.id);
  }
});

test("IDEMPOTENCY (Phase 3): processing the same (fromSnapshotId, toSnapshotId) pair twice does not duplicate the Change row", async () => {
  // Direct DB-level test of the idempotency mechanism itself (the unique
  // constraint + upsert), independent of the full scrapeSource() flow —
  // see scrapeSource.ts's doc comment on why the current single scrape
  // code path doesn't naturally re-trigger this exact collision (it
  // always creates a fresh toSnapshotId), while the mechanism itself must
  // still be correct for any future reprocessing path.
  const { product, source } = await createTestProductAndSource();
  try {
    const s1 = await prisma.snapshot.create({
      data: { sourceId: source.id, requestedUrl: baseUrl, contentHash: "hash-1" },
    });
    const s2 = await prisma.snapshot.create({
      data: { sourceId: source.id, requestedUrl: baseUrl, contentHash: "hash-2" },
    });

    const changeData = {
      productId: product.id,
      sourceId: source.id,
      fromSnapshotId: s1.id,
      toSnapshotId: s2.id,
      category: "UNKNOWN" as const,
      severity: "INFO" as const,
      summary: "Test change",
    };

    const upsertOnce = () =>
      prisma.change.upsert({
        where: { fromSnapshotId_toSnapshotId: { fromSnapshotId: s1.id, toSnapshotId: s2.id } },
        create: changeData,
        update: {},
      });

    const first = await upsertOnce();
    const second = await upsertOnce(); // "same processing again"

    assert.equal(first.id, second.id); // same row, not a new one
    const count = await prisma.change.count({ where: { fromSnapshotId: s1.id, toSnapshotId: s2.id } });
    assert.equal(count, 1);
  } finally {
    await cleanup(product.id);
  }
});

test("IDEMPOTENCY (Phase 3): a genuinely new snapshot pair still creates a new Change", async () => {
  const { product, source } = await createTestProductAndSource();
  try {
    const s1 = await prisma.snapshot.create({ data: { sourceId: source.id, requestedUrl: baseUrl, contentHash: "a" } });
    const s2 = await prisma.snapshot.create({ data: { sourceId: source.id, requestedUrl: baseUrl, contentHash: "b" } });
    const s3 = await prisma.snapshot.create({ data: { sourceId: source.id, requestedUrl: baseUrl, contentHash: "c" } });

    const make = (fromId: string, toId: string) =>
      prisma.change.upsert({
        where: { fromSnapshotId_toSnapshotId: { fromSnapshotId: fromId, toSnapshotId: toId } },
        create: {
          productId: product.id,
          sourceId: source.id,
          fromSnapshotId: fromId,
          toSnapshotId: toId,
          category: "UNKNOWN",
          severity: "INFO",
          summary: "Test change",
        },
        update: {},
      });

    await make(s1.id, s2.id);
    await make(s2.id, s3.id); // different pair -> different row

    const count = await prisma.change.count({ where: { sourceId: source.id } });
    assert.equal(count, 2);
  } finally {
    await cleanup(product.id);
  }
});

test("scrapeSource: a fetch failure still persists a Snapshot row with the error recorded", async () => {
  const { product, source } = await createTestProductAndSource();
  try {
    await prisma.source.update({ where: { id: source.id }, data: { url: `${baseUrl}` } });
    // Point at a port nothing listens on to force a connection failure.
    const brokenSource = await prisma.source.create({
      data: { productId: product.id, type: "HOMEPAGE", url: "http://127.0.0.1:1/" },
    });

    await assert.rejects(() =>
      scrapeSource(brokenSource.id, product.id, { urlValidator: permissiveValidator, timeoutMs: 2000 }),
    );

    const snapshot = await prisma.snapshot.findFirst({
      where: { sourceId: brokenSource.id },
      orderBy: { fetchedAt: "desc" },
    });
    assert.ok(snapshot);
    assert.equal(snapshot?.contentHash, null);
    assert.ok(snapshot?.error);
  } finally {
    await cleanup(product.id);
  }
});

test("scrapeSource: throws SourceNotFoundError for an unknown source id", async () => {
  await assert.rejects(() => scrapeSource("does-not-exist"), SourceNotFoundError);
});

test("scrapeSource: throws ProductSourceMismatchError when the source belongs to a different product", async () => {
  const { product, source } = await createTestProductAndSource();
  const otherProduct = await prisma.product.create({
    data: { name: `Phase2 Other Product ${Date.now()}`, homepageUrl: "https://example.com" },
  });
  try {
    await assert.rejects(() => scrapeSource(source.id, otherProduct.id), ProductSourceMismatchError);
  } finally {
    await cleanup(product.id);
    await cleanup(otherProduct.id);
  }
});
