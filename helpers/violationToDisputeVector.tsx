import type { DisputeVectorType } from "./obligationVectors";
import type { ViolationCategory } from "./schema";

/**
 * Maps a compliance violation category to the most appropriate dispute vector.
 *
 * Only canonical DisputeVectorType values are returned so persisted
 * obligationInstance rows remain compatible with rotation and escalation.
 *
 * @param violationCategory - The category of the detected violation
 * @param technicalDetails - Optional technical details that refine the mapping (e.g. fieldName for DOFD)
 * @returns The suggested DisputeVectorType or null if no clear mapping exists
 */
export function mapViolationToDisputeVector(
  violationCategory: string | null | undefined,
  technicalDetails?: { fieldName?: string } | null
): DisputeVectorType | null {
  if (!violationCategory) return null;

  const category = violationCategory as ViolationCategory;

  // Mapping logic based on the violation categories from complianceScanner
  switch (category) {
    case "TEMPORAL_MANIPULATION":
    case "FURNISHER_REAGING_VIOLATION":
    case "RETROACTIVE_HISTORY_MANIPULATION":
    case "LAST_ACTIVITY_DATE_MANIPULATION":
      return "ACCURACY_ATTESTATION";

    case "BALANCE_CALCULATION_VIOLATION":
    case "CREDIT_LIMIT_MANIPULATION":
    case "CLOSED_ACCOUNT_BALANCE_INFLATION":
      return "VERIFICATION_METHOD";

    case "CROSS_ENTITY_DISCREPANCY":
    case "CROSS_BUREAU_INCONSISTENCY":
      return "ACCURACY_ATTESTATION";

    case "DOCUMENTATION_CHAIN_FAILURE":
      if (technicalDetails?.fieldName === "dateOfFirstDelinquency") {
        return "COMPLETENESS_ATTESTATION";
      }
      return "AUTHORITY_TO_REPORT";

    case "COLLECTOR_PAYMENT_ACKNOWLEDGMENT_VIOLATION":
    case "PHANTOM_DEBT_UNVERIFIABLE":
    case "ZOMBIE_DEBT_RESURRECTION":
      return "AUTHORITY_TO_REPORT";

    case "STATUTE_OF_LIMITATIONS":
    case "COLLECTOR_STATUTE_REVIVAL_ATTEMPT":
    case "COLLECTION_LIMITATION_EXCEEDED":
      return "TIMING_COMPLIANCE";

    case "PROCEDURAL_TIMING_VIOLATION":
      return "TIMING_COMPLIANCE";

    case "CREDITOR_RESPONSE_QUALITY":
    case "FURNISHER_RESPONSE_QUALITY":
    case "BUREAU_INVESTIGATION_FAILURE":
    case "BUREAU_NOTIFICATION_FAILURE":
    case "RESPONSE_INCOMPLETE":
    case "RESPONSE_MOV_MISSING":
    case "RESPONSE_NO_DOCUMENTATION":
    case "STALE_REPORTING_FAILURE":
    case "CONSUMER_STATEMENT_SUPPRESSION":
    case "INVESTIGATION_RUBBER_STAMP":
    case "CONSENT_WITHDRAWAL_NOT_HONORED":
      return "INVESTIGATION_PROCEDURE";

    case "IDENTITY_THEFT_VIOLATION":
    case "BUREAU_ACCESS_VIOLATION":
    case "MIXED_FILE_PERSONAL_INFO_MISMATCH":
    case "FREEZE_PERIOD_VIOLATION":
      return "PERMISSIBLE_PURPOSE";

    case "ACCOUNT_STATUS_INCONSISTENCY":
    case "FURNISHER_STATUS_CODE_MISMATCH":
    case "BUREAU_DISPUTE_MARKING_FAILURE":
    case "FURNISHER_JOINT_ACCOUNT_VIOLATION":
    case "FURNISHER_AUTHORIZED_USER_MISREPRESENTATION":
      return "ACCURACY_ATTESTATION";

    case "METRO2_FIELD_VIOLATIONS" as any:
    case "METRO2_RULESET_VIOLATIONS" as any:
    case "DATE_LOGIC_IMPOSSIBLE":
      return "COMPLETENESS_ATTESTATION";

    case "COLLECTOR_DUPLICATE_REPORTING":
    case "COLLECTOR_LICENSE_FAILURE":
      return "AUTHORITY_TO_REPORT";

    case "COLLECTOR_UNAUTHORIZED_FEES":
      return "VERIFICATION_METHOD";

    case "MULTIPLE_COLLECTOR_VIOLATION":
      return "ACCURACY_ATTESTATION";

    default:
      // Fallback for generic response issues
      if (category.startsWith("RESPONSE_")) {
        return "INVESTIGATION_PROCEDURE";
      }
      return null;
  }
}

/**
 * Returns a suggested dispute vector along with a human-readable reason for the suggestion.
 *
 * @param violation - The violation object containing category, recommended action, and optional technical details
 * @returns An object with the suggested vector and the reasoning
 */
export function getDisputeVectorSuggestion(violation: {
  violationCategory?: string | null;
  recommendedAction?: string | null;
  technicalDetails?: { fieldName?: string } | null;
}): { vector: DisputeVectorType | null; reason: string } {
  const vector = mapViolationToDisputeVector(violation.violationCategory, violation.technicalDetails);

  if (vector) {
    const reason = getReasonForVector(vector, violation.violationCategory || "this violation");
    return { vector, reason };
  }

  // If no direct category mapping, try to infer from the recommended action text
  if (violation.recommendedAction) {
    const action = violation.recommendedAction.toLowerCase();

    if (action.includes("statute") || action.includes("limitation")) {
      return {
        vector: "TIMING_COMPLIANCE",
        reason: "The recommended action suggests a challenge based on statutory limitation periods.",
      };
    }

    if (action.includes("identity") || action.includes("fraud")) {
      return {
        vector: "PERMISSIBLE_PURPOSE",
        reason: "The recommended action indicates potential identity theft or unauthorized access.",
      };
    }

    if (action.includes("metro2") || action.includes("format")) {
      return {
        vector: "COMPLETENESS_ATTESTATION",
        reason: "The recommended action points to technical reporting format (Metro 2) inconsistencies.",
      };
    }
  }

  return {
    vector: null,
    reason: "No specific dispute vector could be automatically determined. Please select the most appropriate vector manually.",
  };
}

/**
 * Internal helper to generate human-readable reasons for vector suggestions.
 */
function getReasonForVector(vector: DisputeVectorType, category: string): string {
  const vectorName = String(vector).replace(/_/g, " ");

  switch (vector as string) {
    case "AUTHORITY_TO_REPORT":
      return `The ${category} classification is best challenged by requiring proof of authority to report this account.`;
    case "PERMISSIBLE_PURPOSE":
      return `The ${category} classification raises authorization or identity concerns, so permissible purpose is the best starting point.`;
    case "VERIFICATION_METHOD":
      return `The ${category} classification requires the furnisher or bureau to explain how the disputed information was verified.`;
    case "COMPLETENESS_ATTESTATION":
      return `The ${category} classification concerns missing or incomplete data, so a completeness attestation is the strongest fit.`;
    case "ACCURACY_ATTESTATION":
      return `The ${category} classification challenges whether the reported account data is accurate.`;
    case "TIMING_COMPLIANCE":
      return `The ${category} classification depends on statutory dates or response timing, so timing compliance should be challenged.`;
    case "INVESTIGATION_PROCEDURE":
      return `The ${category} classification points to an inadequate investigation or response process.`;
    default:
      return `Based on the ${category} classification, the ${vectorName} vector is the most effective procedural remedy.`;
  }
}
