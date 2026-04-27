import { db } from "./db";

/**
 * Cleans creditor name by removing common continuation suffixes that appear
 * when tradelines span multiple pages/sections in credit reports.
 */
function cleanCreditorName(name: string): string {
  return name
    .replace(/\s*\(continued\)\s*$/i, "")
    .replace(/\s*\(cont'd\)\s*$/i, "")
    .replace(/\s*\(cont\.\)\s*$/i, "")
    .replace(/\s*\(cont\)\s*$/i, "")
    .replace(/\s+continued\s*$/i, "")
    .replace(/\s+cont'd\s*$/i, "")
    .trim();
}

/**
 * Common abbreviations and their expanded forms for company names
 */
const ABBREVIATIONS: Record<string, string[]> = {
  ca: ["canada"],
  inc: ["incorporated", ""],
  corp: ["corporation", ""],
  co: ["company", ""],
  ltd: ["limited", ""],
  llc: ["limited liability company", ""],
  intl: ["international"],
  natl: ["national"],
  assn: ["association"],
  dept: ["department"],
  div: ["division"],
  mfg: ["manufacturing"],
  svc: ["service", "services"],
  sys: ["systems"],
  tech: ["technology", "technologies"],
};

/**
 * Legal suffixes that should be ignored when comparing company names
 */
const LEGAL_SUFFIXES = [
  "inc",
  "incorporated",
  "corp",
  "corporation",
  "co",
  "company",
  "ltd",
  "limited",
  "llc",
  "limited liability company",
];

/**
 * Normalizes a string for fuzzy matching by converting to lowercase
 * and removing special characters and extra spaces.
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Removes common legal suffixes from the end of a company name
 */
function removeLegalSuffixes(str: string): string {
  const normalized = normalizeString(str);
  const words = normalized.split(" ");
  
  // Remove legal suffixes from the end
  while (words.length > 1) {
    const lastWord = words[words.length - 1];
    if (LEGAL_SUFFIXES.includes(lastWord)) {
      words.pop();
    } else {
      break;
    }
  }
  
  return words.join(" ");
}

/**
 * Expands common abbreviations in a company name
 * Returns an array of possible expansions
 */
function expandAbbreviations(str: string): string[] {
  const normalized = normalizeString(str);
  const words = normalized.split(" ");
  
  const results: string[] = [normalized];
  
  // Check each word for abbreviations
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const expansions = ABBREVIATIONS[word];
    
    if (expansions) {
      for (const expansion of expansions) {
        const newWords = [...words];
        if (expansion === "") {
          // Remove the word
          newWords.splice(i, 1);
        } else {
          // Replace with expansion
          newWords[i] = expansion;
        }
        results.push(newWords.join(" "));
      }
    }
  }
  
  return results;
}

/**
 * Calculates word overlap similarity between two strings
 * Returns the percentage of significant words that overlap
 */
function calculateWordOverlap(str1: string, str2: string): number {
  const cleaned1 = cleanCreditorName(str1);
  const cleaned2 = cleanCreditorName(str2);
  
  // Remove legal suffixes and split into words
  const words1 = removeLegalSuffixes(cleaned1).split(" ");
  const words2 = removeLegalSuffixes(cleaned2).split(" ");
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  // Count overlapping words
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  
  let overlapCount = 0;
  for (const word of set1) {
    if (set2.has(word)) {
      overlapCount++;
    }
  }
  
  // Calculate overlap percentage based on the smaller set
  const minSize = Math.min(set1.size, set2.size);
  return minSize > 0 ? overlapCount / minSize : 0;
}

/**
 * Calculates Levenshtein distance between two strings.
 * Returns the minimum number of single-character edits needed.
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;

  // Create a 2D array for dynamic programming
  const matrix: number[][] = [];

  // Initialize first row and column
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill the matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,     // deletion
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j - 1] + 1  // substitution
        );
      }
    }
  }

  return matrix[len1][len2];
}

/**
 * Calculates similarity between two strings using multiple strategies:
 * 1. Direct Levenshtein distance
 * 2. Prefix matching
 * 3. Abbreviation expansion matching
 * 4. Comparison without legal suffixes
 * 5. Word overlap matching
 * 
 * Returns the highest similarity score from all strategies.
 */
function calculateSimilarity(str1: string, str2: string): number {
  // Clean continuation suffixes before normalization
  const cleaned1 = cleanCreditorName(str1);
  const cleaned2 = cleanCreditorName(str2);
  
  const normalized1 = normalizeString(cleaned1);
  const normalized2 = normalizeString(cleaned2);

  if (normalized1 === normalized2) return 1;
  if (normalized1.length === 0 || normalized2.length === 0) return 0;

  let maxSimilarity = 0;

  // Strategy 1: Direct Levenshtein distance
  const directDistance = levenshteinDistance(normalized1, normalized2);
  const maxLength = Math.max(normalized1.length, normalized2.length);
  const directSimilarity = 1 - directDistance / maxLength;
  maxSimilarity = Math.max(maxSimilarity, directSimilarity);

  // Strategy 2: Prefix matching
  const shorter = normalized1.length <= normalized2.length ? normalized1 : normalized2;
  const longer = normalized1.length > normalized2.length ? normalized1 : normalized2;
  
  if (longer.startsWith(shorter)) {
    const coverage = shorter.length / longer.length;
    if (coverage >= 0.8) {
      maxSimilarity = Math.max(maxSimilarity, coverage);
    }
  }

  // Strategy 3: Compare with abbreviations expanded
  const expansions1 = expandAbbreviations(cleaned1);
  const expansions2 = expandAbbreviations(cleaned2);
  
  for (const exp1 of expansions1) {
    for (const exp2 of expansions2) {
      if (exp1 === exp2) {
        return 1; // Perfect match after expansion
      }
      
      const distance = levenshteinDistance(exp1, exp2);
      const maxLen = Math.max(exp1.length, exp2.length);
      const similarity = 1 - distance / maxLen;
      maxSimilarity = Math.max(maxSimilarity, similarity);
    }
  }

  // Strategy 4: Compare without legal suffixes
  const withoutSuffixes1 = removeLegalSuffixes(cleaned1);
  const withoutSuffixes2 = removeLegalSuffixes(cleaned2);
  
  if (withoutSuffixes1 === withoutSuffixes2) {
    maxSimilarity = Math.max(maxSimilarity, 0.95); // Very high but not perfect
  } else {
    const distance = levenshteinDistance(withoutSuffixes1, withoutSuffixes2);
    const maxLen = Math.max(withoutSuffixes1.length, withoutSuffixes2.length);
    if (maxLen > 0) {
      const similarity = 1 - distance / maxLen;
      maxSimilarity = Math.max(maxSimilarity, similarity);
    }
  }

  // Strategy 5: Word overlap matching
  const wordOverlap = calculateWordOverlap(cleaned1, cleaned2);
  if (wordOverlap >= 0.8) {
    // High word overlap indicates likely match
    // Weight it slightly lower than exact string match
    maxSimilarity = Math.max(maxSimilarity, wordOverlap * 0.95);
  }

  return maxSimilarity;
}

/**
 * Finds an existing creditor with a similar name, or creates a new one.
 * Uses fuzzy matching with 80% similarity threshold.
 * 
 * @param creditorName The creditor name from the parsed tradeline
 * @returns The creditor ID (existing or newly created)
 */
export async function findOrCreateCreditor(creditorName: string): Promise<number> {
  // Get all existing creditors
  const existingCreditors = await db
    .selectFrom("creditor")
    .select(["id", "name"])
    .execute();

  // Try to find a match with 90%+ similarity
  let bestMatch: { id: number; similarity: number } | null = null;
  
  for (const creditor of existingCreditors) {
    const similarity = calculateSimilarity(creditorName, creditor.name);
    if (similarity >= 0.9) {
      if (!bestMatch || similarity > bestMatch.similarity) {
        bestMatch = { id: creditor.id, similarity };
      }
    }
  }

  if (bestMatch) {
    console.log(
      `[Creditor Matcher] Matched "${creditorName}" to existing creditor ID ${bestMatch.id} (${Math.round(bestMatch.similarity * 100)}% similarity)`
    );
    return bestMatch.id;
  }

  // No match found - create new creditor
  console.log(
    `[Creditor Matcher] Creating new creditor record for "${creditorName}"`
  );
  
  const newCreditor = await db
    .insertInto("creditor")
    .values({
      name: creditorName,
      address: null,
      contactEmail: null,
      contactPhone: null,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  console.log(
    `[Creditor Matcher] Created new creditor ID ${newCreditor.id} for "${creditorName}"`
  );

  return newCreditor.id;
}