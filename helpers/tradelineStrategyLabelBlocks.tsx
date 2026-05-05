/**
 * Strategy 5: Split by label-value pair blocks (for Credit Monitoring PDFs).
 * Detects tradeline blocks that use "Account Name:" / "Creditor:" style labels.
 * Handles markdown formatting from OCR output (e.g., **Account Name: CREDITOR**).
 */
import { isValidTradelineSection } from "./tradelineSectionSplitterUtils";

/**
 * Normalizes markdown formatting from OCR output.
 * Strips leading/trailing markdown markers (**, *, #) to help with pattern matching.
 */
function normalizeMarkdown(line: string): string {
  let normalized = line;
  
  // Remove leading markdown markers
  normalized = normalized.replace(/^[\s#*]+/, '').trimStart();
  
  // Remove trailing markdown markers
  normalized = normalized.replace(/[*]+$/, '').trimEnd();
  
  return normalized;
}

export function extractByLabelBlocks(text: string): string[] {
  const sections: string[] = [];
  const lines = text.split("\n");
  let currentSection: string[] = [];

  // Patterns that mark the start of a new tradeline block
  const tradelineStartPatterns = [
    /^\s*Account\s+Name[\s:]/i,
    /^\s*Creditor\s+Name[\s:]/i,
    /^\s*Creditor[\s:]/i,
    // Add new pattern for "Account X: ..." which is used in some TransUnion Credit Monitoring reports
    // e.g. "**Account 4: ROGERS COMMUNICATIONS CA**"
    // Since normalizeMarkdown removes leading asterisks, we match against "Account 4: ..."
    // The pattern allows for "Account" followed by a number and a separator (colon or space)
    /^\s*Account\s+\d+[:\s]/i, 
  ];

  // Blacklist for section content filtering
  const contentBlacklist = [
    "BANKING INFORMATION",
    "BANK ACCOUNTS CLOSED FOR DEROGATORY",
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
    "UNIVERSAL CREDIT BUREAU",
    "BASELINE REPORT",
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Normalize markdown formatting for pattern matching
    const normalizedLine = normalizeMarkdown(line);

    // Check if this line starts a new tradeline block (using normalized text)
    const isTradelineStart = tradelineStartPatterns.some((pattern) =>
      pattern.test(normalizedLine)
    );
    
    // Log when markdown normalization helped detect a tradeline start
    if (isTradelineStart && line !== normalizedLine) {
      console.log(
        `[Section Splitter] Label block strategy: Markdown normalization helped detect tradeline start`
      );
    }

    if (isTradelineStart && currentSection.length > 0) {
      // Save current section if it has content
      const sectionText = currentSection.join("\n").trim();
      if (sectionText.length > 30 && isValidTradelineSection(sectionText)) {
        sections.push(sectionText);
        console.log(
          `[Section Splitter] Label block strategy: Found section with ${currentSection.length} lines`
        );
      }
      // Start new section with this line
      currentSection = [lines[i]]; // Keep original line with whitespace
    } else {
      // Add to current section
      currentSection.push(lines[i]);
    }
  }

  // Add last section
  if (currentSection.length > 0) {
    const sectionText = currentSection.join("\n").trim();
    if (sectionText.length > 30 && isValidTradelineSection(sectionText)) {
      sections.push(sectionText);
      console.log(
        `[Section Splitter] Label block strategy: Found final section with ${currentSection.length} lines`
      );
    }
  }

  // Post-process: Filter out sections that contain blacklisted content
  const filteredSections = sections.filter((section) => {
    const sectionLines = section.split("\n").filter((l) => l.trim().length > 0);
    if (sectionLines.length === 0) return false;

    // Check all lines for blacklisted terms
    for (const line of sectionLines) {
      const upperLine = line.trim().toUpperCase();
      
      // Remove numbered prefix and markdown formatting
      const normalizedLine = upperLine.replace(/^\d+\.\s*/, "").replace(/^[\s#*]+|[*]+$/g, "");
      
      for (const blacklisted of contentBlacklist) {
        if (normalizedLine.includes(blacklisted)) {
          console.log(
            `[Section Splitter] Label block strategy: Filtering out section containing blacklisted term: "${blacklisted}"`
          );
          return false;
        }
      }
      
      // Also check for "Not Applicable" as a standalone line (placeholder text)
      if (normalizedLine === "NOT APPLICABLE") {
        console.log(
          `[Section Splitter] Label block strategy: Filtering out section containing "Not Applicable" placeholder`
        );
        return false;
      }
    }

    return true;
  });

  console.log(
    `[Section Splitter] Label block strategy: Filtered ${sections.length - filteredSections.length} blacklisted sections`
  );

  return filteredSections;
}
