/**
 * Legacy Gemini table parser compatibility shim.
 *
 * Authoritative credit ingestion is deterministic-only. This module is retained
 * so old imports fail closed without making network calls or producing canonical
 * values.
 */

export interface ParsedPaymentGridRow {
  date?: string;
  balance?: number;
  payment?: number;
  pastDue?: number;
  mop?: string;
  terms?: string;
  highCredit?: number;
  creditLimit?: number;
}

export async function parsePaymentGridWithGemini(
  tradelineText: string,
): Promise<ParsedPaymentGridRow | null> {
  void tradelineText;
  return null;
}
