import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  assertParserRuleRegressionGatePassed,
  assertRegressionGateRequired,
  buildParserRuleRegressionEvidence,
  buildPromotedParserExtractionRuleValues,
  findNewRegressionFailures,
  PARSER_RULE_REGRESSION_EVIDENCE_VERSION,
  TEST_ONLY_REGRESSION_BYPASS_FLAG,
  type DerivedRule,
} from "../../endpoints/parser-test-case/promote-rule_POST";
import {
  buildAppliedParserRuleProvenance,
  extractParserRulePromotionEvidence,
  parserExtractionRuleSemanticConfig,
  SOURCE_LABEL_TO_TRADELINE_FIELD_RULE,
} from "../../helpers/parserExtractionRules";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const supportedRule: Extract<DerivedRule, { supported: true }> = {
  supported: true,
  ruleType: SOURCE_LABEL_TO_TRADELINE_FIELD_RULE,
  fieldPath: "tradelines[].remarkCodes",
  targetField: "remarkCodes",
  config: {
    sourceLabel: "Legend",
    valueType: "stringArray",
    overwriteExisting: true,
  },
  description: "TransUnion tradeline Legend line maps to remarkCodes.",
};

function passingEvidence() {
  return buildParserRuleRegressionEvidence({
    promotedAt: "2026-05-21T12:00:00.000Z",
    promotedBy: 77,
    testCaseId: 10,
    decisionId: "decision-1",
    candidateId: 22,
    targetValidation: { passed: true, reason: null },
    beforeFailures: [{ id: 1, name: "existing failing case", reason: "Existing Failure" }],
    afterFailures: [{ id: 1, name: "existing failing case", reason: "Existing Failure" }],
    newFailures: [],
    regressionGateRequired: true,
  });
}

describe("parser rule governance", () => {
  it("rejects runRegressionGate false in production or staging simulation", () => {
    expect(() =>
      assertRegressionGateRequired(
        { runRegressionGate: false },
        { NODE_ENV: "production", APP_ENV: "staging" },
      ),
    ).toThrow(/requires automated regression evidence/);

    expect(() =>
      assertRegressionGateRequired(
        { runRegressionGate: false },
        { NODE_ENV: "test", [TEST_ONLY_REGRESSION_BYPASS_FLAG]: "true" },
      ),
    ).not.toThrow();
  });

  it("activates a passing rule with stored regression evidence", () => {
    const evidence = passingEvidence();
    const values = buildPromotedParserExtractionRuleValues({
      testCase: { bureau: "TransUnion Canada" },
      rule: supportedRule,
      candidateId: 22,
      userId: 77,
      regressionEvidence: evidence,
    });

    expect(values.isActive).toBe(true);
    expect(values.createdFromCandidateId).toBe(22);
    expect(values.createdBy).toBe(77);
    expect(extractParserRulePromotionEvidence(values.config)).toMatchObject({
      version: PARSER_RULE_REGRESSION_EVIDENCE_VERSION,
      candidateId: 22,
      targetValidation: { passed: true },
      regressionGate: { required: true, passed: true, newFailures: [] },
    });
    expect(parserExtractionRuleSemanticConfig(values.config)).toEqual(supportedRule.config);
  });

  it("does not allow activation when the regression gate has a new failure", () => {
    const beforeFailures = [{ id: 1, name: "existing failing case", reason: "Existing Failure" }];
    const afterFailures = [
      ...beforeFailures,
      { id: 2, name: "new failing case", reason: "Tradeline Mismatch" },
    ];
    const newFailures = findNewRegressionFailures(beforeFailures, afterFailures);
    const evidence = buildParserRuleRegressionEvidence({
      promotedAt: "2026-05-21T12:05:00.000Z",
      promotedBy: 77,
      testCaseId: 10,
      decisionId: "decision-1",
      candidateId: 22,
      targetValidation: { passed: true, reason: null },
      beforeFailures,
      afterFailures,
      newFailures,
      regressionGateRequired: true,
    });

    expect(newFailures).toEqual([{ id: 2, name: "new failing case", reason: "Tradeline Mismatch" }]);
    expect(evidence.regressionGate.passed).toBe(false);
    expect(() => assertParserRuleRegressionGatePassed(evidence)).toThrow(/cannot be activated/);

    const endpointSource = source("endpoints/parser-test-case/promote-rule_POST.ts");
    expect(endpointSource.indexOf("assertParserRuleRegressionGatePassed(regressionEvidence);"))
      .toBeLessThan(endpointSource.indexOf('.insertInto("parserExtractionRule")'));
  });

  it("adds active parser rule evidence and version to canonical provenance support", () => {
    const evidence = passingEvidence();
    const values = buildPromotedParserExtractionRuleValues({
      testCase: { bureau: "TransUnion Canada" },
      rule: supportedRule,
      candidateId: 22,
      userId: 77,
      regressionEvidence: evidence,
    });
    const provenance = buildAppliedParserRuleProvenance(
      [
        {
          id: 101,
          bureau: "TransUnion Canada",
          ruleType: supportedRule.ruleType,
          fieldPath: supportedRule.fieldPath,
          targetField: supportedRule.targetField,
          config: values.config,
          isActive: true,
          priority: 100,
          createdFromCandidateId: 22,
        },
      ],
      [101],
    );

    expect(provenance).toEqual([
      expect.objectContaining({
        id: 101,
        governanceVersion: PARSER_RULE_REGRESSION_EVIDENCE_VERSION,
        createdFromCandidateId: 22,
        regressionGatePassed: true,
        targetValidationPassed: true,
        promotedAt: "2026-05-21T12:00:00.000Z",
      }),
    ]);
    expect(provenance[0].regressionEvidenceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(source("helpers/canonicalCreditReportExtractor.tsx")).toContain(
      "appliedParserRules: activeParserRuleProvenance",
    );
  });
});
