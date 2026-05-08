import { describe, expect, it } from "vitest";

import {
  applyCanonicalFieldUpdate,
  buildDeterministicCreditReportPipelinePackage,
  markDiagnosticCandidateNonCanonical,
  normalizeCanonicalDate,
  selectDeterministicCandidate,
  type DeterministicFieldCandidate,
} from "../../helpers/deterministicCreditReportPipeline";
import type { ComprehensiveParseResult, ParsedTradeline } from "../../helpers/reportParserTypes";

function tradeline(overrides: Partial<ParsedTradeline> = {}): ParsedTradeline {
  return {
    creditorName: "BANK OF NOVA SCOTIA",
    accountNumber: "123456789",
    accountType: "INSTALLMENT / INDIVIDUAL",
    balance: 0,
    status: "OPEN",
    dates: {
      opened: new Date(Date.UTC(2011, 8, 3)),
      reported: new Date(Date.UTC(2026, 0, 10)),
      closed: null,
      dofd: null,
    },
    amounts: {
      high: 31320,
      pastDue: 0,
    },
    remarkCodes: ["AC"],
    sourceText:
      "Creditor Name BANK OF NOVA SCOTIA. Account Number 123456789. Balance 0. Opened Date Sep 03, 2011.",
    ...overrides,
  };
}

function parseResult(rawText: string, overrides: Partial<ComprehensiveParseResult> = {}): ComprehensiveParseResult {
  return {
    rawText,
    sourceBureau: { bureauName: "TransUnion Canada", confidence: 100 },
    reportMetadata: {
      reportDate: new Date(Date.UTC(2026, 0, 10)),
      reportNumber: null,
      fileNumber: "TU-123",
      bureauFileId: null,
      transUnionCaseId: "L121322",
      bureauName: "TransUnion Canada",
      bureauPhone: null,
      bureauAddress: null,
      totalAccounts: null,
      openAccounts: null,
      closedAccounts: null,
      delinquentAccounts: null,
      derogatoryAccounts: null,
      totalBalances: null,
      totalCreditLimit: null,
      utilizationPercent: null,
      fraudAlertActive: false,
      securityFreezeActive: false,
      activeDisputePresent: false,
      militaryLendingActCovered: false,
      oldestAccountDate: null,
      newestAccountDate: null,
      averageAccountAge: null,
      rawHeaderText: null,
      confidence: 100,
    },
    consumerInfo: {
      fullName: "TEST CONSUMER",
      addressLine1: "26 MAIN ST E",
      addressLine2: null,
      city: "STEWIACKE",
      province: "NS",
      postalCode: "B0N 2J0",
      dateOfBirth: new Date(Date.UTC(1977, 3, 11)),
      dateOfBirthRaw: "Apr 11, 1977",
      phone: null,
      phoneSecondary: null,
      sinLastDigits: null,
      previousAddresses: [],
      confidence: 100,
    },
    tradelines: [tradeline()],
    creditScores: [],
    inquiries: [],
    publicRecords: [],
    consumerStatements: [],
    employmentInfo: [],
    paymentHistories: [],
    ...overrides,
  };
}

function build(rawText: string, overrides: Partial<ComprehensiveParseResult> = {}) {
  return buildDeterministicCreditReportPipelinePackage({
    parseResult: parseResult(rawText, overrides),
    rawText,
    documentBinarySha256: "document-sha",
  });
}

describe("deterministic credit report pipeline", () => {
  it("normalizes ambiguous DOB candidates through documented deterministic selection", () => {
    const packageResult = build(`
TransUnion Canada Consumer Disclosure
Personal Information:
Name TEST CONSUMER
Birth Date Apr 11, 1977
Credit Account Information
Creditor Name BANK OF NOVA SCOTIA
`);

    const dobField = packageResult.finalOutput.fields["consumerInfo.dateOfBirth"];
    const dobPool = packageResult.candidatePools.find((pool) => pool.fieldKey === "consumerInfo.dateOfBirth");

    expect(dobField.normalizedValue).toBe("1977-04-11");
    expect(dobField.confidence).toBe(1.0);
    expect(dobField.deterministic).toBe(true);
    expect(dobPool?.candidates.length).toBeGreaterThanOrEqual(2);
    expect(dobField.alternatives.length).toBeGreaterThanOrEqual(1);
  });

  it("produces the same replay hash and canonical output for identical inputs", () => {
    const rawText = `
Credit Report
Report Date 01/10/2026
Personal Information
Date of Birth 04/11/77
Account Information
Creditor Name BANK OF NOVA SCOTIA
`;

    const first = build(rawText);
    const second = build(rawText);

    expect(first.replayHash).toBe(second.replayHash);
    expect(first.canonicalResultSha256).toBe(second.canonicalResultSha256);
    expect(first.finalOutput).toEqual(second.finalOutput);
  });

  it("carries the TransUnion case ID through report metadata candidate selection", () => {
    const packageResult = build(`
TransUnion Canada Consumer Disclosure
TU Case IDL121322
Your file as of Jan 10, 2026
`);

    const field = packageResult.finalOutput.fields["reportMetadata.transUnionCaseId"];
    const pool = packageResult.candidatePools.find((candidatePool) => candidatePool.fieldKey === "reportMetadata.transUnionCaseId");

    expect(packageResult.finalOutput.reportMetadata.transUnionCaseId).toBe("L121322");
    expect(field.value).toBe("L121322");
    expect(field.deterministic).toBe(true);
    expect(field.evidence.zoneName).toBe("report_header");
    expect(pool?.selectedCandidateId).toBeTruthy();
    expect(pool?.candidates.some((candidate) => candidate.value === "L121322")).toBe(true);
  });

  it("rejects null updates over valid canonical values", () => {
    const packageResult = build("Personal Information\nDOB Apr 11, 1977\n");
    const existing = packageResult.finalOutput.fields["consumerInfo.dateOfBirth"];

    const reconciled = applyCanonicalFieldUpdate(existing, null, "Regression null overwrite check");

    expect(reconciled?.value).toBe(existing.value);
    expect(reconciled?.history.at(-1)?.reason).toContain("Null update rejected");
  });

  it("keeps LLM and DocStrange candidates non-canonical until deterministic validation exists", () => {
    const diagnosticCandidate: DeterministicFieldCandidate = {
      candidateId: "llm-dob",
      fieldKey: "consumerInfo.dateOfBirth",
      value: "1977-04-11",
      normalizedValue: "1977-04-11",
      sourceStage: "STRUCTURED_CANDIDATE_EXTRACTION",
      sourceMethod: "docstrange.llm",
      evidence: { textSnippet: "LLM suggested DOB" },
      score: 100,
      scoreBreakdown: { structuredSource: 100 },
      canonicalEligible: true,
      order: 0,
    };

    const selected = selectDeterministicCandidate([
      markDiagnosticCandidateNonCanonical(diagnosticCandidate),
    ]);

    expect(selected).toBeNull();
  });

  it("indexes source evidence and reports required-field coverage", () => {
    const tradelineSource = `
Creditor Name BANK OF NOVA SCOTIA
Account Number 123456789
Account Type INSTALLMENT / INDIVIDUAL
Balance 0
Status OPEN
Opened Date Sep 03, 2011
Reported Date Jan 10, 2026
`;
    const packageResult = build(
      `
TransUnion Canada Credit Report
Report Date 01/10/2026
Personal Information
Name TEST CONSUMER
Date of Birth Apr 11, 1977
Address 26 MAIN ST E STEWIACKE NS B0N 2J0
Account Information
${tradelineSource}
`,
      {
        tradelines: [tradeline({ sourceText: tradelineSource })],
      },
    );

    const evidence = packageResult.finalOutput.evidence;

    expect(evidence.fieldIndex["consumerInfo.dateOfBirth"].textSnippet).toContain("Date of Birth");
    expect(evidence.fieldIndex["consumerInfo.dateOfBirth"].evidenceId).toMatch(/^evidence-/);
    expect(evidence.fieldIndex["tradelines[0].creditorName"].textSnippet).toContain("BANK OF NOVA SCOTIA");
    expect(evidence.fieldIndex["tradelines[0].creditorName"].evidenceId).toMatch(/^evidence-/);
    expect(evidence.coverage.requiredFieldKeys).toContain("consumerInfo.dateOfBirth");
    expect(evidence.coverage.requiredFieldKeys).toContain("tradelines[0].creditorName");
    expect(evidence.coverage.requiredFieldsMissingEvidence).toEqual([]);
    expect(evidence.coverage.requiredCoveragePercent).toBe(100);
  });

  it("links comma-formatted amount and status-code evidence without corrupting creditor names", () => {
    const tradelineSource = `
Creditor Name SAMPLE BANK VISA
Account Number ********1111
Account Type REVOLVING / INDIVIDUAL
Balance $2,345.67
Opened Date 2020-01-15
Reported Date 2026-01-10
Payment History
Jan 2026 2345 100 0 R1 100 5000 0 0 AC /
`;
    const packageResult = build(
      `
TransUnion Canada Consumer Disclosure
Report Date 2026-01-10
Personal Information
Name TEST CONSUMER
Date of Birth 1961-01-30
Address 26 MAIN ST E STEWIACKE NS B0N 2J0
Account Information
${tradelineSource}
`,
      {
        consumerInfo: {
          ...parseResult("").consumerInfo!,
          dateOfBirth: new Date(Date.UTC(1961, 0, 30)),
        },
        tradelines: [
          tradeline({
            creditorName: "SAMPLE BANK VISA",
            accountNumber: "********1111",
            accountType: "REVOLVING / INDIVIDUAL",
            balance: 2345.67,
            status: "Account Closed",
            dates: {
              opened: new Date(Date.UTC(2020, 0, 15)),
              reported: new Date(Date.UTC(2026, 0, 10)),
              closed: null,
              dofd: null,
            },
            sourceText: tradelineSource,
          }),
        ],
      },
    );

    expect(packageResult.finalOutput.fields["tradelines[0].creditorName"].normalizedValue).toBe("SAMPLE BANK VISA");
    expect(packageResult.finalOutput.fields["tradelines[0].balance"].evidence.textSnippet).toContain("$2,345.67");
    expect(packageResult.finalOutput.fields["tradelines[0].status"].evidence.textSnippet).toContain("AC /");
    expect(packageResult.finalOutput.evidence.coverage.requiredFieldsMissingEvidence).toEqual([]);
    expect(packageResult.finalOutput.evidence.coverage.requiredCoveragePercent).toBe(100);
  });

  it("does not allow TransUnion label bleed into canonical creditor names", () => {
    const sourceText = `
Creditor Name
NameMAPLE FINANCIAL VISAPayment History
Account Number Not Provided by Bureau
Account Type REVOLVING
Status Open
`;
    const packageResult = build(sourceText, {
      tradelines: [
        tradeline({
          creditorName: "NameMAPLE FINANCIAL VISAPayment History",
          accountNumber: "Not Provided by Bureau",
          accountType: "REVOLVING",
          status: "Open",
          sourceText,
        }),
      ],
    });

    expect(packageResult.finalOutput.fields["tradelines[0].creditorName"].value).toBe("MAPLE FINANCIAL VISA");
    expect(packageResult.finalOutput.fields["tradelines[0].creditorName"].normalizedValue).toBe("MAPLE FINANCIAL VISA");
    expect(packageResult.finalOutput.tradelines[0].creditorName).toBe("MAPLE FINANCIAL VISA");
  });

  it("detects semantic zones across different section layouts", () => {
    const transUnionLayout = build(`
TransUnion Canada Consumer Disclosure
Personal Information
Birth Date Apr 11, 1977
Installment Loans
Creditor Name BANK OF NOVA SCOTIA
`);
    const portalLayout = build(`
Credit Report
Account Information
Creditor Name BANK OF NOVA SCOTIA
Consumer Information
DOB Apr 11, 1977
`);

    expect(transUnionLayout.semanticZoneDetection.zones.map((zone) => zone.zoneName)).toContain("consumer_identity");
    expect(transUnionLayout.semanticZoneDetection.zones.map((zone) => zone.zoneName)).toContain("tradeline_accounts");
    expect(portalLayout.semanticZoneDetection.zones.map((zone) => zone.zoneName)).toContain("consumer_identity");
    expect(portalLayout.semanticZoneDetection.zones.map((zone) => zone.zoneName)).toContain("tradeline_accounts");
    expect(normalizeCanonicalDate("04/11/77")).toBe("1977-04-11");
  });

  it("segments creditor statements and collection letters without making guessed bureau fields", () => {
    const creditorStatement = build(
      `
Account Statement
Statement Date 2026-04-16
Amount Due $123.45
`,
      { consumerInfo: null, tradelines: [] },
    );
    const collectionLetter = build(
      `
Collection Notice
Debt Collector ABC COLLECTION SERVICES
Amount Owing $500.00
`,
      { consumerInfo: null, tradelines: [] },
    );

    expect(creditorStatement.semanticZoneDetection.zones.map((zone) => zone.zoneName)).toContain("creditor_statement");
    expect(collectionLetter.semanticZoneDetection.zones.map((zone) => zone.zoneName)).toContain("collection_letter");
    expect(creditorStatement.finalOutput.tradelines).toHaveLength(0);
    expect(collectionLetter.finalOutput.tradelines).toHaveLength(0);
    expect(creditorStatement.candidatePools.find((pool) => pool.fieldKey === "consumerInfo.dateOfBirth")).toBeUndefined();
    expect(collectionLetter.candidatePools.find((pool) => pool.fieldKey === "consumerInfo.dateOfBirth")).toBeUndefined();
  });
});
