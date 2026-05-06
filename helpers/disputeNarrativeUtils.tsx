import type { TradelineDetails } from "./equifaxDisputeTemplate";
import { formatCurrency as formatDollarAmount } from "./formatters";

/**
 * Formats a date to a readable string, returning undefined if the date is null/undefined.
 */
export function formatDate(date: Date | string | null | undefined): string | undefined {
  if (!date) return undefined;
  const d = new Date(date);
  if (isNaN(d.getTime())) return typeof date === "string" ? date : undefined;
  return d.toLocaleDateString("en-CA");
}

/**
 * Formats a numeric string as a currency amount.
 */
export function formatCurrency(value: string | number | null | undefined): string | undefined {
  const formatted = formatDollarAmount(value);
  return formatted || undefined;
}

/**
 * Checks if a string looks like an ISO date and formats it if so.
 */
export function formatIfDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
  if (isoDateRegex.test(value)) {
    return formatDate(value) ?? value;
  }
  return value;
}

/**
 * Checks if a value is purely technical and shouldn't be exposed directly to the user.
 */
export function isTechnicalValue(
  value: string | null | undefined,
  fieldName?: string | null,
  otherValue?: string | null
): boolean {
  if (!value) return false;
  const str = value.trim();
  if (/^\d+\s*chars$/i.test(str)) return true;
  if (/^Max \d+/i.test(str)) return true;
  if (str === "All required fields present") return true;
  if (str === "null") return true;
  if (/^\d+$/.test(str) && !fieldName && !otherValue) return true;
  if (str.toLowerCase().includes("non-zero")) return true;
  return false;
}

/**
 * Produces a plain-language problem statement tailored to the dispute reason,
 * using actual tradeline figures from the consumer disclosure.
 */
export function buildReasonSpecificProblem(reasonDescription: string, details: TradelineDetails): string {
  const lower = reasonDescription.toLowerCase();

  if (lower.includes("balance") && details.balance) return `The reported balance of ${formatCurrency(details.balance)} is incorrect.`;
  if (lower.includes("credit limit") && details.creditLimit) return `The reported credit limit of ${formatCurrency(details.creditLimit)} is incorrect.`;
  if ((lower.includes("status") || lower.includes("payment status")) && details.status) return `The reported payment status of "${details.status}" is incorrect.`;
  if (lower.includes("date") && details.dateOfFirstDelinquency) return `The reported Date of First Delinquency (${formatDate(details.dateOfFirstDelinquency)}) is incorrect.`;
  if (lower.includes("outdated") || lower.includes("obsolete")) return `This account has exceeded its permissible retention period and must be removed.`;
  if (lower.includes("duplicate")) return `This account is reported multiple times in error.`;
  if (lower.includes("not mine") || lower.includes("does not belong")) return `This account does not belong to me.`;

  return `The reported information is inaccurate: ${reasonDescription.toLowerCase()}.`;
}
