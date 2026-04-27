import {
  DISPUTE_VECTORS,
  DisputeVectorType,
} from "./obligationVectors";
import type { EquifaxDisputeReasonCode } from "./equifaxDisputeReasons";

/**
 * Challenge Access Point Definition
 *
 * Represents a procedural ingress vector for challenging a tradeline or bureau report
 * when no specific data violations are detected. These focus on authority, procedure,
 * and statutory compliance rather than data accuracy.
 */
export interface ChallengeAccessPoint {
  id: string;
  vector: DisputeVectorType;
  label: string;
  description: string;
  entityType: "BUREAU" | "CREDITOR" | "COLLECTOR";
  statutoryBasis: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  applicability: string;
}

/**
 * Simple Tradeline Interface
 * Minimal data required to determine applicability of access points.
 */
export interface SimpleTradeline {
  id: number | string;
  creditorName: string;
  accountNumber: string;
  status?: string | null;
  bureauCode?: string | null;
}

/**
 * Procedural Access Points Definitions
 *
 * A comprehensive list of all possible procedural challenges available
 * when data-specific violations are absent.
 */
export const PROCEDURAL_ACCESS_POINTS: ChallengeAccessPoint[] = [
  // --- BUREAU ACCESS POINTS ---
  {
    id: "BUREAU_AUTHORITY",
    vector: "AUTHORITY_TO_REPORT",
    label: "Bureau Authority to Report",
    description:
      "Ask the credit bureau to prove they have the right to keep this information about you.",
    entityType: "BUREAU",
    statutoryBasis: "Provincial Consumer Reporting Acts / PIPEDA",
    priority: "HIGH",
    applicability: "Applies to all reporting bureaus regardless of data content.",
  },
  {
    id: "BUREAU_INVESTIGATION",
    vector: "INVESTIGATION_PROCEDURE",
    label: "Bureau Investigation Procedure",
    description:
      "Ask the credit bureau to show you exactly how they checked if this information is correct.",
    entityType: "BUREAU",
    statutoryBasis: "Provincial CRA s. 13 (ON) and equivalents",
    priority: "MEDIUM",
    applicability: "Applies whenever a consumer questions the validity of a file.",
  },
  {
    id: "BUREAU_ACCESS",
    vector: "TIMING_COMPLIANCE", // Using Timing/Notice as proxy for access rights compliance
    label: "Consumer Access Rights Compliance",
    description:
      "Check if the credit bureau followed the rules for letting you see your own file.",
    entityType: "BUREAU",
    statutoryBasis: "FCAC Guidelines / Provincial Consumer Reporting Acts",
    priority: "LOW",
    applicability: "General procedural compliance check.",
  },

  // --- CREDITOR ACCESS POINTS ---
  {
    id: "CREDITOR_AUTHORITY",
    vector: "AUTHORITY_TO_REPORT",
    label: "Creditor Authority to Furnish",
    description:
      "Ask the creditor to prove they are legally allowed to share your data with credit bureaus.",
    entityType: "CREDITOR",
    statutoryBasis: "Data Furnisher Agreement / PIPEDA Consent Principles",
    priority: "HIGH",
    applicability: "Fundamental requirement for any data furnishing.",
  },
  {
    id: "CREDITOR_PURPOSE",
    vector: "PERMISSIBLE_PURPOSE",
    label: "Permissible Purpose Documentation",
    description:
      "Ask for proof that they had a valid reason to open this account and report it.",
    entityType: "CREDITOR",
    statutoryBasis: "PIPEDA s.7 / Provincial CRA — Permissible Purpose",
    priority: "HIGH",
    applicability: "Required for the existence of the tradeline.",
  },
  {
    id: "CREDITOR_CONSENT",
    vector: "AUTHORITY_TO_REPORT", // Closely related to authority
    label: "Consumer Consent Evidence",
    description:
      "Ask for proof that you actually agreed to let them share your private data.",
    entityType: "CREDITOR",
    statutoryBasis: "PIPEDA Schedule 1, Principle 4.3",
    priority: "MEDIUM",
    applicability: "Privacy compliance check applicable to all accounts.",
  },
  {
    id: "CREDITOR_NOTICE",
    vector: "TIMING_COMPLIANCE",
    label: "Negative Information Notice",
    description:
      "Ask them to prove they warned you before sending negative information to the credit bureau.",
    entityType: "CREDITOR",
    statutoryBasis: "FCAC CG-3 / Provincial CRA — Negative Information Notice",
    priority: "MEDIUM",
    applicability: "Applies to any account with negative history or potential for it.",
  },
  {
    id: "CREDITOR_ACCURACY",
    vector: "ACCURACY_ATTESTATION",
    label: "Accuracy Attestation Methodology",
    description:
      "Ask the creditor to explain exactly how they make sure their records about you are correct.",
    entityType: "CREDITOR",
    statutoryBasis: "Provincial CRA — Maximum Possible Accuracy Duty",
    priority: "MEDIUM",
    applicability: "Standard procedural check for data integrity systems.",
  },

  // --- COLLECTOR ACCESS POINTS ---
  {
    id: "COLLECTOR_CHAIN",
    vector: "AUTHORITY_TO_REPORT",
    label: "Chain of Title / Custody",
    description:
      "Ask the collector to prove they actually own this debt by showing all the transfer paperwork.",
    entityType: "COLLECTOR",
    statutoryBasis: "Provincial Collection Agencies Acts / Assignment Law",
    priority: "HIGH",
    applicability: "Critical for third-party debt collectors.",
  },
  {
    id: "COLLECTOR_LICENSE",
    vector: "AUTHORITY_TO_REPORT",
    label: "Collector Licensing & Authority",
    description:
      "Check if the collector has a valid license to collect debts in your province.",
    entityType: "COLLECTOR",
    statutoryBasis: "Provincial Licensing Regulations",
    priority: "HIGH",
    applicability: "Jurisdictional compliance check.",
  },
  {
    id: "COLLECTOR_VERIFICATION",
    vector: "VERIFICATION_METHOD",
    label: "Original Creditor Verification",
    description:
      "Ask the collector to get proof of the debt directly from the original creditor, not just their own files.",
    entityType: "COLLECTOR",
    statutoryBasis: "Provincial Collection Agencies Act — Validation of Debts",
    priority: "HIGH",
    applicability: "Standard validation requirement for assigned debts.",
  },
];

/**
 * Generates applicable challenge access points for a list of tradelines.
 *
 * @param tradelines Array of simple tradeline objects.
 * @returns Array of ChallengeAccessPoint objects tailored to the tradelines.
 */
export function generateAccessPointsForTradelines(
  tradelines: SimpleTradeline[],
): ChallengeAccessPoint[] {
  const accessPoints: ChallengeAccessPoint[] = [];
  const addedIds = new Set<string>();

  // Helper to add unique points
  const addPoint = (pointId: string) => {
    if (addedIds.has(pointId)) return;
    const point = PROCEDURAL_ACCESS_POINTS.find((p) => p.id === pointId);
    if (point) {
      accessPoints.push(point);
      addedIds.add(pointId);
    }
  };

  // 1. Always add foundational Bureau and Creditor points
  addPoint("BUREAU_AUTHORITY");
  addPoint("CREDITOR_AUTHORITY");
  addPoint("CREDITOR_PURPOSE");

  // 2. Analyze tradelines for specific entity types
  let hasCollector = false;
  let hasNegative = false;

  for (const tl of tradelines) {
    const name = tl.creditorName.toLowerCase();
    const status = tl.status?.toLowerCase() || "";

    // Heuristic for Collection Agencies
    if (
      name.includes("collection") ||
      name.includes("recover") ||
      name.includes("portfolio") ||
      name.includes("receivable") ||
      name.includes("agency") ||
      status.includes("collection") ||
      status.includes("charged off") // Often implies sold to collector
    ) {
      hasCollector = true;
    }

    // Heuristic for Negative Info (broad check)
    if (
      status.includes("late") ||
      status.includes("past due") ||
      status.includes("collection") ||
      status.includes("charged off") ||
      status.includes("repossession")
    ) {
      hasNegative = true;
    }
  }

  // 3. Add conditional points based on analysis
  if (hasCollector) {
    addPoint("COLLECTOR_CHAIN");
    addPoint("COLLECTOR_LICENSE");
    addPoint("COLLECTOR_VERIFICATION");
  }

  if (hasNegative) {
    addPoint("CREDITOR_NOTICE");
    addPoint("BUREAU_INVESTIGATION");
  }

  // 4. Fill with general procedural points if list is short
  if (accessPoints.length < 5) {
    addPoint("CREDITOR_ACCURACY");
    addPoint("CREDITOR_CONSENT");
    addPoint("BUREAU_ACCESS");
  }

  return accessPoints;
}

/**
 * Maps a Challenge Access Point ID to its most appropriate Equifax dispute reason code.
 *
 * @param accessPointId The ID of the challenge access point
 * @returns The corresponding EquifaxDisputeReasonCode
 */
export function mapAccessPointToDisputeReasonCode(
  accessPointId: string,
): EquifaxDisputeReasonCode {
  switch (accessPointId) {
    case "BUREAU_AUTHORITY":
    case "CREDITOR_AUTHORITY":
    case "CREDITOR_PURPOSE":
    case "CREDITOR_CONSENT":
    case "COLLECTOR_CHAIN":
    case "COLLECTOR_LICENSE":
      return "ACCOUNT_NOT_MINE";
    case "BUREAU_INVESTIGATION":
    case "BUREAU_ACCESS":
    case "CREDITOR_NOTICE":
    case "CREDITOR_ACCURACY":
    case "COLLECTOR_VERIFICATION":
    default:
      return "OTHER";
  }
}

/**
 * Looks up a challenge access point by its ID.
 *
 * @param id The ID of the access point
 * @returns The ChallengeAccessPoint object or undefined if not found
 */
export function getAccessPointById(id: string): ChallengeAccessPoint | undefined {
  return PROCEDURAL_ACCESS_POINTS.find((point) => point.id === id);
}

/**
 * Generates a standard set of procedural access points when no specific tradeline details are available.
 * Useful for initial system setup or when only aggregate counts are known.
 *
 * @param tradelineCount The number of tradelines (used to scale importance, though logic remains similar).
 * @returns Array of standard ChallengeAccessPoint objects.
 */
export function generateAccessPointsWhenNoViolations(
  tradelineCount: number,
): ChallengeAccessPoint[] {
  const accessPoints: ChallengeAccessPoint[] = [];
  const addedIds = new Set<string>();

  const addPoint = (pointId: string) => {
    if (addedIds.has(pointId)) return;
    const point = PROCEDURAL_ACCESS_POINTS.find((p) => p.id === pointId);
    if (point) {
      accessPoints.push(point);
      addedIds.add(pointId);
    }
  };

  // Always return a robust mix of Bureau and Creditor challenges
  // These are "safe" procedural attacks that don't rely on specific data errors.

  // Bureau Level
  addPoint("BUREAU_AUTHORITY");
  addPoint("BUREAU_INVESTIGATION");

  // Creditor Level (Foundational)
  addPoint("CREDITOR_AUTHORITY");
  addPoint("CREDITOR_PURPOSE");

  // Creditor Level (Procedural)
  addPoint("CREDITOR_ACCURACY");
  addPoint("CREDITOR_CONSENT");

  // If we have many tradelines, assume at least one might be a collector or negative,
  // so we add a generic collector point as a potential avenue.
  if (tradelineCount > 0) {
    // We add this tentatively; in a real UI, the user might select if it applies.
    // For "no violations found", we want to offer options.
    addPoint("COLLECTOR_LICENSE");
  }

  return accessPoints;
}