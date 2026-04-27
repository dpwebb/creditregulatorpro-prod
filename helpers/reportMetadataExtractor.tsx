import { parse } from "./dateUtils";

export type ExtractedReportMetadata = {
  // Report Identification
  reportDate: Date | null;
  reportNumber: string | null;
  fileNumber: string | null;
  bureauFileId: string | null;

  // Bureau Information
  bureauName: string | null;
  bureauPhone: string | null;
  bureauAddress: string | null;

  // Report Summary/Statistics
  totalAccounts: number | null;
  openAccounts: number | null;
  closedAccounts: number | null;
  delinquentAccounts: number | null;
  derogatoryAccounts: number | null;
  totalBalances: number | null;
  totalCreditLimit: number | null;
  utilizationPercent: number | null;

  // Alerts and Flags
  fraudAlertActive: boolean;
  securityFreezeActive: boolean;
  activeDisputePresent: boolean;
  militaryLendingActCovered: boolean;

  // File Age
  oldestAccountDate: Date | null;
  newestAccountDate: Date | null;
  averageAccountAge: string | null; // e.g., "5 years 3 months"

  // Raw text for audit
  rawHeaderText: string | null;
  confidence: number;
};

/**
 * Helper to parse various date formats found in credit reports
 */
function parseReportDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const cleanStr = dateStr.trim();

  // Try common formats
  const formats = [
    "MM/dd/yyyy",
    "dd/MM/yyyy",
    "yyyy-MM-dd",
    "MMM dd, yyyy",
    "MMMM dd, yyyy",
    "dd MMM yyyy",
  ];

  for (const fmt of formats) {
    try {
      const date = parse(cleanStr, fmt, new Date());
      if (!isNaN(date.getTime())) return date;
    } catch (e) {
      // continue
    }
  }

  // Fallback to native parser
  const nativeDate = new Date(cleanStr);
  if (!isNaN(nativeDate.getTime())) return nativeDate;

  return null;
}

/**
 * Helper to extract currency or number values
 */
function parseNumericValue(val: string): number | null {
  if (!val) return null;
  // Remove currency symbols, commas, and whitespace
  const cleanVal = val.replace(/[$,\s]/g, "");
  const num = parseFloat(cleanVal);
  return isNaN(num) ? null : num;
}

/**
 * Extracts metadata from the header section of a credit report.
 * Focuses on the first 3000 characters to capture header info.
 */
export function extractReportMetadata(text: string): ExtractedReportMetadata {
  // Initialize default result
  const result: ExtractedReportMetadata = {
    reportDate: null,
    reportNumber: null,
    fileNumber: null,
    bureauFileId: null,
    bureauName: null,
    bureauPhone: null,
    bureauAddress: null,
    totalAccounts: null,
    openAccounts: null,
    closedAccounts: null,
    delinquentAccounts: null,
    derogatoryAccounts: null,
    totalBalances: null,
    totalCreditLimit: null,
    utilizationPercent: null,
    fraudAlertActive: false,
    securityFreezeActive: false,
    activeDisputePresent: false,
    militaryLendingActCovered: false,
    oldestAccountDate: null,
    newestAccountDate: null,
    averageAccountAge: null,
    rawHeaderText: null,
    confidence: 0,
  };

  if (!text) return result;

  // Limit processing to the header section (approx first 3000 chars)
  // This avoids false positives from tradeline data later in the file
  const headerText = text.substring(0, 3000);
  result.rawHeaderText = headerText;

  const lines = headerText.split("\n").map((l) => l.trim());

  // --- 1. Report Identification ---

  // Report Date
  const datePatterns = [
    /(?:Report Date|Date of Report|Date Generated|Created|As of)\s*[:.]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|[A-Za-z]+\s+\d{1,2},?\s*\d{4})/i,
    /Date:\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
  ];

  for (const pattern of datePatterns) {
    const match = headerText.match(pattern);
    if (match && match[1]) {
      result.reportDate = parseReportDate(match[1]);
      if (result.reportDate) break;
    }
  }

  // File/Report Numbers
  const fileNumPattern =
    /(?:File|Report|Reference)\s*(?:#|Number|No\.?)\s*[:.]?\s*([A-Za-z0-9-]+)/i;
  const matchFileNum = headerText.match(fileNumPattern);
  if (matchFileNum && matchFileNum[1]) {
    result.fileNumber = matchFileNum[1];
    // Often report number and file number are used interchangeably in headers
    result.reportNumber = matchFileNum[1];
  }

  // --- 2. Bureau Information ---

  if (
    /Equifax/i.test(headerText) ||
    /EQUIFAX CANADA/i.test(headerText) ||
    /1-800-465-7166/.test(headerText)
  ) {
    result.bureauName = "Equifax Canada";
    result.bureauPhone = "1-800-465-7166";
    result.bureauAddress = "Box 190 Jean Talon Station, Montreal, QC, H1S 2Z2";
  } else if (
    /TransUnion/i.test(headerText) ||
    /TRANSUNION CANADA/i.test(headerText) ||
    /1-800-663-9980/.test(headerText)
  ) {
    result.bureauName = "TransUnion Canada";
    result.bureauPhone = "1-800-663-9980";
    result.bureauAddress = "Box 338, LCD 1, Hamilton, ON, L8L 7W2";
  }

  // --- 3. Summary Statistics ---

  // Helper to find value after a label in the text
  const extractStat = (regex: RegExp): number | null => {
    const match = headerText.match(regex);
    return match && match[1] ? parseNumericValue(match[1]) : null;
  };

  result.totalAccounts = extractStat(
    /(?:Total|Number of)\s*Accounts\s*[:.]?\s*(\d+)/i
  );
  result.openAccounts = extractStat(/Open\s*Accounts\s*[:.]?\s*(\d+)/i);
  result.closedAccounts = extractStat(/Closed\s*Accounts\s*[:.]?\s*(\d+)/i);
  result.delinquentAccounts = extractStat(
    /(?:Delinquent|Past Due)\s*Accounts\s*[:.]?\s*(\d+)/i
  );
  result.derogatoryAccounts = extractStat(
    /(?:Derogatory|Negative)\s*Accounts\s*[:.]?\s*(\d+)/i
  );

  result.totalBalances = extractStat(
    /(?:Total|Aggregate)\s*Balance[s]?\s*[:.]?\s*[\$]?([\d,.]+)/i
  );
  result.totalCreditLimit = extractStat(
    /(?:Total|Aggregate)\s*(?:Credit|Limit)[s]?\s*[:.]?\s*[\$]?([\d,.]+)/i
  );

  // Utilization might be explicitly stated
  const utilMatch = headerText.match(
    /(?:Utilization|Usage)\s*[:.]?\s*(\d+(?:\.\d+)?)%/i
  );
  if (utilMatch && utilMatch[1]) {
    result.utilizationPercent = parseFloat(utilMatch[1]);
  } else if (
    result.totalBalances !== null &&
    result.totalCreditLimit !== null &&
    result.totalCreditLimit > 0
  ) {
    // Calculate if not found but components exist
    result.utilizationPercent = Math.round(
      (result.totalBalances / result.totalCreditLimit) * 100
    );
  }

  // --- 4. Alerts and Flags ---

  const upperHeader = headerText.toUpperCase();
  result.fraudAlertActive =
    upperHeader.includes("FRAUD ALERT") ||
    upperHeader.includes("IDENTITY SCAN ALERT");
  result.securityFreezeActive =
    upperHeader.includes("SECURITY FREEZE") ||
    upperHeader.includes("CREDIT LOCK");
  result.activeDisputePresent =
    upperHeader.includes("ACTIVE DISPUTE") ||
    upperHeader.includes("CONSUMER STATEMENT") ||
    upperHeader.includes("NOTICE OF DISPUTE");
  result.militaryLendingActCovered =
    upperHeader.includes("MILITARY LENDING ACT") ||
    upperHeader.includes("MLA COVERED");

  // --- 5. File Age (Summary Section) ---

  // Sometimes these are listed in a summary box
  const oldestMatch = headerText.match(
    /Oldest\s*Account\s*[:.]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i
  );
  if (oldestMatch && oldestMatch[1]) {
    result.oldestAccountDate = parseReportDate(oldestMatch[1]);
  }

  const newestMatch = headerText.match(
    /Newest\s*Account\s*[:.]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i
  );
  if (newestMatch && newestMatch[1]) {
    result.newestAccountDate = parseReportDate(newestMatch[1]);
  }

  const avgAgeMatch = headerText.match(
    /Average\s*(?:Account)?\s*Age\s*[:.]?\s*(\d+\s*Years?(?:\s*\d+\s*Months?)?)/i
  );
  if (avgAgeMatch && avgAgeMatch[1]) {
    result.averageAccountAge = avgAgeMatch[1];
  }

  // --- 6. Confidence Calculation ---

  let score = 0;
  if (result.reportDate) score += 20;
  if (result.fileNumber || result.reportNumber) score += 20;
  if (result.bureauName) score += 20;
  if (result.totalAccounts !== null) score += 10;
  if (result.totalBalances !== null) score += 10;
  if (result.fraudAlertActive || result.securityFreezeActive) score += 10; // Bonus for detecting alerts
  if (score > 100) score = 100;

  result.confidence = score;

  return result;
}