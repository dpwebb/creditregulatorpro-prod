/**
 * Strategy 3: Split by account number patterns.
 */
import { isValidTradelineSection } from "./tradelineSectionSplitterUtils";

export function extractByAccountNumbers(text: string): string[] {
  const sections: string[] = [];
  const lines = text.split("\n");
  let currentSection: string[] = [];

  // Account number patterns (often masked)
  const accountPatterns = [
    /Account\s+(?:Number|#|No\.?)[\s:]+([*X\d-]{4,})/i,
    /Acct[\s#:]+([*X\d-]{4,})/i,
    /^\s*([*X]{4,}[-\s]?\d{4,})\s*$/i, // Masked format like ****1234
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    let hasAccountNumber = false;
    for (const pattern of accountPatterns) {
      if (pattern.test(line)) {
        hasAccountNumber = true;
        break;
      }
    }

    if (hasAccountNumber && currentSection.length > 3) {
      // Save current section and start new one
      const sectionText = currentSection.join("\n").trim();
      if (sectionText.length > 50 && isValidTradelineSection(sectionText)) {
        sections.push(sectionText);
      }
      currentSection = [line];
    } else {
      currentSection.push(line);
    }
  }

  // Add last section
  if (currentSection.length > 0) {
    const sectionText = currentSection.join("\n").trim();
    if (sectionText.length > 50 && isValidTradelineSection(sectionText)) {
      sections.push(sectionText);
    }
  }

  return sections;
}