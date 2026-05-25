import { isValid, parseISO } from "./dateUtils";
import {
  isEffectivelyCollectionAccount,
  type TradelineForCollectionCheck,
} from "./complianceDetectorTypes";
import { accountBoundSourceText } from "./reportFactSource";

export interface TradelineForStaleReportingGuard extends TradelineForCollectionCheck {
  dateClosed?: Date | string | null;
  datePaidSettled?: Date | string | null;
}

function safeParseDate(dateInput: Date | string | null | undefined): Date | null {
  if (!dateInput) return null;

  if (dateInput instanceof Date) {
    return isValid(dateInput) ? dateInput : null;
  }

  if (typeof dateInput === "string") {
    const parsed = parseISO(dateInput);
    return isValid(parsed) ? parsed : null;
  }

  return null;
}

const TERMINAL_STATUS_CODES = new Set([
  "05", // transferred
  "13", // paid/closed zero balance
  "61",
  "62",
  "63",
  "64",
  "65", // paid terminal variants
  "88",
  "89",
  "94",
  "95",
  "96", // legal terminal variants
  "DA",
  "DF", // delete/fraud delete
]);

const TERMINAL_STATUS_KEYWORDS = [
  "closed",
  "closed by company",
  "closed by the company",
  "closed by credit grantor",
  "closed at credit grantor",
  "paid",
  "settled",
  "transferred",
  "write-off",
  "write off",
  "writeoff",
  "charge-off",
  "charge off",
  "charged off",
  "cancelled",
  "canceled",
  "repossession",
  "voluntary surrender",
  "foreclosure",
  "deed in lieu",
];

export function hasTerminalReportingStatus(
  tradeline: Pick<TradelineForStaleReportingGuard, "status" | "dateClosed" | "datePaidSettled" | "sourceText" | "notes">
): boolean {
  if (safeParseDate(tradeline.dateClosed)) return true;
  if (safeParseDate(tradeline.datePaidSettled)) return true;

  const statusRaw = String(tradeline.status || "");
  const statusLower = statusRaw.toLowerCase();
  const statusTokens = statusRaw
    .split(/[\s,|/]+/)
    .map((token) => token.trim().toUpperCase())
    .filter(Boolean);

  if (statusTokens.some((token) => TERMINAL_STATUS_CODES.has(token))) {
    return true;
  }

  if (TERMINAL_STATUS_KEYWORDS.some((keyword) => statusLower.includes(keyword))) {
    return true;
  }

  const sourceEvidence = accountBoundSourceText(`${tradeline.sourceText || ""} ${tradeline.notes || ""}`).toUpperCase();
  if (
    /(?:^|[^A-Z0-9])CZ(?:[^A-Z0-9]|$)/.test(sourceEvidence) ||
    /(?:^|[^A-Z0-9])WO(?:[^A-Z0-9]|$)/.test(sourceEvidence) ||
    sourceEvidence.includes("CLOSED AT CONSUMER") ||
    sourceEvidence.includes("BAD DEBT WRITE-OFF") ||
    sourceEvidence.includes("ACCOUNT TURNED OVER TO COLLECTION")
  ) {
    return true;
  }

  return false;
}

export function isIneligibleForStaleReportingViolation(
  tradeline: TradelineForStaleReportingGuard
): boolean {
  if (hasTerminalReportingStatus(tradeline)) return true;
  if (isEffectivelyCollectionAccount(tradeline)) return true;
  return false;
}

export function shouldSuppressStaleReportingViolation(
  violationCategory: string | null | undefined,
  tradeline: TradelineForStaleReportingGuard
): boolean {
  return (
    violationCategory === "STALE_REPORTING_FAILURE" &&
    isIneligibleForStaleReportingViolation(tradeline)
  );
}
