/**
 * Amount extractors for tradeline parsing.
 * Handles balances, credit limits, payments, and other monetary values.
 *
 * Async exports are retained for backward compatibility, but they delegate to
 * deterministic extractors only. Gemini/LLM enrichment is disabled for
 * authoritative credit ingestion.
 */

import {
  extractLatestTransUnionPaymentGridBalance,
  extractTransUnionPaymentGridRows,
} from "./transunionTextParsing";

/**
 * Extracts the current balance from a tradeline section (sync, regex-based).
 */
export function extractBalance(text: string): number {
  const patterns = [
    // "Balance: $1,234.56" or "Current Balance: 1234.56"
    /(?:Current\s+)?Balance[\s:]+\$?\s*([\d,]+(?:\.\d{2})?)/i,
    // "Balance Owed: $1,234"
    /Balance\s+Owed[\s:]+\$?\s*([\d,]+(?:\.\d{2})?)/i,
    // Just a balance line
    /^Balance[\s:]+\$?\s*([\d,]+(?:\.\d{2})?)/im,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const amount = parseFloat(match[1].replace(/,/g, ""));
      if (!isNaN(amount)) {
        return amount;
      }
    }
  }

  const transUnionGridBalance = extractLatestTransUnionPaymentGridBalance(text);
  return transUnionGridBalance ?? 0;
}

/**
 * Extracts the current balance from a tradeline section through the deterministic path.
 */
export async function extractBalanceAsync(text: string): Promise<number> {
  return extractBalance(text);
}

/**
 * Extracts amounts (high credit, past due, etc.) from a tradeline section (sync, regex-based).
 */
export function extractAmounts(text: string): {
  high?: number;
  pastDue?: number;
} {
  const amounts: {
    high?: number;
    pastDue?: number;
  } = {
    high: undefined,
    pastDue: undefined,
  };

  // High credit/limit patterns
  const highPatterns = [
    /(?:High\s+(?:Credit|Balance))[\s:]+\$?\s*([\d,]+(?:\.\d{2})?)/i,
    /Credit\s+Limit[\s:]+\$?\s*([\d,]+(?:\.\d{2})?)/i,
    /(?:Original\s+)?Loan\s+Amount[\s:]+\$?\s*([\d,]+(?:\.\d{2})?)/i,
    /Limit[\s:]+\$?\s*([\d,]+(?:\.\d{2})?)/i,
  ];

  for (const pattern of highPatterns) {
    const match = text.match(pattern);
    if (match) {
      const amount = parseFloat(match[1].replace(/,/g, ""));
      if (!isNaN(amount)) {
        amounts.high = amount;
        break;
      }
    }
  }

  // Past due patterns
  const pastDuePatterns = [
    /(?:Amount\s+)?Past\s+Due[\s:]+\$?\s*([\d,]+(?:\.\d{2})?)/i,
    /Past\s+Due\s+Amount[\s:]+\$?\s*([\d,]+(?:\.\d{2})?)/i,
  ];

  for (const pattern of pastDuePatterns) {
    const match = text.match(pattern);
    if (match) {
      const amount = parseFloat(match[1].replace(/,/g, ""));
      if (!isNaN(amount)) {
        amounts.pastDue = amount;
        break;
      }
    }
  }

  const latestTransUnionGridRow = extractTransUnionPaymentGridRows(text)[0];
  if (latestTransUnionGridRow?.pastDue !== null && latestTransUnionGridRow?.pastDue !== undefined) {
    amounts.pastDue = latestTransUnionGridRow.pastDue;
  }

  return amounts;
}

/**
 * Extracts amounts (high credit, past due, etc.) through the deterministic path.
 */
export async function extractAmountsAsync(text: string): Promise<{
  high?: number;
  pastDue?: number;
}> {
  return extractAmounts(text);
}

/**
 * Extracts the credit limit (sync, regex-based).
 */
export function extractCreditLimit(text: string): number | null {
  const patterns = [
    // "Credit Limit: $20,000"
    /Credit\s+Limit[\s:]+\$?\s*([\d,]+(?:\.\d{2})?)/i,
    // "Limit: $12,000"
    /\bLimit[\s:]+\$?\s*([\d,]+(?:\.\d{2})?)/i,
    // "Available Credit: $X" (if no limit found, this might indicate limit)
    /Available\s+Credit[\s:]+\$?\s*([\d,]+(?:\.\d{2})?)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const amount = parseFloat(match[1].replace(/,/g, ""));
      if (!isNaN(amount) && amount > 0) {
        return amount;
      }
    }
  }

  return null;
}

/**
 * Extracts the Manner of Payment (MOP) code.
 */
export async function extractMopAsync(text: string): Promise<string | undefined> {
  void text;
  return undefined;
}

/**
 * Extracts the credit limit through the deterministic path.
 */
export async function extractCreditLimitAsync(text: string): Promise<number | null> {
  return extractCreditLimit(text);
}

/**
 * Extracts the original balance/principal before collection.
 */
export function extractOriginalBalance(text: string): number | null {
  const patterns = [
    // "Original Amount: $X,XXX"
    /Original\s+Amount[\s:]+\$?\s*([\d,]+(?:\.\d{2})?)/i,
    // "Original Balance: $X,XXX"
    /Original\s+Balance[\s:]+\$?\s*([\d,]+(?:\.\d{2})?)/i,
    // "Principal: $X,XXX"
    /\bPrincipal[\s:]+\$?\s*([\d,]+(?:\.\d{2})?)/i,
    // "Original Debt: $X,XXX"
    /Original\s+Debt[\s:]+\$?\s*([\d,]+(?:\.\d{2})?)/i,
    // "Original Loan Amount: $X,XXX"
    /Original\s+Loan\s+Amount[\s:]+\$?\s*([\d,]+(?:\.\d{2})?)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const amount = parseFloat(match[1].replace(/,/g, ""));
      if (!isNaN(amount)) {
        return amount;
      }
    }
  }

  return null;
}

/**
 * Extracts monthly payment amount.
 */
export function extractMonthlyPayment(text: string): number | null {
  const patterns = [
    // "Monthly Payment: $XXX"
    /Monthly\s+Payment[\s:]+\$?\s*([\d,]+(?:\.\d{2})?)/i,
    // "Payment Amount: $XXX"
    /Payment\s+Amount[\s:]+\$?\s*([\d,]+(?:\.\d{2})?)/i,
    // "Min Payment: $XXX"
    /Min(?:imum)?\s+Payment[\s:]+\$?\s*([\d,]+(?:\.\d{2})?)/i,
    // "Payment: $XXX"
    /\bPayment[\s:]+\$?\s*([\d,]+(?:\.\d{2})?)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const amount = parseFloat(match[1].replace(/,/g, ""));
      if (!isNaN(amount) && amount > 0) {
        return amount;
      }
    }
  }

  return null;
}

/**
 * Extracts the last payment amount.
 */
export function extractLastPaymentAmount(text: string): number | null {
  const patterns = [
    // "Last Payment: 2025-12-15 ($275)" - extract amount in parentheses
    /Last\s+Payment[\s:]+\d{4}[-/]\d{2}[-/]\d{2}\s+\(\$?\s*([\d,]+(?:\.\d{2})?)\)/i,
    // "Last Payment Amount: $275"
    /Last\s+Payment\s+Amount[\s:]+\$?\s*([\d,]+(?:\.\d{2})?)/i,
    // "Recent Payment: $275"
    /Recent\s+Payment[\s:]+\$?\s*([\d,]+(?:\.\d{2})?)/i,
    // "Last Payment: $275"
    /Last\s+Payment[\s:]+\$?\s*([\d,]+(?:\.\d{2})?)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const amount = parseFloat(match[1].replace(/,/g, ""));
      if (!isNaN(amount) && amount >= 0) {
        return amount;
      }
    }
  }

  return null;
}
