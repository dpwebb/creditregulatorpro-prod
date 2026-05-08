import { describe, expect, it } from "vitest";

import {
  assessParserQuality,
  estimateExpectedAccountMarkersFromRawText,
} from "../../helpers/parserQuality";

const collapsedTwoTradelineText = `
JASON ANDREW MILLER , SYN-TU-001Saturday 10 January 2026 19:34
Account(s):
This section lists synthetic accounts reported by fictional institutions.
Creditor NameMAPLE FINANCIAL VISAPayment History
Reported DateDec 16, 2025Last Payment DateJan 14, 202730  3
Opened DateApr 13, 2021Posted DateDec 18, 202560  1
Account TypeREVOLVING / INDIVIDUAL
DateBalancePaymentPast DueMOPTermsHigh CreditCredit LimitBalloon PaymentCharge OffNarrative 1 / 2
Dec 20256120150730506120500000XR /
Legend: AC-Account current/non-derogatory
Creditor NameNORTHERN AUTO FINANCEPayment History
Reported DateNov 30, 2025Last Payment DateNov 14, 202530  0
Opened DateJun 18, 2022Posted DateDec 02, 202560  0
Account TypeINSTALLMENT / INDIVIDUAL
DateBalancePaymentPast DueMOPTermsHigh CreditCredit LimitBalloon PaymentCharge OffNarrative 1 / 2
Nov 202511244492016028750000AC /
Credit Related Inquiries:
`;

describe("parser quality raw-text account markers", () => {
  it("counts collapsed TransUnion tradeline markers from raw PDF text", () => {
    expect(estimateExpectedAccountMarkersFromRawText(collapsedTwoTradelineText)).toBe(2);
  });

  it("does not count embedded parser assertion instructions as tradelines", () => {
    const textWithAssertionSection = `${collapsedTwoTradelineText}
Embedded Known Errors for Test Assertions
TradelineExtract creditor, account type, dates, balance, past due, MOP, narratives
Expected Error 1 Balance exceeds credit limit on revolving account.
Expected Error 2 Last Payment Date is later than report date.
`;

    expect(estimateExpectedAccountMarkersFromRawText(textWithAssertionSection)).toBe(2);
  });

  it("flags under-extraction when raw text shows more tradelines than parsed output", () => {
    const assessment = assessParserQuality({
      rawHtml: "",
      rawText: collapsedTwoTradelineText,
      extractionSource: "pdf_text",
      llmData: null,
      parseResult: {
        rawText: collapsedTwoTradelineText,
        sourceBureau: { bureauName: "TransUnion Canada", confidence: 100 },
        reportMetadata: {
          reportDate: new Date("2026-01-10T00:00:00.000Z"),
        },
        tradelines: [],
      } as any,
      parsedTradelines: [
        {
          creditorName: "MAPLE FINANCIAL VISA",
          accountNumber: "Not Provided by Bureau",
          accountType: "REVOLVING / INDIVIDUAL",
          status: "Open",
          balance: 6120,
          dates: {
            opened: new Date("2021-04-13T00:00:00.000Z"),
            reported: new Date("2025-12-16T00:00:00.000Z"),
          },
          sourceText: collapsedTwoTradelineText,
        } as any,
      ],
    });

    expect(assessment.expectedAccountMarkers).toBe(2);
    expect(assessment.parsedTradelineCount).toBe(1);
    expect(assessment.issues.map((issue) => issue.code)).toContain("PARSER_ACCOUNT_COUNT_MISMATCH");
  });
});
