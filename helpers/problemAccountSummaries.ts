import { getViolationDisplayLabel } from "./getViolationLabel";
import { hasReportedAccountValue } from "./accountDisplayLabels";
import {
  isActiveProblemReviewIssue,
  summarizeVisibleProblemReviews,
  type ProblemReviewIssue,
} from "./problemReviewVisibility";

export type ProblemAccountIssue = ProblemReviewIssue & {
  tradelineId: number | null;
  creditorName: string | null;
  tradelineAccountNumber: string | null;
  tradelineDisplayStatus: string | null;
  tradelineCurrentBalance: string | number | null;
  tradelineBalance: string | number | null;
  tradelineBureauName: string | null;
  tradelineAccountType?: string | null;
  tradelineCollectionAgencyName?: string | null;
  tradelineOriginalCreditorName?: string | null;
  tradelineIsCollectionAccount?: boolean | null;
  obligationState: string | null;
};

export type ProblemAccountTradeline = {
  id: number;
  creditorId?: number | string | null;
  creditorName: string | null;
  accountNumber: string | null;
  bureauName: string | null;
  status: string | null;
  dateClosed?: Date | string | null;
  datePaidSettled?: Date | string | null;
  currentBalance: string | number | null;
  balance: string | number | null;
  accountType?: string | null;
  collectionAgencyName?: string | null;
  originalCreditorName?: string | null;
  isCollectionAccount?: boolean | null;
};

export type ProblemAccountSummary = {
  tradeline: {
    id: number;
    creditorName: string | null;
    accountNumber: string | null;
    bureauName: string | null;
    status: string | null;
    currentBalance: string | number | null;
    balance: string | number | null;
    accountType: string | null;
    isCollectionAccount: boolean | null;
  };
  issues: ProblemAccountIssue[];
  issueCount: number;
  highPriorityCount: number;
  problemLabels: string[];
};

function firstReportedValue<T extends string | number | null | undefined>(...values: T[]): T | null {
  return values.find((value) => hasReportedAccountValue(value)) ?? null;
}

function uniqueProblemLabels(issues: ProblemAccountIssue[]): string[] {
  const labels: string[] = [];
  for (const issue of issues) {
    const label = getViolationDisplayLabel(issue);
    if (!labels.includes(label)) labels.push(label);
    if (labels.length >= 3) break;
  }
  return labels;
}

export function buildProblemAccountSummaries(
  issues: ProblemAccountIssue[],
  tradelines: ProblemAccountTradeline[],
): ProblemAccountSummary[] {
  const tradelineById = new Map(tradelines.map((tradeline) => [tradeline.id, tradeline]));
  const issuesByTradeline = new Map<number, ProblemAccountIssue[]>();

  for (const issue of issues) {
    if (issue.tradelineId == null || !isActiveProblemReviewIssue(issue)) continue;
    const existing = issuesByTradeline.get(issue.tradelineId) ?? [];
    existing.push(issue);
    issuesByTradeline.set(issue.tradelineId, existing);
  }

  return [...issuesByTradeline.entries()]
    .map(([tradelineId, accountIssues]) => {
      const issueSeed = accountIssues[0];
      const tradeline = tradelineById.get(tradelineId);
      const isCollectionAccount =
        issueSeed.tradelineIsCollectionAccount ?? tradeline?.isCollectionAccount ?? null;
      const visibleReviewSummary = summarizeVisibleProblemReviews(accountIssues, tradeline);

      return {
        tradeline: {
          id: tradelineId,
          creditorName: firstReportedValue(
            issueSeed.creditorName,
            tradeline?.creditorName,
            issueSeed.tradelineCollectionAgencyName,
            tradeline?.collectionAgencyName,
            issueSeed.tradelineOriginalCreditorName,
            tradeline?.originalCreditorName,
          ),
          accountNumber: firstReportedValue(issueSeed.tradelineAccountNumber, tradeline?.accountNumber),
          bureauName: firstReportedValue(issueSeed.tradelineBureauName, tradeline?.bureauName),
          status: firstReportedValue(issueSeed.tradelineDisplayStatus, tradeline?.status),
          currentBalance: firstReportedValue(issueSeed.tradelineCurrentBalance, tradeline?.currentBalance),
          balance: firstReportedValue(issueSeed.tradelineBalance, tradeline?.balance),
          accountType: firstReportedValue(issueSeed.tradelineAccountType, tradeline?.accountType),
          isCollectionAccount,
        },
        issues: accountIssues,
        issueCount: visibleReviewSummary.visibleReviewCount,
        highPriorityCount: visibleReviewSummary.visibleReviewIssues.filter((issue) =>
          ["NO_RESPONSE", "INSUFFICIENT_RESPONSE"].includes(issue.obligationState || ""),
        ).length,
        problemLabels:
          visibleReviewSummary.visibleProblemLabels.length > 0
            ? visibleReviewSummary.visibleProblemLabels
            : uniqueProblemLabels(accountIssues),
      } satisfies ProblemAccountSummary;
    })
    .filter((summary) => summary.issueCount > 0)
    .sort((a, b) => b.issueCount - a.issueCount || a.tradeline.id - b.tradeline.id);
}
