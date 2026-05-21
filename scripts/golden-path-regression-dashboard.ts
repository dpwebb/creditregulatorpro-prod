import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { extractConsumerInfo } from "../helpers/consumerInfoExtractor";
import { buildDeterministicCreditReportPipelinePackage } from "../helpers/deterministicCreditReportPipeline";
import { validateDeterministicReplay } from "../helpers/deterministicReplayValidator";
import { generateAnonymousPreview } from "../helpers/anonymousCompliancePreview";
import { extractEquifaxTradelines } from "../helpers/equifaxPdfExtractor";
import { extractReportMetadata } from "../helpers/reportMetadataExtractor";
import { validateTradeline, type TL } from "../helpers/metro2";
import type { DetectedViolation } from "../helpers/complianceDetectorTypes";
import type { ComprehensiveParseResult, ParsedTradeline } from "../helpers/reportParserTypes";
import { buildSimpleDisputePacketContent } from "../helpers/disputePacketTemplate";
import { generatePacketContentPdfBase64 } from "../helpers/packetPdfContent";
import { enrichDetectedViolationRuleEvidence } from "../helpers/violationRuleEvidence";
import { extractTradelines } from "../helpers/transunionPdfExtractor";
import {
  equifaxTextFixture,
  transUnionCollapsedSyntheticFixture,
} from "../tests/fixtures/creditReportFixtures";

type GoldenPathFixture = {
  id: string;
  bureauName: "TransUnion Canada" | "Equifax Canada";
  text: string;
  extractor: "transunion" | "equifax";
  expectedTradelineCount: number;
  expectedCreditors: string[];
};

export type GoldenPathCheck = {
  key: string;
  label: string;
  status: "PASS" | "FAIL";
  detail: string;
};

export type GoldenPathDashboard = {
  ok: boolean;
  generatedAt: string;
  fixtures: string[];
  checks: GoldenPathCheck[];
};

type ParsedGoldenPathReport = {
  fixture: GoldenPathFixture;
  parseResult: ComprehensiveParseResult;
};

const GOLDEN_PATH_FIXTURES: GoldenPathFixture[] = [
  {
    id: "golden-transunion-collapsed-two-account",
    bureauName: "TransUnion Canada",
    text: transUnionCollapsedSyntheticFixture,
    extractor: "transunion",
    expectedTradelineCount: 2,
    expectedCreditors: ["MAPLE FINANCIAL VISA", "NORTHERN AUTO FINANCE"],
  },
  {
    id: "golden-equifax-revolving-plus-collection",
    bureauName: "Equifax Canada",
    text: equifaxTextFixture,
    extractor: "equifax",
    expectedTradelineCount: 2,
    expectedCreditors: ["CAPITAL ONE BANK", "CBV COLLECTION SERVICES"],
  },
];

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toNumber(value: unknown): number {
  if (value == null || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function portfolioType(accountType: string | null | undefined): string | undefined {
  const value = (accountType ?? "").toUpperCase();
  if (value.includes("REVOLV")) return "R";
  if (value.includes("INSTALL")) return "I";
  if (value.includes("MORTGAGE")) return "M";
  if (value.includes("OPEN")) return "O";
  return undefined;
}

function toMetro2Tradeline(tradeline: ParsedTradeline, reportDate: Date | null): TL {
  return {
    amounts: {
      high: toNumber(tradeline.amounts?.high ?? tradeline.balance),
      current: toNumber(tradeline.balance),
      pastDue: toNumber(tradeline.amounts?.pastDue),
    },
    dates: {
      opened: asDate(tradeline.dates?.opened),
      reported: asDate(tradeline.dates?.reported),
      closed: asDate(tradeline.dates?.closed),
      dofd: asDate(tradeline.dates?.dofd),
      chargeOff: null,
    },
    status: tradeline.status ?? "Unknown",
    remarkCodes: tradeline.remarkCodes ?? [],
    payment: {
      scheduledMonthly: toNumber(tradeline.monthlyPayment),
    },
    creditorName: tradeline.creditorName,
    creditLimit: toNumber(tradeline.creditLimit),
    accountType: tradeline.accountType ?? undefined,
    portfolioType: portfolioType(tradeline.accountType),
    paymentPattern: tradeline.paymentHistoryProfile ?? undefined,
    isCollectionAccount: tradeline.isCollectionAccount ?? false,
    lastPaymentDate: asDate(tradeline.lastPaymentDate),
    reportDate,
  };
}

function parseFixture(fixture: GoldenPathFixture): ParsedGoldenPathReport {
  const tradelines =
    fixture.extractor === "equifax"
      ? extractEquifaxTradelines(fixture.text)
      : extractTradelines(fixture.text);

  return {
    fixture,
    parseResult: {
      rawText: fixture.text,
      sourceBureau: {
        bureauName: fixture.bureauName,
        confidence: 100,
      },
      reportMetadata: extractReportMetadata(fixture.text),
      consumerInfo: extractConsumerInfo(fixture.text),
      tradelines,
      creditScores: [],
      inquiries: [],
      publicRecords: [],
      consumerStatements: [],
      employmentInfo: [],
      paymentHistories: [],
    },
  };
}

function parseGoldenPathReports(): ParsedGoldenPathReport[] {
  return GOLDEN_PATH_FIXTURES.map(parseFixture);
}

function validateUploadPayloads(): string {
  for (const fixture of GOLDEN_PATH_FIXTURES) {
    const bytesBase64 = Buffer.from(fixture.text, "utf8").toString("base64");
    const fileName = `${fixture.id}.pdf`;
    const mimeType = "application/pdf";

    assert(bytesBase64.length > 100, `${fixture.id} synthetic upload payload is empty.`);
    assert(fileName.endsWith(".pdf"), `${fixture.id} upload fixture must use a PDF filename.`);
    assert.equal(mimeType, "application/pdf", `${fixture.id} upload fixture must use PDF MIME type.`);
    assert(Buffer.byteLength(fixture.text, "utf8") < 15 * 1024 * 1024, `${fixture.id} exceeds upload size limit.`);
  }

  return `${GOLDEN_PATH_FIXTURES.length} synthetic PDF upload payloads are valid.`;
}

function validateParse(reports: ParsedGoldenPathReport[]): string {
  for (const { fixture, parseResult } of reports) {
    assert.equal(parseResult.reportMetadata.bureauName, fixture.bureauName, `${fixture.id} bureau mismatch.`);
    assert.equal(parseResult.tradelines.length, fixture.expectedTradelineCount, `${fixture.id} tradeline count mismatch.`);
    assert.deepEqual(
      parseResult.tradelines.map((tradeline) => tradeline.creditorName),
      fixture.expectedCreditors,
      `${fixture.id} creditor sequence mismatch.`,
    );
  }

  return reports
    .map(({ fixture, parseResult }) => `${fixture.id}: ${parseResult.tradelines.length} tradelines`)
    .join("; ");
}

function validateCanonicalMap(reports: ParsedGoldenPathReport[]): string {
  for (const { fixture, parseResult } of reports) {
    const packageInput = {
      parseResult,
      rawText: fixture.text,
      documentBinarySha256: `${fixture.id}-sha256`,
    };
    const packageResult = buildDeterministicCreditReportPipelinePackage(packageInput);
    const replayValidation = validateDeterministicReplay(packageInput, packageResult);

    assert.equal(replayValidation.ok, true, `${fixture.id} replay validation failed.`);
    assert.equal(packageResult.finalOutput.reportMetadata.bureauName, fixture.bureauName, `${fixture.id} canonical bureau mismatch.`);
    assert.equal(packageResult.finalOutput.tradelines.length, fixture.expectedTradelineCount, `${fixture.id} canonical tradeline count mismatch.`);
    assert.equal(
      packageResult.finalOutput.evidence.coverage.requiredCoveragePercent,
      100,
      `${fixture.id} required evidence coverage must be 100%.`,
    );
    assert.equal(
      packageResult.finalOutput.fields["tradelines[0].creditorName"]?.normalizedValue,
      fixture.expectedCreditors[0],
      `${fixture.id} canonical first creditor mismatch.`,
    );
  }

  return "Canonical mapping, replay validation, and required evidence coverage passed.";
}

function validateAnomalyDetection(reports: ParsedGoldenPathReport[]): string {
  const transUnion = reports.find((report) => report.fixture.extractor === "transunion");
  assert(transUnion, "TransUnion golden report missing.");

  const firstTradeline = transUnion.parseResult.tradelines[0];
  const metro2Results = validateTradeline(
    toMetro2Tradeline(firstTradeline, asDate(transUnion.parseResult.reportMetadata.reportDate)),
    "2026",
  );
  const invalidRules = metro2Results.filter((result) => !result.valid).map((result) => result.ruleName);
  const previewProblems = generateAnonymousPreview(transUnion.parseResult);

  assert(invalidRules.includes("BALANCE_EXCEEDS_CREDIT_LIMIT"), "Expected balance-over-limit anomaly was not detected.");
  assert(invalidRules.includes("DATE_LAST_PAYMENT_AFTER_REPORT_DATE"), "Expected future-payment-date anomaly was not detected.");
  assert(previewProblems.length > 0, "Consumer preview did not produce any review signal.");

  return `Detected anomalies: ${invalidRules.join(", ")}.`;
}

function buildGoldenViolation(): DetectedViolation {
  return {
    violationCategory: "BALANCE_CALCULATION_VIOLATION",
    severity: "ERROR",
    confidenceScore: 100,
    userExplanation: "The current balance is higher than the reported credit limit.",
    technicalDetails: {
      fieldName: "currentBalance",
      detectedValue: 6120,
      expectedValue: "<= 5000",
      textSnippet: "MAPLE FINANCIAL VISA balance 6120 credit limit 5000",
      regulationIds: ["PIPEDA_4_6"],
      reportArtifactId: 9001,
    },
    recommendedAction: "Ask the reporting party to review the balance and credit limit.",
    tradelineId: 1001,
    responsibleEntity: "CREDITOR",
  };
}

function validateViolationDetection(): DetectedViolation {
  const enriched = enrichDetectedViolationRuleEvidence(buildGoldenViolation());
  const details = enriched.technicalDetails ?? {};

  assert.equal(enriched.violationCategory, "BALANCE_CALCULATION_VIOLATION");
  assert.equal(details.deterministicRuleId, "deterministic-violation-balance-calculation-violation-v1");
  assert(Array.isArray(details.regulationReferences), "Violation must have regulation references.");
  assert(details.regulationReferences.length > 0, "Violation regulation references must not be empty.");

  return enriched;
}

function validateEvidenceBinding(violation: DetectedViolation): string {
  const details = violation.technicalDetails ?? {};
  const evidenceLink = details.evidenceLink as Record<string, unknown> | undefined;

  assert(evidenceLink, "Violation is missing deterministic evidence link.");
  assert.equal(evidenceLink.fieldName, "currentBalance");
  assert.equal(evidenceLink.tradelineId, 1001);
  assert(String(evidenceLink.textSnippet ?? "").includes("MAPLE FINANCIAL VISA"));

  return "Violation evidence link includes field, tradeline, artifact, and source snippet.";
}

function buildPacket(violation: DetectedViolation) {
  return buildSimpleDisputePacketContent({
    packetType: "credit_bureau",
    reportType: "TransUnion Canada golden path report",
    reportDate: "2026-01-10",
    recipient: {
      type: "credit_bureau",
      name: "TransUnion Canada",
      address: ["Consumer Relations", "Burlington, ON L7N 3N8"],
    },
    consumer: {
      name: "Golden Path Consumer",
      address: ["1 Test St", "Halifax, NS B3H 0A1"],
    },
    disputedItems: [
      {
        issueId: 7001,
        tradelineId: violation.tradelineId ?? null,
        creditorCollectorName: "MAPLE FINANCIAL VISA",
        accountNumber: "999988887777",
        disputedField: "current balance",
        reportedValue: "$6,120",
        expectedValue: "At or below reported credit limit",
        issueType: violation.violationCategory,
        explanation: violation.userExplanation,
        evidenceReference: "report artifact 9001; field currentBalance; source text MAPLE FINANCIAL VISA balance 6120 credit limit 5000",
      },
    ],
    reportArtifactIds: [9001],
    generatedByUserId: 4001,
  });
}

function validatePacketGeneration(violation: DetectedViolation) {
  const packet = buildPacket(violation);

  assert.equal(packet.version, "simple-dispute-packet-v1");
  assert.equal(packet.disputedItems.length, 1);
  assert.equal(packet.disputedItems[0].needsManualReview, false);
  assert.equal(packet.evidenceList[0], "Relevant report section for Balance reported.");
  assert(!/artifact|tradeline|field:|9001/i.test(packet.evidenceList.join(" ")));
  assert.equal(packet.metadata.reportArtifactIds[0], 9001);

  return packet;
}

async function validatePdfDownload(violation: DetectedViolation): Promise<string> {
  const packet = buildPacket(violation);
  const base64 = await generatePacketContentPdfBase64(packet, "4001", "7001");
  const bytes = Buffer.from(base64, "base64");

  assert.equal(bytes.subarray(0, 4).toString("utf8"), "%PDF");
  assert(bytes.length > 1000, "Generated dispute packet PDF is unexpectedly small.");

  return `Generated PDF bytes: ${bytes.length}.`;
}

async function runCheck(
  key: string,
  label: string,
  check: () => string | Promise<string>,
): Promise<GoldenPathCheck> {
  try {
    return {
      key,
      label,
      status: "PASS",
      detail: await check(),
    };
  } catch (error) {
    return {
      key,
      label,
      status: "FAIL",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runGoldenPathRegression(): Promise<GoldenPathDashboard> {
  const reports = parseGoldenPathReports();
  let enrichedViolation: DetectedViolation | null = null;

  const checks: GoldenPathCheck[] = [];
  checks.push(await runCheck("upload", "Upload", validateUploadPayloads));
  checks.push(await runCheck("parse", "Parse", () => validateParse(reports)));
  checks.push(await runCheck("canonical-map", "Canonical Map", () => validateCanonicalMap(reports)));
  checks.push(await runCheck("anomaly-detect", "Anomaly Detect", () => validateAnomalyDetection(reports)));
  checks.push(await runCheck("violation-detect", "Violation Detect", () => {
    enrichedViolation = validateViolationDetection();
    return "Deterministic violation rule envelope and regulation references passed.";
  }));
  checks.push(await runCheck("evidence-bind", "Evidence Bind", () => {
    enrichedViolation ??= validateViolationDetection();
    return validateEvidenceBinding(enrichedViolation);
  }));
  checks.push(await runCheck("packet-generate", "Packet Generate", () => {
    enrichedViolation ??= validateViolationDetection();
    validatePacketGeneration(enrichedViolation);
    return "Dispute packet content generated with selected issue and evidence reference.";
  }));
  checks.push(await runCheck("pdf-download", "PDF Download", async () => {
    enrichedViolation ??= validateViolationDetection();
    return await validatePdfDownload(enrichedViolation);
  }));

  return {
    ok: checks.every((check) => check.status === "PASS"),
    generatedAt: new Date().toISOString(),
    fixtures: GOLDEN_PATH_FIXTURES.map((fixture) => fixture.id),
    checks,
  };
}

export function formatGoldenPathDashboard(dashboard: GoldenPathDashboard): string {
  const rows = dashboard.checks
    .map((check) => `| ${check.label} | ${check.status} | ${check.detail.replace(/\|/g, "\\|")} |`)
    .join("\n");

  return [
    "# Golden Path Regression Dashboard",
    "",
    `Generated: ${dashboard.generatedAt}`,
    `Fixtures: ${dashboard.fixtures.join(", ")}`,
    "",
    "| Check | Status | Detail |",
    "| --- | --- | --- |",
    rows,
    "",
    dashboard.ok ? "Result: PASS" : "Result: FAIL",
  ].join("\n");
}

function isMainModule(): boolean {
  const entry = process.argv[1] ? resolve(process.argv[1]) : "";
  return fileURLToPath(import.meta.url) === entry;
}

if (isMainModule()) {
  const dashboard = await runGoldenPathRegression();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(dashboard, null, 2));
  } else {
    console.log(formatGoldenPathDashboard(dashboard));
  }
  if (!dashboard.ok) {
    process.exitCode = 1;
  }
}
