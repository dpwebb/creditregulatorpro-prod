import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateAnonymousPreview } from "../../helpers/anonymousCompliancePreview";
import type { ComprehensiveParseResult, ParsedTradeline } from "../../helpers/reportParserTypes";

function reportWithTradeline(
  tradeline: Partial<ParsedTradeline>,
): ComprehensiveParseResult {
  return {
    rawText: "synthetic report",
    reportMetadata: {
      reportDate: "2026-05-27",
    } as ComprehensiveParseResult["reportMetadata"],
    sourceBureau: { bureauName: "Synthetic Bureau", confidence: 100 },
    consumerInfo: {
      province: "NS",
    } as ComprehensiveParseResult["consumerInfo"],
    tradelines: [
      {
        accountNumber: "1234",
        creditorName: "Halifax Telecom",
        accountType: "Collection",
        balance: 100,
        status: "Collection",
        dates: {},
        amounts: { pastDue: 100 },
        remarkCodes: [],
        isCollectionAccount: true,
        ...tradeline,
      } as ParsedTradeline,
    ],
    creditScores: [],
    inquiries: [],
    publicRecords: [],
    consumerStatements: [],
    employmentInfo: [],
    paymentHistories: [],
  };
}

describe("anonymous compliance preview wording", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses direct expired-reporting wording without may language", () => {
    const [problem] = generateAnonymousPreview(
      reportWithTradeline({
        dates: { dofd: new Date("2019-01-01T00:00:00Z") },
      }),
    );

    expect(problem.type).toBe("sol_expired");
    expect(`${problem.title} ${problem.detail} ${problem.solution}`).toContain(
      "This account is reported beyond Nova Scotia's allowed reporting period.",
    );
    expect(`${problem.detail} ${problem.solution}`).not.toMatch(
      /\b(may|might|appears to|could|suggest)\b/i,
    );
    expect(`${problem.detail} ${problem.solution}`).not.toContain("NS law");
  });

  it("uses current-date framing for upcoming reporting limits", () => {
    const [problem] = generateAnonymousPreview(
      reportWithTradeline({
        dates: { dofd: new Date("2020-08-27T00:00:00Z") },
      }),
    );

    expect(problem.type).toBe("sol_approaching");
    expect(problem.detail).toContain(
      "This account reaches Nova Scotia's reporting limit on 2026-08-27.",
    );
    expect(problem.detail).toContain("Time remaining from today:");
    expect(problem.detail).not.toMatch(/\b(Expiring soon|is expected to)\b/i);
  });
});
