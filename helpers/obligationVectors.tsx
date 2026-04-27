/**
 * Obligation Vectors Definition
 *
 * Defines the adversarial dispute vectors and rotation strategies used to test
 * creditor compliance without ever admitting debt validity.
 */

export type DisputeVectorType =
  | "AUTHORITY_TO_REPORT"
  | "PERMISSIBLE_PURPOSE"
  | "VERIFICATION_METHOD"
  | "COMPLETENESS_ATTESTATION"
  | "ACCURACY_ATTESTATION"
  | "TIMING_COMPLIANCE"
  | "INVESTIGATION_PROCEDURE";

export interface DisputeVector {
  type: DisputeVectorType;
  label: string;
  description: string;
  statutoryBasis: string; // e.g., "Provincial CRA — Maximum possible accuracy requirement" or generic reference
}

export const DISPUTE_VECTORS: Record<DisputeVectorType, DisputeVector> = {
  AUTHORITY_TO_REPORT: {
    type: "AUTHORITY_TO_REPORT",
    label: "Authority to Report",
    description: "Demonstrate statutory authority to report this account",
    statutoryBasis: "Consumer Reporting Act (provincial) — Duty to report only authorized information",
  },
  PERMISSIBLE_PURPOSE: {
    type: "PERMISSIBLE_PURPOSE",
    label: "Permissible Purpose",
    description:
      "Provide documentation of permissible purpose for account creation",
    statutoryBasis: "PIPEDA s.7 / Provincial CRA — Permissible purpose for accessing consumer report",
  },
  VERIFICATION_METHOD: {
    type: "VERIFICATION_METHOD",
    label: "Verification Method",
    description: "Disclose specific method used to verify disputed information",
    statutoryBasis: "Provincial CRA — Duty to disclose method of verification upon reinvestigation",
  },
  COMPLETENESS_ATTESTATION: {
    type: "COMPLETENESS_ATTESTATION",
    label: "Completeness Attestation",
    description: "Attest to completeness of data elements reported",
    statutoryBasis: "Provincial CRA — Duty to ensure completeness of reported data",
  },
  ACCURACY_ATTESTATION: {
    type: "ACCURACY_ATTESTATION",
    label: "Accuracy Attestation",
    description: "Provide procedural basis for accuracy claim",
    statutoryBasis: "Provincial CRA — Maximum possible accuracy requirement",
  },
  TIMING_COMPLIANCE: {
    type: "TIMING_COMPLIANCE",
    label: "Timing Compliance",
    description:
      "Document compliance with statutory notice/timing requirements",
    statutoryBasis: "Provincial CRA — Statutory timeline for investigation completion",
  },
  INVESTIGATION_PROCEDURE: {
    type: "INVESTIGATION_PROCEDURE",
    label: "Investigation Procedure",
    description: "Detail investigation procedure and findings",
    statutoryBasis: "Provincial CRA — Obligation to conduct reasonable reinvestigation",
  },
};

/**
 * Obligation Sequence Strategy (Rotation Logic)
 *
 * Defines the order in which vectors should be applied to exhaust procedural remedies.
 */
export const OBLIGATION_SEQUENCES = [
  {
    sequenceId: 1,
    name: "Foundational Challenge",
    vectors: [
      DISPUTE_VECTORS.AUTHORITY_TO_REPORT,
      DISPUTE_VECTORS.PERMISSIBLE_PURPOSE,
    ],
  },
  {
    sequenceId: 2,
    name: "Methodological Challenge",
    vectors: [
      DISPUTE_VECTORS.VERIFICATION_METHOD,
      DISPUTE_VECTORS.COMPLETENESS_ATTESTATION,
    ],
  },
  {
    sequenceId: 3,
    name: "Substantive Procedural Challenge",
    vectors: [
      DISPUTE_VECTORS.ACCURACY_ATTESTATION,
      DISPUTE_VECTORS.INVESTIGATION_PROCEDURE,
    ],
  },
  {
    sequenceId: 4,
    name: "Procedural Exhaustion",
    vectors: [DISPUTE_VECTORS.TIMING_COMPLIANCE],
  },
];

/**
 * Statutory Timing Requirements
 *
 * Defines the expected response window for different obligation types.
 * Note: These are defaults and may be overridden by specific jurisdiction rules.
 */
export const STATUTORY_TIMING_DEFAULTS: Record<DisputeVectorType, number> = {
  AUTHORITY_TO_REPORT: 30,
  PERMISSIBLE_PURPOSE: 30,
  VERIFICATION_METHOD: 15, // Often shorter for method of verification requests
  COMPLETENESS_ATTESTATION: 30,
  ACCURACY_ATTESTATION: 30,
  TIMING_COMPLIANCE: 30,
  INVESTIGATION_PROCEDURE: 30,
};

/**
 * Response Deficiency Detection Rules
 *
 * Keywords or patterns that indicate a response is insufficient or generic.
 */
export const DEFICIENCY_PATTERNS = {
  GENERIC_VERIFICATION: [
    "verified as accurate",
    "account information matches",
    "confirmed with creditor",
    "accurate as reported",
  ],
  DISMISSIVE_LANGUAGE: [
    "frivolous",
    "irrelevant",
    "previously investigated",
    "refer to prior correspondence",
  ],
  MISSING_ATTESTATION: [
    // Logic: If response doesn't contain specific affirmative words, it might be deficient
    // This is usually an inverse check, but here we list what indicates a failure to attest
    "unable to provide",
    "proprietary information",
    "policy prohibits",
  ],
};
