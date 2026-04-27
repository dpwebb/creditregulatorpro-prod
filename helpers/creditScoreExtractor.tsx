import { parse } from "./dateUtils";

export type ExtractedCreditScore = {
  scoreType: string;
  scoreValue: number;
  scoreDate: Date | null;
  scoreFactors: string[];
  bureauName: string | null;
  scoreRangeMin: number | null;
  scoreRangeMax: number | null;
  rawSectionText: string;
  confidence: number; // 0-100
};

/**
 * Extracts credit scores from Canadian credit report text.
 * Handles Equifax (Beacon/ERS) and TransUnion (CreditVision/Empirica) formats.
 */
export function extractCreditScores(text: string): ExtractedCreditScore[] {
  const scores: ExtractedCreditScore[] = [];
  
  // Strategy: Find sections that look like score blocks
  // We look for keywords like "Score", "Beacon", "Risk", "CreditVision" followed by a 3-digit number
  
  // Common headers for score sections
  const scoreHeaders = [
    "CREDIT SCORE",
    "RISK SCORE",
    "BEACON",
    "FICO",
    "CREDITVISION",
    "EMPIRICA",
    "SCORE INFORMATION"
  ];

  const lines = text.split('\n');
  
  // Helper to find score blocks
  let currentBlock: string[] = [];
  let inScoreBlock = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Check for start of a score section
    const isHeader = scoreHeaders.some(h => line.toUpperCase().includes(h));
    
    // Also check for explicit score lines like "Your Credit Score: 750"
    const isScoreLine = /Score.*:?\s*\d{3}/i.test(line);

    if (isHeader || (isScoreLine && !inScoreBlock)) {
      if (inScoreBlock && currentBlock.length > 0) {
        processScoreBlock(currentBlock, scores);
      }
      inScoreBlock = true;
      currentBlock = [line];
    } else if (inScoreBlock) {
      // Heuristic to end block: if we hit another major section header
      if (/^(TRADELINES|INQUIRIES|PUBLIC RECORDS|COLLECTIONS|CONSUMER INFO)/i.test(line)) {
        processScoreBlock(currentBlock, scores);
        inScoreBlock = false;
        currentBlock = [];
      } else {
        currentBlock.push(line);
      }
    }
  }
  
  // Process final block
  if (inScoreBlock && currentBlock.length > 0) {
    processScoreBlock(currentBlock, scores);
  }

  // Fallback: If no blocks were found via headers, try regex scanning the whole text for isolated score patterns
  if (scores.length === 0) {
    scanForIsolatedScores(text, scores);
  }

  console.log(`[CreditScoreExtractor] Found ${scores.length} scores`);
  return scores;
}

function processScoreBlock(lines: string[], results: ExtractedCreditScore[]) {
  const blockText = lines.join('\n');
  
  // 1. Extract Score Value (3 digits, usually 300-900)
  const scoreMatch = blockText.match(/(?:Score|Rating|Result)[\s:]+([3-9]\d{2})\b/i) || 
                     blockText.match(/\b([3-9]\d{2})\b/); // Fallback to just finding a plausible number if context is strong
  
  if (!scoreMatch) return;
  
  const scoreValue = parseInt(scoreMatch[1], 10);
  
  // 2. Extract Date
  let scoreDate: Date | null = null;
  const dateMatch = blockText.match(/Date(?:.*?:)?\s*(\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4}|[A-Za-z]{3}\s+\d{1,2},?\s+\d{4})/i);
  if (dateMatch) {
    const dateStr = dateMatch[1];
    // Try parsing standard formats
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      scoreDate = parsed;
    }
  }

  // 3. Extract Score Type/Name
  let scoreType = "Unknown Credit Score";
  if (/Beacon/i.test(blockText)) scoreType = "Equifax Beacon Score";
  else if (/ERS|Equifax Risk/i.test(blockText)) scoreType = "Equifax Risk Score";
  else if (/CreditVision/i.test(blockText)) scoreType = "TransUnion CreditVision";
  else if (/Empirica/i.test(blockText)) scoreType = "TransUnion Empirica";
  else if (/FICO/i.test(blockText)) scoreType = "FICO Score";
  
  // 4. Extract Range
  let min = 300;
  let max = 900;
  const rangeMatch = blockText.match(/(?:Range|Scale)[\s:]+(\d{3})\s*(?:-|to)\s*(\d{3})/i);
  if (rangeMatch) {
    min = parseInt(rangeMatch[1], 10);
    max = parseInt(rangeMatch[2], 10);
  }

  // 5. Extract Factors
  // Look for lines starting with numbers or codes followed by text
  const factors: string[] = [];
  const factorPatterns = [
    /^\s*\d+\.\s+(.+)$/, // "1. Too many inquiries"
    /^\s*([A-Z0-9]{2,4})\s*-\s*(.+)$/, // "001 - Serious delinquency"
    /Reason Code \d+:?\s*(.+)$/i
  ];

  for (const line of lines) {
    for (const pattern of factorPatterns) {
      const match = line.match(pattern);
      if (match) {
        // Filter out common false positives
        const text = match[match.length - 1].trim();
        if (text.length > 5 && !text.includes("Score") && !text.includes("Date")) {
          factors.push(text);
        }
      }
    }
  }

  // 6. Determine Bureau
  let bureauName: string | null = null;
  if (scoreType.includes("Equifax") || /Equifax/i.test(blockText)) bureauName = "Equifax";
  else if (scoreType.includes("TransUnion") || /TransUnion/i.test(blockText)) bureauName = "TransUnion";

  results.push({
    scoreType,
    scoreValue,
    scoreDate,
    scoreFactors: factors,
    bureauName,
    scoreRangeMin: min,
    scoreRangeMax: max,
    rawSectionText: blockText,
    confidence: 85 // Base confidence
  });
}

function scanForIsolatedScores(text: string, results: ExtractedCreditScore[]) {
  // Regex for "Score: 750" patterns
  const pattern = /(?:Credit|Risk|Beacon)?\s*Score\s*(?:is|:)?\s*([3-9]\d{2})/gi;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const scoreValue = parseInt(match[1], 10);
    // Grab surrounding context (100 chars before and after)
    const start = Math.max(0, match.index - 100);
    const end = Math.min(text.length, match.index + 100);
    const context = text.substring(start, end);
    
    results.push({
      scoreType: "Credit Score",
      scoreValue,
      scoreDate: null,
      scoreFactors: [],
      bureauName: null,
      scoreRangeMin: 300,
      scoreRangeMax: 900,
      rawSectionText: context,
      confidence: 60 // Lower confidence for isolated matches
    });
  }
}