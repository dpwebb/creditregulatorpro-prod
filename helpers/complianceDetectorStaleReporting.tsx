import { parseISO, isValid } from "./dateUtils";
import type { Selectable } from "kysely";

/**
 * Safely parses a date input which might be a Date object, an ISO string, or null/undefined.
 */
function safeParseDate(dateInput: Date | string | null | undefined): Date | null {
  if (!dateInput) return null;
  
  if (dateInput instanceof Date) {
    return isValid(dateInput) ? dateInput : null;
  }
  
  if (typeof dateInput === 'string') {
    const parsed = parseISO(dateInput);
    return isValid(parsed) ? parsed : null;
  }
  
  return null;
}
import type { Tradeline } from "./schema";
import type { DetectedViolation } from "./complianceDetectorTypes";
import { regulationRegistry } from "./regulationRegistry";

/**
 * Checks if a tradeline's last reported date is suspiciously old.
 * Furnishers are required to report accurate monthly updates under PIPEDA 4.6.
 */
export function detectStaleReportingFailure(
  tradeline: Selectable<Tradeline>,
  reportDateParam: Date | string
): DetectedViolation[] {
  const violations: DetectedViolation[] = [];

  const statusLower = (tradeline.status || "").toLowerCase();
  
  const trulyDeadStatuses = ["closed", "paid", "settled", "transferred"];
  if (trulyDeadStatuses.some((s) => statusLower.includes(s))) {
    return violations; // No obligation to continue monthly reporting
  }

  const chargeOffStatuses = ["charge", "writeoff", "write-off"];
  if (chargeOffStatuses.some((s) => statusLower.includes(s))) {
    const balance = Number(tradeline.balance) || 0;
    if (balance <= 0) {
      return violations; // No obligation to report if balance is 0
    }
  }

  const lastReported = safeParseDate(tradeline.lastReportedDate as any);
  const posted = safeParseDate((tradeline as any).postedDate);

  let effectiveDate: Date | null = null;
  if (lastReported && posted) {
    effectiveDate = lastReported.getTime() > posted.getTime() ? lastReported : posted;
  } else if (lastReported) {
    effectiveDate = lastReported;
  } else if (posted) {
    effectiveDate = posted;
  }

  if (!effectiveDate) {
    return violations;
  }

  const referenceDate = safeParseDate(reportDateParam);
  if (!referenceDate) {
    return violations;
  }
  const monthsOld = (referenceDate.getFullYear() - effectiveDate.getFullYear()) * 12 + (referenceDate.getMonth() - effectiveDate.getMonth());

  // Trigger if more than 2 months have passed since the last report
  if (monthsOld > 2) {
    const isError = monthsOld > 6;
    violations.push({
      violationCategory: "STALE_REPORTING_FAILURE",
      severity: isError ? "ERROR" : "WARNING",
      confidenceScore: 90,
      userExplanation: `This account hasn't been updated in ${monthsOld} MONTHS.`,
      technicalDetails: {
        lastReportedDate: tradeline.lastReportedDate,
        postedDate: (tradeline as any).postedDate,
        effectiveDate: effectiveDate.toISOString(),
        monthsOld,
        detectedValue: monthsOld,
        regulationIds: ["PIPEDA_4_6"],
      },
      recommendedAction: "Dispute the account as stale and unverified since the company has stopped reporting its monthly status.",
      tradelineId: tradeline.id,
      responsibleEntity: "CREDITOR",
    });
  }

  return violations;
}