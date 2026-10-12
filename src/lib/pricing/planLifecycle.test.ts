import { test } from "node:test";
import assert from "node:assert/strict";
import { findDisappearedPlans } from "./planLifecycle";

const base = { sourceIsPricingAuthoritative: true, renderRequired: false };

test("a known plan missing from an authoritative pricing page is reported as disappeared", () => {
  assert.deepEqual(
    findDisappearedPlans({ ...base, knownActivePlanKeys: ["basic", "pro"], observedPlanKeys: ["pro"] }),
    ["basic"],
  );
});

test("nothing disappears when every known plan is still observed", () => {
  assert.deepEqual(findDisappearedPlans({ ...base, knownActivePlanKeys: ["pro"], observedPlanKeys: ["pro", "team"] }), []);
});

test("a NON-authoritative source (homepage/blog) never marks a plan as disappeared", () => {
  assert.deepEqual(
    findDisappearedPlans({ knownActivePlanKeys: ["basic", "pro"], observedPlanKeys: ["pro"], sourceIsPricingAuthoritative: false, renderRequired: false }),
    [],
  );
});

test("a renderRequired page (likely thin JS shell) never marks plans as disappeared", () => {
  assert.deepEqual(
    findDisappearedPlans({ knownActivePlanKeys: ["basic", "pro"], observedPlanKeys: ["pro"], sourceIsPricingAuthoritative: true, renderRequired: true }),
    [],
  );
});

test("zero observed plans is treated as a possible parse failure, NOT as 'every plan was removed'", () => {
  assert.deepEqual(findDisappearedPlans({ ...base, knownActivePlanKeys: ["basic", "pro"], observedPlanKeys: [] }), []);
});

test("output is sorted and deterministic", () => {
  assert.deepEqual(
    findDisappearedPlans({ ...base, knownActivePlanKeys: ["zeta", "alpha", "pro"], observedPlanKeys: ["pro"] }),
    ["alpha", "zeta"],
  );
});
