import type { DisputeVectorType } from "./obligationVectors";
import type { ViolationCategory } from "./schema";

/**
 * Maps a compliance violation category to the most appropriate dispute vector.
 *
 * Note: Some vector types used here (e.g., 'TEMPORAL', 'CHAIN_OF_TITLE') are
 * conceptual extensions of the base DisputeVectorType and are cast to ensure
 * compatibility with the packet generation workflow.
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
      return "TEMPORAL" as DisputeVectorType;

    case "BALANCE_CALCULATION_VIOLATION":
    case "CREDIT_LIMIT_MANIPULATION":
    case "CLOSED_ACCOUNT_BALANCE_INFLATION":
      return "VERIFICATION_OF_DEBT" as DisputeVectorType;

    case "CROSS_ENTITY_DISCREPANCY":
    case "CROSS_BUREAU_INCONSISTENCY":
      return "CROSS_ENTITY" as DisputeVectorType;

    case "DOCUMENTATION_CHAIN_FAILURE":
      // DOFD-missing violations should use STATUTE_LIMITATIONS vector since
      // the strategic argument is about SOL obstruction, not chain of title
      if (technicalDetails?.fieldName === "dateOfFirstDelinquency") {
        return "STATUTE_LIMITATIONS" as DisputeVectorType;
      }
      return "CHAIN_OF_TITLE" as DisputeVectorType;

    case "COLLECTOR_PAYMENT_ACKNOWLEDGMENT_VIOLATION":
    case "PHANTOM_DEBT_UNVERIFIABLE":
    case "ZOMBIE_DEBT_RESURRECTION":
      return "CHAIN_OF_TITLE" as DisputeVectorType;

    case "STATUTE_OF_LIMITATIONS":
    case "COLLECTOR_STATUTE_REVIVAL_ATTEMPT":
    case "COLLECTION_LIMITATION_EXCEEDED":
      return "STATUTE_LIMITATIONS" as DisputeVectorType;

    case "PROCEDURAL_TIMING_VIOLATION":
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
      return "PROCEDURAL" as DisputeVectorType;

    case "IDENTITY_THEFT_VIOLATION":
    case "BUREAU_ACCESS_VIOLATION":
    case "MIXED_FILE_PERSONAL_INFO_MISMATCH":
    case "FREEZE_PERIOD_VIOLATION":
      return "IDENTITY" as DisputeVectorType;

    case "ACCOUNT_STATUS_INCONSISTENCY":
    case "FURNISHER_STATUS_CODE_MISMATCH":
    case "BUREAU_DISPUTE_MARKING_FAILURE":
    case "FURNISHER_JOINT_ACCOUNT_VIOLATION":
    case "FURNISHER_AUTHORIZED_USER_MISREPRESENTATION":
      return "STATUS_ACCURACY" as DisputeVectorType;

    case "METRO2_FIELD_VIOLATIONS" as any:
    case "METRO2_RULESET_VIOLATIONS" as any:
    case "DATE_LOGIC_IMPOSSIBLE":
      return "METRO2_COMPLIANCE" as DisputeVectorType;

    case "COLLECTOR_DUPLICATE_REPORTING":
    case "COLLECTOR_LICENSE_FAILURE":
    case "COLLECTOR_UNAUTHORIZED_FEES":
    case "MULTIPLE_COLLECTOR_VIOLATION":
      return "COLLECTOR_VIOLATIONS" as DisputeVectorType;

    default:
      // Fallback for generic response issues
      if (category.startsWith("RESPONSE_")) {
        return "PROCEDURAL" as DisputeVectorType;
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
        vector: "STATUTE_LIMITATIONS" as DisputeVectorType,
        reason: "The recommended action suggests a challenge based on statutory limitation periods.",
      };
    }

    if (action.includes("identity") || action.includes("fraud")) {
      return {
        vector: "IDENTITY" as DisputeVectorType,
        reason: "The recommended action indicates potential identity theft or unauthorized access.",
      };
    }

    if (action.includes("metro2") || action.includes("format")) {
      return {
        vector: "METRO2_COMPLIANCE" as DisputeVectorType,
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
    case "TEMPORAL":
      return `Violations of type ${category} involve date manipulation or re-aging, which are best addressed by challenging the reporting timeline.`;
    case "VERIFICATION_OF_DEBT":
      return `Financial discrepancies in ${category} require a formal verification of the debt calculation and balance accuracy.`;
    case "CROSS_ENTITY":
      return `Inconsistencies between different bureaus or entities suggest a failure in data integrity across the reporting ecosystem.`;
    case "CHAIN_OF_TITLE":
      return `Documentation failures regarding ownership or validation rights are best challenged by demanding proof of the chain of title.`;
    case "STATUTE_LIMITATIONS":
      return `This violation indicates the debt may be time-barred or past the legal reporting window for your province.`;
    case "PROCEDURAL":
      return `The furnisher or bureau failed to follow statutory investigation procedures or provide a quality response.`;
    case "IDENTITY":
      return `This violation suggests unauthorized account creation or access, requiring an identity-focused challenge.`;
    case "STATUS_ACCURACY":
      return `Inconsistent account status or payment history codes require a challenge to the accuracy of the reported status.`;
    case "METRO2_COMPLIANCE":
      return `Technical reporting errors in the Metro 2 data fields indicate a failure to meet industry reporting standards.`;
    case "COLLECTOR_VIOLATIONS":
      return `Specific violations by a collection agency regarding licensing or fees should be challenged using collector-specific vectors.`;
    default:
      return `Based on the ${category} classification, the ${vectorName} vector is the most effective procedural remedy.`;
  }
}