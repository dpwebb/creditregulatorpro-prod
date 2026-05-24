/**
 * Basic info extractors for tradeline parsing.
 * Handles account numbers, creditor names, collection accounts, etc.
 */

/**
 * Extracts fields from label-value block format (used in Credit Monitoring PDFs).
 * Handles both inline format (Label: Value | Label2: Value2) and multi-line format.
 * 
 * @param text The text to parse for label-value pairs
 * @returns Object containing extracted fields
 */
export function extractFromLabelValueBlock(text: string): {
  accountName?: string;
  accountNumber?: string;
  balance?: number;
  status?: string;
  creditLimit?: number;
  paymentStatus?: string;
} {
  const result: {
    accountName?: string;
    accountNumber?: string;
    balance?: number;
    status?: string;
    creditLimit?: number;
    paymentStatus?: string;
  } = {};

  // Pattern for inline format: "Label: Value | Label2: Value2"
  const inlinePatterns = [
    { label: 'Account Name', field: 'accountName' as const, pattern: /Account\s+Name[\s:]+([^|\n]+?)(?:\s*\||$|\n)/i },
    { label: 'Account Number', field: 'accountNumber' as const, pattern: /Account\s+Number[\s:]+([^|\n]+?)(?:\s*\||$|\n)/i },
    { label: 'Balance', field: 'balance' as const, pattern: /Balance[\s:]+\$?\s*([\d,]+(?:\.\d{2})?)(?:\s*\||$|\n)/i, isNumber: true },
    { label: 'Status', field: 'status' as const, pattern: /Status[\s:]+([^|\n]+?)(?:\s*\||$|\n)/i },
    { label: 'Credit Limit', field: 'creditLimit' as const, pattern: /Credit\s+Limit[\s:]+\$?\s*([\d,]+(?:\.\d{2})?)(?:\s*\||$|\n)/i, isNumber: true },
    { label: 'Payment Status', field: 'paymentStatus' as const, pattern: /Payment\s+Status[\s:]+([^|\n]+?)(?:\s*\||$|\n)/i },
  ];

  for (const { field, pattern, isNumber } of inlinePatterns) {
    const match = text.match(pattern);
    if (match) {
      const value = match[1].trim();
      if (isNumber) {
        const numValue = parseFloat(value.replace(/,/g, ""));
        if (!isNaN(numValue)) {
          (result as any)[field] = numValue;
        }
      } else {
        (result as any)[field] = value;
      }
    }
  }

  // Pattern for multi-line format: "Label" on one line, "Value" on next line
  const multiLinePatterns = [
    { label: 'Account Name', field: 'accountName' as const, pattern: /Account\s+Name\s*\n\s*([^\n]+)/i },
    { label: 'Account Number', field: 'accountNumber' as const, pattern: /Account\s+Number\s*\n\s*([^\n]+)/i },
    { label: 'Balance', field: 'balance' as const, pattern: /Balance\s*\n\s*\$?\s*([\d,]+(?:\.\d{2})?)/i, isNumber: true },
    { label: 'Status', field: 'status' as const, pattern: /Status\s*\n\s*([^\n]+)/i },
    { label: 'Credit Limit', field: 'creditLimit' as const, pattern: /Credit\s+Limit\s*\n\s*\$?\s*([\d,]+(?:\.\d{2})?)/i, isNumber: true },
    { label: 'Payment Status', field: 'paymentStatus' as const, pattern: /Payment\s+Status\s*\n\s*([^\n]+)/i },
  ];

  for (const { field, pattern, isNumber } of multiLinePatterns) {
    // Only try multi-line if we haven't found it yet
    if ((result as any)[field] === undefined) {
      const match = text.match(pattern);
      if (match) {
        const value = match[1].trim();
        if (isNumber) {
          const numValue = parseFloat(value.replace(/,/g, ""));
          if (!isNaN(numValue)) {
            (result as any)[field] = numValue;
          }
        } else {
          (result as any)[field] = value;
        }
      }
    }
  }

  return result;
}

/**
 * Extracts the account number from a tradeline section.
 * Handles masked formats common in Canadian reports.
 * Avoids extracting payment history patterns as account numbers.
 * 
 * Note: TransUnion Consumer Disclosure format typically does not include
 * account numbers for privacy reasons. Returning null/Unknown is expected
 * for this format.
 */
export function extractAccountNumber(text: string): string | null {
  // First, try label-value block extraction (Credit Monitoring format)
  const labelValueData = extractFromLabelValueBlock(text);
  if (labelValueData.accountNumber) {
    console.log(`[Field Extractor] Extracted account number from label-value block: "${labelValueData.accountNumber}"`);
    return labelValueData.accountNumber;
  }

  // First, check if there's a payment history pattern we should avoid
  // Payment patterns are typically 12+ characters of just 1s, or digits/letters like CNOX
  const paymentPatternMatch = text.match(/(?:Payment\s+(?:History|Pattern)|History)[:\s]*\n?\s*([0-9CNOX]{12,})/i);
  const paymentPatternValue = paymentPatternMatch ? paymentPatternMatch[1] : null;
  
  // List of known field labels that should NOT be extracted as account numbers
  const fieldLabelBlacklist = [
    'Condition:',
    'Responsibility:',
    'Current Balance:',
    'Balance:',
    'Status:',
    'Payment Status:',
    'Credit Limit:',
    'Account Type:',
    'Date Opened:',
    'Last Activity:',
    'High Credit:',
    'Past Due:',
    'Monthly Payment:',
    'Terms:',
    'Interest Rate:',
    'Original Creditor:',
    'Collection Agency:',
  ];
  
  const patterns = [
    // Monitoring format: "Account Number" on one line, value on next line
    /Account\s+Number\s*\n\s*([^\n]+)/i,
    // Monitoring format: "Account Number / Account Type:" with slashes
    /Account\s+Number[\/\s]+[^:]*:\s*([*X\d-]{4,})/i,
    // "Account Number: ****1234" or "Account #: XXXX1234"
    /Account\s+(?:Number|#|No\.?)[\s:]+([*X\d-]{4,})/i,
    // "Acct: 1234567890"
    /Acct[\s#:]+([*X\d-]{4,})/i,
    // Standalone masked numbers like "****1234" or "XXXX-XXXX-1234"
    /\b([*X]{4,}[-\s]?\d{4,})\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const accountNum = match[1].trim();
      
      // Check if this starts with a known field label (Issue 1 fix)
      const startsWithFieldLabel = fieldLabelBlacklist.some(label => 
        accountNum.startsWith(label)
      );
      
      if (startsWithFieldLabel) {
        console.log(`[Field Extractor] Skipping "${accountNum}" - starts with field label`);
        continue;
      }
      
      // Validate that it looks like an account number (contains digits or masking characters)
      const looksLikeAccountNumber = /[\d*X-]/.test(accountNum);
      
      if (!looksLikeAccountNumber) {
        console.log(`[Field Extractor] Skipping "${accountNum}" - doesn't look like an account number`);
        continue;
      }
      
      // Validate it's not just a date or other number
      if (accountNum.length >= 4) {
        // Skip if this looks like a payment pattern (all same digit or matches known payment pattern)
        if (paymentPatternValue && accountNum === paymentPatternValue) {
          console.log(`[Field Extractor] Skipping "${accountNum}" - matches payment pattern`);
          continue;
        }
        // Skip if it's all 1s (common payment pattern indicator)
        if (/^1+$/.test(accountNum)) {
          console.log(`[Field Extractor] Skipping "${accountNum}" - looks like payment pattern (all 1s)`);
          continue;
        }
        // Skip if it matches the typical payment history format (12-24 chars of limited charset)
        if (/^[0-9CNOX]{12,}$/.test(accountNum) && !/[*X-]/.test(accountNum)) {
          console.log(`[Field Extractor] Skipping "${accountNum}" - looks like payment history code`);
          continue;
        }
        return accountNum;
      }
    }
  }

  return null;
}

/**
 * Checks if an account is a collection account.
 */
function sourceTextWithoutLegendDefinitions(text: string): string {
  return text.replace(/\bLegend\s*:[\s\S]*$/i, " ");
}

export function extractIsCollectionAccount(text: string): boolean {
  const accountText = sourceTextWithoutLegendDefinitions(text);

  // Check for collection-related keywords in status
  if (/Status[\s:]+.*Collection/i.test(accountText)) {
    return true;
  }

  // Check for collection agency indicators
  const collectionIndicators = [
    /\bcollection\s+agenc/i,
    /\bcollecting\s+for\b/i,
    /\bon\s+behalf\s+of\b/i,
    /\boriginal\s+creditor\b/i,
    /\boriginal\s+debt\b/i,
    /\bplaced\s+for\s+collection\b/i,
    /\bthird[\s-]party\s+collector\b/i,
    /(?:^|[^A-Z])TC\s*[-\/]\s*/i,
    /(?:Narrative|Remarks?|Comments?|Status)[\s\S]{0,50}\bTC\b/i,
  ];

  for (const pattern of collectionIndicators) {
    if (pattern.test(accountText)) {
      return true;
    }
  }

  // Check if creditor name contains collection-related terms
  const creditorMatch = accountText.match(/(?:Creditor|Lender|Institution)[\s:]+([^\n]+)/i);
  if (creditorMatch) {
    const creditorText = creditorMatch[1].toLowerCase();
    const collectionTerms = [
      'collection',
      'recovery',
      'receivables',
      'asset management'
    ];
    
    for (const term of collectionTerms) {
      if (creditorText.includes(term)) {
        // Require STATUS/TYPE confirmation
        const confirmingStatusRegex = /\b(?:collection|charge[ -]?off|written off|bad debt|placed for collection|09|delinquent|past due|in arrears)\b/i;
        if (confirmingStatusRegex.test(accountText)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Detects report language/codes showing the account was turned over to a
 * collection agency, even when the agency name itself is not reported.
 */
export function extractCollectionTurnoverSignal(text: string): boolean {
  const accountText = sourceTextWithoutLegendDefinitions(text);

  return (
    /(?:^|[^A-Z])TC\s*[-\/]\s*/i.test(accountText) ||
    /\bTC\s*-\s*Third\s+party\s+collection\/account\s+turned\s+over\s+to\s+collection\s+agency\b/i.test(accountText) ||
    /\b(?:sent|turned\s+over|assigned|placed)\s+(?:to|for)\s+collection(?:s|\s+agency)?\b/i.test(accountText) ||
    /\bacct\.?\s+assigned\s+to\s+third\s+party\s+for\s+collection\b/i.test(accountText) ||
    /\bassigned\s+to\s+third\s+party\s+for\s+collection\b/i.test(accountText) ||
    /\bthird[\s-]party\s+collection\b/i.test(accountText)
  );
}

/**
 * Extracts the creditor name from a tradeline section.
 * Enhanced to handle TransUnion format where creditor name is followed by "Payment History".
 */
export function sanitizeCreditorName(value: string | null | undefined): string | null {
  if (!value) return null;

  const cleaned = value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^Creditor\s+Name\s*:?\s*/i, "")
    .replace(/^Account\s+Name\s*:?\s*/i, "")
    .replace(/^Name\s*:?\s*/i, "")
    .replace(/^Name(?=[A-Z0-9])/u, "")
    .replace(
      /\s*(?:Payment\s+History|Account\s+Number|Account\s+Type|Balance|Status|Reported\s+Date|Opened\s+Date|Date\s+Opened|Last\s+Reported|High\s+Credit|Credit\s+Limit|Past\s+Due|Terms)\b[\s\S]*$/i,
      "",
    )
    .trim();

  return cleaned.length >= 3 ? cleaned.slice(0, 100) : null;
}

export function extractCreditorName(text: string): string | null {
  // First, try label-value block extraction (Credit Monitoring format)
  const labelValueData = extractFromLabelValueBlock(text);
  if (labelValueData.accountName) {
    const sanitized = sanitizeCreditorName(labelValueData.accountName);
    if (sanitized) {
      console.log(`[Field Extractor] Extracted creditor name from label-value block: "${sanitized}"`);
      return sanitized;
    }
  }

  // Blacklist for non-creditor section headers and generic account type headers
  const creditorBlacklist = [
    "PREVIOUS ADDRESSES",
    "CONTACT INFORMATION",
    "EMPLOYMENT INFORMATION",
    "CREDIT FILE SUMMARY",
    "CONSUMER IDENTIFICATION",
    "INQUIRIES",
    "STATEMENTS",
    "PERSONAL INFORMATION",
    "FILE INFORMATION",
    "INSTALLMENT LOANS",
    "INSTALLMENT LOAN",
    "REVOLVING CREDIT ACCOUNTS",
    "REVOLVING CREDIT ACCOUNT",
    "MORTGAGE ACCOUNTS",
    "MORTGAGE ACCOUNT",
    "COLLECTION ACCOUNTS",
    "COLLECTION ACCOUNT",
    "OPEN ACCOUNTS",
    "OPEN ACCOUNT",
    "CREDIT ACCOUNTS",
    "CREDIT ACCOUNT",
  ];

  const patterns = [
    // Monitoring format: "Account Name:" followed by creditor name (inline with pipe or newline)
    /Account\s+Name[\s:]+([A-Z][A-Za-z\s&,.\-']{2,})(?:\s*\||Account\s+Number|\n|$)/i,
    // Monitoring format: "Account Name" on one line, followed by actual name on next line
    /Account\s+Name\s*\n\s*([A-Z][A-Za-z\s&,.\-']{2,})(?:\n|$)/i,
    // TransUnion format: "Creditor Name BANK OF NOVA SCOTIA" or label on one line, value on next line
    /Creditor\s+Name[\s:]+([A-Z][A-Za-z\s&,.\-']{2,}?)(?=Payment\s+History|\n|Account|Balance|Status|$)/i,
    // TransUnion format: "Creditor Name\n{NAME}Payment History" - extract name between "Creditor Name" and "Payment History"
    /Creditor\s+Name\s*\n\s*([A-Z][A-Za-z\s&,.\-']+?)(?=Payment\s+History)/i,
    // Some TransUnion text variants split "Creditor Name" so the account line starts with "Name{CREDITOR}Payment History"
    /(?:^|\n)\s*Name\s*([A-Z0-9][A-Z0-9\s&,.\-']{2,}?)(?=Payment\s+History|\n|Account|Balance|Status|$)/,
    // "Creditor: BANK OF MONTREAL" or "Creditor: Portfolio Recovery Associates" (highest priority)
    /Creditor[\s:]+([A-Z][A-Za-z\s&,.\-']{2,})(?:\n|Account|Balance|Status|$)/i,
    // Numbered subsection with dash format like "8.1 AUTO LOAN – SCOTIABANK" (extract after dash)
    /^\s*\d+\.\d+\s+[^–\n]+–\s*([A-Z][A-Za-z\s&,.\-']{2,})$/m,
    // Numbered subsection items like "7.1 RBC VISA PLATINUM"
    /^\s*\d+\.\d+\s+([A-Z][A-Z\s&,.\-']{2,})$/m,
    // Numbered list items like "1. TD CANADA TRUST" or "1. Portfolio Recovery"
    /^\s*\d+\.\s+([A-Z][A-Z\s&,.\-']{2,})$/m,
    // "Lender: TD Canada Trust"
    /(?:Lender|Institution)[\s:]+([A-Z][A-Z\s&,.\-']{2,})(?:\n|Account|Balance|Status|$)/i,
    // Collection agency specific patterns
    /(?:Collection\s+Agency|Agency)[\s:]+([A-Z][A-Z\s&,.\-']{2,})(?:\n|$)/i,
    // "Portfolio Recovery Associates" or similar (title case with recovery/collection/associates)
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+(?:Recovery|Collection|Receivables|Associates|Financial\s+Services)))$/m,
    // Creditor name at start of section (all caps, 3+ words or 10+ chars)
    /^([A-Z][A-Z\s&,.\-']{9,})$/m,
    // Title case creditor name at line start
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,}(?:\s+(?:Bank|Credit|Card|Financial|Inc|Ltd|Corp))?)$/m,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const creditor = sanitizeCreditorName(match[1]);
      if (!creditor) continue;
      
      // Check against blacklist
      const isBlacklisted = creditorBlacklist.some((blacklisted) =>
        creditor.toUpperCase().includes(blacklisted)
      );
      
      if (isBlacklisted) {
        continue;
      }
      
      // Filter out common false positives
      if (
        creditor.length >= 3 &&
        !creditor.match(
          /^(Account|Balance|Status|Date|Payment|Credit Type|Limit|Amount)/i,
        )
      ) {
        // Validate that this comes from actual tradeline context
        // Check if the text contains tradeline indicators near the creditor name
        const hasTradelineContext =
          /Creditor[\s:]/i.test(text) ||
          /Account\s+(?:Number|#)[\s:]/i.test(text) ||
          /Payment\s+History/i.test(text) ||
          /Balance[\s:]/i.test(text) ||
          /Status[\s:]/i.test(text) ||
          /\$[\d,]+\.?\d*/i.test(text) ||
          /\b[RIMO]\d\b/.test(text);
        
        if (hasTradelineContext) {
          const finalCreditor = creditor;
          
          // Check if this is a generic account type header
          const isGenericHeader = creditorBlacklist.some((blacklisted) =>
            finalCreditor.toUpperCase().includes(blacklisted)
          );
          
          if (isGenericHeader) {
            // Try to extract the actual creditor from subsection format
            const subsectionMatch = text.match(
              /^\s*\d+\.\d+\s+[^–\n]+–\s*([A-Z][A-Za-z\s&,.\-']{2,})$/m
            );
            if (subsectionMatch) {
              const subsectionCreditor = subsectionMatch[1].trim();
              console.log(
                `[Field Extractor] Found generic header "${finalCreditor}", extracted actual creditor from subsection: "${subsectionCreditor}"`
              );
              return subsectionCreditor.slice(0, 100);
            }
            
            // If no subsection creditor found, continue to next pattern
            continue;
          }
          
          return finalCreditor;
        }
      }
    }
  }

  return null;
}

/**
 * Extracts the original creditor name (for collection accounts).
 * Returns null if not a collection account or original creditor not found.
 */
export function extractOriginalCreditor(text: string): string | null {
  const patterns = [
    // "Original Creditor: CIBC"
    /Original\s+Creditor[\s:]+([A-Z][A-Za-z\s&,.\-']{2,})(?:\n|$)/i,
    // TransUnion table/text extraction: label on one line, value on next line
    /Original\s+Creditor\s*\n\s*([A-Z][A-Za-z\s&,.\-']{2,})(?:\n|Account|Balance|Status|Payment|$)/i,
    // Collapsed extraction: "Original CreditorFIDO"
    /Original\s+Creditor\s*([A-Z][A-Za-z\s&,.\-']{2,}?)(?=Account|Balance|Status|Payment|Collection|$)/i,
    // "On behalf of: CIBC"
    /On\s+behalf\s+of[\s:]+([A-Z][A-Za-z\s&,.\-']{2,})(?:\n|$)/i,
    // "Collecting for: CIBC"
    /Collecting\s+for[\s:]+([A-Z][A-Za-z\s&,.\-']{2,})(?:\n|$)/i,
    // "For: CIBC" (when in collection context)
    /\bFor[\s:]+([A-Z][A-Za-z\s&,.\-']{2,})(?:\n|$)/i,
    // "Original Debt: CIBC"
    /Original\s+(?:Debt|Account)[\s:]+([A-Z][A-Za-z\s&,.\-']{2,})(?:\n|$)/i,
    // "Placed by: CIBC"
    /Placed\s+by[\s:]+([A-Z][A-Za-z\s&,.\-']{2,})(?:\n|$)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const originalCreditor = match[1].trim();
      // Filter out common false positives
      if (
        originalCreditor.length >= 3 &&
        !originalCreditor.match(
          /^(Account|Balance|Status|Date|Payment|Credit|Type|Limit|Amount)/i,
        )
      ) {
        return originalCreditor.slice(0, 100); // Limit length
      }
    }
  }

  return null;
}

/**
 * Extracts the collection agency name (different from creditor for collection accounts).
 */
export function extractCollectionAgencyName(text: string): string | null {
  const patterns = [
    // "Collection Agency: XYZ Recovery"
    /Collection\s+Agency[\s:]+([A-Z][A-Za-z\s&,.\-']{2,})(?:\n|Account|Balance|Status|$)/i,
    // "Collector: ABC Collections"
    /Collector[\s:]+([A-Z][A-Za-z\s&,.\-']{2,})(?:\n|Account|Balance|Status|$)/i,
    // "Agency Name: Portfolio Recovery Associates"
    /Agency\s+Name[\s:]+([A-Z][A-Za-z\s&,.\-']{2,})(?:\n|Account|Balance|Status|$)/i,
    // "Agency: ABC Collections"
    /\bAgency[\s:]+([A-Z][A-Za-z\s&,.\-']{2,})(?:\n|Account|Balance|Status|$)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const agencyName = match[1].trim();
      // Filter out common false positives
      if (
        agencyName.length >= 3 &&
        !agencyName.match(
          /^(Account|Balance|Status|Date|Payment|Credit|Type|Limit|Amount)/i,
        )
      ) {
        return agencyName.slice(0, 100); // Limit length
      }
    }
  }

  // If no explicit agency label, check if creditor name contains collection-related terms
  const creditorMatch = text.match(/(?:Creditor|Lender|Institution)[\s:]+([^\n]+)/i);
  if (creditorMatch) {
    const creditorText = creditorMatch[1].trim();
    const collectionTerms = [
      'collection',
      'recovery',
      'receivables',
      'asset management'
    ];
    
    for (const term of collectionTerms) {
      if (creditorText.toLowerCase().includes(term)) {
        // Require STATUS/TYPE confirmation
        const confirmingStatusRegex = /\b(?:collection|charge[ -]?off|written off|bad debt|placed for collection|09|delinquent|past due|in arrears)\b/i;
        if (confirmingStatusRegex.test(text)) {
          return creditorText.slice(0, 100);
        }
      }
    }
  }

  return null;
}
