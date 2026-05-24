export const FINDING_TAXONOMY_VERSION = "finding-taxonomy-v1" as const;

export interface FindingTaxonomyEntry {
  stableId: string;
  canonicalCode: string;
  displayLabel: string;
  description: string;
  legacyTerms: string[];
}

export const FINDING_TAXONOMY_ALIASES: Record<string, FindingTaxonomyEntry> = {
  ACCOUNT_STATUS_INCONSISTENCY: {
    stableId: "ACCOUNT_STATUS_INCONSISTENCY",
    canonicalCode: "ACCOUNT_STATUS_INCONSISTENCY",
    displayLabel: "Account status inconsistency",
    description: "Conflicting account status information should be reviewed for accuracy.",
    legacyTerms: [],
  },
  BALANCE_CALCULATION_VIOLATION: {
    stableId: "BALANCE_CALCULATION_VIOLATION",
    canonicalCode: "BALANCE_REPORTING_INCONSISTENCY",
    displayLabel: "Balance reporting inconsistency",
    description: "Reported balance information does not align with the available account records.",
    legacyTerms: ["balance calculation violation"],
  },
  BANKRUPTCY_DISCHARGE_VIOLATION: {
    stableId: "BANKRUPTCY_DISCHARGE_VIOLATION",
    canonicalCode: "BANKRUPTCY_STATUS_REPORTING_ISSUE",
    displayLabel: "Bankruptcy status reporting issue",
    description: "Reported account status may not reflect bankruptcy discharge information.",
    legacyTerms: ["bankruptcy discharge violation"],
  },
  BUREAU_ACCESS_VIOLATION: {
    stableId: "BUREAU_ACCESS_VIOLATION",
    canonicalCode: "ACCESS_AUTHORIZATION_REVIEW",
    displayLabel: "Access authorization review",
    description: "Credit file access or disclosure should be reviewed for support.",
    legacyTerms: ["bureau access violation"],
  },
  BUREAU_DISPUTE_MARKING_FAILURE: {
    stableId: "BUREAU_DISPUTE_MARKING_FAILURE",
    canonicalCode: "DISPUTE_STATUS_REPORTING_ISSUE",
    displayLabel: "Dispute status reporting issue",
    description: "The report may not reflect an active dispute status.",
    legacyTerms: ["bureau dispute marking failure"],
  },
  BUREAU_INVESTIGATION_FAILURE: {
    stableId: "BUREAU_INVESTIGATION_FAILURE",
    canonicalCode: "INVESTIGATION_RESPONSE_ISSUE",
    displayLabel: "Investigation response issue",
    description: "The bureau response or investigation record needs review.",
    legacyTerms: ["bureau investigation failure"],
  },
  BUREAU_NOTIFICATION_FAILURE: {
    stableId: "BUREAU_NOTIFICATION_FAILURE",
    canonicalCode: "BUREAU_NOTICE_REVIEW",
    displayLabel: "Bureau notice review",
    description: "Required notice or communication records need review.",
    legacyTerms: ["bureau notification failure"],
  },
  BUREAU_REINSERTION_VIOLATION: {
    stableId: "BUREAU_REINSERTION_VIOLATION",
    canonicalCode: "REINSERTED_ITEM_REVIEW",
    displayLabel: "Reinserted item review",
    description: "A reappearing item should be reviewed for support and notice.",
    legacyTerms: ["bureau reinsertion violation"],
  },
  CLOSED_ACCOUNT_BALANCE_INFLATION: {
    stableId: "CLOSED_ACCOUNT_BALANCE_INFLATION",
    canonicalCode: "CLOSED_ACCOUNT_BALANCE_INCREASE",
    displayLabel: "Closed account balance increase",
    description: "A closed account balance appears inconsistent with the account status.",
    legacyTerms: ["closed account balance inflation"],
  },
  COLLECTION_LIMITATION_EXCEEDED: {
    stableId: "COLLECTION_LIMITATION_EXCEEDED",
    canonicalCode: "COLLECTION_LIMITATION_REVIEW",
    displayLabel: "Collection limitation review",
    description: "Collection reporting should be reviewed against the applicable limitation period.",
    legacyTerms: ["collection limitation exceeded"],
  },
  COLLECTOR_DUPLICATE_REPORTING: {
    stableId: "COLLECTOR_DUPLICATE_REPORTING",
    canonicalCode: "DUPLICATE_COLLECTION_REPORTING",
    displayLabel: "Duplicate collection reporting",
    description: "The same collection account appears more than once.",
    legacyTerms: [],
  },
  COLLECTOR_LICENSE_FAILURE: {
    stableId: "COLLECTOR_LICENSE_FAILURE",
    canonicalCode: "COLLECTION_IDENTITY_VERIFICATION",
    displayLabel: "Collection identity verification",
    description: "The collection agency identity or licensing record should be verified.",
    legacyTerms: ["collector license failure"],
  },
  COLLECTOR_PAYMENT_ACKNOWLEDGMENT_VIOLATION: {
    stableId: "COLLECTOR_PAYMENT_ACKNOWLEDGMENT_VIOLATION",
    canonicalCode: "PAYMENT_ACKNOWLEDGMENT_REVIEW",
    displayLabel: "Payment acknowledgement review",
    description: "A reported collection balance may not reflect a recorded payment.",
    legacyTerms: ["collector payment acknowledgment violation"],
  },
  COLLECTOR_STATUTE_REVIVAL_ATTEMPT: {
    stableId: "COLLECTOR_STATUTE_REVIVAL_ATTEMPT",
    canonicalCode: "COLLECTION_DATE_REVIVAL_REVIEW",
    displayLabel: "Collection date revival review",
    description: "Collection dates appear to require limitation-period review.",
    legacyTerms: ["collector statute revival attempt"],
  },
  COLLECTOR_UNAUTHORIZED_FEES: {
    stableId: "COLLECTOR_UNAUTHORIZED_FEES",
    canonicalCode: "COLLECTION_FEE_SUPPORT_REVIEW",
    displayLabel: "Collection fee support review",
    description: "Fees or interest in the reported balance need supporting records.",
    legacyTerms: ["collector unauthorized fees"],
  },
  CONSENT_WITHDRAWAL_NOT_HONORED: {
    stableId: "CONSENT_WITHDRAWAL_NOT_HONORED",
    canonicalCode: "CONSENT_WITHDRAWAL_REVIEW",
    displayLabel: "Consent withdrawal review",
    description: "Continued reporting should be reviewed against recorded consent status.",
    legacyTerms: [],
  },
  CONSUMER_STATEMENT_SUPPRESSION: {
    stableId: "CONSUMER_STATEMENT_SUPPRESSION",
    canonicalCode: "CONSUMER_STATEMENT_DISPLAY_REVIEW",
    displayLabel: "Consumer statement display review",
    description: "A consumer statement or alert may not appear as expected.",
    legacyTerms: ["consumer statement suppression"],
  },
  CREDIT_LIMIT_MANIPULATION: {
    stableId: "CREDIT_LIMIT_MANIPULATION",
    canonicalCode: "CREDIT_LIMIT_REPORTING_INCONSISTENCY",
    displayLabel: "Credit limit reporting inconsistency",
    description: "Credit limit reporting differs from available account records.",
    legacyTerms: ["credit limit manipulation"],
  },
  CREDITOR_RESPONSE_QUALITY: {
    stableId: "CREDITOR_RESPONSE_QUALITY",
    canonicalCode: "CREDITOR_RESPONSE_REVIEW",
    displayLabel: "Creditor response review",
    description: "A creditor response needs review for completeness and support.",
    legacyTerms: [],
  },
  CROSS_BUREAU_INCONSISTENCY: {
    stableId: "CROSS_BUREAU_INCONSISTENCY",
    canonicalCode: "CROSS_BUREAU_DATA_MISMATCH",
    displayLabel: "Cross-bureau data mismatch",
    description: "Different bureaus report different information for the same account.",
    legacyTerms: [],
  },
  CROSS_ENTITY_DISCREPANCY: {
    stableId: "CROSS_ENTITY_DISCREPANCY",
    canonicalCode: "CROSS_ENTITY_DATA_MISMATCH",
    displayLabel: "Cross-entity data mismatch",
    description: "Different reporting entities show conflicting account information.",
    legacyTerms: [],
  },
  DATE_LOGIC_IMPOSSIBLE: {
    stableId: "DATE_LOGIC_IMPOSSIBLE",
    canonicalCode: "REPORTING_CHRONOLOGY_CONFLICT",
    displayLabel: "Reporting chronology conflict",
    description: "Reported account dates do not form a coherent chronology.",
    legacyTerms: ["date logic impossible"],
  },
  DISCLOSURE_DEFICIENCY: {
    stableId: "DISCLOSURE_DEFICIENCY",
    canonicalCode: "DISCLOSURE_COMPLETENESS_REVIEW",
    displayLabel: "Disclosure completeness review",
    description: "A disclosure or account detail may be incomplete.",
    legacyTerms: [],
  },
  DOCUMENTATION_CHAIN_FAILURE: {
    stableId: "DOCUMENTATION_CHAIN_FAILURE",
    canonicalCode: "INCOMPLETE_ACCOUNT_DOCUMENTATION",
    displayLabel: "Incomplete account documentation",
    description: "Account support or identifying information is incomplete.",
    legacyTerms: ["documentation chain failure"],
  },
  FREEZE_PERIOD_VIOLATION: {
    stableId: "FREEZE_PERIOD_VIOLATION",
    canonicalCode: "FREEZE_PERIOD_ACTIVITY_REVIEW",
    displayLabel: "Freeze-period activity review",
    description: "Activity during a security freeze should be reviewed for support.",
    legacyTerms: ["freeze period violation"],
  },
  FURNISHER_AUTHORIZED_USER_MISREPRESENTATION: {
    stableId: "FURNISHER_AUTHORIZED_USER_MISREPRESENTATION",
    canonicalCode: "AUTHORIZED_USER_STATUS_MISMATCH",
    displayLabel: "Authorized-user status mismatch",
    description: "Reported responsibility status may not match account records.",
    legacyTerms: ["authorized user misrepresentation"],
  },
  FURNISHER_JOINT_ACCOUNT_VIOLATION: {
    stableId: "FURNISHER_JOINT_ACCOUNT_VIOLATION",
    canonicalCode: "JOINT_ACCOUNT_STATUS_MISMATCH",
    displayLabel: "Joint account status mismatch",
    description: "Reported responsibility status may not match joint-account records.",
    legacyTerms: ["furnisher joint account violation"],
  },
  FURNISHER_POST_DISPUTE_RETALIATION: {
    stableId: "FURNISHER_POST_DISPUTE_RETALIATION",
    canonicalCode: "POST_DISPUTE_REPORTING_CHANGE",
    displayLabel: "Post-dispute reporting change",
    description: "A negative reporting change after a dispute should be reviewed for support.",
    legacyTerms: ["post-dispute retaliation"],
  },
  FURNISHER_REAGING_VIOLATION: {
    stableId: "FURNISHER_REAGING_VIOLATION",
    canonicalCode: "REPORTING_CHRONOLOGY_CONFLICT",
    displayLabel: "Reporting chronology conflict",
    description: "Reported account dates may extend the reporting period beyond source records.",
    legacyTerms: ["furnisher reaging violation"],
  },
  FURNISHER_RESPONSE_QUALITY: {
    stableId: "FURNISHER_RESPONSE_QUALITY",
    canonicalCode: "FURNISHER_RESPONSE_REVIEW",
    displayLabel: "Furnisher response review",
    description: "A furnisher response needs review for completeness and support.",
    legacyTerms: [],
  },
  FURNISHER_STATUS_CODE_MISMATCH: {
    stableId: "FURNISHER_STATUS_CODE_MISMATCH",
    canonicalCode: "STATUS_CODE_MISMATCH",
    displayLabel: "Status code mismatch",
    description: "Reported status coding conflicts with other account information.",
    legacyTerms: [],
  },
  IDENTITY_THEFT_VIOLATION: {
    stableId: "IDENTITY_THEFT_VIOLATION",
    canonicalCode: "UNAUTHORIZED_ACTIVITY_REVIEW",
    displayLabel: "Unauthorized activity review",
    description: "The account has indicators that require identity or authorization review.",
    legacyTerms: ["identity theft violation", "fraud indicator"],
  },
  INVESTIGATION_RUBBER_STAMP: {
    stableId: "INVESTIGATION_RUBBER_STAMP",
    canonicalCode: "INVESTIGATION_RESPONSE_QUALITY",
    displayLabel: "Investigation response quality",
    description: "The investigation response appears generic or incomplete.",
    legacyTerms: ["investigation rubber stamp"],
  },
  LAST_ACTIVITY_DATE_MANIPULATION: {
    stableId: "LAST_ACTIVITY_DATE_MANIPULATION",
    canonicalCode: "LAST_ACTIVITY_DATE_CONFLICT",
    displayLabel: "Last activity date conflict",
    description: "The reported last-activity date conflicts with source information.",
    legacyTerms: ["last activity date manipulation"],
  },
  MIXED_FILE_PERSONAL_INFO_MISMATCH: {
    stableId: "MIXED_FILE_PERSONAL_INFO_MISMATCH",
    canonicalCode: "PERSONAL_INFORMATION_MISMATCH",
    displayLabel: "Personal information mismatch",
    description: "Personal information does not match the consumer record.",
    legacyTerms: [],
  },
  MULTIPLE_COLLECTOR_VIOLATION: {
    stableId: "MULTIPLE_COLLECTOR_VIOLATION",
    canonicalCode: "COLLECTION_REPORTING_AMBIGUITY",
    displayLabel: "Collection reporting ambiguity",
    description: "More than one collector appears connected to the same debt.",
    legacyTerms: ["multiple collector violation", "collection chain failure"],
  },
  PAYMENT_HISTORY_MANIPULATION: {
    stableId: "PAYMENT_HISTORY_MANIPULATION",
    canonicalCode: "PAYMENT_HISTORY_INCONSISTENCY",
    displayLabel: "Payment history inconsistency",
    description: "Payment history reporting conflicts with the available record.",
    legacyTerms: ["payment history manipulation"],
  },
  PHANTOM_DEBT_UNVERIFIABLE: {
    stableId: "PHANTOM_DEBT_UNVERIFIABLE",
    canonicalCode: "UNVERIFIABLE_COLLECTION_IDENTITY",
    displayLabel: "Unverifiable collection identity",
    description: "The reported collection account cannot be connected to a clear source record.",
    legacyTerms: ["phantom debt unverifiable", "phantom debt"],
  },
  PROCEDURAL_TIMING_VIOLATION: {
    stableId: "PROCEDURAL_TIMING_VIOLATION",
    canonicalCode: "RESPONSE_TIMING_REVIEW",
    displayLabel: "Response timing review",
    description: "Response timing should be reviewed against the mapped timeframe.",
    legacyTerms: ["procedural timing violation"],
  },
  RESPONSE_ADDRESS_MISMATCH: {
    stableId: "RESPONSE_ADDRESS_MISMATCH",
    canonicalCode: "RESPONSE_ADDRESS_MISMATCH",
    displayLabel: "Response address mismatch",
    description: "A response address does not match the expected consumer address.",
    legacyTerms: [],
  },
  RESPONSE_INCOMPLETE: {
    stableId: "RESPONSE_INCOMPLETE",
    canonicalCode: "INCOMPLETE_RESPONSE",
    displayLabel: "Incomplete response",
    description: "A response appears incomplete or unsupported.",
    legacyTerms: [],
  },
  RESPONSE_MOV_MISSING: {
    stableId: "RESPONSE_MOV_MISSING",
    canonicalCode: "METHOD_OF_VERIFICATION_MISSING",
    displayLabel: "Method of verification missing",
    description: "The response does not show how the information was verified.",
    legacyTerms: [],
  },
  RESPONSE_NO_DOCUMENTATION: {
    stableId: "RESPONSE_NO_DOCUMENTATION",
    canonicalCode: "UNSUPPORTED_RESPONSE",
    displayLabel: "Unsupported response",
    description: "A response does not include supporting records.",
    legacyTerms: [],
  },
  RESPONSE_UNAUTHORIZED: {
    stableId: "RESPONSE_UNAUTHORIZED",
    canonicalCode: "RESPONSE_SOURCE_MISMATCH",
    displayLabel: "Response source mismatch",
    description: "A response appears to come from an unexpected source.",
    legacyTerms: ["response unauthorized"],
  },
  RETROACTIVE_HISTORY_MANIPULATION: {
    stableId: "RETROACTIVE_HISTORY_MANIPULATION",
    canonicalCode: "RETROACTIVE_HISTORY_CONFLICT",
    displayLabel: "Retroactive history conflict",
    description: "Previously reported account history changed in a way that needs support.",
    legacyTerms: ["retroactive history manipulation"],
  },
  STALE_REPORTING_FAILURE: {
    stableId: "STALE_REPORTING_FAILURE",
    canonicalCode: "STALE_REPORTING_REVIEW",
    displayLabel: "Stale reporting review",
    description: "Reported account information may not reflect current records.",
    legacyTerms: ["stale reporting failure"],
  },
  STATUTE_APPROACHING: {
    stableId: "STATUTE_APPROACHING",
    canonicalCode: "REPORTING_PERIOD_REVIEW",
    displayLabel: "Reporting period review",
    description: "The account is approaching the expected reporting-period review date.",
    legacyTerms: ["statute approaching"],
  },
  STATUTE_OF_LIMITATIONS: {
    stableId: "STATUTE_OF_LIMITATIONS",
    canonicalCode: "REPORTING_PERIOD_REVIEW",
    displayLabel: "Reporting period review",
    description: "The account should be reviewed against the mapped reporting period.",
    legacyTerms: ["statute of limitations"],
  },
  TEMPORAL_MANIPULATION: {
    stableId: "TEMPORAL_MANIPULATION",
    canonicalCode: "REPORTING_CHRONOLOGY_CONFLICT",
    displayLabel: "Reporting chronology conflict",
    description: "Reported account dates conflict with available chronology.",
    legacyTerms: ["temporal manipulation"],
  },
  ZOMBIE_DEBT_RESURRECTION: {
    stableId: "ZOMBIE_DEBT_RESURRECTION",
    canonicalCode: "REAPPEARING_DEBT_RECORD",
    displayLabel: "Reappearing debt record",
    description: "A previously resolved or removed item appears again and should be reviewed.",
    legacyTerms: ["zombie debt resurrection", "zombie debt"],
  },
};

const IDENTIFIER_TO_LABEL = new Map<string, string>(
  Object.values(FINDING_TAXONOMY_ALIASES).flatMap((entry) => [
    [entry.stableId.toUpperCase(), entry.displayLabel],
    [entry.canonicalCode.toUpperCase(), entry.displayLabel],
  ]),
);

const LEGACY_TERM_TO_LABEL = Object.values(FINDING_TAXONOMY_ALIASES).flatMap((entry) =>
  entry.legacyTerms.map((term) => ({ term, label: entry.displayLabel })),
);

export function canonicalFindingTaxonomyFor(value: string | null | undefined): FindingTaxonomyEntry | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return FINDING_TAXONOMY_ALIASES[normalized] ??
    Object.values(FINDING_TAXONOMY_ALIASES).find((entry) => entry.canonicalCode === normalized) ??
    null;
}

export function canonicalFindingCodeFor(value: string | null | undefined): string | null {
  return canonicalFindingTaxonomyFor(value)?.canonicalCode ?? null;
}

export function canonicalFindingLabelFor(value: string | null | undefined): string | null {
  return canonicalFindingTaxonomyFor(value)?.displayLabel ?? null;
}

export function canonicalFindingDescriptionFor(value: string | null | undefined): string | null {
  return canonicalFindingTaxonomyFor(value)?.description ?? null;
}

export function neutralizeFindingText(value: string | null | undefined): string {
  if (!value) return "";

  let output = value;
  for (const [identifier, label] of IDENTIFIER_TO_LABEL.entries()) {
    const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    output = output.replace(new RegExp(`\\b${escaped}\\b`, "g"), label);
  }
  for (const { term, label } of LEGACY_TERM_TO_LABEL) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    output = output.replace(new RegExp(`\\b${escaped}\\b`, "gi"), label.toLowerCase());
  }

  return output
    .replace(/\bverification\s+failure\b/gi, "verification issue")
    .replace(/\bregulatory\s+reference\s+failure\b/gi, "reference mapping review")
    .replace(/\bcollection\s+chain\s+failure\b/gi, "collection reporting ambiguity")
    .replace(/\bfraud\s+indicator\b/gi, "unauthorized activity review")
    .replace(/\billegal\s+reporting\b/gi, "unsupported reporting")
    .replace(/\bunlawful\s+reporting\b/gi, "unsupported reporting")
    .replace(/\bnoncompliant\s+reporting\b/gi, "reporting that needs review")
    .replace(/\bmust\s+be\s+removed\b/gi, "should be reviewed and corrected or removed if unverifiable")
    .replace(/\bmanipulat(?:e|ed|ion|ing)\b/gi, "conflict")
    .replace(/\bfailure\b/gi, "issue")
    .replace(/\bviolation\b/gi, "issue")
    .replace(/\s+/g, " ")
    .trim();
}

