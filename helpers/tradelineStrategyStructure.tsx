/**
 * Strategy 4: Split by structural patterns (multiple blank lines, horizontal rules).
 */
import { isValidTradelineSection } from "./tradelineSectionSplitterUtils";

export function extractByStructure(text: string): string[] {
  const sections: string[] = [];

  // Split by multiple consecutive blank lines (2 or more)
  const chunks = text.split(/\n\s*\n\s*\n+/);

  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    // Only include chunks that look like they could be tradelines
    // (contain some key indicators)
    if (
      trimmed.length > 50 &&
      isValidTradelineSection(trimmed) &&
      (trimmed.match(/balance|account|credit|status|date/i) ||
        trimmed.match(/\$[\d,]+\.?\d*/))
    ) {
      sections.push(trimmed);
    }
  }

  return sections;
}