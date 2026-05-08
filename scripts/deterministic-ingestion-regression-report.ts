import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { extractConsumerInfo } from "../helpers/consumerInfoExtractor";
import {
  buildDeterministicCreditReportPipelinePackage,
  type DeterministicPipelinePackage,
} from "../helpers/deterministicCreditReportPipeline";
import { extractEquifaxTradelines } from "../helpers/equifaxPdfExtractor";
import { extractReportMetadata } from "../helpers/reportMetadataExtractor";
import { extractTradelines } from "../helpers/transunionPdfExtractor";
import { assessParserQuality } from "../helpers/parserQuality";
import type { ComprehensiveParseResult, ParsedTradeline } from "../helpers/reportParserTypes";
import {
  equifaxAccountOnlyTextFixture,
  equifaxInstallmentTextFixture,
  equifaxTextFixture,
  transUnionCollapsedSyntheticFixture,
  transUnionLegacyDisclosureFixture,
  transUnionPortalLayoutFixture,
  transUnionTextFixture,
} from "../tests/fixtures/creditReportFixtures";

type FixtureDefinition = {
  id: string;
  bureauName: "TransUnion Canada" | "Equifax Canada";
  text: string;
  extractor: "transunion" | "equifax";
  minTradelines: number;
  expectedAccountMarkers?: number;
  expectConsumerName: boolean;
};

type FixtureReport = {
  id: string;
  bureauName: string;
  tradelines: number;
  canonicalFields: number;
  replayStable: boolean;
  requiredEvidenceCoveragePercent: number;
  requiredFieldsMissingEvidence: number;
  expectedAccountMarkers: number;
  consumerNamePresent: boolean;
};

const originalLog = console.log.bind(console);
const originalInfo = console.info.bind(console);
const originalDebug = console.debug.bind(console);
console.log = () => undefined;
console.info = () => undefined;
console.debug = () => undefined;
console.warn = () => undefined;

const fixtures: FixtureDefinition[] = [
  {
    id: "transunion-consumer-disclosure",
    bureauName: "TransUnion Canada",
    text: transUnionTextFixture,
    extractor: "transunion",
    minTradelines: 1,
    expectConsumerName: true,
  },
  {
    id: "transunion-collapsed-two-tradeline-synthetic",
    bureauName: "TransUnion Canada",
    text: transUnionCollapsedSyntheticFixture,
    extractor: "transunion",
    minTradelines: 2,
    expectedAccountMarkers: 2,
    expectConsumerName: false,
  },
  {
    id: "transunion-legacy-numbered-section",
    bureauName: "TransUnion Canada",
    text: transUnionLegacyDisclosureFixture,
    extractor: "transunion",
    minTradelines: 1,
    expectConsumerName: true,
  },
  {
    id: "transunion-portal-layout",
    bureauName: "TransUnion Canada",
    text: transUnionPortalLayoutFixture,
    extractor: "transunion",
    minTradelines: 1,
    expectConsumerName: true,
  },
  {
    id: "equifax-revolving-and-collection",
    bureauName: "Equifax Canada",
    text: equifaxTextFixture,
    extractor: "equifax",
    minTradelines: 2,
    expectConsumerName: true,
  },
  {
    id: "equifax-installment",
    bureauName: "Equifax Canada",
    text: equifaxInstallmentTextFixture,
    extractor: "equifax",
    minTradelines: 1,
    expectConsumerName: true,
  },
  {
    id: "equifax-account-only-no-consumer-identity",
    bureauName: "Equifax Canada",
    text: equifaxAccountOnlyTextFixture,
    extractor: "equifax",
    minTradelines: 1,
    expectConsumerName: false,
  },
];

function parseFixture(definition: FixtureDefinition): ComprehensiveParseResult {
  const tradelines: ParsedTradeline[] =
    definition.extractor === "equifax"
      ? extractEquifaxTradelines(definition.text)
      : extractTradelines(definition.text);

  return {
    rawText: definition.text,
    sourceBureau: {
      bureauName: definition.bureauName,
      confidence: 100,
    },
    reportMetadata: extractReportMetadata(definition.text),
    consumerInfo: extractConsumerInfo(definition.text),
    tradelines,
    creditScores: [],
    inquiries: [],
    publicRecords: [],
    consumerStatements: [],
    employmentInfo: [],
    paymentHistories: [],
  };
}

function buildPackage(definition: FixtureDefinition): DeterministicPipelinePackage {
  const parseResult = parseFixture(definition);
  return buildDeterministicCreditReportPipelinePackage({
    parseResult,
    rawText: definition.text,
    documentBinarySha256: `${definition.id}-document-sha`,
  });
}

function assertViolationSearchPreservation(): void {
  const uploadResults = readFileSync(resolve("endpoints/upload-results/get_GET.ts"), "utf8");
  const creditorValidation = readFileSync(resolve("endpoints/creditor-validation/list_GET.ts"), "utf8");

  for (const required of [
    '"creditorObligationTest.violationCategory"',
    '"creditorObligationTest.userStatus"',
    '"creditorObligationTest.obligationState"',
    '"tradeline.accountNumber"',
    '"bureau.name as bureauName"',
  ]) {
    assert(uploadResults.includes(required), `upload-results violation search field missing: ${required}`);
  }

  for (const required of [
    "input.creditorId",
    "input.obligationState",
    "input.tradelineId",
    "creditorObligationTest.statutoryBasis",
    "tradeline.accountNumber as tradelineAccountNumber",
    "bureau.name as tradelineBureauName",
  ]) {
    assert(creditorValidation.includes(required), `creditor-validation search field missing: ${required}`);
  }
}

function run(): void {
  const reports: FixtureReport[] = fixtures.map((definition) => {
    const parseResult = parseFixture(definition);
    const parserQuality = assessParserQuality({
      rawHtml: "",
      rawText: definition.text,
      llmData: null,
      parseResult,
      parsedTradelines: parseResult.tradelines,
      extractionSource: "pdf_text",
    });
    const first = buildDeterministicCreditReportPipelinePackage({
      parseResult,
      rawText: definition.text,
      documentBinarySha256: `${definition.id}-document-sha`,
    });
    const second = buildPackage(definition);
    const consumerNamePresent = Boolean(first.finalOutput.consumerInfo?.fullName);

    assert(first.replayHash === second.replayHash, `${definition.id} replay hash changed between identical inputs.`);
    assert(first.finalOutput.tradelines.length >= definition.minTradelines, `${definition.id} parsed too few tradelines.`);
    if (definition.expectedAccountMarkers !== undefined) {
      assert(
        parserQuality.expectedAccountMarkers === definition.expectedAccountMarkers,
        `${definition.id} expected ${definition.expectedAccountMarkers} raw account marker(s), got ${parserQuality.expectedAccountMarkers}.`,
      );
    }
    assert(
      first.finalOutput.tradelines.length >= parserQuality.expectedAccountMarkers,
      `${definition.id} parsed ${first.finalOutput.tradelines.length} tradeline(s), but raw text showed ${parserQuality.expectedAccountMarkers} account marker(s).`,
    );
    assert(
      !parserQuality.issues.some((issue) => issue.code === "PARSER_ACCOUNT_COUNT_MISMATCH"),
      `${definition.id} parser quality reported account-count mismatch.`,
    );
    assert(
      first.finalOutput.evidence.coverage.requiredCoveragePercent === 100,
      `${definition.id} required evidence coverage is ${first.finalOutput.evidence.coverage.requiredCoveragePercent}%; missing ${first.finalOutput.evidence.coverage.requiredFieldsMissingEvidence.join(", ") || "none"}.`,
    );
    assert(
      consumerNamePresent === definition.expectConsumerName,
      `${definition.id} consumer identity expectation failed.`,
    );

    return {
      id: definition.id,
      bureauName: definition.bureauName,
      tradelines: first.finalOutput.tradelines.length,
      canonicalFields: Object.keys(first.finalOutput.fields).length,
      replayStable: first.replayHash === second.replayHash,
      requiredEvidenceCoveragePercent: first.finalOutput.evidence.coverage.requiredCoveragePercent,
      requiredFieldsMissingEvidence:
        first.finalOutput.evidence.coverage.requiredFieldsMissingEvidence.length,
      expectedAccountMarkers: parserQuality.expectedAccountMarkers,
      consumerNamePresent,
    };
  });

  assertViolationSearchPreservation();

  const summary = {
    ok: true,
    fixtures: reports.length,
    fixtureReports: reports,
    violationSearchPreserved: true,
  };

  originalLog(JSON.stringify(summary, null, 2));
}

run();
