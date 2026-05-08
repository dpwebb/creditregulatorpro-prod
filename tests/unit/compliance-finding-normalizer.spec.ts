import { describe, expect, it } from "vitest";

import type { DetectedViolation } from "../../helpers/complianceDetectorTypes";
import { normalizeDetectedViolation } from "../../helpers/complianceFindingNormalizer";

describe("compliance finding normalizer", () => {
  it("softens field-level required language when no local field authority is mapped", () => {
    const violation: DetectedViolation = {
      violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
      severity: "ERROR",
      confidenceScore: 97,
      userExplanation: "The company says this debt was written off as a loss, but they didn't report when that happened. That date is required.",
      technicalDetails: {
        fieldName: "chargeOffDate",
        regulationIds: ["PIPEDA_4_6"],
      },
      recommendedAction: "Ask the company to report when this account was written off.",
      tradelineId: 515,
      responsibleEntity: "CREDITOR",
    };

    const normalized = normalizeDetectedViolation(violation);

    expect(normalized.userExplanation).toContain("That date can help verify the reporting.");
    expect(normalized.userExplanation).not.toContain("That date is required.");
  });

  it("does not leave attached pronouns when neutralizing removal language", () => {
    const violation: DetectedViolation = {
      violationCategory: "STATUTE_APPROACHING",
      severity: "WARNING",
      confidenceScore: 90,
      userExplanation: "After that, the credit bureau must remove it.",
      technicalDetails: {
        regulationIds: ["PIPEDA_4_5", "NS_CRA_REPORTING_LIMIT"],
        detectedValue: "2020-08-09T00:00:00.000Z",
        province: "NS",
      },
      recommendedAction: "Monitor the account.",
      tradelineId: 521,
      responsibleEntity: "BUREAU",
    };

    const normalized = normalizeDetectedViolation(violation);

    expect(normalized.userExplanation).not.toContain("informationit");
    expect(normalized.userExplanation).toContain("review and correct the reported information");
  });
});
