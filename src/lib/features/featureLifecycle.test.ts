import { test } from "node:test";
import assert from "node:assert/strict";
import { decideFeatureLifecycle } from "./featureLifecycle";

test("first observation -> ACTIVE", () => {
  const result = decideFeatureLifecycle({
    currentStatus: "UNCERTAIN",
    observedThisScan: true,
    sourceIsAuthoritative: false,
    explicitRemovalEvidence: false,
  });
  assert.equal(result.status, "ACTIVE");
});

test("repeated observation -> stays ACTIVE", () => {
  const result = decideFeatureLifecycle({
    currentStatus: "ACTIVE",
    observedThisScan: true,
    sourceIsAuthoritative: false,
    explicitRemovalEvidence: false,
  });
  assert.equal(result.status, "ACTIVE");
});

test("a feature previously REMOVED that reappears flips back to ACTIVE", () => {
  const result = decideFeatureLifecycle({
    currentStatus: "REMOVED",
    observedThisScan: true,
    sourceIsAuthoritative: false,
    explicitRemovalEvidence: false,
  });
  assert.equal(result.status, "ACTIVE");
});

test("CRITICAL: disappearance from a single NON-authoritative page (e.g. homepage) does NOT mark REMOVED", () => {
  const result = decideFeatureLifecycle({
    currentStatus: "ACTIVE",
    observedThisScan: false,
    sourceIsAuthoritative: false,
    explicitRemovalEvidence: false,
  });
  assert.equal(result.status, "ACTIVE"); // unchanged, not REMOVED and not even UNCERTAIN
  assert.match(result.reason, /absence alone is not evidence/i);
});

test("disappearance from an AUTHORITATIVE source with no explicit removal language -> UNCERTAIN, not REMOVED", () => {
  const result = decideFeatureLifecycle({
    currentStatus: "ACTIVE",
    observedThisScan: false,
    sourceIsAuthoritative: true,
    explicitRemovalEvidence: false,
  });
  assert.equal(result.status, "UNCERTAIN");
});

test("explicit removal evidence -> REMOVED, even from a non-authoritative source", () => {
  const result = decideFeatureLifecycle({
    currentStatus: "ACTIVE",
    observedThisScan: false,
    sourceIsAuthoritative: false,
    explicitRemovalEvidence: true,
  });
  assert.equal(result.status, "REMOVED");
});

test("every decision includes a human-readable reason", () => {
  for (const observedThisScan of [true, false]) {
    for (const sourceIsAuthoritative of [true, false]) {
      for (const explicitRemovalEvidence of [true, false]) {
        const result = decideFeatureLifecycle({ currentStatus: "ACTIVE", observedThisScan, sourceIsAuthoritative, explicitRemovalEvidence });
        assert.ok(result.reason.length > 0);
      }
    }
  }
});

test("decision is deterministic", () => {
  const input = { currentStatus: "ACTIVE" as const, observedThisScan: false, sourceIsAuthoritative: true, explicitRemovalEvidence: false };
  assert.deepEqual(decideFeatureLifecycle(input), decideFeatureLifecycle(input));
});
