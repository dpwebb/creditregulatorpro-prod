import { describe, expect, it } from "vitest";

import type { DetectedViolation } from "../../helpers/complianceDetectorTypes";
import {
  classifyDetectedViolationEligibility,
} from "../../helpers/complianceFindingEligibility";
import {
  enrichDetectedViolationRuleEvidence,
  getDeterministicViolationStatutoryBasis,
} from "../../helpers/violationRuleEvidence";

function violation(overrides: Partial<DetectedViolation> = {}): DetectedViolation {
  return {
    violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
    severity: "WARNING",
    confidenceScore: 92,
    userExplanation: "The report item requires review.",
    technicalDetails: {
      fieldName: "accountNumber",
      reportArtifactId: 77,
      textSnippet: "Account number not shown.",
      regulationIds: ["PIPEDA_4_6"],
    },
    recommendedAction: "Ask the reporting party to verify the account.",
    tradelineId: 42,
    responsibleEntity: "CREDITOR",
    ...overrides,
  };
}

describe("formal violation eligibility boundary", () => {
  it("classifies an exact official field mandate as a true regulatory violation", () => {
    const enriched = enrichDetectedViolationRuleEvidence(
      violation({
        violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
        severity: "ERROR",
        confidenceScore: 96,
        userExplanation: "This judgment record does not include the judgment creditor name.",
        technicalDetails: {
          fieldName: "judgmentCreditorName",
          actualValue: "null",
          detectedValue: "null",
          accountType: "judgment",
          province: "NS",
          reportArtifactId: 77,
          textSnippet: "Judgment creditor name not shown.",
          regulationIds: ["PIPEDA_4_6"],
        },
      }),
    );

    const eligibility = classifyDetectedViolationEligibility(enriched);

    expect(eligibility).toEqual(
      expect.objectContaining({
        findingKind: "regulatory_violation",
        confidenceClass: "VERIFIED_REGULATORY_VIOLATION",
        formalViolationEligible: true,
        legalConclusionAllowed: true,
        explicitAuthorityMapped: true,
        deterministicBreachLogic: true,
        evidenceLinked: true,
        confidenceThresholdMet: true,
      }),
    );
    expect(eligibility.statutoryReferenceIds).toContain("NS_CRA_JUDGMENT_FIELDS");
    expect(getDeterministicViolationStatutoryBasis(enriched)).toContain("Nova Scotia Consumer Reporting Act");
  });

  it("keeps broad PIPEDA inconsistency findings as dispute-only signals", () => {
    const enriched = enrichDetectedViolationRuleEvidence(
      violation({
        violationCategory: "CROSS_BUREAU_INCONSISTENCY",
        severity: "WARNING",
        confidenceScore: 90,
        userExplanation: "The same account shows different balances across bureaus.",
        technicalDetails: {
          fieldName: "balance",
          reportArtifactId: 77,
          textSnippet: "Balance differs across bureau reports.",
          regulationIds: ["PIPEDA_4_6"],
        },
      }),
    );

    const eligibility = classifyDetectedViolationEligibility(enriched);

    expect(eligibility).toEqual(
      expect.objectContaining({
        findingKind: "inconsistency",
        confidenceClass: "HIGH_CONFIDENCE_DISPUTE_BASIS",
        formalViolationEligible: false,
        legalConclusionAllowed: false,
        explicitAuthorityMapped: false,
        evidenceLinked: true,
        confidenceThresholdMet: true,
      }),
    );
    expect(eligibility.reasonCodes).toContain("NO_EXPLICIT_STATUTORY_AUTHORITY");
    expect(getDeterministicViolationStatutoryBasis(enriched)).toBeNull();
  });

  it("marks weak or unsupported findings as manual-review-only rather than statutory violations", () => {
    const enriched = enrichDetectedViolationRuleEvidence(
      violation({
        violationCategory: "BANKRUPTCY_DISCHARGE_VIOLATION",
        severity: "ERROR",
        confidenceScore: 40,
        userExplanation: "Bankruptcy reporting requires review.",
        technicalDetails: {
          bankruptcyRecordId: 5,
          regulationIds: ["BIA_S178_2"],
        },
      }),
    );

    const eligibility = classifyDetectedViolationEligibility(enriched);

    expect(eligibility).toEqual(
      expect.objectContaining({
        findingKind: "manual_review_only",
        confidenceClass: "INSUFFICIENT_EVIDENCE",
        formalViolationEligible: false,
        legalConclusionAllowed: false,
        explicitAuthorityMapped: true,
        evidenceLinked: false,
        confidenceThresholdMet: false,
      }),
    );
    expect(eligibility.reasonCodes).toEqual(
      expect.arrayContaining(["NO_EVIDENCE_LINK", "CONFIDENCE_BELOW_THRESHOLD"]),
    );
  });

  it("keeps evidence-linked manual-review categories out of violation status", () => {
    const eligibility = classifyDetectedViolationEligibility(
      violation({
        violationCategory: "IDENTITY_THEFT_VIOLATION",
        severity: "WARNING",
        confidenceScore: 88,
        userExplanation: "Identity information requires review.",
        technicalDetails: {
          reportArtifactId: 91,
          fieldName: "remarks",
          textSnippet: "Potential unauthorized account.",
          regulationIds: ["PIPEDA_4_3"],
        },
      }),
    );

    expect(eligibility).toEqual(
      expect.objectContaining({
        findingKind: "manual_review_only",
        confidenceClass: "REVIEW_RECOMMENDED",
        formalViolationEligible: false,
        legalConclusionAllowed: false,
        evidenceLinked: true,
        confidenceThresholdMet: true,
      }),
    );
  });
});
