import { extractByAccountNumbers } from "./tradelineStrategyAccountNumbers";
import { extractByCreditorNames } from "./tradelineStrategyCreditorNames";
import { extractByHeaders } from "./tradelineStrategyHeaders";
import { extractByLabelBlocks } from "./tradelineStrategyLabelBlocks";
import { extractByStructure } from "./tradelineStrategyStructure";
import {
  findTradelineSectionStart,
  logSectionDetails,
} from "./tradelineSectionSplitterUtils";

/**
 * Splits credit report text into individual tradeline sections.
 * Uses multiple strategies to handle various Canadian credit report formats.
 *
 * @param text The full credit report text
 * @returns Array of text sections, each potentially representing a tradeline
 */
export function splitIntoTradelineSections(text: string): string[] {
  console.log(`[Section Splitter] Processing ${text.length} characters`);

  // First, find where the actual tradeline sections begin
  const tradelineStartIndex = findTradelineSectionStart(text);
  
  if (tradelineStartIndex === -1) {
    console.log(`[Section Splitter] No tradeline section markers found`);
    // Fallback to original text but still try to extract
  } else {
    console.log(`[Section Splitter] Found tradeline section start at index ${tradelineStartIndex}`);
    // Only process text from tradeline sections onwards
    text = text.substring(tradelineStartIndex);
    console.log(`[Section Splitter] Processing ${text.length} characters after skipping header sections`);
  }

  // Strategy 1: Look for section headers (Equifax/TransUnion common headers)
  const headerSections = extractByHeaders(text);
  if (headerSections.length > 0) {
    console.log(
      `[Section Splitter] Strategy 1 (headers): Found ${headerSections.length} sections`,
    );
    logSectionDetails(headerSections);
    return headerSections;
  }

  // Strategy 2: Split by creditor names (usually in caps at start of line)
  const creditorSections = extractByCreditorNames(text);
  if (creditorSections.length > 1) {
    console.log(
      `[Section Splitter] Strategy 2 (creditors): Found ${creditorSections.length} sections`,
    );
    logSectionDetails(creditorSections);
    return creditorSections;
  }

  // Strategy 5: Split by label-value blocks (Credit Monitoring format)
  // MOVED UP: Run before account numbers to better handle Credit Monitoring PDFs
  const labelBlockSections = extractByLabelBlocks(text);
  if (labelBlockSections.length > 1) {
    console.log(
      `[Section Splitter] Strategy 5 (label blocks): Found ${labelBlockSections.length} sections`,
    );
    logSectionDetails(labelBlockSections);
    return labelBlockSections;
  }

  // Strategy 3: Split by account number patterns
  const accountSections = extractByAccountNumbers(text);
  if (accountSections.length > 1) {
    console.log(
      `[Section Splitter] Strategy 3 (accounts): Found ${accountSections.length} sections`,
    );
    
    // Hybrid approach: Check if any section is suspiciously long (could be multiple tradelines merged)
    const LONG_SECTION_THRESHOLD = 1500;
    const hasLongSections = accountSections.some(
      (section) => section.length > LONG_SECTION_THRESHOLD
    );
    
    if (hasLongSections) {
      console.log(
        `[Section Splitter] Detected long sections (>${LONG_SECTION_THRESHOLD} chars) - attempting re-split with label block strategy`
      );
      
      // Re-run Strategy 5 on each section to split further
      const reSplitSections: string[] = [];
      for (let i = 0; i < accountSections.length; i++) {
        const section = accountSections[i];
        
        if (section.length > LONG_SECTION_THRESHOLD) {
          console.log(
            `[Section Splitter] Re-splitting section ${i + 1} (${section.length} chars) with label block strategy`
          );
          const subSections = extractByLabelBlocks(section);
          
          if (subSections.length > 1) {
            console.log(
              `[Section Splitter] Successfully split section ${i + 1} into ${subSections.length} sub-sections`
            );
            reSplitSections.push(...subSections);
          } else {
            // Couldn't split further, keep original
            console.log(
              `[Section Splitter] Could not split section ${i + 1} further, keeping original`
            );
            reSplitSections.push(section);
          }
        } else {
          // Section is not long, keep as-is
          reSplitSections.push(section);
        }
      }
      
      if (reSplitSections.length > accountSections.length) {
        console.log(
          `[Section Splitter] Hybrid re-split successful: ${accountSections.length} → ${reSplitSections.length} sections`
        );
        logSectionDetails(reSplitSections);
        return reSplitSections;
      } else {
        console.log(
          `[Section Splitter] Hybrid re-split did not produce more sections, using original account-based sections`
        );
      }
    }
    
    logSectionDetails(accountSections);
    return accountSections;
  }

  // Strategy 4: Split by structural patterns (blank lines, separators)
  const structuralSections = extractByStructure(text);
  if (structuralSections.length > 0) {
    console.log(
      `[Section Splitter] Strategy 4 (structure): Found ${structuralSections.length} sections`,
    );
    logSectionDetails(structuralSections);
    return structuralSections;
  }

  // Fallback: Return entire text as single section if nothing worked
  console.log(
    `[Section Splitter] Using fallback: treating entire text as one section`,
  );
  return text.trim().length > 50 ? [text] : [];
}
