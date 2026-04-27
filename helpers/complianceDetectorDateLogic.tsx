import { isBefore, parseISO, isValid } from "./dateUtils";
import { regulationRegistry } from "./regulationRegistry";
import type { Selectable } from "kysely";
import type { Tradeline } from "./schema";
import type { DetectedViolation } from "./complianceDetectorTypes";
import { isEffectivelyCollectionAccount } from "./complianceDetectorTypes";

/**
 * Helper to safely parse and validate a date.
 */
function safeParseDate(dateVal: any): Date | null {
  if (!dateVal) return null;
  const d = typeof dateVal === "string" ? parseISO(dateVal) : new Date(dateVal);
  if (isValid(d)) {
    if (d.toISOString() === "2000-01-01T00:00:00.000Z") return null;
    return d;
  }
  return null;
}

/**
 * Checks ALL date relationships on the tradeline for logical impossibilities.
 */
export function detectDateLogicImpossibility(
  tradeline: Selectable<Tradeline>
): DetectedViolation[] {
  const violations: DetectedViolation[] = [];
  const isCollection = isEffectivelyCollectionAccount(tradeline);

  const openedDate = safeParseDate(tradeline.openedDate);
  const dofd = safeParseDate(tradeline.dateOfFirstDelinquency);
  const dateClosed = safeParseDate(tradeline.dateClosed);
  const dateOfLastPayment = safeParseDate(tradeline.dateOfLastPayment);
  const lastActivityDate = safeParseDate(tradeline.lastActivityDate);
  const chargeOffDate = safeParseDate(tradeline.chargeOffDate);
  const dateAssignedToCollection = safeParseDate(tradeline.dateAssignedToCollection);

  const checkAndPush = (
    date1: Date | null,
    name1: string,
    date2: Date | null,
    name2: string,
    ruleDesc: string
  ) => {
    if (date1 && date2 && isBefore(date1, date2)) {
      violations.push({
        violationCategory: "DATE_LOGIC_IMPOSSIBLE",
        severity: "ERROR",
        confidenceScore: 100,
        userExplanation: `The ${name1.toUpperCase()} is logically impossible as it occurs before the ${name2.toUpperCase()}.`,
        technicalDetails: {
          tradelineId: tradeline.id,
          date1Name: name1,
          date1Value: date1.toISOString(),
          date2Name: name2,
          date2Value: date2.toISOString(),
          ruleViolated: `${name1} < ${name2}`,
          detectedValue: `${name1} < ${name2}`,
          regulationIds: ["PIPEDA_4_6"],
        },
        recommendedAction: "Dispute this account on the basis of inaccurate and impossible date reporting.",
        responsibleEntity: "CREDITOR",
      });
    }
  };

  // a. DOFD before openedDate
  if (!isCollection) {
    checkAndPush(dofd, "Date of First Delinquency", openedDate, "Opened Date", "the account is marked as delinquent before it was even opened");
  }

  // b. dateClosed before openedDate
  checkAndPush(dateClosed, "Date Closed", openedDate, "Opened Date", "the account was closed before it was opened");

  // c. dateOfLastPayment before openedDate
  if (!isCollection) {
    checkAndPush(dateOfLastPayment, "Date of Last Payment", openedDate, "Opened Date", "a payment was made before the account was opened");
  }

  // d. lastActivityDate before openedDate
  checkAndPush(lastActivityDate, "Last Activity Date", openedDate, "Opened Date", "activity was reported before the account was opened");

  // e. chargeOffDate before openedDate
  checkAndPush(chargeOffDate, "Charge Off Date", openedDate, "Opened Date", "the account was charged off before it was opened");

  // f. dateAssignedToCollection before openedDate
  checkAndPush(dateAssignedToCollection, "Date Assigned to Collection", openedDate, "Opened Date", "the account was sent to collections before it was opened");

  // g. chargeOffDate before DOFD
  checkAndPush(chargeOffDate, "Charge Off Date", dofd, "Date of First Delinquency", "the account was charged off before it went delinquent");

  // h. dateAssignedToCollection before DOFD
  checkAndPush(dateAssignedToCollection, "Date Assigned to Collection", dofd, "Date of First Delinquency", "the account was sent to collections before it went delinquent");

  return violations;
}