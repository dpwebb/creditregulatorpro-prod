import { describe, expect, it } from "vitest";

import type { DetectedViolation } from "../../helpers/complianceDetectorTypes";
import {
  buildDeterministicViolationRuleEnvelope,
  enrichDetectedViolationRuleEvidence,
  filterViolationsWithLocalAuthorityLinks,
  getDeterministicViolationStatutoryBasis,
  hasBonaFideLocalAuthorityLink,
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
});
