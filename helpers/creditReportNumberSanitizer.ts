const MAX_CREDIT_REPORT_AMOUNT = 99_999_999.99;
const MAX_CREDIT_REPORT_PERCENT = 999.99;
const MAX_PAYMENT_HISTORY_COUNT = 999;

function parseNumericValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function warnSuppressed(fieldName: string | undefined, reason: string): void {
  console.warn(
    `[CreditReportNumberSanitizer] Suppressed numeric value${fieldName ? ` for ${fieldName}` : ""}: ${reason}`
  );
}

export function normalizeCreditReportAmount(
  value: unknown,
  fieldName?: string
): number | null {
  const parsed = parseNumericValue(value);
  if (parsed === null) return null;

  if (parsed < 0) {
    warnSuppressed(fieldName, "negative monetary value");
    return null;
  }

  if (Math.abs(parsed) > MAX_CREDIT_REPORT_AMOUNT) {
    warnSuppressed(fieldName, "outside supported credit-report monetary range");
    return null;
  }

  return Math.round(parsed * 100) / 100;
}

export function normalizeCreditReportAmountString(
  value: unknown,
  fieldName?: string
): string | null {
  const normalized = normalizeCreditReportAmount(value, fieldName);
  return normalized === null ? null : String(normalized);
}

export function normalizeCreditReportPercent(
  value: unknown,
  fieldName?: string
): number | null {
  const parsed = parseNumericValue(value);
  if (parsed === null) return null;

  if (parsed < 0 || Math.abs(parsed) > MAX_CREDIT_REPORT_PERCENT) {
    warnSuppressed(fieldName, "outside supported percentage range");
    return null;
  }

  return Math.round(parsed * 100) / 100;
}

export function normalizePaymentHistoryCount(
  value: unknown,
  fieldName?: string
): number | null {
  const parsed = parseNumericValue(value);
  if (parsed === null) return null;

  const count = Math.trunc(parsed);
  if (count < 0 || count > MAX_PAYMENT_HISTORY_COUNT) {
    warnSuppressed(fieldName, "outside supported payment-history count range");
    return null;
  }

  return count;
}
