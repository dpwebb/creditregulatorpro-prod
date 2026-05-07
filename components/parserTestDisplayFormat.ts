import { formatCurrency, formatDate } from "../helpers/formatters";

export const MISSING_ACCOUNT_NUMBER_LABEL = "Not Provided by Bureau";
export const MISSING_REPORT_VALUE_LABEL = "Not Provided on Report";

const MISSING_TEXT_VALUES = new Set([
  "unknown",
  "n/a",
  "na",
  "none",
  "null",
  "not reported",
  "not provided",
  "not provided by bureau",
  "not available",
  "not extracted",
]);

function compact(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizedMissingText(value: unknown): string {
  return compact(value).toLowerCase();
}

export function isMissingReportValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "number") return !Number.isFinite(value);
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "string") {
    const normalized = normalizedMissingText(value);
    return !normalized || MISSING_TEXT_VALUES.has(normalized);
  }
  return false;
}

export function formatAccountNumber(value: unknown): string {
  return isMissingReportValue(value) ? MISSING_ACCOUNT_NUMBER_LABEL : compact(value);
}

export function formatReportDate(value: unknown): string | null {
  if (isMissingReportValue(value)) return null;
  return formatDate(value as string | Date) || compact(value);
}

export function isMoneyField(label: string): boolean {
  const normalized = label.toLowerCase();
  if (normalized.includes("history")) return false;
  if (normalized.includes("date")) return false;
  return /\b(balance|amount|credit|limit|past due|payment|charge off|written off)\b/.test(
    normalized,
  );
}

export function formatParserTestValue(label: string, value: unknown): string | null {
  if (/account number/i.test(label)) return formatAccountNumber(value);
  if (isMissingReportValue(value)) return null;

  if (isMoneyField(label)) {
    const formatted = formatCurrency(value as string | number);
    if (formatted) return formatted;
  }

  return compact(value);
}

export function getRemarkCodeLines(value: unknown): string[] {
  if (isMissingReportValue(value)) return [];
  const values = (Array.isArray(value) ? value : [value]).flatMap((entry) =>
    String(entry).split(/[,;|]+/),
  );
  return values.map((entry) => compact(entry)).filter(Boolean);
}
