import { describe, expect, it } from "vitest";

import type { DetectedViolation } from "../../helpers/complianceDetectorTypes";
import {
  buildDeterministicViolationRuleEnvelope,
  enrichDetectedViolationRuleEvidence,
  getDeterministicViolationStatutoryBasis,
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
});
