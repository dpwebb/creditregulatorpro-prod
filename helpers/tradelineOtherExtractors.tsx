/**
 * Other extractors for tradeline parsing.
 * Handles interest rates, terms, payment patterns, and remark codes.
 */

/**
 * Extracts the interest rate if mentioned.
 */
export function extractInterestRate(text: string): number | null {
  const patterns = [
    // "Interest Rate: X.X%"
    /Interest\s+Rate[\s:]+(\d+(?:\.\d+)?)\s*%/i,
    // "Rate: X.XX%"
    /\bRate[\s:]+(\d+(?:\.\d+)?)\s*%/i,
    // "APR: X.X%"
    /\bAPR[\s:]+(\d+(?:\.\d+)?)\s*%/i,
    // Just a percentage that might be the rate
    /(\d+(?:\.\d+)?)\s*%/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const rate = parseFloat(match[1]);
      if (!isNaN(rate) && rate >= 0 && rate <= 100) {
        return rate;
      }
    }
  }

  return null;
}

/**
 * Extracts payment terms (e.g., "60 months").
 */
export function extractTerms(text: string): string | null {
  const patterns = [
    // "Terms: 60 months"
    /\bTerms[\s:]+([^\n]+)/i,
    // "Payment Terms: ..."
    /Payment\s+Terms[\s:]+([^\n]+)/i,
    // "Loan Term: ..."
    /Loan\s+Term[\s:]+([^\n]+)/i,
    // "X months" or "X-month"
    /(\d+\s*[-\s]?months?)/i,
    // "X years" or "X-year"
    /(\d+\s*[-\s]?years?)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const terms = match[1].trim();
      if (terms.length >= 2) {
        return terms;
      }
    }
  }

  return null;
}

/**
 * Extracts the payment pattern (history string like "111111111111").
 */
export function extractPaymentPattern(text: string): string | null {
  // Table-summary style often present in TransUnion disclosures:
  // header: "30 60 90 #M" with next row values like "1 1 21 32".
  const summaryPatterns = [
    /30\s+60\s+90\s+#M[\s\S]{0,120}?(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/i,
    /30\s*:?\s*(\d+)\s+60\s*:?\s*(\d+)\s+90\s*:?\s*(\d+)\s+#M\s*:?\s*(\d+)/i,
    /30\s*:\s*(\d+)[\s,;|]+60\s*:\s*(\d+)[\s,;|]+90\s*:\s*(\d+)[\s,;|]+#M\s*:\s*(\d+)/i,
  ];

  for (const pattern of summaryPatterns) {
    const match = text.match(pattern);
    if (!match) continue;

    const late30 = Number(match[1]);
    const late60 = Number(match[2]);
    const late90 = Number(match[3]);
    const months = Number(match[4]);

    if (
      Number.isFinite(late30) &&
      Number.isFinite(late60) &&
      Number.isFinite(late90) &&
      Number.isFinite(months) &&
      months >= 0 &&
      months <= 999 &&
      late30 <= months &&
      late60 <= months &&
      late90 <= months
    ) {
      return `30d:${late30} 60d:${late60} 90d:${late90} months:${months}`;
    }
  }

  const patterns = [
    // "Payment History: 111111111111"
    /Payment\s+History[\s:]+([0-9CNOX]{12,})/i,
    // "Payment Pattern: 111111111111"
    /Payment\s+Pattern[\s:]+([0-9CNOX]{12,})/i,
    // "History: 111111111111"
    /\bHistory[\s:]+([0-9CNOX]{12,})/i,
    // Standalone pattern of 12+ payment codes
    /\b([0-9CNOX]{12,})\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const paymentPattern = match[1].trim();
      // Validate it looks like a payment pattern (mostly digits/codes)
      if (/^[0-9CNOX]+$/.test(paymentPattern) && paymentPattern.length >= 12) {
        return paymentPattern;
      }
    }
  }

  // Handle multi-line payment patterns (e.g., "24-Month Payment History:" with two rows)
  const multiLineMatch = text.match(/(?:Payment\s+History|Payment\s+Pattern)[\s:]+\n?\s*([0-9CNOX\s]+)/i);
  if (multiLineMatch) {
    // Remove all whitespace and concatenate
    const concatenated = multiLineMatch[1].replace(/\s+/g, '');
    if (/^[0-9CNOX]+$/.test(concatenated) && concatenated.length >= 12) {
      return concatenated;
    }
  }

  return null;
}

/**
 * Extracts remark codes from a tradeline section.
 */
export function extractRemarkCodes(text: string): string[] {
  const codes: string[] = [];

  const addCode = (value: string | null | undefined) => {
    const normalized = (value || "").trim();
    if (normalized) codes.push(normalized);
  };

  const addDelimitedLine = (value: string, splitWhitespaceCodes = false) => {
    const commaParts = value.split(/\s*,\s*/).map((part) => part.trim()).filter(Boolean);
    for (const part of commaParts) {
      if (splitWhitespaceCodes && /^[A-Z]{2}\d{2}(?:\s+[A-Z]{2}\d{2})+$/i.test(part)) {
        part.split(/\s+/).forEach(addCode);
      } else {
        addCode(part);
      }
    }
  };

  // TransUnion consumer disclosures use "Legend:" to define the narrative/remark code
  // attached to the payment-history row, e.g. "Legend:AC-Account closed/rating non derogatory".
  const legendMatch = text.match(/(?:^|\n)\s*Legend\s*:?\s*([^\r\n]+)/i);
  if (legendMatch?.[1]) addDelimitedLine(legendMatch[1]);

  // "Remarks: AC01, CN02" or "Remark Codes: AC01 CN02".
  const remarksMatch = text.match(/Remark(?:\s+Code)?s?\s*:?\s*([^\r\n]+)/i);
  if (remarksMatch?.[1]) addDelimitedLine(remarksMatch[1], true);

  // Common remark code format (2 letters + 2 digits).
  for (const match of text.matchAll(/\b([A-Z]{2}\d{2})\b/g)) {
    addCode(match[1]);
  }

  return [...new Set(codes)]; // Remove duplicates
}
