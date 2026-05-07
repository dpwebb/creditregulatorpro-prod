import { describe, expect, it } from "vitest";

import {
  attachRuntimeValuesToParserPipelineAudit,
  extractRawParserFieldBaseline,
  ParserFieldBaseline,
  reconcileParserPipelineFields,
} from "../../helpers/parserPipelineFieldReconciliation";
import {
  ComprehensiveParseResult,
  ExtractedReportMetadata,
  ParsedTradeline,
} from "../../helpers/reportParserTypes";

function metadata(overrides: Partial<ExtractedReportMetadata> = {}): ExtractedReportMetadata {
  return {
    reportDate: null,
    reportNumber: null,
    fileNumber: null,
    bureauFileId: null,
    transUnionCaseId: null,
    bureauName: null,
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
    confidence: 0,
    ...overrides,
  };
}

function tradeline(overrides: Partial<ParsedTradeline> = {}): ParsedTradeline {
  return {
    creditorName: "",
    accountNumber: "",
    accountType: "",
    balance: 0,
    status: "",
    dates: {
      opened: null,
      reported: null,
      closed: null,
      dofd: null,
    },
    amounts: {
      high: undefined,
      pastDue: undefined,
    },
    remarkCodes: [],
    ...overrides,
  };
}

function parseResult(overrides: Partial<ComprehensiveParseResult> = {}): ComprehensiveParseResult {
  return {
    rawText: "",
    sourceBureau: null,
    reportMetadata: metadata(),
    consumerInfo: null,
    tradelines: [],
    creditScores: [],
    inquiries: [],
    publicRecords: [],
    consumerStatements: [],
    employmentInfo: [],
    paymentHistories: [],
    ...overrides,
  };
}

describe("parser pipeline field reconciliation", () => {
  it("recovers the TransUnion DOB when the production mapped result drops it", () => {
    const rawText = `
TransUnion Canada Consumer Disclosure
Personal Information:
SurnameGiven Name(s)Middle NameSuffixSocial Insurance NoBirth Date
Your InformationTEST CONSUMERON FILEJan 30, 1961
Cross Reference(s):
`;
    const rawBaseline = extractRawParserFieldBaseline(rawText);
    expect(rawBaseline.consumerInfo?.dateOfBirth?.toISOString().slice(0, 10)).toBe("1961-01-30");
    expect(rawBaseline.consumerInfo?.dateOfBirthRaw).toBe("Jan 30, 1961");

    const final = parseResult({
      rawText,
      sourceBureau: rawBaseline.sourceBureau,
      reportMetadata: rawBaseline.reportMetadata,
      consumerInfo: {
        ...rawBaseline.consumerInfo!,
        dateOfBirth: null,
        dateOfBirthRaw: null,
      },
      tradelines: rawBaseline.tradelines,
    });

    const result = reconcileParserPipelineFields(final, rawBaseline);

    expect(result.parseResult.consumerInfo?.dateOfBirth?.toISOString().slice(0, 10)).toBe("1961-01-30");
    expect(result.parseResult.consumerInfo?.dateOfBirthRaw).toBe("Jan 30, 1961");
    expect(result.audit.summary.backfilledFields).toContain("consumerInfo.dateOfBirth");
    expect(result.audit.summary.backfilledFields).toContain("consumerInfo.dateOfBirthRaw");
  });

  it("backfills representative report, consumer, and tradeline fields without overwriting non-empty mapped values", () => {
    const rawBaseline: ParserFieldBaseline = {
      rawText: "TransUnion raw text with account evidence",
      sourceBureau: { bureauName: "TransUnion Canada", confidence: 100 },
      reportMetadata: metadata({
        reportDate: new Date(2026, 0, 10),
        bureauName: "TransUnion Canada",
        fileNumber: "TU-123",
        transUnionCaseId: "L121322",
      }),
      consumerInfo: {
        fullName: "DAVID PHILIP WEBB",
        addressLine1: "26 MAIN ST E",
        addressLine2: "PO BOX 593",
        city: "STEWIACKE",
        province: "NS",
        postalCode: "B0N 2J0",
        dateOfBirth: new Date(1961, 0, 30),
        dateOfBirthRaw: "Jan 30, 1961",
        phone: "(647) 612-7729",
        phoneSecondary: null,
        sinLastDigits: "123",
        previousAddresses: [],
        confidence: 100,
      },
      tradelines: [
        tradeline({
          creditorName: "CAPITAL ONE BANK",
          accountNumber: "123456789",
          accountType: "REVOLVING",
          balance: 1000,
          status: "Open",
          dates: {
            opened: new Date(2020, 4, 1),
            reported: new Date(2026, 0, 10),
            closed: new Date(2025, 11, 15),
            dofd: new Date(2024, 5, 30),
          },
          amounts: {
            high: 1500,
            pastDue: 75,
          },
          remarkCodes: ["AC"],
          responsibilityCode: "Individual",
          collectionAgencyName: "CBV COLLECTIONS",
          originalCreditorName: "CAPITAL ONE BANK",
          dateAssignedToCollection: new Date(2025, 0, 15),
          sourceText: "CAPITAL ONE BANK account source evidence",
        }),
      ],
    };
    const final = parseResult({
      rawText: rawBaseline.rawText,
      sourceBureau: null,
      reportMetadata: metadata(),
      consumerInfo: null,
      tradelines: [
        tradeline({
          creditorName: "Capital One Bank",
          accountNumber: "Not Provided by Bureau",
          accountType: "",
          balance: null as any,
          status: "",
          dates: {},
          amounts: {},
          sourceText: "",
        }),
      ],
    });

    const result = reconcileParserPipelineFields(final, rawBaseline);
    const reconciled = result.parseResult;

    expect(reconciled.sourceBureau?.bureauName).toBe("TransUnion Canada");
    expect(reconciled.reportMetadata.reportDate?.toISOString().slice(0, 10)).toBe("2026-01-10");
    expect(reconciled.reportMetadata.fileNumber).toBe("TU-123");
    expect(reconciled.reportMetadata.transUnionCaseId).toBe("L121322");
    expect(reconciled.consumerInfo?.fullName).toBe("DAVID PHILIP WEBB");
    expect(reconciled.consumerInfo?.sinLastDigits).toBe("123");
    expect(reconciled.tradelines[0].accountNumber).toBe("123456789");
    expect(reconciled.tradelines[0].balance).toBe(1000);
    expect(reconciled.tradelines[0].dates.opened?.toISOString().slice(0, 10)).toBe("2020-05-01");
    expect(reconciled.tradelines[0].dates.dofd?.toISOString().slice(0, 10)).toBe("2024-06-30");
    expect(reconciled.tradelines[0].collectionAgencyName).toBe("CBV COLLECTIONS");
    expect(reconciled.tradelines[0].sourceText).toBe("CAPITAL ONE BANK account source evidence");

    expect(result.audit.summary.backfilledFields).toEqual(
      expect.arrayContaining([
        "sourceBureau.bureauName",
        "reportMetadata.reportDate",
        "reportMetadata.transUnionCaseId",
        "consumerInfo.fullName",
        "consumerInfo.addressLine2",
        "consumerInfo.sinLastDigits",
        "tradelines[0].accountNumber",
        "tradelines[0].balance",
        "tradelines[0].dates.opened",
        "tradelines[0].dates.dofd",
        "tradelines[0].collectionAgencyName",
        "tradelines[0].sourceText",
      ]),
    );
    expect(result.audit.summary.backfilledFields).toContain("tradelines[0].accountNumber");
  });

  it("adds persisted and final API values to parser-test audit entries", () => {
    const result = reconcileParserPipelineFields(
      parseResult({
        consumerInfo: null,
      }),
      {
        rawText: "",
        sourceBureau: null,
        reportMetadata: metadata(),
        consumerInfo: {
          fullName: "TEST CONSUMER",
          addressLine1: null,
          addressLine2: null,
          city: null,
          province: null,
          postalCode: null,
          dateOfBirth: null,
          dateOfBirthRaw: null,
          phone: null,
          previousAddresses: [],
          confidence: 50,
        },
        tradelines: [],
      },
    );

    const audit = attachRuntimeValuesToParserPipelineAudit({
      audit: result.audit,
      persistedRoot: { consumerInfo: { fullName: "TEST CONSUMER" } },
      finalApiRoot: result.parseResult,
    });
    const entry = audit.entries.find((item) => item.fieldPath === "consumerInfo.fullName");

    expect(entry?.persistedValue).toBe("TEST CONSUMER");
    expect(entry?.finalApiValue).toBe("TEST CONSUMER");
  });
});
