import { describe, expect, it } from "vitest";

import {
  buildProblemAccountSummaries,
  type ProblemAccountIssue,
  type ProblemAccountTradeline,
} from "../../helpers/problemAccountSummaries";
import { getViolationLabel } from "../../helpers/getViolationLabel";

function issue(overrides: Partial<ProblemAccountIssue> = {}): ProblemAccountIssue {
  return {
    tradelineId: 42,
    creditorName: null,
    tradelineAccountNumber: null,
    tradelineDisplayStatus: null,
    tradelineCurrentBalance: null,
    tradelineBalance: null,
    tradelineBureauName: null,
    tradelineAccountType: null,
    tradelineCollectionAgencyName: null,
    tradelineOriginalCreditorName: null,
    tradelineIsCollectionAccount: null,
    obligationState: "OBLIGATION_PENDING",
    violationCategory: "BALANCE_CALCULATION_VIOLATION",
    userStatus: "active",
    technicalDetails: null,
    ...overrides,
  };
}

function tradeline(overrides: Partial<ProblemAccountTradeline> = {}): ProblemAccountTradeline {
  return {
    id: 42,
    creditorName: "CAPITAL ONE BANK",
    accountNumber: "********1234",
    bureauName: "Equifax Canada",
    status: "Revolving - Bad debt write-off",
    currentBalance: "1234.00",
    balance: "1234.00",
    accountType: "Revolving",
    creditorId: 7,
    dateClosed: null,
    datePaidSettled: null,
    collectionAgencyName: null,
    originalCreditorName: null,
    isCollectionAccount: false,
    ...overrides,
  };
}

describe("problem account summaries", () => {
  it("fills problem cards from the authoritative tradeline when validation rows are sparse", () => {
    const [summary] = buildProblemAccountSummaries([issue()], [tradeline()]);

    expect(summary.tradeline.creditorName).toBe("CAPITAL ONE BANK");
    expect(summary.tradeline.accountNumber).toBe("********1234");
    expect(summary.tradeline.bureauName).toBe("Equifax Canada");
    expect(summary.tradeline.status).toBe("Revolving - Bad debt write-off");
    expect(summary.tradeline.currentBalance).toBe("1234.00");
    expect(summary.tradeline.accountType).toBe("Revolving");
    expect(summary.problemLabels).toEqual(["Balance Doesn't Add Up"]);
  });

  it("uses collection agency and original creditor fallbacks before showing generic account labels", () => {
    const [summary] = buildProblemAccountSummaries(
      [
        issue({
          tradelineCollectionAgencyName: "CBV COLLECTION SERVICES",
          tradelineOriginalCreditorName: "ORIGINAL CREDITOR INC",
          tradelineIsCollectionAccount: true,
        }),
      ],
      [tradeline({ creditorName: null, collectionAgencyName: "CBV COLLECTION SERVICES", isCollectionAccount: true })],
    );

    expect(summary.tradeline.creditorName).toBe("CBV COLLECTION SERVICES");
    expect(summary.tradeline.isCollectionAccount).toBe(true);
  });

  it("excludes dismissed and verified issues from the active problems page", () => {
    const summaries = buildProblemAccountSummaries(
      [
        issue({ userStatus: "dismissed" }),
        issue({ userStatus: "verified" }),
        issue({ violationCategory: "ACCOUNT_STATUS_INCONSISTENCY", obligationState: "NO_RESPONSE" }),
      ],
      [tradeline()],
    );

    expect(summaries).toHaveLength(1);
    expect(summaries[0].issueCount).toBe(1);
    expect(summaries[0].highPriorityCount).toBe(1);
    expect(summaries[0].problemLabels).toEqual(["Account Status Doesn't Match"]);
  });

  it("counts only consumer-visible review items so cards match the tradeline drilldown", () => {
    const [summary] = buildProblemAccountSummaries(
      [
        issue({ violationCategory: "DOCUMENTATION_CHAIN_FAILURE", obligationState: "NO_RESPONSE" }),
        issue({ violationCategory: "STATUTE_APPROACHING" }),
        issue({ violationCategory: "STALE_REPORTING_FAILURE" }),
        issue({
          violationCategory: "DISCLOSURE_DEFICIENCY",
          technicalDetails: { fieldPath: "accounts[].creditor_name" },
        }),
        issue({ violationCategory: "DOCUMENTATION_CHAIN_FAILURE" }),
        issue({ violationCategory: "MULTIPLE_COLLECTOR_VIOLATION" }),
      ],
      [
        tradeline({
          status: "Cancelled by Credit Grantor",
          dateClosed: "2026-01-01",
          originalCreditorName: "FIDO",
        }),
      ],
    );

    expect(summary.issueCount).toBe(2);
    expect(summary.highPriorityCount).toBe(1);
    expect(summary.problemLabels).toEqual([
      getViolationLabel("DOCUMENTATION_CHAIN_FAILURE"),
      getViolationLabel("STATUTE_APPROACHING"),
    ]);
  });
});
