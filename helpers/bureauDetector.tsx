import { extractTextFromPdf } from "./pdfTextExtractor";

/**
 * Result object for bureau detection.
 */
export type DetectedBureau = {
  bureauName: string;
  confidence: number; // 0-100
  matchedPatterns: string[];
};

type BureauPattern = {
  pattern: RegExp | string;
  weight: number;
  description: string;
};

type BureauDefinition = {
  name: string;
  patterns: BureauPattern[];
};

// Definitions for Canadian Bureaus with weighted patterns
const BUREAUS: BureauDefinition[] = [
  {
    name: "Equifax Canada",
    patterns: [
      { pattern: /Equifax Canada/i, weight: 50, description: "Exact Name Match" },
      { pattern: /Equifax/i, weight: 30, description: "Name Match" },
      { pattern: /equifax\.ca/i, weight: 40, description: "Domain Match" },
      { pattern: /Consumer Disclosure/i, weight: 20, description: "Document Type" },
      { pattern: /1-?800-?465-?7166/, weight: 60, description: "Phone Number" },
      { pattern: /Montreal/i, weight: 15, description: "City Match" },
      { pattern: /H1S\s*2Z2/i, weight: 40, description: "Postal Code Match" },
      { pattern: /Jean-?Talon/i, weight: 20, description: "Address Keyword" },
      { pattern: /Box 190/i, weight: 20, description: "PO Box Match" },
    ],
  },
  {
    name: "TransUnion Canada",
    patterns: [
      { pattern: /TransUnion Canada/i, weight: 50, description: "Exact Name Match" },
      { pattern: /TransUnion Credit Monitoring/i, weight: 45, description: "Credit Monitoring Service" },
      { pattern: /Your TransUnion Credit Report/i, weight: 35, description: "Monitoring Report Title" },
      { pattern: /TransUnion/i, weight: 30, description: "Name Match" },
      { pattern: /My TransUnion/i, weight: 25, description: "Member Portal" },
      { pattern: /transunion\.ca/i, weight: 40, description: "Domain Match" },
      { pattern: /member\.transunion\.ca/i, weight: 40, description: "Member Portal Domain" },
      { pattern: /Consumer Relations/i, weight: 20, description: "Department Match" },
      { pattern: /Credit Monitoring/i, weight: 20, description: "Monitoring Service" },
      { pattern: /Online Personal Credit Reports/i, weight: 15, description: "Online Report Type" },
      { pattern: /1-?800-?663-?9980/, weight: 60, description: "Phone Number" },
      { pattern: /Hamilton/i, weight: 15, description: "City Match" },
      { pattern: /L8L\s*7W2/i, weight: 40, description: "Postal Code Match" },
      { pattern: /Box 338/i, weight: 20, description: "PO Box Match" },
    ],
  },
];

/**
 * Analyzes text content to determine which Canadian credit bureau issued the report.
 * Uses a weighted scoring system based on keywords, phone numbers, and address patterns.
 *
 * @param text The raw text content from a credit report
 * @returns The detected bureau with confidence score, or null if confidence is too low (< 30%)
 */
export function detectBureauFromText(text: string): DetectedBureau | null {
  if (!text) return null;

  let bestMatch: DetectedBureau | null = null;
  let highestScore = 0;

  // Analyze against each bureau definition
  for (const bureau of BUREAUS) {
    let score = 0;
    const matchedPatterns: string[] = [];
    const uniqueMatches = new Set<string>();

    for (const p of bureau.patterns) {
      const isMatch =
        typeof p.pattern === "string"
          ? text.includes(p.pattern)
          : p.pattern.test(text);

      if (isMatch) {
        // Prevent double counting similar patterns if needed, 
        // but here we allow accumulation to build confidence.
        // We use a Set to ensure we don't list the same description twice in the output
        // if we had multiple regexes for the same thing (not the case here currently).
        
        score += p.weight;
        if (!uniqueMatches.has(p.description)) {
          matchedPatterns.push(p.description);
          uniqueMatches.add(p.description);
        }
      }
    }

    // Cap confidence at 100
    const confidence = Math.min(100, score);

    if (confidence > highestScore) {
      highestScore = confidence;
      bestMatch = {
        bureauName: bureau.name,
        confidence,
        matchedPatterns,
      };
    }
  }

  // Threshold check
  if (bestMatch && bestMatch.confidence >= 30) {
    console.log(
      `[BureauDetector] Detected: ${bestMatch.bureauName} (${bestMatch.confidence}% confidence). Patterns: [${bestMatch.matchedPatterns.join(", ")}]`
    );
    return bestMatch;
  }

  return null;
}

/**
 * Convenience wrapper that extracts text from a base64 PDF and detects the bureau.
 *
 * @param base64Data The base64 encoded PDF string
 * @returns Promise resolving to the detected bureau or null
 */
export async function detectBureauFromPdf(
  base64Data: string
): Promise<DetectedBureau | null> {
  try {
    const text = await extractTextFromPdf(base64Data);
    if (!text) {
      console.warn("[BureauDetector] PDF text extraction returned empty string.");
      return null;
    }
    return detectBureauFromText(text);
  } catch (error) {
    console.error("[BureauDetector] Failed to detect bureau from PDF:", error);
    return null;
  }
}