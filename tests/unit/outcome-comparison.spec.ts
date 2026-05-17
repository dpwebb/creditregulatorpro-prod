import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  compareOutcomeSnapshots,
  type OutcomeComparisonInput,
  type ReportComparisonSnapshot,
} from "../../helpers/outcomeComparison";

const basePreviousTradeline = {
  tradelineId: 101,
  bureau: "Equifax",
  creditorName: "Synthetic Bank",
  originalCreditorName: "Synthetic Bank",
  accountType: "revolving",
  maskedAccountNumber: "****6789",
  accountSuffix: "6789",
  openDate: "2020-01-02",
  status: "Collection",
  balance: 1200,
  amountPastDue: 1200,
  dateOfFirstDelinquency: "2022-04-01",
  evidenceIds: ["ev-status-101"],
  evidenceLocationSnapshot: [
    {
      evidenceId: "ev-status-101",
      pageNumber: 2,
      boundingBox: { x: 20, y: 40, width: 120, height: 16 },
      coordinateSource: "native_pdf",
    },
  ],
};

function previousReport(overrides: Partial<ReportComparisonSnapshot> = {}): ReportComparisonSnapshot {
  return {
    reportArtifactId: 501,
    userId: 10,
    bureau: "Equifax",
    reportDate: "2026-01-01",
    reportType: "credit_report",
    parserQuality: { canonicalReady: true, packetReady: true, confidence: 96 },
    tradelines: [basePreviousTradeline],
    ...overrides,
  };
}

function laterReport(overrides: Partial<ReportComparisonSnapshot> = {}): ReportComparisonSnapshot {
  return {
    reportArtifactId: 502,
    userId: 10,
    bureau: "Equifax",
    reportDate: "2026-03-01",
    reportType: "credit_report",
    parserQuality: { canonicalReady: true, packetReady: true, confidence: 95 },
    tradelines: [{ ...basePreviousTradeline, tradelineId: 201 }],
    ...overrides,
  };
}

function compare(overrides: Partial<OutcomeComparisonInput> = {}) {
  return compareOutcomeSnapshots({
    userId: 10,
    previousReport: previousReport(),
    laterReport: laterReport(),
    comparisonScope: "report_to_report",
    ...overrides,
  });
}

function firstOutcome(overrides: Partial<OutcomeComparisonInput> = {}) {
  return compare(overrides).findingOutcomes[0];
}

describe("deterministic outcome comparison", () => {
  it("classifies identical matched tradelines as unchanged", () => {
    const result = compare();

    expect(result.comparisonStatus).toBe("completed");
    expect(result.summary.unchanged).toBe(1);
    expect(result.findingOutcomes[0]).toMatchObject({
      outcomeType: "unchanged",
      matchingMethod: "exact_account_creditor_date",
      confidenceLevel: "high",
      previousTradelineId: 101,
      laterTradelineId: 201,
    });
  });

  it("classifies a reliable missing later tradeline as removed only when comparable", () => {
    const outcome = firstOutcome({ laterReport: laterReport({ tradelines: [] }) });

    expect(outcome).toMatchObject({
      outcomeType: "removed",
      confidenceLevel: "high",
      reasonCodes: ["COMPARABLE_LATER_REPORT_WITHOUT_MATCH"],
    });
  });

  it("classifies a corrected status field as corrected", () => {
    const outcome = firstOutcome({
      packetFindings: [
        {
          disputePacketId: 9001,
          disputePacketFindingId: 9101,
          creditorObligationTestId: 301,
          previousTradelineId: 101,
          targetFields: ["status"],
          expectedCorrectionDirection: "remove_issue",
          evidenceIds: ["ev-status-101"],
        },
      ],
      laterReport: laterReport({
        tradelines: [{ ...basePreviousTradeline, tradelineId: 201, status: "Current" }],
      }),
      comparisonScope: "packet_findings",
    });

    expect(outcome).toMatchObject({
      outcomeType: "corrected",
      creditorObligationTestId: 301,
      disputePacketFindingId: 9101,
      evidenceIds: ["ev-status-101"],
    });
  });

  it("classifies mixed targeted field changes as partially corrected", () => {
    const outcome = firstOutcome({
      packetFindings: [
        {
          previousTradelineId: 101,
          targetFields: ["status", "balance"],
          expectedCorrectionDirection: "remove_issue",
        },
      ],
      laterReport: laterReport({
        tradelines: [{ ...basePreviousTradeline, tradelineId: 201, status: "Current", balance: 1200 }],
      }),
      comparisonScope: "packet_findings",
    });

    expect(outcome).toMatchObject({
      outcomeType: "partially_corrected",
      reasonCodes: expect.arrayContaining(["PARTIAL_OR_MIXED_TARGET_FIELD_CHANGE"]),
    });
  });

  it("marks multiple possible later matches as needs_review", () => {
    const outcome = firstOutcome({
      laterReport: laterReport({
        tradelines: [
          { ...basePreviousTradeline, tradelineId: 201 },
          { ...basePreviousTradeline, tradelineId: 202 },
        ],
      }),
    });

    expect(outcome).toMatchObject({
      outcomeType: "needs_review",
      matchingMethod: "ambiguous",
      reasonCodes: ["MULTIPLE_LATER_MATCHES"],
    });
  });

  it("marks low-quality later reports as unresolved", () => {
    const result = compare({
      laterReport: laterReport({
        parserQuality: { canonicalReady: false, packetReady: false, confidence: 42, reasonCodes: ["LOW_TEXT_CONFIDENCE"] },
      }),
    });

    expect(result.comparisonStatus).toBe("unresolved");
    expect(result.summary.unresolved).toBe(1);
    expect(result.findingOutcomes[0].reasonCodes).toEqual(["LOW_LATER_REPORT_PARSER_QUALITY"]);
  });

  it("marks different bureaus as not comparable", () => {
    const result = compare({ laterReport: laterReport({ bureau: "TransUnion" }) });

    expect(result.comparisonStatus).toBe("not_comparable");
    expect(result.summary.notComparable).toBe(1);
    expect(result.findingOutcomes[0]).toMatchObject({
      outcomeType: "not_comparable",
      matchingMethod: "not_comparable",
      reasonCodes: ["BUREAU_MISMATCH"],
    });
  });

  it("classifies a prior removed outcome that appears again as reinserted", () => {
    const outcome = firstOutcome({
      previousOutcomeHistory: [{ outcomeType: "removed", previousTradelineId: 101 }],
      laterReport: laterReport({ tradelines: [{ ...basePreviousTradeline, tradelineId: 201 }] }),
    });

    expect(outcome).toMatchObject({
      outcomeType: "reinserted",
      reasonCodes: expect.arrayContaining(["PRIOR_REMOVED_OUTCOME_PRESENT_AGAIN"]),
    });
  });

  it("classifies later-only unmatched tradelines as new_issue", () => {
    const result = compare({
      laterReport: laterReport({
        tradelines: [
          { ...basePreviousTradeline, tradelineId: 201 },
          {
            tradelineId: 202,
            bureau: "Equifax",
            creditorName: "Synthetic New Lender",
            maskedAccountNumber: "****4444",
            accountSuffix: "4444",
            openDate: "2025-01-01",
            accountType: "installment",
            status: "Past due",
            balance: 800,
          },
        ],
      }),
    });

    expect(result.summary.unchanged).toBe(1);
    expect(result.summary.newIssue).toBe(1);
    expect(result.findingOutcomes.find((item) => item.outcomeType === "new_issue")).toMatchObject({
      laterTradelineId: 202,
      reasonCodes: ["LATER_TRADELINE_NOT_PRESENT_IN_PREVIOUS_REPORT"],
    });
  });

  it("maps packet findings through synthetic dispute_packet_findings-like snapshots without current finding rows", () => {
    const result = compare({
      comparisonScope: "packet_findings",
      packetFindings: [
        {
          disputePacketId: 9001,
          disputePacketFindingId: 9101,
          creditorObligationTestId: 301,
          previousTradelineId: 101,
          targetFields: ["status"],
          expectedCorrectionDirection: "remove_issue",
          readinessSnapshot: { packetReady: true },
          packetItemSnapshot: { issueId: 301, tradelineId: 101, disputedField: "status" },
          evidenceIds: ["ev-status-101"],
          evidenceLocationSnapshot: [{ evidenceId: "ev-status-101", pageNumber: 2, coordinateSource: "native_pdf" }],
        },
      ],
      laterReport: laterReport({ tradelines: [{ ...basePreviousTradeline, tradelineId: 201, status: "Current" }] }),
    });

    expect(result.findingOutcomes).toHaveLength(1);
    expect(result.findingOutcomes[0]).toMatchObject({
      outcomeType: "corrected",
      creditorObligationTestId: 301,
      disputePacketFindingId: 9101,
      previousTradelineId: 101,
      laterTradelineId: 201,
      evidenceIds: ["ev-status-101"],
    });
  });

  it("classifies response received without a later report as response_received", () => {
    const result = compare({
      laterReport: null,
      response: {
        packetId: 9001,
        responseReceivedAt: "2026-03-10T12:00:00.000Z",
        responseType: "bureau_response",
        source: "bureau_response",
      },
      packetFindings: [{ disputePacketFindingId: 9101, previousTradelineId: 101 }],
      comparisonScope: "packet_findings",
    });

    expect(result.summary.responseReceived).toBe(1);
    expect(result.findingOutcomes[0]).toMatchObject({
      outcomeType: "response_received",
      matchingMethod: "response_only",
      reasonCodes: ["RESPONSE_WITHOUT_LATER_REPORT"],
    });
  });

  it("does not classify delivery metadata alone as corrected or removed", () => {
    const result = compare({
      laterReport: null,
      delivery: {
        packetId: 9001,
        sentAt: "2026-03-01T12:00:00.000Z",
        deliveryMethod: "Synthetic Registered Mail",
      },
      packetFindings: [{ disputePacketFindingId: 9101, previousTradelineId: 101 }],
      comparisonScope: "packet_findings",
    });

    expect(result.summary.corrected).toBe(0);
    expect(result.summary.removed).toBe(0);
    expect(result.summary.unresolved).toBe(1);
    expect(result.warnings).toContain("Delivery metadata alone is not an outcome.");
  });

  it("sanitizes full SIN, full account, raw text, and storage secrets from snapshots", () => {
    const result = compare({
      previousReport: previousReport({
        tradelines: [
          {
            ...basePreviousTradeline,
            maskedAccountNumber: "1234567890123456",
            creditorName: "Synthetic Bank raw report text should not leak",
            evidenceIds: ["ev-safe", "sk-synthetic-key-should-not-appear"],
            evidenceLocationSnapshot: [
              {
                evidenceId: "ev-safe",
                pageNumber: 1,
                boundingBox: { x: 1, y: 2, width: 3, height: 4 },
                textSnippet: "SIN 123-456-789 raw report text",
                storageUrl: "bucket://private/path?X-Goog-Signature=secret",
              },
            ],
          },
        ],
      }),
      laterReport: laterReport({
        tradelines: [{ ...basePreviousTradeline, tradelineId: 201, status: "Current" }],
      }),
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("123-456-789");
    expect(serialized).not.toContain("1234567890123456");
    expect(serialized).not.toContain("raw report text");
    expect(serialized).not.toContain("bucket://private");
    expect(serialized).not.toContain("X-Goog-Signature");
    expect(serialized).not.toContain("sk-synthetic-key");
    expect(result.findingOutcomes[0].safePreviousSnapshot?.maskedAccountNumber).toBe("Account ending 3456");
    expect(result.findingOutcomes[0].evidenceIds).toContain("ev-safe");
    expect(result.findingOutcomes[0].evidenceIds).not.toContain("sk-synthetic-key-should-not-appear");
  });

  it("does not import or call packet readiness, violation firing, parser, OCR, or regulation runtime modules", () => {
    const source = readFileSync(resolve("helpers/outcomeComparison.ts"), "utf8");

    expect(source).not.toMatch(/\bimport\s+/);
    expect(source).not.toMatch(/evaluatePacketReadiness|validateDisputePacketReadiness|packetReadiness/i);
    expect(source).not.toMatch(/fireViolation|detectViolations|scanAndPersistViolations|complianceScanner/i);
    expect(source).not.toMatch(/pdfTextExtractor|ocr|extractCanonical|deterministicCreditReportPipeline|canonicalCreditReport/i);
    expect(source).not.toMatch(/activateRuntime|regulationRuntimeTruth|runtimeBridgeMapping|regulationRegistry/i);
    expect(source).not.toMatch(/\bdb\.|selectFrom|insertInto|updateTable|deleteFrom|transaction\(/);
  });
});
