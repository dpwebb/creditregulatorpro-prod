/**
 * Strategy 2: Split by creditor names (typically in ALL CAPS or Title Case at line start).
 */
import { isValidTradelineSection } from "./tradelineSectionSplitterUtils";

export function extractByCreditorNames(text: string): string[] {
  const sections: string[] = [];
  const lines = text.split("\n");
  let currentSection: string[] = [];

  // Keywords that indicate non-tradeline sections
  const sectionBlacklist = [
    "ADDRESSES",
    "ADDRESS",
    "CONTACT",
    "IDENTIFICATION",
    "SUMMARY",
    "INQUIRIES",
    "INQUIRY",
    "STATEMENTS",
    "SCORE",
    "EMPLOYMENT",
    "PERSONAL INFORMATION",
    "FILE INFORMATION",
    "CONSUMER IDENTIFICATION",
    "UNIVERSAL CREDIT BUREAU",
    "BASELINE REPORT",
    "REPORT HEADER",
    "CURRENT ADDRESS",
    "PREVIOUS ADDRESS",
  ];

  // Pattern to detect numbered creditor entries (e.g., "1. TD CANADA TRUST")
  const numberedCreditorPattern = /^\s*\d+\.\s+([A-Z][A-Z\s&.,'\-]{2,})/;

  // Pattern to detect numbered subsection entries (e.g., "7.1 RBC VISA PLATINUM")
  const numberedSubsectionPattern = /^\s*\d+\.\d+\s+([A-Z][A-Z\s&.,'\-]{2,})/;

  // Termination patterns - stop adding to current section when these are encountered
  const terminationPatterns = [
    // TransUnion specific terminators
    /^\s*Insolvency:\s*$/i,
    /^\s*Credit\s+Related\s+Inquiries:\s*$/i,
    /^\s*Non-Credit\s+Related\s+Inquiries:\s*$/i,
    /^\s*\d+\.\s*INQUIR(?:Y|IES)\s+(?:DETAILS?|SECTION)/i,
    /^\s*INQUIRY\s+DETAILS?:/i,
    /^\s*Credit\s+Inquiries:/i,
    /^\s*\d+\.\s*CONSUMER\s+STATEMENT/i,
    /^\s*CONSUMER\s+STATEMENT/i,
    /^\s*\d+\.\s*SCORE/i,
    /^\s*SCORE\s+INFORMATION/i,
    /^\s*\d+\.\s*PUBLIC\s+RECORD/i,
    /^\s*PUBLIC\s+RECORD/i,
    /^\s*\d+\.\s*PERSONAL\s+INFORMATION/i,
    /^\s*\d+\.\s*BANKING\s+INFORMATION/i,
    /^\s*CREDIT\s+SCORE/i,
  ];
  
  // Summary label patterns - these are NOT termination points (they're just counts/summaries)
  const summaryLabelPatterns = [
    /^\s*Inquiries\s+\(\d+\s+years?\)/i,
    /^\s*Credit\s+Accounts?\s*$/i,
    /^\s*Open\s+Accounts?\s*$/i,
    /^\s*Closed\s+Accounts?\s*$/i,
    // Add patterns for summary counts often found in report headers/dashboards
    /^\s*Public\s+Records?[:\s]+\d+/i, // e.g. "Public Records: 0"
    /^\s*Credit\s+Score[:\s]+\d+/i, // e.g. "Credit Score: 591"
    /^\s*Delinquent[:\s]+\d+/i, // e.g. "Delinquent: 0"
    /^\s*Derogatory[:\s]+\d+/i, // e.g. "Derogatory: 2"
    /^\s*Balances?[:\s]+\$?[0-9,]+/i, // e.g. "Balances: $589"
    /^\s*Payments?[:\s]+\$?[0-9,]+/i, // e.g. "Payments: $0"
  ];

  // Pattern to detect numbered account entries (e.g., "Account 1:", "Account 2:")
  const numberedAccountPattern = /^Account\s+\d+:/i;

  // Tradeline section headers - we should start processing only after these
  const tradelineSectionHeaders = [
    // TransUnion Consumer Disclosure format
    /^\s*Account\(s\):\s*$/i,
    /^\s*\d+\.\s*REVOLVING\s+CREDIT/i,
    /^\s*\d+\.\s*INSTALLMENT/i,
    /^\s*\d+\.\s*MORTGAGE/i,
    /^\s*\d+\.\s*COLLECTION/i,
    /^\s*\d+\.\s*OPEN\s+ACCOUNTS?/i,
    /^\s*\d+\.\s*CREDIT\s+ACCOUNTS?/i,
    /^\s*\d+\.\s*TRADE\s+ACCOUNTS?/i,
    // Strict matching for headers to avoid false positives with account types like "INSTALLMENT / INDIVIDUAL"
    /^REVOLVING\s+CREDIT$/i,
    /^INSTALLMENT\s+LOANS?$/i,
    /^MORTGAGE$/i,
    /^COLLECTION$/i,
    /^OPEN\s+ACCOUNTS?$/i,
    /^CREDIT\s+ACCOUNTS?$/i,
    /^TRADE\s+ACCOUNTS?$/i,
  ];

  // Pattern to detect creditor names:
  // - At least 3 characters
  // - Starts with uppercase letter
  // - Contains mostly uppercase letters, spaces, and common punctuation
  // - Not just a field label
  const creditorPattern =
    /^([A-Z][A-Z\s&.,'\-]{2,}(?:INC|LTD|CORP|BANK|CARD|CREDIT|LOAN|FINANCE|CAPITAL)?)\s*$/;
  const fieldLabelPattern =
    /^(Account|Balance|Status|Date|Payment|Credit|Type|Limit|Amount|High|Past|Report|Open|Close)[\s:]/i;

  // Expanded blacklist for section content filtering
  const contentBlacklist = [
    "PREVIOUS ADDRESSES",
    "PREVIOUS ADDRESS",
    "CURRENT ADDRESS",
    "CONTACT INFORMATION",
    "EMPLOYMENT INFORMATION",
    "CREDIT FILE SUMMARY",
    "CONSUMER IDENTIFICATION",
    "INQUIRIES",
    "INQUIRY",
    "STATEMENTS",
    "PERSONAL INFORMATION",
    "FILE INFORMATION",
    "PUBLIC RECORDS",
    "BANKING INFORMATION",
    "UNIVERSAL CREDIT BUREAU",
    "BASELINE REPORT",
  ];

  let shouldStopProcessing = false;
  let hasSeenTradelineSection = false;
  let nextLineIsTransUnionCreditor = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check if this is the "Creditor Name" label (TransUnion format)
    if (line === "Creditor Name") {
      // Save current section if it has content
      if (currentSection.length > 3) {
        const sectionText = currentSection.join("\n").trim();
        if (sectionText.length > 50 && isValidTradelineSection(sectionText)) {
          sections.push(sectionText);
        }
      }
      // Start new section and flag that next line is the creditor
      currentSection = [line];
      nextLineIsTransUnionCreditor = true;
      continue;
    }

    // Check if this line matches a termination pattern
    // BUT exclude summary labels which just show counts
    const isTerminationLine = terminationPatterns.some((pattern) =>
      pattern.test(line)
    );
    
    const isSummaryLabel = summaryLabelPatterns.some((pattern) =>
      pattern.test(line)
    );

    if (isTerminationLine && !isSummaryLabel) {
      // Save current section if it has content
      if (currentSection.length > 0) {
        const sectionText = currentSection.join("\n").trim();
        if (sectionText.length > 50 && isValidTradelineSection(sectionText)) {
          sections.push(sectionText);
        }
      }
      // Stop processing - we've left the tradeline sections
      shouldStopProcessing = true;
      console.log(
        `[Section Splitter] Hit termination pattern at line: "${line}" - stopping tradeline extraction`
      );
      break;
    }

    // Skip empty lines
    if (!line) {
      if (currentSection.length > 0) {
        currentSection.push("");
      }
      continue;
    }

    // Check if this is a tradeline section header
    const isTradelineSectionHeader = tradelineSectionHeaders.some((pattern) =>
      pattern.test(line)
    );
    
    if (isTradelineSectionHeader) {
      hasSeenTradelineSection = true;
      // Save current section if it has content
      if (currentSection.length > 3) {
        const sectionText = currentSection.join("\n").trim();
        if (sectionText.length > 50 && isValidTradelineSection(sectionText)) {
          sections.push(sectionText);
        }
      }
      // Start new section with the header
      currentSection = [line];
      continue;
    }

    // If the previous line was "Creditor Name" (TransUnion format), this line is the actual creditor
    if (nextLineIsTransUnionCreditor) {
      currentSection.push(line);
      nextLineIsTransUnionCreditor = false;
      continue;
    }

    // Skip all content until we see a tradeline section header
    if (!hasSeenTradelineSection) {
      continue;
    }

    // Check if this looks like a numbered creditor entry (e.g., "1. TD CANADA TRUST")
    const numberedCreditorMatch = line.match(numberedCreditorPattern);
    const isNumberedCreditor = numberedCreditorMatch !== null;

    // Check if this looks like a numbered subsection entry (e.g., "7.1 RBC VISA PLATINUM")
    const isNumberedSubsection = numberedSubsectionPattern.test(line);

    // Check if numbered section header contains blacklisted keywords
    let isBlacklistedSection = false;
    if (isNumberedCreditor && numberedCreditorMatch) {
      const sectionTitle = numberedCreditorMatch[1].toUpperCase();
      isBlacklistedSection = sectionBlacklist.some((keyword) =>
        sectionTitle.includes(keyword)
      );
    }

    // Check if this looks like a numbered account entry (e.g., "Account 1:")
    const isNumberedAccount = numberedAccountPattern.test(line);

    // Check if this looks like a regular creditor name
    const isCreditorName =
      creditorPattern.test(line) && !fieldLabelPattern.test(line);

    // For numbered entries, check if the current section contains tradeline indicators
    const hasTradlineIndicators = (section: string[]): boolean => {
      const sectionText = section.join("\n");
      return (
        /Account\s+(?:Number|#|No\.?)[\s:]/i.test(sectionText) ||
        /Balance[\s:]/i.test(sectionText) ||
        /Creditor[\s:]/i.test(sectionText) ||
        /\$[\d,]+\.?\d*/i.test(sectionText) ||
        /Status[\s:]/i.test(sectionText) ||
        /\b[RIMO]\d\b/.test(sectionText)
      );
    };

    // Handle numbered subsections (X.Y format) - always start new section regardless of length
    if (isNumberedSubsection) {
      // Save current section if it has any content
      if (currentSection.length > 0) {
        const sectionText = currentSection.join("\n").trim();
        if (sectionText.length > 50 && isValidTradelineSection(sectionText)) {
          sections.push(sectionText);
        }
      }
      // Start new section with this subsection
      currentSection = [line];
      continue;
    }

    // Handle other tradeline indicators
    if (
      ((isNumberedCreditor && !isBlacklistedSection) ||
        isNumberedAccount ||
        isCreditorName) &&
      currentSection.length > 3
    ) {
      // For numbered sections, validate they contain tradeline indicators
      if (isNumberedCreditor && !isBlacklistedSection) {
        if (hasTradlineIndicators(currentSection)) {
          // Save current section and start new one
          const sectionText = currentSection.join("\n").trim();
          if (sectionText.length > 50 && isValidTradelineSection(sectionText)) {
            sections.push(sectionText);
          }
          currentSection = [line];
        } else {
          // Not a real tradeline section, just continue
          currentSection.push(line);
        }
      } else {
        // Other indicators, save and start new section
        const sectionText = currentSection.join("\n").trim();
        if (sectionText.length > 50 && isValidTradelineSection(sectionText)) {
          sections.push(sectionText);
        }
        currentSection = [line];
      }
    } else {
      currentSection.push(line);
    }
  }

  // Add last section (only if we didn't stop processing due to termination pattern)
  if (currentSection.length > 0 && !shouldStopProcessing) {
    const sectionText = currentSection.join("\n").trim();
    if (sectionText.length > 50 && isValidTradelineSection(sectionText)) {
      sections.push(sectionText);
    }
  }

  // Post-process: Filter out sections that start with blacklisted content
  const filteredSections = sections.filter((section) => {
    const sectionLines = section.split("\n").filter((l) => l.trim().length > 0);
    if (sectionLines.length === 0) return false;

    // Check first few lines for blacklisted terms
    for (let i = 0; i < Math.min(3, sectionLines.length); i++) {
      const line = sectionLines[i].trim().toUpperCase();
      
      // Remove numbered prefix if present (e.g., "3. PREVIOUS ADDRESSES" → "PREVIOUS ADDRESSES")
      const lineWithoutNumber = line.replace(/^\d+\.\s*/, "");
      
      for (const blacklisted of contentBlacklist) {
        if (lineWithoutNumber.includes(blacklisted)) {
          console.log(
            `[Section Splitter] Filtering out section starting with blacklisted term: "${lineWithoutNumber}"`
          );
          return false;
        }
      }
    }

    return true;
  });

  console.log(
    `[Section Splitter] Filtered ${sections.length - filteredSections.length} blacklisted sections`
  );

  return filteredSections;
}