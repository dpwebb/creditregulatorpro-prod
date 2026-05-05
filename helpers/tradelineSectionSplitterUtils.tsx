/**
 * Utility functions for the tradeline section splitter.
 */

/**
 * Finds the starting index of actual tradeline sections in the credit report.
 * Looks for section markers like "7. REVOLVING CREDIT", "8. INSTALLMENT", "9. MORTGAGE"
 * to skip non-tradeline content (Consumer ID, Addresses, Contact Info, etc.)
 * 
 * @param text The full credit report text
 * @returns The character index where tradeline sections begin, or -1 if not found
 */
export function findTradelineSectionStart(text: string): number {
  const lines = text.split("\n");
  
  // Patterns that indicate the start of actual tradeline sections
  const tradelineSectionPatterns = [
    // TransUnion Consumer Disclosure format
    /^\s*Account\(s\):\s*$/i,
    // TransUnion Online Credit Monitoring format
    /^\s*Online\s+Personal\s+Credit\s+Reports?/i,
    /^\s*Credit\s+Monitoring/i,
    /^\s*Your\s+credit\s+report/i,
    /^\s*Account\s+Information\s*$/i,
    /^\s*Account\s+Name[\s:]/i, // Table format starting with "Account Name"
    // Numbered sections (7., 8., 9., etc.) with tradeline keywords
    /^\s*7\.\s*REVOLVING\s+CREDIT/i,
    /^\s*8\.\s*INSTALLMENT/i,
    /^\s*9\.\s*MORTGAGE/i,
    /^\s*\d+\.\s*REVOLVING\s+CREDIT\s+ACCOUNTS?/i,
    /^\s*\d+\.\s*INSTALLMENT\s+LOANS?/i,
    /^\s*\d+\.\s*MORTGAGE\s+ACCOUNTS?/i,
    /^\s*\d+\.\s*COLLECTION\s+ACCOUNTS?/i,
    /^\s*\d+\.\s*TRADE\s+ACCOUNTS?/i,
    /^\s*\d+\.\s*CREDIT\s+ACCOUNTS?/i,
    // Non-numbered tradeline section headers
    /^REVOLVING\s+CREDIT\s+ACCOUNTS?$/i,
    /^INSTALLMENT\s+LOANS?$/i,
    /^MORTGAGE\s+ACCOUNTS?$/i,
    /^COLLECTION\s+ACCOUNTS?$/i,
    /^TRADE\s+ACCOUNTS?$/i,
    /^CREDIT\s+ACCOUNTS?$/i,
  ];
  
  let charIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    for (const pattern of tradelineSectionPatterns) {
      if (pattern.test(line)) {
        console.log(`[Section Splitter] Found tradeline section start at line ${i}`);
        return charIndex;
      }
    }
    
    // Add line length + newline character to charIndex
    charIndex += lines[i].length + 1;
  }
  
  return -1;
}

/**
 * Checks if a section appears to be non-tradeline content (metadata, addresses, etc.)
 * 
 * @param sectionText The section text to validate
 * @returns true if this appears to be a valid tradeline section
 */
export function isValidTradelineSection(sectionText: string): boolean {
  const upperText = sectionText.toUpperCase();
  
  // Patterns that indicate non-tradeline content
  const nonTradelinePatterns = [
    /CONSUMER\s+IDENTIFICATION/i,
    /UNIVERSAL\s+CREDIT\s+BUREAU/i,
    /BASELINE\s+REPORT/i,
    /CURRENT\s+ADDRESS/i,
    /PREVIOUS\s+ADDRESS/i,
    /CONTACT\s+INFORMATION/i,
    /EMPLOYMENT\s+INFORMATION/i,
    /BANKING\s+INFORMATION/i,
    /CREDIT\s+FILE\s+SUMMARY/i,
    /REPORT\s+HEADER/i,
    /PERSONAL\s+INFORMATION/i,
    /^ADDRESSES?$/i,
    /Bank\s+accounts?\s+closed\s+for\s+derogatory/i,
    /^\s*Not\s+Applicable\s*$/i,
  ];
  
  // Check if section contains non-tradeline indicators
  for (const pattern of nonTradelinePatterns) {
    if (pattern.test(upperText)) {
      return false;
    }
  }
  
  // Section should contain at least some tradeline indicators to be valid
  const hasTradelineIndicators =
    /Account\s+(?:Number|#|No\.?)[\s:]/i.test(sectionText) ||
    /Balance[\s:]/i.test(sectionText) ||
    /Creditor[\s:]/i.test(sectionText) ||
    /\$[\d,]+\.?\d*/i.test(sectionText) ||
    /Status[\s:]/i.test(sectionText) ||
    /\b[RIMO]\d\b/.test(sectionText);
  
  return hasTradelineIndicators;
}

/**
 * Logs detailed information about each section for debugging.
 */
export function logSectionDetails(sections: string[]): void {
  console.log(
    `[Section Splitter] ====== SECTION DETAILS (${sections.length} sections) ======`,
  );
  sections.forEach((section, index) => {
    console.log(
      `[Section Splitter] --- Section ${index + 1} (${section.length} chars) ---`,
    );
    console.log(`[Section Splitter] --- End Section ${index + 1} ---`);
  });
  console.log(`[Section Splitter] ====== END SECTION DETAILS ======`);
}
