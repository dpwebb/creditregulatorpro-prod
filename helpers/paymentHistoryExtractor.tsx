import { ResponsibilityCode, EcoaCode } from "./schema";

export type ExtractedPaymentHistory = {
  paymentPattern: string | null;
  responsibilityCode: ResponsibilityCode | null;
  ecoaCode: EcoaCode | null;
  complianceConditionCode: string | null;
  specialCommentCodes: string[];
  times30DaysLate: number | null;
  times60DaysLate: number | null;
  times90DaysLate: number | null;
  times120DaysLate: number | null;
  worstDelinquencyCode: string | null;
  worstDelinquencyDate: Date | null;
  accountCondition: string | null;
  monthlyPayment: number | null;
  lastPaymentAmount: number | null;
  lastActivityDate: Date | null;
  lastReportedDate: Date | null;
  lastPaymentDate: Date | null;
  rawSectionText: string;
  confidence: number; // 0-100
};

/**
 * Extracts detailed payment history and status codes from a tradeline section.
 */
export function extractPaymentHistory(tradelineText: string): ExtractedPaymentHistory {
  const result: ExtractedPaymentHistory = {
    paymentPattern: null,
    responsibilityCode: null,
    ecoaCode: null,
    complianceConditionCode: null,
    specialCommentCodes: [],
    times30DaysLate: null,
    times60DaysLate: null,
    times90DaysLate: null,
    times120DaysLate: null,
    worstDelinquencyCode: null,
    worstDelinquencyDate: null,
    accountCondition: null,
    monthlyPayment: null,
    lastPaymentAmount: null,
    lastActivityDate: null,
    lastReportedDate: null,
    lastPaymentDate: null,
    rawSectionText: tradelineText,
    confidence: 0,
  };

  // 1. Extract Payment Pattern
  // Look for long strings of digits/chars that look like payment history
  // e.g. "111111111111" or "C11111111111" or "OK OK OK 30 60"
  // Common formats: 24 months, 36 months, etc.
  
  // First try explicit labeled patterns
  const labeledPatterns = [
    /Payment\s+History[\s:]+([0-9CNOX]{12,})/i,
    /Payment\s+Pattern[\s:]+([0-9CNOX]{12,})/i,
    /\d+-Month\s+Payment\s+History[\s:]+([0-9CNOX\s\n]+)/i,
  ];

  for (const pattern of labeledPatterns) {
    const match = tradelineText.match(pattern);
    if (match) {
      // Remove all whitespace/newlines and concatenate
      const cleaned = match[1].replace(/[\s\n]+/g, '');
      if (/^[0-9CNOX]+$/.test(cleaned) && cleaned.length >= 12) {
        result.paymentPattern = cleaned;
        result.confidence += 20;
        break;
      }
    }
  }

  // If no labeled pattern found, try standalone pattern
  if (!result.paymentPattern) {
    const patternMatch = tradelineText.match(/\b([0-9CNOX]{12,})\b/);
    if (patternMatch) {
      result.paymentPattern = patternMatch[1];
      result.confidence += 15; // Lower confidence for unlabeled
    }
  }

  // 2. Extract Responsibility / ECOA
  // First try explicit labels
  const responsibilityPatterns = [
    { pattern: /Responsibility[\s:]+Individual/i, code: "individual" as ResponsibilityCode, ecoa: "I" as EcoaCode },
    { pattern: /Responsibility[\s:]+Joint/i, code: "joint" as ResponsibilityCode, ecoa: "J" as EcoaCode },
    { pattern: /Responsibility[\s:]+Authorized\s+User/i, code: "authorized_user" as ResponsibilityCode, ecoa: "A" as EcoaCode },
    { pattern: /Responsibility[\s:]+Co-?signer/i, code: "cosigner" as ResponsibilityCode, ecoa: "C" as EcoaCode },
    { pattern: /Account\s+Holder[\s:]+Individual/i, code: "individual" as ResponsibilityCode, ecoa: "I" as EcoaCode },
    { pattern: /Account\s+Holder[\s:]+Joint/i, code: "joint" as ResponsibilityCode, ecoa: "J" as EcoaCode },
  ];

  let responsibilityFound = false;
  for (const { pattern, code, ecoa } of responsibilityPatterns) {
    if (pattern.test(tradelineText)) {
      result.responsibilityCode = code;
      result.ecoaCode = ecoa;
      responsibilityFound = true;
      break;
    }
  }

  // Fallback to keyword search if explicit label not found
  if (!responsibilityFound) {
    if (/Joint/i.test(tradelineText)) {
      result.responsibilityCode = "joint";
      result.ecoaCode = "J";
    } else if (/Individual/i.test(tradelineText)) {
      result.responsibilityCode = "individual";
      result.ecoaCode = "I";
    } else if (/Authorized User/i.test(tradelineText)) {
      result.responsibilityCode = "authorized_user";
      result.ecoaCode = "A";
    } else if (/Co-?signer/i.test(tradelineText)) {
      result.responsibilityCode = "cosigner";
      result.ecoaCode = "C";
    }
  }

  // Check for explicit ECOA code
  const ecoaMatch = tradelineText.match(/ECOA[\s:]+([IJACSTBXZ])\b/i);
  if (ecoaMatch) {
    result.ecoaCode = ecoaMatch[1].toUpperCase() as EcoaCode;
  }

  // 3. Extract Delinquency Counts
  // Patterns like "30 Days: 0", "60 Days: 1", "Times 30 Days Late: 0"
  const extractCount = (regex: RegExp): number | null => {
    const match = tradelineText.match(regex);
    return match ? parseInt(match[1], 10) : null;
  };

  result.times30DaysLate = extractCount(/(?:30\s*Days|Times\s*30|Late\s*30)[\D]*(\d+)/i);
  result.times60DaysLate = extractCount(/(?:60\s*Days|Times\s*60|Late\s*60)[\D]*(\d+)/i);
  result.times90DaysLate = extractCount(/(?:90\s*Days|Times\s*90|Late\s*90)[\D]*(\d+)/i);
  
  // 120+ is sometimes labeled differently
  result.times120DaysLate = extractCount(/(?:120\+?\s*Days|Times\s*120|Late\s*120)[\D]*(\d+)/i);

  // 4. Extract Amounts
  const extractAmount = (regex: RegExp): number | null => {
    const match = tradelineText.match(regex);
    if (match) {
      const val = parseFloat(match[1].replace(/,/g, ""));
      return isNaN(val) ? null : val;
    }
    return null;
  };

  result.monthlyPayment = extractAmount(/(?:Monthly|Scheduled)\s+Payment:?\s*\$?([\d,]+(?:\.\d{2})?)/i);
  
  // Try to extract last payment amount from combined format "Last Payment: 2025-12-15 ($275)"
  const combinedPaymentMatch = tradelineText.match(/Last\s+Payment[\s:]+\d{4}[-/]\d{2}[-/]\d{2}\s+\(\$?\s*([\d,]+(?:\.\d{2})?)\)/i);
  if (combinedPaymentMatch) {
    const amount = parseFloat(combinedPaymentMatch[1].replace(/,/g, ""));
    if (!isNaN(amount)) {
      result.lastPaymentAmount = amount;
    }
  } else {
    // Fallback to standard patterns
    result.lastPaymentAmount = extractAmount(/(?:Last|Recent)\s+Payment(?:\s+Amount)?:?\s*\$?([\d,]+(?:\.\d{2})?)/i);
  }

  // 5. Extract Dates
  const parseDate = (str: string): Date | null => {
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  };

  const extractDate = (regex: RegExp): Date | null => {
    const match = tradelineText.match(regex);
    return match ? parseDate(match[1]) : null;
  };

  result.lastActivityDate = extractDate(/(?:Last\s+Activity|DLA|Date\s+of\s+Last\s+Activity)\s*(?:Date)?\s*:?\s*(\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4}|[A-Za-z]{3}\s+\d{1,2},?\s+\d{4})/i);
  result.lastReportedDate = extractDate(/(?:Reported|Date\s+Reported|Reported\s+Date)\s*:?\s*(\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4}|[A-Za-z]{3}\s+\d{1,2},?\s+\d{4})/i);
  
  // Try to extract last payment date from combined format "Last Payment: 2025-12-15 ($275)"
  const combinedDateMatch = tradelineText.match(/Last\s+Payment(?:\s+Date)?\s*:?\s*(\d{4}[-/]\d{2}[-/]\d{2}|[A-Za-z]{3}\s+\d{1,2},?\s+\d{4})/i);
  if (combinedDateMatch) {
    result.lastPaymentDate = parseDate(combinedDateMatch[1]);
  } else {
    // Fallback to standard patterns
    result.lastPaymentDate = extractDate(/(?:Last\s+Payment\s+Date):?\s*(\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4}|[A-Za-z]{3}\s+\d{1,2},?\s+\d{4})/i);
  }

  // 6. Extract Account Condition / Status
  // e.g. "Open", "Closed", "Paid", "Derogatory"
  const conditionMatch = tradelineText.match(/(?:Account\s+)?Condition:?\s*([A-Za-z\s]+)(?:\n|$)/i);
  if (conditionMatch) {
    result.accountCondition = conditionMatch[1].trim();
  }

  // 7. Worst Delinquency
  // e.g. "Worst Delinquency: 90 Days"
  const worstMatch = tradelineText.match(/Worst\s+Delinquency:?\s*([^\n]+)/i);
  if (worstMatch) {
    result.worstDelinquencyCode = worstMatch[1].trim();
  }

  // Calculate confidence based on how much we found
  let fieldsFound = 0;
  if (result.paymentPattern) fieldsFound++;
  if (result.responsibilityCode) fieldsFound++;
  if (result.times30DaysLate !== null) fieldsFound++;
  if (result.monthlyPayment !== null) fieldsFound++;
  if (result.lastActivityDate) fieldsFound++;

  result.confidence = Math.min(100, fieldsFound * 20);

  return result;
}
