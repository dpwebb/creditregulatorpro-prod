import { Selectable } from "kysely";
import { db } from "../../helpers/db";
import { BusinessRuleError, handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { isAdmin } from "../../helpers/userRoleUtils";
import { Json, ParserExtractionRule, ParserTestCase } from "../../helpers/schema";
import { ensureParserTestAdjudicationSchema } from "../../helpers/parserTestAdjudicationSchema";
import { ensureParserRulePromotionSchema } from "../../helpers/parserRulePromotionSchema";
import {
  applyParserExtractionRules,
  MISSING_TRADELINE_FIELD_RULE,
  parserExtractionRuleConfigToJson,
  ParserExtractionRuleLike,
  SOURCE_LABEL_TO_TRADELINE_FIELD_RULE,
} from "../../helpers/parserExtractionRules";
import { parsePdfThroughProductionHtmlPipeline } from "../../helpers/parserTestProductionParser";
import { compareConsumerInfo, compareTradelines, hasAnyExpectations } from "../../helpers/parserPatternAnalyzer";
import {
  acceptDecisionCoveredByExistingRule,
  EXISTING_ACTIVE_RULE_COVERAGE_MESSAGE,
} from "../../helpers/parserRulePromotionDecision";
import { ExtractedConsumerInfo } from "../../helpers/consumerInfoExtractorTypes";
import { ParsedTradeline } from "../../helpers/reportParser";
import { schema, OutputType } from "./promote-rule_POST.schema";

type ParserDecisionRecord = Record<string, unknown>;

type DerivedRule =
  | {
      supported: true;
      ruleType: string;
      fieldPath: string;
      targetField: string;
      config: Record<string, unknown>;
      description: string;
    }
  | {
      supported: false;
      ruleType: string;
      config: Record<string, unknown>;
      message: string;
    };

type EvaluationFailure = { id: number; name: string; reason: string };

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDecisionValue(value: unknown): Json | null {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value)) as Json;
}

function stableJson(value: unknown): string {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function preferredTradelineExpectations(approved: unknown, fallback: unknown): unknown {
  return Array.isArray(approved) && approved.length > 0 ? approved : fallback;
}

function findDecision(testCase: Selectable<ParserTestCase>, decisionId: string): ParserDecisionRecord {
  const decision = asArray(testCase.adjudicationDecisions)
    .map(asRecord)
    .find((entry) => stringValue(entry.id) === decisionId);

  if (!decision) {
    throw new BusinessRuleError("Parser adjudication decision not found for this test case.", 404);
  }

  return decision;
}

function isTransUnionBureau(value: string | null | undefined): boolean {
  return /trans\s*union|transunion/i.test(value || "");
}

function extractSourceLabel(decision: ParserDecisionRecord): string | null {
  const haystack = [
    stringValue(decision.sourceEvidence),
    stringValue(decision.reason),
    stringValue(decision.correctValue),
    stringValue(decision.parsedValue),
  ].join("\n");

  if (/legend\s*:/i.test(haystack) || /\blegend\b/i.test(haystack)) return "Legend";
  if (/remark\s+codes?\s*:/i.test(haystack)) return "Remark Codes";
  if (/remarks?\s*:/i.test(haystack)) return "Remarks";

  return null;
}

function normalizedToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function valueMeansNotProvided(value: unknown): boolean {
  const token = normalizedToken(value);
  return (
    token === "notprovided" ||
    token === "notprovidedbybureau" ||
    token === "notreported" ||
    token === "notreportedbybureau" ||
    token === "notoncreditreport" ||
    token === "notavailable"
  );
}

function decisionSaysBureauDidNotProvideField(decision: ParserDecisionRecord): boolean {
  if (valueMeansNotProvided(decision.correctValue)) return true;

  const haystack = [
    stringValue(decision.sourceEvidence),
    stringValue(decision.reason),
  ].join("\n");

  return (
    /not\s+(?:on|in)\s+(?:the\s+)?(?:credit\s+)?report/i.test(haystack) ||
    /(?:does\s+not|do\s+not|did\s+not)\s+include/i.test(haystack) ||
    /not\s+provided\s+by\s+bureau/i.test(haystack) ||
    /not\s+reported\s+by\s+bureau/i.test(haystack)
  );
}

function deriveRule(testCase: Selectable<ParserTestCase>, decision: ParserDecisionRecord): DerivedRule {
  const decisionType = stringValue(decision.decision);
  const entityType = stringValue(decision.entityType);
  const fieldPath = stringValue(decision.fieldPath);

  if (!["corrected", "missing"].includes(decisionType)) {
    return {
      supported: false,
      ruleType: "manual_review",
      config: { reason: "Only corrected and missing parser decisions can be promoted automatically." },
      message: "Only corrected or missing parser decisions can be promoted automatically.",
    };
  }

  if (entityType !== "tradeline") {
    return {
      supported: false,
      ruleType: "manual_review",
      config: { reason: "Automatic raw-text promotion currently supports tradeline fields only." },
      message: "Automatic promotion currently supports tradeline fields only.",
    };
  }

  const targetMatch = fieldPath.match(/^tradelines\[\d+\]\.(.+)$/);
  const targetField = targetMatch?.[1] || "";
  const sourceLabel = extractSourceLabel(decision);

  if (
    isTransUnionBureau(testCase.bureau) &&
    targetField === "remarkCodes" &&
    sourceLabel === "Legend"
  ) {
    return {
      supported: true,
      ruleType: SOURCE_LABEL_TO_TRADELINE_FIELD_RULE,
      fieldPath: "tradelines[].remarkCodes",
      targetField: "remarkCodes",
      config: {
        sourceLabel,
        valueType: "stringArray",
        overwriteExisting: true,
      },
      description: "TransUnion tradeline Legend line maps to remarkCodes.",
    };
  }

  if (
    isTransUnionBureau(testCase.bureau) &&
    targetField === "accountNumber" &&
    decisionSaysBureauDidNotProvideField(decision)
  ) {
    const replacementValue = stringValue(decision.correctValue) || "Not Provided by Bureau";
    return {
      supported: true,
      ruleType: MISSING_TRADELINE_FIELD_RULE,
      fieldPath: "tradelines[].accountNumber",
      targetField: "accountNumber",
      config: {
        replacementValue,
        missingValues: ["Unknown", "Not Reported", "Not Provided", "Not Available", "N/A", "NA"],
        overwriteExisting: false,
      },
      description: "TransUnion missing tradeline account numbers normalize to a bureau-not-provided value.",
    };
  }

  return {
    supported: false,
    ruleType: "manual_review",
    config: {
      reason: "No supported automatic parser-rule template matched this decision.",
      bureau: testCase.bureau,
      entityType,
      fieldPath,
      sourceLabel,
    },
    message:
      "No supported automatic rule template matched this correction. A candidate was recorded for developer review.",
  };
}

function buildTransientRule(
  id: number,
  testCase: Selectable<ParserTestCase>,
  rule: Extract<DerivedRule, { supported: true }>,
): ParserExtractionRuleLike {
  return {
    id,
    bureau: testCase.bureau || "Unknown",
    ruleType: rule.ruleType,
    fieldPath: rule.fieldPath,
    targetField: rule.targetField,
    config: parserExtractionRuleConfigToJson(rule.config),
    isActive: true,
    priority: 100,
  };
}

async function evaluateTestCase(
  testCase: Selectable<ParserTestCase>,
  extraRules: ParserExtractionRuleLike[] = [],
): Promise<{ passed: boolean; reason: string | null }> {
  const { parseResult, rawExtractedText } = await parsePdfThroughProductionHtmlPipeline(
    testCase.pdfBase64,
    {
      allowAiFallback: false,
      parserMode: "deterministic",
    },
  );
  const effectiveParseResult =
    extraRules.length > 0
      ? applyParserExtractionRules(parseResult, extraRules).parseResult
      : parseResult;

  const expectedConsumerInfo = testCase.approvedConsumerInfo ?? testCase.expectedConsumerInfo;
  const expectedTradelines = preferredTradelineExpectations(
    testCase.approvedTradelines,
    testCase.expectedTradelines,
  );
  const hasExpectations = hasAnyExpectations(
    expectedConsumerInfo as unknown as Partial<ExtractedConsumerInfo>,
    expectedTradelines as unknown as ParsedTradeline[],
  );
  const consumerInfoResults = compareConsumerInfo(
    expectedConsumerInfo as unknown as Partial<ExtractedConsumerInfo>,
    effectiveParseResult.consumerInfo,
    rawExtractedText,
  );
  const tradelineResults = compareTradelines(
    expectedTradelines as unknown as ParsedTradeline[],
    effectiveParseResult.tradelines,
    rawExtractedText,
  );
  const consumerInfoPassed = consumerInfoResults.every((result) => result.passed);
  const tradelinesPassed = tradelineResults.every((result) => result.passed);
  const passed = hasExpectations && consumerInfoPassed && tradelinesPassed;

  let reason: string | null = null;
  if (!hasExpectations) reason = "No Expected Values Configured";
  else if (!consumerInfoPassed) reason = "Consumer Info Mismatch";
  else if (!tradelinesPassed) reason = "Tradeline Mismatch";

  return { passed, reason };
}

async function evaluateAllTestCases(): Promise<EvaluationFailure[]> {
  const testCases = await db
    .selectFrom("parserTestCase")
    .selectAll()
    .execute();
  const failures: EvaluationFailure[] = [];

  for (const testCase of testCases) {
    try {
      const result = await evaluateTestCase(testCase);
      if (!result.passed) {
        failures.push({
          id: testCase.id,
          name: testCase.name,
          reason: result.reason || "Unknown Failure",
        });
      }
    } catch (error) {
      failures.push({
        id: testCase.id,
        name: testCase.name,
        reason: `Exception: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }

  return failures;
}

async function findExistingActiveRule(
  testCase: Selectable<ParserTestCase>,
  rule: Extract<DerivedRule, { supported: true }>,
): Promise<Selectable<ParserExtractionRule> | null> {
  const candidates = await db
    .selectFrom("parserExtractionRule")
    .selectAll()
    .where("bureau", "=", testCase.bureau || "Unknown")
    .where("ruleType", "=", rule.ruleType)
    .where("fieldPath", "=", rule.fieldPath)
    .where("targetField", "=", rule.targetField)
    .where("isActive", "=", true)
    .execute();

  const wantedConfig = stableJson(rule.config);
  return candidates.find((candidate) => stableJson(candidate.config) === wantedConfig) || null;
}

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (!isAdmin(user)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 403 });
    }

    const input = schema.parse(JSON.parse(await request.text()));
    const runRegressionGate = input.runRegressionGate ?? true;

    await ensureParserTestAdjudicationSchema();
    await ensureParserRulePromotionSchema();

    const testCase = await db
      .selectFrom("parserTestCase")
      .selectAll()
      .where("id", "=", input.testCaseId)
      .executeTakeFirstOrThrow();
    const decision = findDecision(testCase, input.decisionId);
    const derivedRule = deriveRule(testCase, decision);
    let supportedRule: Extract<DerivedRule, { supported: true }> | null = null;
    let blockedMessage: string | null = null;
    if (derivedRule.supported === true) {
      supportedRule = derivedRule;
    } else {
      blockedMessage = (derivedRule as Extract<DerivedRule, { supported: false }>).message;
    }

    const insertedCandidate = await db
      .insertInto("parserRuleCandidate")
      .values({
        testCaseId: testCase.id,
        decisionId: input.decisionId,
        bureau: testCase.bureau,
        parserMode: testCase.parserMode,
        stageVersion: testCase.stageVersion,
        entityType: stringValue(decision.entityType) || "other",
        entityKey: stringValue(decision.entityKey) || null,
        fieldPath: stringValue(decision.fieldPath),
        parsedValue: normalizeDecisionValue(decision.parsedValue),
        approvedValue: normalizeDecisionValue(decision.correctValue),
        sourceEvidence: stringValue(decision.sourceEvidence) || null,
        parserInstruction: stringValue(decision.reason) || null,
        ruleType: derivedRule.ruleType,
        ruleConfig: parserExtractionRuleConfigToJson(derivedRule.config),
        status: derivedRule.supported ? "candidate" : "blocked",
        validationSummary: blockedMessage
          ? normalizeDecisionValue({ message: blockedMessage })
          : null,
        createdBy: user.id,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    if (!supportedRule) {
      const output: OutputType = {
        candidate: {
          id: insertedCandidate.id,
          status: "blocked",
          ruleType: insertedCandidate.ruleType,
          ruleConfig: insertedCandidate.ruleConfig,
          activatedRuleId: null,
        },
        activated: false,
        message: blockedMessage || "Rule candidate requires developer review.",
        targetValidation: {
          passed: false,
          reason: blockedMessage || "Rule candidate requires developer review.",
        },
      };
      return new Response(JSON.stringify(output), { headers: { "Content-Type": "application/json" } });
    }

    const transientRule = buildTransientRule(-insertedCandidate.id, testCase, supportedRule);
    const targetValidation = await evaluateTestCase(testCase, [transientRule]);

    if (!targetValidation.passed) {
      await db
        .updateTable("parserRuleCandidate")
        .set({
          status: "failed_validation",
          validationSummary: normalizeDecisionValue({ targetValidation }) as Json,
          updatedAt: new Date(),
        })
        .where("id", "=", insertedCandidate.id)
        .execute();

      const output: OutputType = {
        candidate: {
          id: insertedCandidate.id,
          status: "failed_validation",
          ruleType: insertedCandidate.ruleType,
          ruleConfig: insertedCandidate.ruleConfig,
          activatedRuleId: null,
        },
        activated: false,
        message: "Rule candidate did not make the originating parser test pass.",
        targetValidation,
      };
      return new Response(JSON.stringify(output), { headers: { "Content-Type": "application/json" } });
    }

    const beforeFailures = runRegressionGate ? await evaluateAllTestCases() : [];
    const existingRule = await findExistingActiveRule(testCase, supportedRule);
    const activeRule = existingRule || (await db
      .insertInto("parserExtractionRule")
      .values({
        bureau: testCase.bureau || "Unknown",
        ruleType: supportedRule.ruleType,
        fieldPath: supportedRule.fieldPath,
        targetField: supportedRule.targetField,
        config: parserExtractionRuleConfigToJson(supportedRule.config),
        isActive: true,
        priority: 100,
        description: supportedRule.description,
        createdFromCandidateId: insertedCandidate.id,
        createdBy: user.id,
      })
      .returningAll()
      .executeTakeFirstOrThrow());

    const afterFailures = runRegressionGate ? await evaluateAllTestCases() : [];
    const beforeFailureIds = new Set(beforeFailures.map((failure) => failure.id));
    const newFailures = afterFailures.filter((failure) => !beforeFailureIds.has(failure.id));

    if (newFailures.length > 0 && !existingRule) {
      await db
        .updateTable("parserExtractionRule")
        .set({
          isActive: false,
          updatedAt: new Date(),
        })
        .where("id", "=", activeRule.id)
        .execute();

      await db
        .updateTable("parserRuleCandidate")
        .set({
          status: "failed_regression",
          activatedRuleId: activeRule.id,
          validationSummary: normalizeDecisionValue({
            targetValidation,
            regressionGate: {
              beforeFailed: beforeFailures.length,
              afterFailed: afterFailures.length,
              newFailures,
            },
          }) as Json,
          updatedAt: new Date(),
        })
        .where("id", "=", insertedCandidate.id)
        .execute();

      const output: OutputType = {
        candidate: {
          id: insertedCandidate.id,
          status: "failed_regression",
          ruleType: insertedCandidate.ruleType,
          ruleConfig: insertedCandidate.ruleConfig,
          activatedRuleId: activeRule.id,
        },
        activated: false,
        message: "Rule candidate was rolled back because it introduced new parser-test failures.",
        targetValidation,
        regressionGate: {
          beforeFailed: beforeFailures.length,
          afterFailed: afterFailures.length,
          newFailures,
        },
      };
      return new Response(JSON.stringify(output), { headers: { "Content-Type": "application/json" } });
    }

    await db
      .updateTable("parserRuleCandidate")
      .set({
        status: "activated",
        activatedRuleId: activeRule.id,
        validationSummary: normalizeDecisionValue({
          targetValidation,
          regressionGate: runRegressionGate
            ? {
                beforeFailed: beforeFailures.length,
                afterFailed: afterFailures.length,
                newFailures,
              }
            : null,
          reusedExistingRule: Boolean(existingRule),
        }) as Json,
        updatedAt: new Date(),
      })
      .where("id", "=", insertedCandidate.id)
      .execute();

    if (existingRule) {
      const acceptance = acceptDecisionCoveredByExistingRule(
        testCase.adjudicationDecisions,
        input.decisionId,
        activeRule.id,
        user.id,
      );
      if (acceptance.changed) {
        await db
          .updateTable("parserTestCase")
          .set({
            adminReviewStatus: acceptance.hasRemainingPromotableDecisions
              ? testCase.adminReviewStatus
              : testCase.adminReviewStatus === "approved"
                ? "approved"
                : "partially_reviewed",
            adjudicationDecisions: acceptance.decisions,
            updatedAt: new Date(),
          })
          .where("id", "=", testCase.id)
          .execute();
      }
    }

    const output: OutputType = {
      candidate: {
        id: insertedCandidate.id,
        status: "activated",
        ruleType: insertedCandidate.ruleType,
        ruleConfig: insertedCandidate.ruleConfig,
        activatedRuleId: activeRule.id,
      },
      activated: true,
      message: existingRule
        ? EXISTING_ACTIVE_RULE_COVERAGE_MESSAGE
        : "Parser rule promoted and activated.",
      targetValidation,
      ...(runRegressionGate
        ? {
            regressionGate: {
              beforeFailed: beforeFailures.length,
              afterFailed: afterFailures.length,
              newFailures,
            },
          }
        : {}),
    };

    return new Response(JSON.stringify(output), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return handleEndpointError(error);
  }
}
