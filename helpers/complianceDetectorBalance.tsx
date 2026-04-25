import type { Selectable } from "kysely";
import type { Tradeline, ReportArtifact } from "./schema";
import type { DetectedViolation } from "./complianceDetectorTypes";
import { StandardizedCreditData } from "./changeDetector";
import { regulationRegistry } from "./regulationRegistry";

/**
 * Compares payment history codes across reports to find unexplained negative changes.
 */
export function detectPaymentHistoryManipulation(
  tradeline: Selectable<Tradeline>,
  reportArtifacts: Selectable<ReportArtifact>[]
): DetectedViolation[] {
  const violations: DetectedViolation[] = [];
  if (reportArtifacts.length < 2) {
    return violations;
  }

  const sortedArtifacts = [...reportArtifacts].sort((a, b) =>
    new Date(a.reportDate!).getTime() - new Date(b.reportDate!).getTime()
  );

  for (let i = 0; i < sortedArtifacts.length - 1; i++) {
    const prevData = sortedArtifacts[i].data as StandardizedCreditData | null;
    const currData = sortedArtifacts[i + 1].data as StandardizedCreditData | null;

    const prevHistory = prevData?.paymentHistory ?? "";
    const currHistory = currData?.paymentHistory ?? "";

    if (prevHistory && currHistory && prevHistory !== currHistory) {
      // A simple heuristic: check if the number of non-zero/non-current ratings has increased.
      const countNegative = (h: string) => (h.match(/[1-9BCDEFGHJKL]/g) || []).length;
      if (countNegative(currHistory) > countNegative(prevHistory)) {
        violations.push({
          violationCategory: "PAYMENT_HISTORY_MANIPULATION",
          severity: "WARNING",
          confidenceScore: 75,
          userExplanation: "The PAYMENT HISTORY shows unexplained new negative marks compared to previous reports.",
          technicalDetails: {
            previousHistory: prevHistory,
            currentHistory: currHistory,
            detectedValue: currHistory,
            comparedArtifacts: [sortedArtifacts[i].id, sortedArtifacts[i+1].id],
            regulationIds: ["PIPEDA_4_6", "METRO2_PAYMENT_RATING"],
          },
      recommendedAction: "Ask the company to explain these new negative marks or remove them.",
      tradelineId: tradeline.id,
      responsibleEntity: "CREDITOR",
    });
      }
    }
  }
  return violations;
}

/**
 * Verifies the mathematical consistency of balance fields.
 */
export function detectBalanceCalculationViolation(
  tradeline: Selectable<Tradeline>
): DetectedViolation[] {
  const violations: DetectedViolation[] = [];
  const balance = Number(tradeline.balance);
  const pastDue = Number(tradeline.amountPastDue);
  const highCredit = Number(tradeline.highCredit);

  if (pastDue > balance && balance > 0) {
    violations.push({
      violationCategory: "BALANCE_CALCULATION_VIOLATION",
      severity: "ERROR",
      confidenceScore: 100,
      userExplanation: "The AMOUNT PAST DUE exceeds the total BALANCE.",
      technicalDetails: { balance, pastDue, detectedValue: pastDue, check: "pastDue > balance", regulationIds: ["PIPEDA_4_6"] },
      recommendedAction: "Dispute this account because the numbers don't add up correctly.",
      tradelineId: tradeline.id,
      responsibleEntity: "CREDITOR",
    });
  }

  if (balance > highCredit && highCredit > 0) {
    // This can be legitimate (e.g., interest on a maxed-out card), so it's a warning.
    violations.push({
      violationCategory: "BALANCE_CALCULATION_VIOLATION",
      severity: "INFO",
      confidenceScore: 60,
      userExplanation: "The current BALANCE exceeds the reported HIGH CREDIT.",
      technicalDetails: { balance, highCredit, detectedValue: balance, check: "balance > highCredit", regulationIds: ["PIPEDA_4_6"] },
      recommendedAction: "Ask the company reporting this to fix the reporting or show proof for why the balance is so high.",
      tradelineId: tradeline.id,
      responsibleEntity: "CREDITOR",
    });
  }

  return violations;
}

/**
 * Tracks and flags unexplained credit limit reductions across reports.
 */
export function detectCreditLimitManipulation(
  tradeline: Selectable<Tradeline>,
  reportArtifacts: Selectable<ReportArtifact>[]
): DetectedViolation[] {
  const violations: DetectedViolation[] = [];
  if (reportArtifacts.length < 2) {
    return violations;
  }

  const statusStr = String(tradeline.status || "").toUpperCase();
  const isClosed = statusStr.includes("CLOSED") || statusStr.includes("PAID");
  
  if (isClosed) {
    return violations;
  }

  const sortedArtifacts = [...reportArtifacts].sort((a, b) =>
    new Date(a.reportDate!).getTime() - new Date(b.reportDate!).getTime()
  );

  for (let i = 0; i < sortedArtifacts.length - 1; i++) {
    const prevData = sortedArtifacts[i].data as StandardizedCreditData | null;
    const currData = sortedArtifacts[i + 1].data as StandardizedCreditData | null;

    const prevLimit = Number(prevData?.creditLimit);
    const currLimit = Number(currData?.creditLimit);

    if (prevLimit > 0 && currLimit < prevLimit) {
      const decreaseAmt = prevLimit - currLimit;
      const decreasePct = (decreaseAmt / prevLimit) * 100;

      if (decreasePct >= 25 && decreaseAmt >= 500) {
        violations.push({
          violationCategory: "CREDIT_LIMIT_MANIPULATION",
          severity: "WARNING",
          confidenceScore: 55,
          userExplanation: `The CREDIT LIMIT was reduced by ${Math.round(decreasePct)}% without explanation.`,
          technicalDetails: {
            previousLimit: prevLimit,
            currentLimit: currLimit,
            detectedValue: currLimit,
            comparedArtifacts: [sortedArtifacts[i].id, sortedArtifacts[i+1].id],
            regulationIds: ["PIPEDA_4_6"],
          },
          recommendedAction: "Ask the company to explain why your credit limit was lowered.",
          tradelineId: tradeline.id,
          responsibleEntity: "CREDITOR",
        });
      }
    }
  }
  return violations;
}