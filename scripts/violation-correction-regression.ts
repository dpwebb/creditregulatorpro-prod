import assert from "node:assert/strict";
import {
  deriveTrainingLabel,
  sanitizeComplianceNeutralText,
  validateCorrectionFinalizeRequirements,
} from "../helpers/violationCorrectionValidation";

function runCase(name: string, fn: () => void) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    console.error(`[FAIL] ${name}`);
    throw error;
  }
}

runCase("finalized canonical corrections require evidence and regulation mapping", () => {
  const errors = validateCorrectionFinalizeRequirements({
    action: "corrected",
    originalViolationId: 12,
    trainingNoteOnly: false,
    evidenceCount: 0,
    activeRegulationReferenceCount: 0,
  });

  assert.equal(errors.length, 2);
});

runCase("training note only bypasses evidence and regulation requirements", () => {
  const errors = validateCorrectionFinalizeRequirements({
    action: "corrected",
    originalViolationId: null,
    trainingNoteOnly: true,
    evidenceCount: 0,
    activeRegulationReferenceCount: 0,
  });

  assert.deepEqual(errors, []);
});

runCase("rejected false positives still require evidence", () => {
  const errors = validateCorrectionFinalizeRequirements({
    action: "rejected",
    originalViolationId: 44,
    trainingNoteOnly: false,
    evidenceCount: 0,
    activeRegulationReferenceCount: 0,
  });

  assert.equal(errors.length, 1);
  assert.match(errors[0], /evidence/i);
});

runCase("manual missed issue defaults to false negative label", () => {
  assert.equal(
    deriveTrainingLabel({
      action: "corrected",
      originalViolationId: null,
      correctedViolationType: "DOCUMENTATION_CHAIN_FAILURE",
    }),
    "false_negative",
  );
});

runCase("neutral sanitizer removes hard legal conclusions", () => {
  const sanitized = sanitizeComplianceNeutralText(
    "This is illegal, creates liability, and proves a violation / breach of law.",
  );

  assert.ok(sanitized);
  assert.doesNotMatch(sanitized!, /\billegal\b/i);
  assert.doesNotMatch(sanitized!, /\bliability\b/i);
  assert.doesNotMatch(sanitized!, /\bbreach of law\b/i);
  assert.doesNotMatch(sanitized!, /\bproves a violation\b/i);
});

console.log("Violation correction regression checks passed.");
