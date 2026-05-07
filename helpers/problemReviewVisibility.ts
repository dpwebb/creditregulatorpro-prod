import { getViolationLabel } from "./getViolationLabel";
import { isIneligibleForStaleReportingViolation } from "./staleReportingGuard";

export type ProblemReviewIssue = {
  violationCategory: string | null | undefined;
  userStatus?: string | null;
  technicalDetails?: Record<string, unknown> | null;
};

export type ProblemReviewTradeline = {
  status?: string | null;
  dateClosed?: Date | string | null;
  datePaidSettled?: Date | string | null;
  isCollectionAccount?: boolean | null;
  collectionAgencyName?: string | null;
  accountType?: string | null;
  creditorId?: number | string | null;
  originalCreditorName?: string | null;
};

export type VisibleProblemReviewSummary<TIssue extends ProblemReviewIssue> = {
  activeIssues: TIssue[];
  displayIssues: TIssue[];
  nonAdminDisplayIssues: TIssue[];
  approachingIssue: TIssue | null;
  visibleReviewIssues: TIssue[];
  visibleReviewCount: number;
  visibleProblemLabels: string[];
};

export function isActiveProblemReviewIssue(issue: ProblemReviewIssue): boolean {
  return !issue.userStatus || issue.userStatus === "active";
}

function hasKnownCreditorIdentity(tradeline: ProblemReviewTradeline | null | undefined): boolean {
  if (!tradeline) return false;
  return !!(
    tradeline.creditorId != null ||
    (tradeline.originalCreditorName && tradeline.originalCreditorName.trim().length > 0) ||
    (tradeline.collectionAgencyName && tradeline.collectionAgencyName.trim().length > 0)
  );
}

function getTechnicalFieldPath(issue: ProblemReviewIssue): string {
  return String(issue.technicalDetails?.fieldPath || "").toLowerCase();
}

function uniqueProblemLabels(issues: ProblemReviewIssue[]): string[] {
  const labels: string[] = [];
  for (const issue of issues) {
    const label = getViolationLabel(issue.violationCategory);
    if (!labels.includes(label)) labels.push(label);
    if (labels.length >= 3) break;
  }
  return labels;
}

export function summarizeVisibleProblemReviews<TIssue extends ProblemReviewIssue>(
  issues: TIssue[],
  tradeline?: ProblemReviewTradeline | null,
): VisibleProblemReviewSummary<TIssue> {
  const activeIssues = issues.filter(isActiveProblemReviewIssue);
  const approachingIssue =
    activeIssues.find((issue) => issue.violationCategory === "STATUTE_APPROACHING") ?? null;
  const displayIssues = activeIssues.filter(
    (issue) => issue.violationCategory !== "STATUTE_APPROACHING",
  );
  const hasStatuteTimingIssue = activeIssues.some(
    (issue) =>
      issue.violationCategory === "STATUTE_OF_LIMITATIONS" ||
      issue.violationCategory === "STATUTE_APPROACHING",
  );
  const suppressStaleReporting = !!(
    tradeline &&
    isIneligibleForStaleReportingViolation({
      status: tradeline.status,
      dateClosed: tradeline.dateClosed,
      datePaidSettled: tradeline.datePaidSettled,
      isCollectionAccount: tradeline.isCollectionAccount,
      collectionAgencyName: tradeline.collectionAgencyName,
      accountType: tradeline.accountType,
    })
  );
  const knownCreditorIdentity = hasKnownCreditorIdentity(tradeline);

  const filtered = displayIssues.filter((issue) => {
    if (issue.violationCategory === "MULTIPLE_COLLECTOR_VIOLATION") return false;

    if (issue.violationCategory === "STALE_REPORTING_FAILURE") {
      if (hasStatuteTimingIssue || suppressStaleReporting) return false;
    }

    if (issue.violationCategory === "DISCLOSURE_DEFICIENCY") {
      const fieldPath = getTechnicalFieldPath(issue);
      if (
        (fieldPath === "accounts[].creditor_name" || fieldPath === "accounts.creditor_name") &&
        knownCreditorIdentity
      ) {
        return false;
      }
    }

    return true;
  });

  const seenCategories = new Set<string>();
  const nonAdminDisplayIssues = filtered.filter((issue) => {
    if (!issue.violationCategory) return true;
    if (seenCategories.has(issue.violationCategory)) return false;
    seenCategories.add(issue.violationCategory);
    return true;
  });

  const visibleIssueSet = new Set<TIssue>(nonAdminDisplayIssues);
  if (approachingIssue) visibleIssueSet.add(approachingIssue);

  const visibleReviewIssues = activeIssues.filter((issue) => visibleIssueSet.has(issue));

  return {
    activeIssues,
    displayIssues,
    nonAdminDisplayIssues,
    approachingIssue,
    visibleReviewIssues,
    visibleReviewCount: visibleReviewIssues.length,
    visibleProblemLabels: uniqueProblemLabels(visibleReviewIssues),
  };
}
