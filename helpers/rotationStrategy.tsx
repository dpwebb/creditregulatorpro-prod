import { DisputeVectorType, DISPUTE_VECTORS } from "./obligationVectors";
import { CoherenceIssue } from "./metro2";

export const ALL_VECTORS: DisputeVectorType[] = Object.keys(DISPUTE_VECTORS) as DisputeVectorType[];

/**
 * Maps Metro2 issue codes (from metro2.tsx) to high-level dispute vectors.
 *
 * Mappings:
 * - DATE_LOGIC_DOFDR -> "ACCURACY_ATTESTATION"
 * - METRO2_COHERENCE -> "COMPLETENESS_ATTESTATION"
 * - BALANCE_RECON -> "VERIFICATION_METHOD"
 * - Default fallback -> "AUTHORITY_TO_REPORT"
 */
export function mapObligationTypeToVector(obligationType: string): DisputeVectorType {
  switch (obligationType) {
    case "DATE_LOGIC_DOFDR":
      return "ACCURACY_ATTESTATION";
    case "METRO2_COHERENCE":
      return "COMPLETENESS_ATTESTATION";
    case "BALANCE_RECON":
      return "VERIFICATION_METHOD";
    default:
      // If we encounter an unknown obligation type, we default to a generic authority challenge
      // or we could potentially map specific known strings if the system expands.
      return "AUTHORITY_TO_REPORT";
  }
}

/**
 * Selects the next best vector to use based on history.
 *
 * Strategy:
 * 1. Filter out the immediately preceding vector (no consecutive repeats).
 * 2. Score remaining vectors based on recency (least recently used gets higher priority).
 * 3. If history is empty, return a default starting vector (e.g., 'ACCURACY_ATTESTATION').
 *
 * @param lastVectors Array of previously used vector strings, ordered from most recent [0] to oldest [n].
 * @param availableVectors Optional subset of vectors to choose from. Defaults to ALL_VECTORS.
 */
export function selectNextVector(
  lastVectors: DisputeVectorType[],
  availableVectors: DisputeVectorType[] = ALL_VECTORS
): DisputeVectorType | null {
  if (availableVectors.length === 0) {
    console.warn("[RotationStrategy] No available vectors provided.");
    return null;
  }

  // If no history, pick the first available one (usually 'ACCURACY_ATTESTATION' if available)
  if (!lastVectors || lastVectors.length === 0) {
    console.log("[RotationStrategy] No history found. Selecting default:", availableVectors[0]);
    return availableVectors[0];
  }

  const lastUsed = lastVectors[0];

  // 1. Filter out the immediate last used vector to prevent consecutive repeats
  // unless it's the ONLY option available.
  let candidates = availableVectors.filter((v) => v !== lastUsed);

  if (candidates.length === 0) {
    console.log(
      "[RotationStrategy] Only one vector available and it was just used. Forced to reuse:",
      lastUsed
    );
    return availableVectors.includes(lastUsed) ? lastUsed : null;
  }

  // 2. Score candidates based on recency in the last 3 uses.
  // We want to pick the one that appears LEAST or furthest back in the recent history.
  const recentHistory = lastVectors.slice(0, 3);
  
  // Map candidates to a score. Lower score = appeared more recently = less desirable.
  const scoredCandidates = candidates.map((vector) => {
    const index = recentHistory.indexOf(vector);
    // If not found in recent history, it's a great candidate (score = 100)
    // If found at index 0 (shouldn't happen due to filter above), score = 0
    // If found at index 1, score = 1
    // If found at index 2, score = 2
    const score = index === -1 ? 100 : index;
    return { vector, score };
  });

  // Sort by score descending (higher score = better candidate)
  scoredCandidates.sort((a, b) => b.score - a.score);

  const bestChoice = scoredCandidates[0].vector;

  console.log("[RotationStrategy] Selection Logic:", {
    lastUsed,
    recentHistory,
    candidates: scoredCandidates,
    selected: bestChoice,
  });

  return bestChoice;
}

/**
 * Checks if a specific obligation should be skipped because its corresponding vector
 * was the most recently used one.
 *
 * This is useful when iterating through a list of potential Metro2 violations (obligations)
 * and deciding which one to act upon next.
 */
export function shouldSkipObligation(
  obligationType: string,
  lastVectors: DisputeVectorType[]
): boolean {
  if (!lastVectors || lastVectors.length === 0) return false;

  const mappedVector = mapObligationTypeToVector(obligationType);
  const lastVector = lastVectors[0];

  const shouldSkip = mappedVector === lastVector;

  if (shouldSkip) {
    console.log(
      `[RotationStrategy] Skipping obligation '${obligationType}' because vector '${mappedVector}' was just used.`
    );
  }

  return shouldSkip;
}