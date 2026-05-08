import { describe, expect, it } from "vitest";

import type { DetectedViolation } from "../../helpers/complianceDetectorTypes";
import {
  buildDeterministicViolationRuleEnvelope,
  enrichDetectedViolationRuleEvidence,
  filterViolationsWithLocalAuthorityLinks,
  getDeterministicViolationStatutoryBasis,
  hasBonaFideLocalAuthorityLink,
  hasFieldSpecificAuthorityForMissingInformation,
  isMissingInformationReviewIssue,
} from "../../helpers/violationRuleEvidence";

function violation(overrides: Partial<DetectedViolation> = {}): DetectedViolation {
  return {
    violationCategory: "BALANCE_CALCULATION_VIOLATION",
    severity: "WARNING",
    confidenceScore: 92,
    userExplanation: "The reported balance does not match the available account values.",
    technicalDetails: {
      fieldName: "balance",
      detectedValue: 1250,
      reportArtifactId: 77,
      textSnippet: "Balance $1,250. High credit $900.",
      regulationIds: ["PIPEDA_4_6"],
    },
    recommendedAction: "Ask the reporting party to review the balance.",
    tradelineId: 42,
    responsibleEntity: "CREDITOR",
    ...overrides,
  };
}

describe("deterministic violation rule evidence", () => {
  it("builds a rule envelope with trigger, source evidence, and regulation references", () => {
    const envelope = buildDeterministicViolationRuleEnvelope(violation());

    expect(envelope?.ruleId).toBe("deterministic-violation-balance-calculation-violation-v1");
    expect(envelope?.factualTrigger).toContain("field=balance");
    expect(envelope?.factualTrigger).toContain("value=1250");
    expect(envelope?.sourceFields).toEqual(["balance"]);
    expect(envelope?.evidence).toEqual(
      expect.objectContaining({
        tradelineId: 42,
        reportArtifactId: 77,
        fieldName: "balance",
        textSnippet: "Balance $1,250. High credit $900.",
      }),
    );
    expect(envelope?.regulationReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "PIPEDA_4_6",
          statute: "PIPEDA",
          citation: "Schedule 1, Principle 4.6",
        }),
      ]),
    );
  });

  it("enriches technical details without changing existing searchable violation fields", () => {
    const original = violation();
    const enriched = enrichDetectedViolationRuleEvidence(original);

    expect(enriched.violationCategory).toBe(original.violationCategory);
    expect(enriched.severity).toBe(original.severity);
    expect(enriched.confidenceScore).toBe(original.confidenceScore);
    expect(enriched.technicalDetails).toEqual(
      expect.objectContaining({
        deterministicRuleId: "deterministic-violation-balance-calculation-violation-v1",
        factualTrigger: expect.stringContaining("field=balance"),
        sourceFields: ["balance"],
        evidenceLink: expect.objectContaining({ tradelineId: 42 }),
        regulationReferences: expect.arrayContaining([
          expect.objectContaining({ id: "PIPEDA_4_6" }),
        ]),
      }),
    );
  });

  it("derives a deterministic statutory basis from registry references", () => {
    const enriched = enrichDetectedViolationRuleEvidence(violation());

    expect(getDeterministicViolationStatutoryBasis(enriched)).toContain(
      "PIPEDA Schedule 1, Principle 4.6",
    );
  });

  it("does not add broad category references when a detector supplied explicit regulation ids", () => {
    const envelope = buildDeterministicViolationRuleEnvelope(
      violation({
        violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
        technicalDetails: {
          fieldName: "dateAssignedToCollection",
          regulationIds: ["PIPEDA_4_6"],
          specificFieldRequirementMapped: false,
        },
      }),
    );

    expect(envelope?.regulationReferences.map((ref) => ref.id)).toEqual(["PIPEDA_4_6"]);
    expect(envelope?.regulationReferences[0]).toEqual(
      expect.objectContaining({
        sourceUrl: expect.stringContaining("laws-lois.justice.gc.ca"),
        supportLevel: "category_principle",
        allowsFieldRequiredLanguage: false,
      }),
    );
  });

  it("limits category fallback authority to the consumer province", () => {
    const envelope = buildDeterministicViolationRuleEnvelope(
      violation({
        violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
        technicalDetails: {
          province: "ON",
          fieldName: "originalCreditorName",
        },
      }),
    );

    const ids = envelope?.regulationReferences.map((ref) => ref.id) ?? [];
    expect(ids).toEqual(expect.arrayContaining(["PIPEDA_4_6", "METRO2_BASE_SEGMENT", "ON_CRA_ACCURACY"]));
    expect(ids.some((id) => /^BC_/.test(id))).toBe(false);
    expect(ids.some((id) => /^[A-Z]{2}_/.test(id) && !id.startsWith("ON_"))).toBe(false);
  });

  it("does not add provincial fallback authority when the consumer province is unknown", () => {
    const envelope = buildDeterministicViolationRuleEnvelope(
      violation({
        violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
        technicalDetails: {
          fieldName: "originalCreditorName",
        },
      }),
    );

    const ids = envelope?.regulationReferences.map((ref) => ref.id) ?? [];
    expect(ids).toEqual(["PIPEDA_4_6", "METRO2_BASE_SEGMENT"]);
  });

  it("drops violations whose explicit regulation ids do not resolve to local authority", () => {
    const unsupported = violation({
      technicalDetails: {
        fieldName: "balance",
        regulationIds: ["NOT_A_LOCAL_AUTHORITY"],
      },
    });

    expect(hasBonaFideLocalAuthorityLink(unsupported)).toBe(false);
    expect(filterViolationsWithLocalAuthorityLinks([unsupported, violation()])).toHaveLength(1);
  });

  it("sanitizes regulation ids to locally resolved authority references", () => {
    const enriched = enrichDetectedViolationRuleEvidence(
      violation({
        technicalDetails: {
          fieldName: "balance",
          regulationIds: ["PIPEDA_4_6", "NOT_A_LOCAL_AUTHORITY"],
        },
      }),
    );

    expect(enriched.technicalDetails?.regulationIds).toEqual(["PIPEDA_4_6"]);
    expect(enriched.technicalDetails?.regulationReferences).toEqual([
      expect.objectContaining({ id: "PIPEDA_4_6" }),
    ]);
  });

  it("does not surface missing closed-date review issues without field-specific authority", () => {
    const missingClosedDate = violation({
      violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
      severity: "ERROR",
      confidenceScore: 100,
      userExplanation: "This account shows as closed but doesn't include a closing date.",
      technicalDetails: {
        ruleName: "DATE_CLOSED_REQUIRED",
        actualValue: "null",
        detectedValue: "null",
        accountType: "INSTALLMENT",
        accountStatus: "Closed",
        regulationIds: ["PIPEDA_4_6", "METRO2_BASE_SEGMENT"],
        province: "NS",
      },
    });

    const envelope = buildDeterministicViolationRuleEnvelope(missingClosedDate);

    expect(envelope?.sourceFields).toEqual(["dateClosed"]);
    expect(envelope?.evidence.fieldName).toBe("dateClosed");
    expect(isMissingInformationReviewIssue(missingClosedDate)).toBe(true);
    expect(hasFieldSpecificAuthorityForMissingInformation(missingClosedDate)).toBe(false);
    expect(filterViolationsWithLocalAuthorityLinks([missingClosedDate])).toEqual([]);
  });

  it.each([
    {
      name: "collection assignment date",
      fieldName: "dateAssignedToCollection",
      accountType: "collection_account",
      province: "ON",
      regulationIds: ["PIPEDA_4_6", "METRO2_BASE_SEGMENT"],
    },
    {
      name: "first delinquency date",
      fieldName: "dateOfFirstDelinquency",
      accountType: "collection_account",
      province: "ON",
      regulationIds: ["PIPEDA_4_6", "METRO2_BASE_SEGMENT"],
    },
    {
      name: "terms field",
      fieldName: "terms",
      accountType: "installment",
      province: "NS",
      regulationIds: ["PIPEDA_4_6", "METRO2_BASE_SEGMENT"],
    },
    {
      name: "judgment creditor on the wrong account type",
      fieldName: "judgmentCreditorName",
      accountType: "installment",
      province: "NS",
      regulationIds: ["PIPEDA_4_6", "NS_CRA_JUDGMENT_FIELDS"],
    },
    {
      name: "legal current status on the wrong account type",
      fieldName: "currentStatus",
      accountType: "installment",
      province: "ON",
      regulationIds: ["PIPEDA_4_6", "ON_CRA_LEGAL_ACTION_STATUS_FIELD"],
    },
  ])("blocks missing-field review issues without exact field/account authority: $name", (input) => {
    const missingField = violation({
      violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
      severity: "ERROR",
      confidenceScore: 96,
      userExplanation: `This account does not include ${input.fieldName}. That information is required.`,
      technicalDetails: {
        fieldName: input.fieldName,
        actualValue: "null",
        detectedValue: "null",
        accountType: input.accountType,
        province: input.province,
        regulationIds: input.regulationIds,
      },
    });

    expect(isMissingInformationReviewIssue(missingField)).toBe(true);
    expect(hasFieldSpecificAuthorityForMissingInformation(missingField)).toBe(false);
    expect(filterViolationsWithLocalAuthorityLinks([missingField])).toEqual([]);
  });

  it("surfaces missing information only when an exact Canadian field mandate matches the province and record type", () => {
    const missingJudgmentCreditor = violation({
      violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
      severity: "ERROR",
      confidenceScore: 96,
      userExplanation: "This judgment record does not include the judgment creditor name.",
      technicalDetails: {
        fieldName: "judgmentCreditorName",
        actualValue: "null",
        detectedValue: "null",
        accountType: "judgment",
        regulationIds: ["PIPEDA_4_6"],
        province: "NS",
      },
    });

    const envelope = buildDeterministicViolationRuleEnvelope(missingJudgmentCreditor);
    const enriched = enrichDetectedViolationRuleEvidence(missingJudgmentCreditor);

    expect(isMissingInformationReviewIssue(missingJudgmentCreditor)).toBe(true);
    expect(hasFieldSpecificAuthorityForMissingInformation(missingJudgmentCreditor)).toBe(true);
    expect(envelope?.regulationReferences.map((ref) => ref.id)).toEqual([
      "PIPEDA_4_6",
      "NS_CRA_JUDGMENT_FIELDS",
    ]);
    expect(envelope?.regulationReferences.find((ref) => ref.id === "PIPEDA_4_6")).toEqual(
      expect.objectContaining({
        authorityIssueClassification: "mapped_legal_authority_issue",
        authorityIssueLabel: "Mapped legal authority issue",
      }),
    );
    expect(envelope?.regulationReferences.find((ref) => ref.id === "NS_CRA_JUDGMENT_FIELDS")).toEqual(
      expect.objectContaining({
        authorityIssueClassification: "confirmed_legal_violation",
        authorityIssueLabel: "Confirmed legal violation",
      }),
    );
    expect(enriched.technicalDetails?.regulationIds).toEqual(["PIPEDA_4_6", "NS_CRA_JUDGMENT_FIELDS"]);
    expect(filterViolationsWithLocalAuthorityLinks([missingJudgmentCreditor])).toHaveLength(1);
  });

  it("does not borrow another province's exact field mandate when the consumer province is unknown", () => {
    const missingJudgmentCreditor = violation({
      violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
      severity: "ERROR",
      confidenceScore: 96,
      userExplanation: "This judgment record does not include the judgment creditor name.",
      technicalDetails: {
        fieldName: "judgmentCreditorName",
        actualValue: "null",
        detectedValue: "null",
        accountType: "judgment",
        regulationIds: ["PIPEDA_4_6"],
      },
    });

    expect(isMissingInformationReviewIssue(missingJudgmentCreditor)).toBe(true);
    expect(hasFieldSpecificAuthorityForMissingInformation(missingJudgmentCreditor)).toBe(false);
    expect(filterViolationsWithLocalAuthorityLinks([missingJudgmentCreditor])).toEqual([]);
  });

  it("does not treat omitted technical values as missing field evidence by themselves", () => {
    const nonMissingDocumentationIssue = violation({
      violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
      userExplanation: "The listed original creditor does not match the account history.",
      technicalDetails: {
        fieldName: "originalCreditorName",
        actualValue: "FIDO",
        regulationIds: ["PIPEDA_4_6"],
      },
    });

    expect(isMissingInformationReviewIssue(nonMissingDocumentationIssue)).toBe(false);
    expect(filterViolationsWithLocalAuthorityLinks([nonMissingDocumentationIssue])).toHaveLength(1);
  });
});
