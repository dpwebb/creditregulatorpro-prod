/**
 * Assesses the quality of extracted PDF text to determine if it's valid or garbled.
 * Used to decide whether OCR fallback is needed.
 */

/**
 * Common terms expected in credit reports (case-insensitive).
 * Used to validate that extracted text is actually credit report content.
 */
const CREDIT_REPORT_KEYWORDS = [
  "account",
  "balance",
  "credit",
  "report",
  "payment",
  "creditor",
  "inquiry",
  "equifax",
  "transunion",
  "tradeline",
  "bureau",
  "score",
  "revolving",
  "installment",
  "delinquent",
  "current",
  "closed",
  "opened",
];

/**
 * Result of text quality assessment.
 */
export interface TextQualityAssessment {
  /** Whether the text appears to be valid and readable */
  isValid: boolean;
  /** Ratio of printable characters (0-1) */
  printableRatio: number;
  /** Number of credit report keywords found */
  keywordCount: number;
  /** Average word length in characters */
  avgWordLength: number;
  /** Total character count */
  totalChars: number;
  /** Reason why text was deemed invalid (if applicable) */
  invalidReason?: string;
}

/**
 * Checks if a character is printable (ASCII 32-126 or common UTF-8 characters).
 */
function isPrintableChar(char: string): boolean {
  const code = char.charCodeAt(0);
  // ASCII printable range (space to tilde)
  if (code >= 32 && code <= 126) return true;
  // Common extended UTF-8 (accented characters, etc.)
  if (code >= 160 && code <= 255) return true;
  // Whitespace characters (tab, newline, carriage return)
  if (code === 9 || code === 10 || code === 13) return true;
  return false;
}

/**
 * Assesses the quality of extracted text to determine if it's valid or needs OCR fallback.
 * 
 * Checks multiple signals:
 * - Text length (should have at least 100 characters)
 * - Printable character ratio (should be mostly readable characters)
 * - Presence of credit report keywords
 * - Average word length (garbled text often has very long "words")
 * 
 * @param text The extracted text to assess
 * @returns Assessment result with quality metrics
 */
export function assessTextQuality(text: string): TextQualityAssessment {
  const totalChars = text.length;

  // Check 1: Minimum length
  if (totalChars < 100) {
    return {
      isValid: false,
      printableRatio: 0,
      keywordCount: 0,
      avgWordLength: 0,
      totalChars,
      invalidReason: "Text too short (< 100 characters)",
    };
  }

  // Check 2: Printable character ratio
  const printableChars = Array.from(text).filter(isPrintableChar).length;
  const printableRatio = printableChars / totalChars;

  if (printableRatio < 0.8) {
    return {
      isValid: false,
      printableRatio,
      keywordCount: 0,
      avgWordLength: 0,
      totalChars,
      invalidReason: `Low printable character ratio (${(printableRatio * 100).toFixed(1)}%)`,
    };
  }

  // Check 3: Credit report keyword presence
  const lowerText = text.toLowerCase();
  const keywordCount = CREDIT_REPORT_KEYWORDS.filter((keyword) =>
    lowerText.includes(keyword)
  ).length;

  if (keywordCount < 3) {
    return {
      isValid: false,
      printableRatio,
      keywordCount,
      avgWordLength: 0,
      totalChars,
      invalidReason: `Too few credit report keywords found (${keywordCount}/3 minimum)`,
    };
  }

  // Check 4: Average word length (garbled text often has very long "words")
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const avgWordLength =
    words.length > 0
      ? words.reduce((sum, word) => sum + word.length, 0) / words.length
      : 0;

  // Typical English text has average word length of 4-6 characters
  // Garbled text often has much longer "words" (20+ characters)
  if (avgWordLength > 20) {
    return {
      isValid: false,
      printableRatio,
      keywordCount,
      avgWordLength,
      totalChars,
      invalidReason: `Average word length too high (${avgWordLength.toFixed(1)} chars), suggests garbled text`,
    };
  }

  // All checks passed
  return {
    isValid: true,
    printableRatio,
    keywordCount,
    avgWordLength,
    totalChars,
  };
}