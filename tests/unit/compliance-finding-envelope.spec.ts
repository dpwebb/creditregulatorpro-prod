import { describe, expect, it } from "vitest";

import type { DetectedViolation } from "../../helpers/complianceDetectorTypes";
import {
  fromCreditorObligationTest,
  fromDetectedViolation,
  safeNormalizeFindingEnvelope,
} from "../../helpers/complianceFindingEnvelope";
import { PLAIN_DISPUTE_LETTER_REASONS } from "../../helpers/disputeLetterReason";

describe("compliance finding envelope adapter", () => {
  it("wraps an existing DetectedViolation without dropping technical metadata", () => {
    const violation: DetectedViolation = {
      violationCategory: "BALANCE_CALCULATION_VIOLATION",
      severity: "ERROR",
      confidenceScore: 96,
      userExplanation: "The current balance is higher than the reported credit limit.",
      recommendedAction: "Ask the reporting party to review the balance and credit limit.",
      tradelineId: 42,
      responsibleEntity: "CREDITOR",
      technicalDetails: {
        deterministicRuleId: "deterministic-violation-balance-calculation-violation-v1",
        fieldName: "currentBalance",
        evidenceIds: ["evidence-balance-42"],
        evidenceLink: {
          evidenceId: "evidence-balance-42",
          fieldName: "currentBalance",
          reportArtifactId: 9001,
          pageNumber: 2,
          textSnippet: "Balance $6,120 Credit limit $5,000",
        },
        regulationReferences: [{ id: "PIPEDA_4_6", citation: "Principle 4.6" }],
        retainedAdminMetadata: { source: "unit-test" },
      },
    };

    const envelope = fromDetectedViolation(violation, {
      findingId: 1001,
      bureau: "TransUnion Canada",
      userStatus: "active",
      validationStatus: "PENDING",
    });

    expect(envelope).toMatchObject({
      findingId: 1001,
      tradelineId: 42,
      bureau: "TransUnion Canada",
      actor: "CREDITOR",
      category: "BALANCE_CALCULATION_VIOLATION",
      technicalRuleId: "deterministic-violation-balance-calculation-violation-v1",
      severity: "ERROR",
      confidenceScore: 96,
      externalReasonKey: "INCORRECT_BALANCE",
      plainLanguageReason: PLAIN_DISPUTE_LETTER_REASONS.INCORRECT_BALANCE,
      sourceType: "detected_violation",
    });
    expect(envelope.sourceFinding).toBe(violation);
    expect(envelope.technicalDetails.retainedAdminMetadata).toEqual({ source: "unit-test" });
    expect(envelope.evidence).toMatchObject({
      hasEvidenceLink: true,
      evidenceIds: ["evidence-balance-42"],
      sourceFields: ["currentBalance"],
    });
    expect(envelope.evidenceQuality).toMatchObject({
      hasEvidence: true,
      needsManualReview: false,
    });
    expect(envelope.readiness.packetReady).toBe(true);
  });

  it("does not crash when evidence metadata is missing", () => {
    const envelope = fromDetectedViolation({
      violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
      severity: "WARNING",
      confidenceScore: 72,
      userExplanation: "The account support information appears incomplete.",
      recommendedAction: "Ask the reporting party to verify the account support.",
      technicalDetails: {
        fieldName: "originalCreditorName",
      },
    });

    expect(envelope.evidence.hasEvidenceLink).toBe(false);
    expect(envelope.evidence.evidenceIds).toEqual([]);
    expect(envelope.evidenceQuality).toMatchObject({
      hasEvidence: false,
      needsManualReview: true,
      reasonCodes: ["MISSING_REQUIRED_EVIDENCE", "MANUAL_REVIEW_REQUIRED"],
    });
    expect(envelope.readiness.packetReady).toBe(false);
    expect(envelope.readiness.reasonCodes).toEqual(
      expect.arrayContaining(["MISSING_REQUIRED_EVIDENCE", "MANUAL_REVIEW_REQUIRED"]),
    );
  });

  it("preserves confidence and severity from creditorObligationTest-style findings", () => {
    const row = {
      id: 501,
      tradelineId: 42,
      bureauName: "Equifax Canada",
      violationCategory: "PAYMENT_HISTORY_MANIPULATION",
      severity: "WARNING",
      confidenceScore: 83,
      userStatus: "active",
      validationStatus: "PENDING",
      obligationState: "OBLIGATION_PENDING",
      recommendedAction: "Review the payment history.",
      technicalDetails: {
        deterministicRuleId: "payment-history-rule-v1",
        fieldName: "paymentHistory",
        evidenceLink: {
          fieldName: "paymentHistory",
          textSnippet: "Payment history 111120111111",
        },
      },
    };

    const envelope = fromCreditorObligationTest(row);

    expect(envelope).toMatchObject({
      findingId: 501,
      tradelineId: 42,
      bureau: "Equifax Canada",
      category: "PAYMENT_HISTORY_MANIPULATION",
      severity: "WARNING",
      confidenceScore: 83,
      technicalRuleId: "payment-history-rule-v1",
      externalReasonKey: "INCORRECT_LATE_PAYMENTS",
      plainLanguageReason: PLAIN_DISPUTE_LETTER_REASONS.INCORRECT_LATE_PAYMENTS,
      status: {
        userStatus: "active",
        validationStatus: "PENDING",
        obligationState: "OBLIGATION_PENDING",
      },
    });
    expect(envelope.sourceFinding).toBe(row);
  });

  it("resolves balance findings to the existing plain-language reason", () => {
    const envelope = safeNormalizeFindingEnvelope({
      violationCategory: "BALANCE_CALCULATION_VIOLATION",
      severity: "ERROR",
      confidenceScore: 100,
      recommendedAction: "correct balance",
      technicalDetails: {
        fieldName: "balance",
        evidenceLink: { fieldName: "balance", textSnippet: "Balance $500" },
      },
    });

    expect(envelope?.externalReasonKey).toBe("INCORRECT_BALANCE");
    expect(envelope?.plainLanguageReason).toBe(PLAIN_DISPUTE_LETTER_REASONS.INCORRECT_BALANCE);
  });

  it("uses fallback plain-language reason for unknown categories", () => {
    const envelope = safeNormalizeFindingEnvelope({
      id: 777,
      tradelineId: 10,
      violationCategory: "SYNTHETIC_UNKNOWN_FINDING",
      severity: "INFO",
      confidenceScore: 55,
      userStatus: "active",
      validationStatus: "PENDING",
      technicalDetails: {},
    });

    expect(envelope?.findingId).toBe(777);
    expect(envelope?.externalReasonKey).toBe("FALLBACK");
    expect(envelope?.plainLanguageReason).toBe(PLAIN_DISPUTE_LETTER_REASONS.FALLBACK);
    expect(envelope?.technicalDetails).toEqual({});
  });
});
