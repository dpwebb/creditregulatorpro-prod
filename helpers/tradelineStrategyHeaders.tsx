/**
 * Strategy 1: Extract sections by identifying report section headers.
 */
import { extractByCreditorNames } from "./tradelineStrategyCreditorNames";

export function extractByHeaders(text: string): string[] {
  // Look for common section headers in Canadian reports
  const headerPatterns = [
    /(?:trade|credit)\s+(?:accounts?|information)/i,
    /account\s+information/i,
    /credit\s+file/i,
    /tradelines?/i,
  ];

  let sectionStart = -1;
  const lines = text.split("\n");

  // Find where the tradelines section starts
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of headerPatterns) {
      if (pattern.test(line)) {
        // NOTE: We must include the header line itself (index i, not i+1) because
        // extractByCreditorNames relies on matching these headers to set its
        // 'hasSeenTradelineSection' flag to true. If we skip it, it might ignore the content.
        sectionStart = i;
        console.log(
          `[Section Splitter] Found section header at line ${i}: "${line.trim()}"`,
        );
        break;
      }
    }
    if (sectionStart !== -1) break;
  }

  if (sectionStart === -1) {
    return [];
  }

  // Extract text from section start onwards
  const sectionText = lines.slice(sectionStart).join("\n");

  // Now split this section by tradeline indicators
  return extractByCreditorNames(sectionText);
}