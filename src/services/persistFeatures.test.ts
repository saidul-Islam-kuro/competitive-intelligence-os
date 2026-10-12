/**
 * These tests run for real in this sandbox — see persistPricing.test.ts's
 * doc comment for why (type-only Prisma import, no runtime dependency).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { persistFeatureExtraction, extractAndPersistFeatures } from "./persistFeatures";
import { createFakePrismaTx } from "./testUtils/fakePrismaTx";
import type { FeatureCandidate } from "../lib/features/extractFeatures";

const PRODUCT_ID = "product-1";
const SOURCE_ID = "source-features-1";

function ssoCandidate(overrides: Partial<FeatureCandidate> = {}): FeatureCandidate {
  return {
    name: "SSO",
    canonicalName: "sso",
    confidence: 0.8,
    evidenceText: "SSO",
    source: "heading",
    ...overrides,
  };
}

function context(overrides: Partial<Parameters<typeof persistFeatureExtraction>[2]> = {}) {
  return { productId: PRODUCT_ID, sourceId: SOURCE_ID, sourceType: "FEATURE", snapshotId: "snapshot-1", ...overrides };
}

test("first observation creates a Feature and an ACTIVE FeatureObservation", async () => {
  const tx = createFakePrismaTx();
  const result = await persistFeatureExtraction(tx as never, [ssoCandidate()], context());

  assert.equal(result.featureObservationIds.length, 1);
  assert.equal(tx._tables.features.length, 1);
  assert.equal(tx._tables.features[0].canonicalName, "sso");
  assert.equal(tx._tables.featureObservations[0].status, "ACTIVE");
});

test("'Slack Integration' then 'Slack Integrations' resolve to the SAME Feature, with both raw forms recorded as aliases", async () => {
  const tx = createFakePrismaTx();
  await persistFeatureExtraction(
    tx as never,
    [ssoCandidate({ name: "Slack Integration", canonicalName: "slack integration" })],
    context({ snapshotId: "s1" }),
  );
  await persistFeatureExtraction(
    tx as never,
    [ssoCandidate({ name: "Slack Integrations", canonicalName: "slack integration" })],
    context({ snapshotId: "s2" }),
  );

  assert.equal(tx._tables.features.length, 1);
  assert.deepEqual(tx._tables.features[0].aliases.sort(), ["Slack Integration", "Slack Integrations"]);
});

test("IDEMPOTENCY: repeated observation across scans updates lastSeenAt on ONE row, never creates a duplicate FeatureObservation", async () => {
  const tx = createFakePrismaTx();
  await persistFeatureExtraction(tx as never, [ssoCandidate()], context({ snapshotId: "s1" }));
  const firstSeenAt = tx._tables.featureObservations[0].firstSeenAt;
  await persistFeatureExtraction(tx as never, [ssoCandidate()], context({ snapshotId: "s2" }));

  assert.equal(tx._tables.featureObservations.length, 1);
  assert.equal(tx._tables.featureObservations[0].firstSeenAt.getTime(), firstSeenAt.getTime()); // preserved, not reset
  assert.equal(tx._tables.featureObservations[0].snapshotId, "s2"); // evidence refreshed to latest
});

test("CRITICAL: a feature missing from a non-authoritative source's next scan stays ACTIVE (not REMOVED, not even UNCERTAIN)", async () => {
  const tx = createFakePrismaTx();
  await persistFeatureExtraction(tx as never, [ssoCandidate()], context({ snapshotId: "s1", sourceType: "HOMEPAGE" }));
  await persistFeatureExtraction(tx as never, [], context({ snapshotId: "s2", sourceType: "HOMEPAGE" })); // nothing observed this scan

  assert.equal(tx._tables.featureObservations[0].status, "ACTIVE");
});

test("a feature missing from an AUTHORITATIVE source's next scan becomes UNCERTAIN, not REMOVED", async () => {
  const tx = createFakePrismaTx();
  await persistFeatureExtraction(tx as never, [ssoCandidate()], context({ snapshotId: "s1", sourceType: "FEATURE" }));
  await persistFeatureExtraction(tx as never, [], context({ snapshotId: "s2", sourceType: "FEATURE" }));

  assert.equal(tx._tables.featureObservations[0].status, "UNCERTAIN");
});

test("a feature that reappears after being UNCERTAIN flips back to ACTIVE", async () => {
  const tx = createFakePrismaTx();
  await persistFeatureExtraction(tx as never, [ssoCandidate()], context({ snapshotId: "s1" }));
  await persistFeatureExtraction(tx as never, [], context({ snapshotId: "s2" })); // -> UNCERTAIN (authoritative FEATURE source)
  assert.equal(tx._tables.featureObservations[0].status, "UNCERTAIN");
  await persistFeatureExtraction(tx as never, [ssoCandidate()], context({ snapshotId: "s3" })); // seen again

  assert.equal(tx._tables.featureObservations[0].status, "ACTIVE");
});

test("SCOPING: a feature last evidenced by a DIFFERENT source is untouched by this source's scan", async () => {
  const tx = createFakePrismaTx();
  await persistFeatureExtraction(tx as never, [ssoCandidate()], context({ snapshotId: "s1", sourceId: "other-source" }));
  // This source has never mentioned SSO at all — scanning it (finding
  // nothing) must not reconsider SSO's lifecycle.
  await persistFeatureExtraction(tx as never, [], context({ snapshotId: "s2", sourceId: SOURCE_ID }));

  assert.equal(tx._tables.featureObservations[0].status, "ACTIVE");
});

test("multiple distinct features extracted together each get their own Feature + FeatureObservation", async () => {
  const tx = createFakePrismaTx();
  await persistFeatureExtraction(
    tx as never,
    [ssoCandidate(), ssoCandidate({ name: "Audit Logs", canonicalName: "audit log" })],
    context(),
  );
  assert.equal(tx._tables.features.length, 2);
  assert.equal(tx._tables.featureObservations.length, 2);
});

test("status transitions are reported back to the caller", async () => {
  const tx = createFakePrismaTx();
  await persistFeatureExtraction(tx as never, [ssoCandidate()], context({ snapshotId: "s1" }));
  const result = await persistFeatureExtraction(tx as never, [], context({ snapshotId: "s2" }));

  assert.deepEqual(result.statusChanges, [{ canonicalName: "sso", from: "ACTIVE", to: "UNCERTAIN" }]);
});

test("extractAndPersistFeatures: end-to-end from raw headings/listItems through to persisted rows", async () => {
  const tx = createFakePrismaTx();
  const result = await extractAndPersistFeatures(
    tx as never,
    { headings: [{ level: 3, text: "SSO" }], listItems: ["Audit logs"] },
    context(),
  );
  assert.equal(result.featureObservationIds.length, 2);
  assert.equal(tx._tables.features.length, 2);
});
