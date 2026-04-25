import { ParsedTradeline } from "./reportParser";

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
      balance: Math.max(0, tl.balance || 0),
      amounts: {
        ...tl.amounts,
        high: Math.max(0, tl.amounts.high || 0),
        pastDue: Math.max(0, tl.amounts.pastDue || 0),
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