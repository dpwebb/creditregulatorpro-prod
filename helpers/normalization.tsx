import { ParsedTradeline } from "./reportParser";
import { normalizeCreditReportAmount } from "./creditReportNumberSanitizer";

/**
 * Normalizes parsed tradeline data.
 * - Trims whitespace
 * - Converts status to uppercase
 * - Standardizes account types
 * - Ensures numeric values are valid numbers (or 0)
 */
export function normalizeTradelines(tradelines: ParsedTradeline[]): ParsedTradeline[] {
  return tradelines.map((tl) => {
    return {
      ...tl,
      accountNumber: tl.accountNumber.trim(),
      creditorName: tl.creditorName.trim(),
      accountType: normalizeAccountType(tl.accountType),
      status: tl.status.trim().toUpperCase(),
      balance: normalizeCreditReportAmount(tl.balance, "tradeline.balance") ?? 0,
      amounts: {
        ...tl.amounts,
        high: normalizeCreditReportAmount(tl.amounts.high, "tradeline.highCredit") ?? 0,
        pastDue: normalizeCreditReportAmount(tl.amounts.pastDue, "tradeline.amountPastDue") ?? 0,
      },
      remarkCodes: tl.remarkCodes.map((code) => code.trim().toUpperCase()),
    };
  });
}

function normalizeAccountType(type: string): string {
  const t = type.trim().toLowerCase();
  if (t.includes("revolving")) return "Revolving";
  if (t.includes("installment")) return "Installment";
  if (t.includes("mortgage")) return "Mortgage";
  if (t.includes("open")) return "Open";
  return type.trim(); // Fallback to original if no match
}
