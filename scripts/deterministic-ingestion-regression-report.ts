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
  equifaxCollapsedCollectionsTextFixture,
  equifaxInstallmentTextFixture,
  equifaxMortgageTextFixture,
  equifaxTextFixture,
  transUnionCollapsedSyntheticFixture,
  transUnionLegacyDisclosureFixture,
  transUnionPortalLayoutFixture,
  transUnionPortalTwoAccountTextOrderFixture,
  transUnionRegionalDisclosureTextFixture,
  transUnionTextFixture,
} from "../tests/fixtures/creditReportFixtures";

type ExpectedTradeline = {
  creditorName: string;
  accountNumber?: string;
  accountType?: string;
  balance?: number | null;
  high?: number;
  pastDue?: number;
  creditLimit?: number;
  opened?: string;
  reported?: string;
  dofd?: string;
  lastPaymentDate?: string;
  dateAssignedToCollection?: string;
  isCollectionAccount?: boolean;
  collectionAgencyName?: string;
  originalCreditorName?: string;
  originalBalance?: number;
};

type FixtureDefinition = {
  id: string;
  bureauName: "TransUnion Canada" | "Equifax Canada";
  text: string;
  extractor: "transunion" | "equifax";
  expectedTradelineCount: number;
  expectedAccountMarkers?: number;
  expectConsumerName: boolean;
  expectedReportDate?: string;
  expectedTransUnionCaseId?: string;
  expectedConsumerDob?: string;
  expectedPostalCode?: string;
  expectedTradelines: ExpectedTradeline[];
};

type FixtureReport = {
  id: string;
  bureauName: string;
  tradelines: number;
  expectedTradelines: number;
  canonicalFields: number;
  replayStable: boolean;
  requiredEvidenceCoveragePercent: number;
  requiredFieldsMissingEvidence: number;
  expectedAccountMarkers: number;
  consumerNamePresent: boolean;
  verifiedFields: number;
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
    expectedTradelineCount: 1,
    expectConsumerName: true,
    expectedReportDate: "2026-01-10",
    expectedTransUnionCaseId: "L121322",
    expectedConsumerDob: "1961-01-30",
    expectedPostalCode: "B0N 2J0",
    expectedTradelines: [
      {
        creditorName: "BANK OF NOVA SCOTIA",
        accountType: "INSTALLMENT",
        balance: 0,
        high: 522,
        pastDue: 0,
        creditLimit: 31320,
        opened: "2011-09-03",
        reported: "2013-10-31",
        lastPaymentDate: "2013-10-03",
      },
    ],
  },
  {
    id: "transunion-collapsed-two-tradeline-synthetic",
    bureauName: "TransUnion Canada",
    text: transUnionCollapsedSyntheticFixture,
    extractor: "transunion",
    expectedTradelineCount: 2,
    expectedAccountMarkers: 2,
    expectConsumerName: true,
    expectedReportDate: "2026-01-10",
    expectedTradelines: [
      {
        creditorName: "MAPLE FINANCIAL VISA",
        accountType: "REVOLVING",
        balance: 6120,
        high: 6120,
        pastDue: 730,
        creditLimit: 5000,
        opened: "2021-04-13",
        reported: "2025-12-16",
        dofd: "2025-09-14",
        lastPaymentDate: "2027-01-14",
      },
      {
        creditorName: "NORTHERN AUTO FINANCE",
        accountType: "INSTALLMENT",
        balance: 11244,
        high: 28750,
        pastDue: 0,
        opened: "2022-06-18",
        reported: "2025-11-30",
        lastPaymentDate: "2025-11-14",
      },
    ],
  },
  {
    id: "transunion-legacy-numbered-section",
    bureauName: "TransUnion Canada",
    text: transUnionLegacyDisclosureFixture,
    extractor: "transunion",
    expectedTradelineCount: 1,
    expectConsumerName: true,
    expectedReportDate: "2026-01-10",
    expectedTransUnionCaseId: "L999888",
    expectedConsumerDob: "1961-01-30",
    expectedPostalCode: "B3J 1A1",
    expectedTradelines: [
      {
        creditorName: "SAMPLE BANK VISA",
        accountNumber: "********1111",
        accountType: "REVOLVING",
        balance: 2345.67,
        opened: "2020-01-15",
        reported: "2026-01-10",
      },
    ],
  },
  {
    id: "transunion-portal-layout",
    bureauName: "TransUnion Canada",
    text: transUnionPortalLayoutFixture,
    extractor: "transunion",
    expectedTradelineCount: 1,
    expectConsumerName: true,
    expectedReportDate: "2026-01-10",
    expectedConsumerDob: "1961-01-30",
    expectedPostalCode: "B0N 2J0",
    expectedTradelines: [
      {
        creditorName: "ROYAL BANK VISA",
        accountNumber: "********1111",
        accountType: "REVOLVING",
        balance: 0,
        opened: "2021-06-01",
        reported: "2026-01-10",
      },
    ],
  },
  {
    id: "transunion-regional-numbered-disclosure",
    bureauName: "TransUnion Canada",
    text: transUnionRegionalDisclosureTextFixture,
    extractor: "transunion",
    expectedTradelineCount: 1,
    expectConsumerName: true,
    expectedReportDate: "2026-02-05",
    expectedTransUnionCaseId: "AB-2026-77",
    expectedConsumerDob: "1982-02-05",
    expectedPostalCode: "E1C 1A1",
    expectedTradelines: [
      {
        creditorName: "PRAIRIE AUTO CREDIT",
        accountNumber: "********4455",
        accountType: "INSTALLMENT",
        balance: 8765,
        high: 325,
        pastDue: 0,
        creditLimit: 16000,
        opened: "2018-05-14",
        reported: "2026-02-05",
        lastPaymentDate: "2026-01-20",
      },
    ],
  },
  {
    id: "transunion-exported-portal-two-account-text-order",
    bureauName: "TransUnion Canada",
    text: transUnionPortalTwoAccountTextOrderFixture,
    extractor: "transunion",
    expectedTradelineCount: 2,
    expectConsumerName: true,
    expectedReportDate: "2026-02-05",
    expectedTransUnionCaseId: "PORT-2026-445",
    expectedConsumerDob: "1982-02-05",
    expectedPostalCode: "E1C 1A1",
    expectedTradelines: [
      {
        creditorName: "COASTAL CREDIT CARD",
        accountNumber: "********9911",
        accountType: "REVOLVING",
        balance: 410.25,
        high: 900,
        pastDue: 0,
        creditLimit: 1500,
        opened: "2020-04-02",
        reported: "2026-02-05",
      },
      {
        creditorName: "ATLANTIC AUTO LOAN",
        accountNumber: "********8844",
        accountType: "INSTALLMENT",
        balance: 9900,
        high: 18500,
        pastDue: 0,
        creditLimit: 18500,
        opened: "2021-09-10",
        reported: "2026-02-05",
      },
    ],
  },
  {
    id: "equifax-revolving-and-collection",
    bureauName: "Equifax Canada",
    text: equifaxTextFixture,
    extractor: "equifax",
    expectedTradelineCount: 2,
    expectConsumerName: true,
    expectedReportDate: "2026-04-16",
    expectedConsumerDob: "1961-01-30",
    expectedPostalCode: "B0N 2J0",
    expectedTradelines: [
      {
        creditorName: "CAPITAL ONE BANK",
        accountNumber: "********1234",
        accountType: "Revolving",
        balance: 1234,
        pastDue: 123,
        creditLimit: 2500,
        opened: "2020-01-15",
        reported: "2026-04-16",
      },
      {
        creditorName: "CBV COLLECTION SERVICES",
        accountNumber: "********8899",
        accountType: "Collection",
        balance: 500,
        reported: "2026-04-16",
        dateAssignedToCollection: "2024-02-10",
        isCollectionAccount: true,
        collectionAgencyName: "CBV COLLECTION SERVICES",
        originalCreditorName: "ORIGINAL CREDITOR INC",
        originalBalance: 500,
      },
    ],
  },
  {
    id: "equifax-installment",
    bureauName: "Equifax Canada",
    text: equifaxInstallmentTextFixture,
    extractor: "equifax",
    expectedTradelineCount: 1,
    expectConsumerName: true,
    expectedReportDate: "2026-04-16",
    expectedConsumerDob: "1961-01-30",
    expectedPostalCode: "B3J 1A1",
    expectedTradelines: [
      {
        creditorName: "SAMPLE AUTO FINANCE",
        accountNumber: "********2222",
        accountType: "Installment",
        balance: 12345,
        high: 20000,
        pastDue: 0,
        opened: "2022-06-15",
        reported: "2026-04-16",
      },
    ],
  },
  {
    id: "equifax-account-only-no-consumer-identity",
    bureauName: "Equifax Canada",
    text: equifaxAccountOnlyTextFixture,
    extractor: "equifax",
    expectedTradelineCount: 1,
    expectConsumerName: false,
    expectedReportDate: "2026-04-16",
    expectedTradelines: [
      {
        creditorName: "SAMPLE TELCO",
        accountNumber: "********3333",
        accountType: "Open",
        balance: 89.1,
        opened: "2025-12-01",
        reported: "2026-04-16",
      },
    ],
  },
  {
    id: "equifax-mortgage-account-section",
    bureauName: "Equifax Canada",
    text: equifaxMortgageTextFixture,
    extractor: "equifax",
    expectedTradelineCount: 1,
    expectConsumerName: true,
    expectedReportDate: "2026-05-02",
    expectedConsumerDob: "1982-02-05",
    expectedPostalCode: "E1C 1A1",
    expectedTradelines: [
      {
        creditorName: "SAMPLE TRUST MORTGAGE",
        accountNumber: "********7788",
        accountType: "Mortgage",
        balance: 245000,
        high: 250000,
        pastDue: 0,
        opened: "2019-08-01",
        reported: "2026-05-02",
      },
    ],
  },
  {
    id: "equifax-collapsed-collection-section",
    bureauName: "Equifax Canada",
    text: equifaxCollapsedCollectionsTextFixture,
    extractor: "equifax",
    expectedTradelineCount: 2,
    expectConsumerName: true,
    expectedReportDate: "2026-05-02",
    expectedConsumerDob: "1982-02-05",
    expectedPostalCode: "E1C 1A1",
    expectedTradelines: [
      {
        creditorName: "EASTERN COLLECTIONS INC",
        accountNumber: "***902",
        accountType: "Collection",
        balance: 721,
        reported: "2026-05-02",
        lastPaymentDate: "2022-12-01",
        dateAssignedToCollection: "2024-07-15",
        isCollectionAccount: true,
        collectionAgencyName: "EASTERN COLLECTIONS INC",
        originalCreditorName: "ORIGINAL STORE LTD",
        originalBalance: 721,
      },
      {
        creditorName: "NORTHERN RECOVERY SERVICES",
        accountNumber: "***903",
        accountType: "Collection",
        balance: 300,
        reported: "2026-05-02",
        dofd: "2023-05-06",
        lastPaymentDate: "2023-05-06",
        dateAssignedToCollection: "2025-01-10",
        isCollectionAccount: true,
        collectionAgencyName: "NORTHERN RECOVERY SERVICES",
        originalCreditorName: "SAMPLE TELCO",
        originalBalance: 312,
      },
    ],
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

function isoDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function getPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (current && typeof current === "object" && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, source);
}

function numbersEqual(actual: unknown, expected: number): boolean {
  return typeof actual === "number" && Math.abs(actual - expected) < 0.001;
}

function assertEqualIfExpected(
  actual: unknown,
  expected: string | number | boolean | null | undefined,
  message: string,
): number {
  if (expected === undefined) return 0;
  if (typeof expected === "number") {
    assert(numbersEqual(actual, expected), `${message}: expected ${expected}, got ${String(actual)}.`);
    return 1;
  }
  assert.equal(actual, expected, message);
  return 1;
}

function assertDateIfExpected(
  actual: unknown,
  expected: string | undefined,
  message: string,
): number {
  if (!expected) return 0;
  assert.equal(isoDate(actual), expected, message);
  return 1;
}

function assertCanonicalFieldEvidence(
  packageResult: DeterministicPipelinePackage,
  fieldKey: string,
  fixtureId: string,
): void {
  const field = packageResult.finalOutput.fields[fieldKey];
  assert(field, `${fixtureId} missing canonical field ${fieldKey}.`);
  assert(
    field.evidence.textSnippet?.trim(),
    `${fixtureId} canonical field ${fieldKey} is missing source evidence text.`,
  );
}

function assertExpectedTradelines(
  definition: FixtureDefinition,
  parseResult: ComprehensiveParseResult,
  packageResult: DeterministicPipelinePackage,
): number {
  let verifiedFields = 0;

  assert.equal(
    parseResult.tradelines.length,
    definition.expectedTradelineCount,
    `${definition.id} parsed an unexpected tradeline count.`,
  );
  assert.equal(
    packageResult.finalOutput.tradelines.length,
    definition.expectedTradelineCount,
    `${definition.id} canonical output has an unexpected tradeline count.`,
  );

  for (const expected of definition.expectedTradelines) {
    const index = parseResult.tradelines.findIndex(
      (tradeline) => tradeline.creditorName === expected.creditorName,
    );
    assert(index >= 0, `${definition.id} missing expected tradeline ${expected.creditorName}.`);

    const parsed = parseResult.tradelines[index];
    const canonical = packageResult.finalOutput.tradelines[index];
    assertCanonicalFieldEvidence(packageResult, `tradelines[${index}].creditorName`, definition.id);

    verifiedFields += assertEqualIfExpected(parsed.creditorName, expected.creditorName, `${definition.id} creditor name mismatch`);
    verifiedFields += assertEqualIfExpected(canonical.creditorName, expected.creditorName, `${definition.id} canonical creditor name mismatch`);
    verifiedFields += assertEqualIfExpected(parsed.accountNumber, expected.accountNumber, `${definition.id} ${expected.creditorName} account number mismatch`);
    verifiedFields += assertEqualIfExpected(parsed.accountType, expected.accountType, `${definition.id} ${expected.creditorName} account type mismatch`);
    verifiedFields += assertEqualIfExpected(parsed.balance, expected.balance, `${definition.id} ${expected.creditorName} balance mismatch`);
    verifiedFields += assertEqualIfExpected(parsed.amounts.high, expected.high, `${definition.id} ${expected.creditorName} high amount mismatch`);
    verifiedFields += assertEqualIfExpected(parsed.amounts.pastDue, expected.pastDue, `${definition.id} ${expected.creditorName} past-due amount mismatch`);
    verifiedFields += assertEqualIfExpected(parsed.creditLimit, expected.creditLimit, `${definition.id} ${expected.creditorName} credit limit mismatch`);
    verifiedFields += assertDateIfExpected(parsed.dates.opened, expected.opened, `${definition.id} ${expected.creditorName} opened date mismatch`);
    verifiedFields += assertDateIfExpected(parsed.dates.reported, expected.reported, `${definition.id} ${expected.creditorName} reported date mismatch`);
    verifiedFields += assertDateIfExpected(parsed.dates.dofd, expected.dofd, `${definition.id} ${expected.creditorName} first delinquency date mismatch`);
    verifiedFields += assertDateIfExpected(parsed.lastPaymentDate, expected.lastPaymentDate, `${definition.id} ${expected.creditorName} last payment date mismatch`);
    verifiedFields += assertDateIfExpected(parsed.dateAssignedToCollection, expected.dateAssignedToCollection, `${definition.id} ${expected.creditorName} collection assignment date mismatch`);
    verifiedFields += assertEqualIfExpected(parsed.isCollectionAccount, expected.isCollectionAccount, `${definition.id} ${expected.creditorName} collection flag mismatch`);
    verifiedFields += assertEqualIfExpected(parsed.collectionAgencyName, expected.collectionAgencyName, `${definition.id} ${expected.creditorName} agency mismatch`);
    verifiedFields += assertEqualIfExpected(parsed.originalCreditorName, expected.originalCreditorName, `${definition.id} ${expected.creditorName} original creditor mismatch`);
    verifiedFields += assertEqualIfExpected(parsed.originalBalance, expected.originalBalance, `${definition.id} ${expected.creditorName} original balance mismatch`);

    for (const [path, value] of [
      ["accountNumber", expected.accountNumber],
      ["balance", expected.balance],
      ["amounts.high", expected.high],
      ["amounts.pastDue", expected.pastDue],
      ["creditLimit", expected.creditLimit],
      ["dates.opened", expected.opened],
      ["dates.reported", expected.reported],
      ["dates.dofd", expected.dofd],
      ["lastPaymentDate", expected.lastPaymentDate],
      ["dateAssignedToCollection", expected.dateAssignedToCollection],
      ["originalBalance", expected.originalBalance],
    ] as const) {
      if (value === undefined) continue;
      const canonicalValue = getPath(canonical, path);
      if (typeof value === "number") {
        assert(numbersEqual(canonicalValue, value), `${definition.id} canonical ${expected.creditorName} ${path} mismatch.`);
      } else if (/date/i.test(path) || path.startsWith("dates.")) {
        assert.equal(isoDate(canonicalValue), value, `${definition.id} canonical ${expected.creditorName} ${path} mismatch.`);
      } else {
        assert.equal(canonicalValue, value, `${definition.id} canonical ${expected.creditorName} ${path} mismatch.`);
      }
    }
  }

  return verifiedFields;
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
    let verifiedFields = 0;

    assert(first.replayHash === second.replayHash, `${definition.id} replay hash changed between identical inputs.`);
    verifiedFields += assertDateIfExpected(
      parseResult.reportMetadata.reportDate,
      definition.expectedReportDate,
      `${definition.id} report date mismatch.`,
    );
    verifiedFields += assertEqualIfExpected(
      parseResult.reportMetadata.bureauName,
      definition.bureauName,
      `${definition.id} bureau metadata mismatch.`,
    );
    verifiedFields += assertEqualIfExpected(
      first.finalOutput.reportMetadata.bureauName,
      definition.bureauName,
      `${definition.id} canonical bureau metadata mismatch.`,
    );
    verifiedFields += assertEqualIfExpected(
      parseResult.reportMetadata.transUnionCaseId,
      definition.expectedTransUnionCaseId,
      `${definition.id} TransUnion case ID mismatch.`,
    );
    if (definition.expectedTransUnionCaseId) {
      verifiedFields += assertEqualIfExpected(
        first.finalOutput.reportMetadata.bureauReferenceId,
        definition.expectedTransUnionCaseId,
        `${definition.id} canonical bureau reference mismatch.`,
      );
      assertCanonicalFieldEvidence(first, "reportMetadata.transUnionCaseId", definition.id);
    }
    verifiedFields += assertDateIfExpected(
      parseResult.consumerInfo?.dateOfBirth,
      definition.expectedConsumerDob,
      `${definition.id} DOB mismatch.`,
    );
    verifiedFields += assertDateIfExpected(
      first.finalOutput.consumerInfo?.dateOfBirth,
      definition.expectedConsumerDob,
      `${definition.id} canonical DOB mismatch.`,
    );
    if (definition.expectedConsumerDob) {
      assertCanonicalFieldEvidence(first, "consumerInfo.dateOfBirth", definition.id);
    }
    verifiedFields += assertEqualIfExpected(
      parseResult.consumerInfo?.postalCode,
      definition.expectedPostalCode,
      `${definition.id} postal code mismatch.`,
    );
    verifiedFields += assertExpectedTradelines(definition, parseResult, first);
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
      expectedTradelines: definition.expectedTradelineCount,
      canonicalFields: Object.keys(first.finalOutput.fields).length,
      replayStable: first.replayHash === second.replayHash,
      requiredEvidenceCoveragePercent: first.finalOutput.evidence.coverage.requiredCoveragePercent,
      requiredFieldsMissingEvidence:
        first.finalOutput.evidence.coverage.requiredFieldsMissingEvidence.length,
      expectedAccountMarkers: parserQuality.expectedAccountMarkers,
      consumerNamePresent,
      verifiedFields,
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
