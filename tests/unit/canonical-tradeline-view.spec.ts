import { describe, expect, it } from "vitest";

import {
  buildCanonicalTradelineViewFromDeterministicOutput,
  buildCanonicalTradelineViewFromParsedTradeline,
  buildCanonicalTradelineViewFromPersistedTradeline,
} from "../../helpers/canonicalTradelineView";
import type { DeterministicNormalizedReport } from "../../helpers/deterministicCreditReportPipeline";

describe("canonical tradeline view adapter", () => {
  it("builds a CanonicalTradelineView from a parsed tradeline", () => {
    const view = buildCanonicalTradelineViewFromParsedTradeline({
      sourceArtifactId: 44,
      tradelineId: 12,
      bureau: "TransUnion Canada",
      parserConfidence: 0.93,
      tradelineIndex: 0,
      tradeline: {
        creditorName: "MAPLE FINANCIAL VISA",
        accountNumber: "123456789",
        accountType: "Revolving",
        status: "Open",
        balance: 6120,
        dates: {
          opened: new Date(Date.UTC(2020, 1, 3)),
          reported: new Date(Date.UTC(2026, 0, 10)),
          closed: null,
          dofd: null,
        },
        lastPaymentDate: new Date(Date.UTC(2025, 11, 1)),
        paymentHistory: { times30DaysLate: 1, times60DaysLate: 0, times90DaysLate: 0 },
        remarkCodes: ["AC01"],
        sourceText: "MAPLE FINANCIAL VISA balance 6120 credit limit 5000",
      },
    });

    expect(view).toMatchObject({
      sourceArtifactId: 44,
      tradelineId: 12,
      bureau: "TransUnion Canada",
      creditorName: "MAPLE FINANCIAL VISA",
      accountNumberMasked: "****6789",
      accountType: "Revolving",
      status: "Open",
      balance: 6120,
      dateOpened: "2020-02-03",
      dateClosed: null,
      dateOfFirstDelinquency: null,
      lastPaymentDate: "2025-12-01",
      lastReportedDate: "2026-01-10",
      remarks: ["AC01"],
      parserConfidence: 93,
      rawSourceType: "parsed_tradeline",
    });
    expect(view.paymentHistory).toEqual({ times30DaysLate: 1, times60DaysLate: 0, times90DaysLate: 0 });
    expect(view.evidenceRefs).toEqual([
      {
        fieldKey: "tradelines[0].sourceText",
        sourceField: "ParsedTradeline.sourceText",
        textSnippet: "MAPLE FINANCIAL VISA balance 6120 credit limit 5000",
        reportArtifactId: 44,
      },
    ]);
  });

  it("builds a CanonicalTradelineView from a persisted tradeline", () => {
    const view = buildCanonicalTradelineViewFromPersistedTradeline({
      bureau: "Equifax Canada",
      disputeStatus: "active",
      parserConfidence: 88,
      tradeline: {
        id: 22,
        reportArtifactId: 77,
        creditorName: "CAPITAL ONE BANK",
        accountNumber: "999988887777",
        accountType: "Revolving",
        status: "Closed",
        balance: "5000.00",
        currentBalance: "6120.50",
        openedDate: new Date(Date.UTC(2019, 5, 1)),
        dateClosed: null,
        dateOfFirstDelinquency: "2024-03-15T00:00:00.000Z",
        dateOfLastPayment: null,
        lastReportedDate: "2026-01-10",
        paymentHistoryProfile: "111111111111",
        notes: "Consumer disputes account",
        ratingCode: "R1",
      },
    });

    expect(view).toMatchObject({
      sourceArtifactId: 77,
      tradelineId: 22,
      bureau: "Equifax Canada",
      creditorName: "CAPITAL ONE BANK",
      accountNumberMasked: "****7777",
      balance: 6120.5,
      dateOpened: "2019-06-01",
      dateClosed: null,
      dateOfFirstDelinquency: "2024-03-15",
      lastPaymentDate: null,
      lastReportedDate: "2026-01-10",
      paymentHistory: "111111111111",
      remarks: ["Consumer disputes account", "R1"],
      disputeStatus: "active",
      parserConfidence: 88,
      rawSourceType: "persisted_tradeline",
    });
  });

  it("preserves nulls and does not invent placeholder values", () => {
    const view = buildCanonicalTradelineViewFromParsedTradeline({
      tradeline: {
        creditorName: "",
        accountNumber: "Not Provided by Bureau",
        balance: null,
        dates: {},
        remarkCodes: [],
      },
    });

    expect(view.creditorName).toBeNull();
    expect(view.accountNumberMasked).toBeNull();
    expect(view.balance).toBeNull();
    expect(view.dateOpened).toBeNull();
    expect(view.lastReportedDate).toBeNull();
    expect(view.paymentHistory).toBeNull();
    expect(view.remarks).toEqual([]);
    expect(view.evidenceRefs).toEqual([]);
  });

  it("preserves deterministic canonical evidence references when available", () => {
    const canonicalOutput = {
      version: "deterministic-credit-report-pipeline-v1",
      reportMetadata: { bureauName: "TransUnion Canada" },
      consumerInfo: null,
      tradelines: [
        {
          creditorName: "MAPLE FINANCIAL VISA",
          accountNumber: "****7777",
          balance: 6120,
          dates: { reported: "2026-01-10" },
          paymentHistoryProfile: "111111111111",
        },
      ],
      fields: {
        "tradelines[0].balance": {
          fieldKey: "tradelines[0].balance",
          value: 6120,
          sourceMethod: "pdf_text.parseResult.tradelines[0].balance",
          evidence: {
            evidenceId: "evidence-balance-1",
            sourceMethod: "pdf_text",
            pageNumber: 2,
            textSnippet: "MAPLE FINANCIAL VISA Balance $6,120",
            tokenIndexes: [10, 11],
          },
        },
        "tradelines[0].dates.reported": {
          fieldKey: "tradelines[0].dates.reported",
          value: "2026-01-10",
          sourceMethod: "pdf_text.parseResult.tradelines[0].dates.reported",
          evidence: {
            evidenceId: "evidence-reported-1",
            sourceMethod: "pdf_text",
            pageNumber: 2,
            textSnippet: "Reported Date 2026-01-10",
            tokenIndexes: [20, 21],
          },
        },
      },
      evidence: { fieldIndex: {}, coverage: {} },
      creditScores: [],
      inquiries: [],
      publicRecords: [],
      consumerStatements: [],
      employmentInfo: [],
      paymentHistories: [],
    } as unknown as DeterministicNormalizedReport;

    const view = buildCanonicalTradelineViewFromDeterministicOutput({
      canonicalOutput,
      tradelineIndex: 0,
      sourceArtifactId: 9001,
      parserConfidence: 91,
    });

    expect(view).not.toBeNull();
    expect(view).toMatchObject({
      sourceArtifactId: 9001,
      bureau: "TransUnion Canada",
      creditorName: "MAPLE FINANCIAL VISA",
      accountNumberMasked: "****7777",
      balance: 6120,
      lastReportedDate: "2026-01-10",
      paymentHistory: "111111111111",
      parserConfidence: 91,
      rawSourceType: "deterministic_canonical_output",
    });
    expect(view?.evidenceRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          evidenceId: "evidence-balance-1",
          fieldKey: "tradelines[0].balance",
          sourceField: "pdf_text.parseResult.tradelines[0].balance",
          sourceMethod: "pdf_text",
          pageNumber: 2,
          textSnippet: "MAPLE FINANCIAL VISA Balance $6,120",
          reportArtifactId: 9001,
        }),
      ]),
    );
  });

  it("does not throw when optional fields are missing", () => {
    expect(() =>
      buildCanonicalTradelineViewFromPersistedTradeline({
        tradeline: {},
      }),
    ).not.toThrow();

    expect(
      buildCanonicalTradelineViewFromDeterministicOutput({
        canonicalOutput: undefined,
      }),
    ).toBeNull();
  });
});
