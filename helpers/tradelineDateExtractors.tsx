/**
 * Date extractors for tradeline parsing.
 * Handles various date fields using the parseDate helper.
 */

import { parseDate } from './tradelineDateParser';

/**
 * Extracts the date when the account was assigned to collection.
 */
export function extractDateAssignedToCollection(text: string): Date | null {
  const patterns = [
    // "Date Assigned: MM/DD/YYYY"
    /Date\s+Assigned[\s:]+([^\n]+)/i,
    // "Assigned to Collection: YYYY-MM-DD"
    /Assigned\s+to\s+Collection[\s:]+([^\n]+)/i,
    // "Collection Date: ..."
    /Collection\s+Date[\s:]+([^\n]+)/i,
    // "Placed for Collection: ..."
    /Placed\s+for\s+Collection[\s:]+([^\n]+)/i,
    // "Transfer Date: ..."
    /Transfer\s+Date[\s:]+([^\n]+)/i,
    // "Assigned Date: ..."
    /Assigned\s+Date[\s:]+([^\n]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const dateStr = match[1].trim();
      const parsed = parseDate(dateStr);
      if (parsed) {
        return parsed;
      }
    }
  }

  return null;
}

/**
 * Extracts last activity date.
 */
export function extractLastActivityDate(text: string): Date | null {
  const patterns = [
    // TransUnion concatenated format: "Last Activity DateOct 03, 2013"
    /Last\s+Activity\s+Date([A-Z][a-z]{2}\s+\d{1,2},?\s+\d{4})/i,
    // "Last Activity: MM/DD/YYYY"
    /Last\s+Activity[\s:]+([^\n]+)/i,
    // "Last Activity Date: ..."
    /Last\s+Activity\s+Date[\s:]+([^\n]+)/i,
    // "Date of Last Activity: ..."
    /Date\s+of\s+Last\s+Activity[\s:]+([^\n]+)/i,
    // "Last Transaction: ..."
    /Last\s+Transaction[\s:]+([^\n]+)/i,
    // "Last Transaction Date: ..."
    /Last\s+Transaction\s+Date[\s:]+([^\n]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const dateStr = match[1].trim();
      const parsed = parseDate(dateStr);
      if (parsed) {
        return parsed;
      }
    }
  }

  return null;
}

/**
 * Extracts the last payment date.
 */
export function extractLastPaymentDate(text: string): Date | null {
  const patterns = [
    // TransUnion concatenated format: "Last Payment DateOct 03, 2013"
    /Last\s+Payment\s+Date([A-Z][a-z]{2}\s+\d{1,2},?\s+\d{4})/i,
    /Last\s+Payment([A-Z][a-z]{2}\s+\d{1,2},?\s+\d{4})/i,
    // "Last Payment: 2025-12-15 ($275)" - extract date part
    /Last\s+Payment[\s:]+(\d{4}[-/]\d{2}[-/]\d{2})/i,
    // "Last Payment Date: 2025-12-15"
    /Last\s+Payment\s+Date[\s:]+([^\n]+)/i,
    // "Date of Last Payment: ..."
    /Date\s+of\s+Last\s+Payment[\s:]+([^\n]+)/i,
    // "Last Paid: ..."
    /Last\s+Paid[\s:]+([^\n]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const dateStr = match[1].trim();
      const parsed = parseDate(dateStr);
      if (parsed) {
        return parsed;
      }
    }
  }

  return null;
}

/**
 * Extracts the maturity date (for loans/mortgages).
 */
export function extractMaturityDate(text: string): Date | null {
  const patterns = [
    // "Maturity Date: 2026-04-30"
    /Maturity\s+Date[\s:]+([^\n]+)/i,
    // "Maturity: Apr 2026"
    /Maturity[\s:]+([^\n]+)/i,
    // "Matures: 2026-04-30"
    /Matures[\s:]+([^\n]+)/i,
    // "Loan Maturity: ..."
    /Loan\s+Maturity[\s:]+([^\n]+)/i,
    // "Term End: ..."
    /Term\s+End[\s:]+([^\n]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let dateStr = match[1].trim();
      
      // Handle partial dates like "2026-04" (year-month only)
      if (/^\d{4}[-/]\d{1,2}$/.test(dateStr)) {
        dateStr = dateStr + '-01'; // Assume first of month
      }
      
      const parsed = parseDate(dateStr);
      if (parsed) {
        return parsed;
      }
    }
  }

  return null;
}

/**
 * Extracts posted/date reported by furnisher (distinct from report date).
 */
export function extractPostedDate(text: string): Date | null {
  const patterns = [
    // TransUnion concatenated format: "Posted DateDec 18, 2025"
    /Posted\s*Date([A-Z][a-z]{2}\s+\d{1,2},?\s+\d{4})/i,
    /Posted\s+Date[\s:]+([^\n]+)/i,
    /Date\s+Posted[\s:]+([^\n]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const parsed = parseDate(match[1].trim());
    if (parsed) return parsed;
  }

  return null;
}

/**
 * Extracts charge-off/write-off date.
 */
export function extractChargeOffDate(text: string): Date | null {
  const patterns = [
    // TransUnion concatenated format: "Charge Off DateJan 10, 2024"
    /Charge\s*Off\s*Date([A-Z][a-z]{2}\s+\d{1,2},?\s+\d{4})/i,
    /Charge\s*[- ]?Off(?:\s+Date)?[\s:]+([^\n]+)/i,
    /Write\s*[- ]?Off(?:\s+Date)?[\s:]+([^\n]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const parsed = parseDate(match[1].trim());
    if (parsed) return parsed;
  }

  return null;
}

/**
 * Extracts balloon payment date when present.
 */
export function extractBalloonPaymentDate(text: string): Date | null {
  const patterns = [
    /Balloon\s+Payment(?:\s+Date)?[\s:]+([^\n]+)/i,
    /Balloon\s+Date[\s:]+([^\n]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const parsed = parseDate(match[1].trim());
    if (parsed) return parsed;
  }

  return null;
}
