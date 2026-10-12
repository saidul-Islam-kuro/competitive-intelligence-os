/**
 * Decides a feature's lifecycle status transition for ONE scan event.
 * Pure — given the inputs below, always returns the same decision.
 *
 * THE ACTUAL RULE IMPLEMENTED (documented per Phase 5.4's explicit ask):
 *
 * 1. Observed in this scan → ACTIVE, always. Even a feature previously
 *    REMOVED or UNCERTAIN flips back to ACTIVE the moment it's seen again
 *    — seeing it is the strongest possible evidence it exists.
 * 2. Not observed, but there's EXPLICIT removal evidence (e.g. a
 *    changelog entry that names this feature alongside a "removed" /
 *    "deprecated" / "sunset" statement — see classification's own
 *    signals, not this module) → REMOVED.
 * 3. Not observed, source is authoritative for feature presence (a
 *    FEATURE or CHANGELOG-type source) but with no explicit removal
 *    language → UNCERTAIN. Missing from a source we trust is real
 *    signal, but "missing" isn't the same claim as "confirmed removed."
 * 4. Not observed, source is NOT authoritative (e.g. a homepage or blog
 *    post that simply didn't happen to mention this feature) → status is
 *    left UNCHANGED. This is the critical, explicitly-required rule:
 *    "never infer removal solely from absence on a single ordinary
 *    marketing page." A homepage redesign that drops a feature mention
 *    says nothing about whether the feature still exists.
 *
 * This function decides ONE transition from ONE scan's evidence; it does
 * not accumulate "missing N times in a row" — Phase 5 doesn't ask for
 * that escalation logic, and adding it now would be inventing behavior
 * beyond what's specified.
 */
export type FeatureLifecycleStatus = "ACTIVE" | "REMOVED" | "UNCERTAIN";

export interface LifecycleDecisionInput {
  currentStatus: FeatureLifecycleStatus;
  observedThisScan: boolean;
  sourceIsAuthoritative: boolean;
  explicitRemovalEvidence: boolean;
}

export interface LifecycleDecision {
  status: FeatureLifecycleStatus;
  reason: string;
}

export function decideFeatureLifecycle(input: LifecycleDecisionInput): LifecycleDecision {
  if (input.observedThisScan) {
    return { status: "ACTIVE", reason: "Observed in this scan." };
  }
  if (input.explicitRemovalEvidence) {
    return { status: "REMOVED", reason: "Explicit removal/deprecation evidence found." };
  }
  if (input.sourceIsAuthoritative) {
    return {
      status: "UNCERTAIN",
      reason: "Not observed on an authoritative source, but no explicit removal evidence — insufficient to confirm removal.",
    };
  }
  return {
    status: input.currentStatus,
    reason: "Not observed on a non-authoritative source — absence alone is not evidence of removal; status unchanged.",
  };
}
