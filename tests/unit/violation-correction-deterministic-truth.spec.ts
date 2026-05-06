import { describe, expect, it } from "vitest";

import type { DetectedViolation } from "../../helpers/complianceDetectorTypes";
import {
  getDeterministicAdminCorrectionMatch,
  type AdminCorrectionPatternForMatch,
  type TradelineForAdminCorrectionMatch,
} from "../../helpers/violationCorrectionRetrieval";

function correction(
  overrides: Partial<AdminCorrectionPatternForMatch> = {},
): AdminCorrectionPatternForMatch {
  return {
    id: 10,
    tradelineId: 100,
    correctionAction: "corrected",
    correctedViolationType: "BALANCE_CALCULATION_VIOLATION",
    correctedSummary: null,
    originalViolationCategory: null,
    patternCreditorId: 7,
    patternBureauId: 3,
    patternAccountNumber: "ABC-1234",
    ...overrides,
  };
}

function tradeline(overrides: Partial<TradelineForAdminCorrectionMatch> = {}) {
  return {
    id: 200,
    creditorId: 7,
    bureauId: 3,
    accountNumber: "ABC1234",
    ...overrides,
  };
}

function violation(overrides: Partial<DetectedViolation> = {}): DetectedViolation {
  return {
    violationCategory: "BALANCE_CALCULATION_VIOLATION",
    severity: "WARNING",
    confidenceScore: 85,
    userExplanation: "Balance requires review.",
    technicalDetails: {
      fieldName: "balance",
    },
    recommendedAction: "Review the account balance.",
    tradelineId: 200,
    ...overrides,
  };
}

describe("deterministic admin correction truth matching", () => {
  it("applies a finalized correction to the same tradeline only when the category is exact", () => {
    const match = getDeterministicAdminCorrectionMatch(
      correction({ tradelineId: 200, correctedViolationType: null, originalViolationCategory: "BALANCE_CALCULATION_VIOLATION" }),
      [],
      violation(),
      tradeline(),
    );

    expect(match).toEqual({
      applies: true,
      kind: "same_tradeline_exact_category",
      reason: "same_tradeline_and_exact_violation_category",
    });
  });

  it("does not treat summary text as an authoritative category mapping", () => {
    const match = getDeterministicAdminCorrectionMatch(
      correction({
        tradelineId: 200,
        correctedViolationType: "DOCUMENTATION_CHAIN_FAILURE",
        originalViolationCategory: null,
        correctedSummary: "Admin mentioned BALANCE_CALCULATION_VIOLATION in notes.",
      }),
      [{ fieldName: "balance" }],
      violation(),
      tradeline(),
    );

    expect(match.applies).toBe(false);
    expect(match.reason).toBe("category_mismatch");
  });

  it("applies across reports only with exact account identity and exact evidence field", () => {
    const match = getDeterministicAdminCorrectionMatch(
      correction(),
      [{ fieldName: "balance" }],
      violation({
        technicalDetails: {
          deterministicRule: {
            sourceFields: ["balance"],
          },
        },
      }),
      tradeline(),
    );

    expect(match).toEqual({
      applies: true,
      kind: "same_account_exact_field",
      reason: "same_creditor_account_bureau_and_exact_evidence_field",
    });
  });

  it("rejects broad same-creditor or same-bureau matches without exact account and field evidence", () => {
    const match = getDeterministicAdminCorrectionMatch(
      correction({ patternAccountNumber: "DIFFERENT-9999" }),
      [{ fieldName: "balance" }],
      violation(),
      tradeline(),
    );

    expect(match.applies).toBe(false);
    expect(match.reason).toBe("no_exact_admin_truth_scope");
  });
});
