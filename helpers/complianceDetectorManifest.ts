import type { CanonicalTradelineView } from "./canonicalTradelineView";
import type { ViolationCategory } from "./schema";

export type ComplianceDetectorActor = "BUREAU" | "CREDITOR" | "COLLECTOR" | "MIXED";

export type ComplianceDetectorRequiredEvidenceLevel =
  | "strong"
  | "partial"
  | "contextual";

export type ComplianceDetectorReadinessSensitivity =
  | "evidence_critical"
  | "parser_sensitive"
  | "response_context"
  | "manual_review_prone";

export type ComplianceDetectorExpectedField =
  | keyof CanonicalTradelineView
  | "analysisDate"
  | "bankruptcyRecords"
  | "metro2Version"
  | "obligationInstances"
  | "reportArtifacts";

export interface ComplianceDetectorManifestEntry {
  detectorId: string;
  category: string;
  actor: ComplianceDetectorActor;
  expectedCanonicalFields: readonly ComplianceDetectorExpectedField[];
  requiredEvidenceLevel: ComplianceDetectorRequiredEvidenceLevel;
  emitsFindingCategories: readonly ViolationCategory[];
  readinessSensitivity: ComplianceDetectorReadinessSensitivity;
  description: string;
}

const ACCOUNT_FIELDS = ["tradelineId", "bureau", "creditorName", "accountNumberMasked"] as const;
const BALANCE_FIELDS = ["balance", "status", "accountType"] as const;
const DATE_FIELDS = ["dateOpened", "dateClosed", "dateOfFirstDelinquency", "lastPaymentDate", "lastReportedDate"] as const;
const PAYMENT_FIELDS = ["paymentHistory", "lastPaymentDate", "lastReportedDate"] as const;
const STATUS_FIELDS = ["status", "remarks", "disputeStatus"] as const;
const REPORT_CONTEXT_FIELDS = ["reportArtifacts", "lastReportedDate"] as const;
const RESPONSE_CONTEXT_FIELDS = ["obligationInstances", "disputeStatus"] as const;

function detector(
  detectorId: string,
  category: string,
  actor: ComplianceDetectorActor,
  expectedCanonicalFields: readonly ComplianceDetectorExpectedField[],
  requiredEvidenceLevel: ComplianceDetectorRequiredEvidenceLevel,
  emitsFindingCategories: readonly ViolationCategory[],
  readinessSensitivity: ComplianceDetectorReadinessSensitivity,
  description: string,
): ComplianceDetectorManifestEntry {
  return {
    detectorId,
    category,
    actor,
    expectedCanonicalFields,
    requiredEvidenceLevel,
    emitsFindingCategories,
    readinessSensitivity,
    description,
  };
}

export const COMPLIANCE_DETECTOR_MANIFEST_VERSION = "compliance-detector-manifest-v1";

export const COMPLIANCE_DETECTOR_MANIFEST = [
  detector("detectTemporalManipulation", "temporal", "CREDITOR", [...DATE_FIELDS, ...REPORT_CONTEXT_FIELDS], "strong", ["TEMPORAL_MANIPULATION"], "evidence_critical", "Compares report timelines for retroactive or inconsistent date changes."),
  detector("detectStatuteOfLimitations", "temporal", "BUREAU", [...ACCOUNT_FIELDS, "dateOfFirstDelinquency", "analysisDate"], "strong", ["STATUTE_OF_LIMITATIONS", "STATUTE_APPROACHING"], "evidence_critical", "Flags accounts that appear beyond, or approaching, stale debt reporting limits."),
  detector("detectRetroactiveHistoryManipulation", "temporal", "CREDITOR", [...PAYMENT_FIELDS, ...REPORT_CONTEXT_FIELDS], "strong", ["RETROACTIVE_HISTORY_MANIPULATION"], "evidence_critical", "Compares prior and current payment history for retroactive adverse updates."),
  detector("detectStaleReportingFailure", "temporal", "CREDITOR", ["lastReportedDate", "analysisDate"], "strong", ["STALE_REPORTING_FAILURE"], "evidence_critical", "Detects accounts that appear stale relative to the latest report date."),
  detector("detectLastActivityDateManipulation", "temporal", "CREDITOR", ["lastPaymentDate", "lastReportedDate", ...REPORT_CONTEXT_FIELDS], "strong", ["LAST_ACTIVITY_DATE_MANIPULATION"], "evidence_critical", "Looks for unsupported last-activity date movement across report artifacts."),

  detector("detectPhantomDebtUnverifiable", "collection", "COLLECTOR", [...ACCOUNT_FIELDS, "balance", "status"], "strong", ["PHANTOM_DEBT_UNVERIFIABLE"], "evidence_critical", "Identifies collection tradelines that lack verifiable creditor or account support."),
  detector("detectCrossEntityDiscrepancy", "cross_entity", "CREDITOR", [...ACCOUNT_FIELDS, "balance", "status", ...REPORT_CONTEXT_FIELDS], "strong", ["CROSS_ENTITY_DISCREPANCY"], "evidence_critical", "Checks account data reported across related entities for inconsistent values."),
  detector("detectMultipleCollectorViolation", "collection", "COLLECTOR", [...ACCOUNT_FIELDS, "balance", "status"], "strong", ["MULTIPLE_COLLECTOR_VIOLATION"], "manual_review_prone", "Flags accounts that appear assigned to more than one collector."),
  detector("detectCrossBureauInconsistency", "bureau", "BUREAU", [...ACCOUNT_FIELDS, "balance", "status", "lastReportedDate"], "strong", ["CROSS_BUREAU_INCONSISTENCY"], "evidence_critical", "Compares equivalent tradelines across bureaus for inconsistent reporting."),
  detector("detectDebtValidationFailure", "collection", "COLLECTOR", [...ACCOUNT_FIELDS, "balance", "status"], "strong", ["DOCUMENTATION_CHAIN_FAILURE"], "manual_review_prone", "Detects collector accounts with missing validation chain support."),
  detector("detectOriginalCreditorChainFailure", "collection", "COLLECTOR", [...ACCOUNT_FIELDS, "balance"], "strong", ["DOCUMENTATION_CHAIN_FAILURE"], "manual_review_prone", "Detects collection accounts missing clear original-creditor chain metadata."),

  detector("detectPaymentHistoryManipulation", "payment_history", "CREDITOR", [...PAYMENT_FIELDS, ...REPORT_CONTEXT_FIELDS], "strong", ["PAYMENT_HISTORY_MANIPULATION"], "evidence_critical", "Checks payment history for unexplained adverse changes."),
  detector("detectBalanceCalculationViolation", "balance", "CREDITOR", [...ACCOUNT_FIELDS, ...BALANCE_FIELDS], "strong", ["BALANCE_CALCULATION_VIOLATION"], "evidence_critical", "Detects impossible or unsupported balance relationships."),
  detector("detectCreditLimitManipulation", "balance", "CREDITOR", [...ACCOUNT_FIELDS, ...BALANCE_FIELDS, ...REPORT_CONTEXT_FIELDS], "strong", ["CREDIT_LIMIT_MANIPULATION"], "evidence_critical", "Flags unsupported or inconsistent credit-limit changes."),
  detector("detectClosedAccountBalanceInflation", "balance", "CREDITOR", [...ACCOUNT_FIELDS, ...BALANCE_FIELDS, "dateClosed"], "strong", ["CLOSED_ACCOUNT_BALANCE_INFLATION"], "evidence_critical", "Detects closed accounts with balances that appear inflated after closure."),
  detector("detectZombieDebtResurrection", "collection", "CREDITOR", [...ACCOUNT_FIELDS, ...DATE_FIELDS, "balance"], "strong", ["ZOMBIE_DEBT_RESURRECTION"], "evidence_critical", "Flags old or inactive accounts that appear newly resurrected."),

  detector("detectDocumentationChainFailure", "documentation", "CREDITOR", [...ACCOUNT_FIELDS, "balance", "status"], "strong", ["DOCUMENTATION_CHAIN_FAILURE"], "manual_review_prone", "Detects accounts with missing support or ownership chain documentation."),
  detector("detectBankruptcyDischargeViolation", "public_record", "CREDITOR", [...ACCOUNT_FIELDS, "status", "bankruptcyRecords"], "strong", ["BANKRUPTCY_DISCHARGE_VIOLATION"], "evidence_critical", "Checks reported accounts against known bankruptcy discharge records."),
  detector("detectIdentityTheftViolation", "identity", "CREDITOR", [...ACCOUNT_FIELDS, "remarks", "status"], "strong", ["IDENTITY_THEFT_VIOLATION"], "manual_review_prone", "Flags accounts with identity-theft indicators or unsupported fraud handling."),
  detector("detectMetro2FieldViolations", "metro2", "CREDITOR", [...ACCOUNT_FIELDS, ...BALANCE_FIELDS, ...DATE_FIELDS, "metro2Version"], "strong", ["DOCUMENTATION_CHAIN_FAILURE"], "parser_sensitive", "Runs field-level Metro 2 checks against canonical tradeline values."),
  detector("detectMetro2RulesetViolations", "metro2", "CREDITOR", [...ACCOUNT_FIELDS, ...BALANCE_FIELDS, ...DATE_FIELDS, "paymentHistory", "metro2Version"], "strong", ["DOCUMENTATION_CHAIN_FAILURE", "BALANCE_CALCULATION_VIOLATION", "ACCOUNT_STATUS_INCONSISTENCY", "PAYMENT_HISTORY_MANIPULATION"], "parser_sensitive", "Runs Metro 2 ruleset validation and maps categories into existing finding categories."),
  detector("detectDateLogicImpossibility", "date_logic", "CREDITOR", [...ACCOUNT_FIELDS, ...DATE_FIELDS], "strong", ["DATE_LOGIC_IMPOSSIBLE"], "evidence_critical", "Checks impossible date relationships on a tradeline."),

  detector("detectProceduralTimingViolation", "response", "CREDITOR", RESPONSE_CONTEXT_FIELDS, "contextual", ["PROCEDURAL_TIMING_VIOLATION"], "response_context", "Checks dispute response timing using obligation-instance context."),
  detector("detectAccountStatusInconsistency", "status", "CREDITOR", [...ACCOUNT_FIELDS, ...STATUS_FIELDS], "strong", ["ACCOUNT_STATUS_INCONSISTENCY"], "evidence_critical", "Detects internally inconsistent account status and remark combinations."),
  detector("detectCreditorResponseQuality", "response", "CREDITOR", RESPONSE_CONTEXT_FIELDS, "contextual", ["CREDITOR_RESPONSE_QUALITY"], "response_context", "Reviews creditor dispute responses for low-quality or incomplete answers."),
  detector("detectInvestigationRubberStamp", "response", "BUREAU", RESPONSE_CONTEXT_FIELDS, "contextual", ["INVESTIGATION_RUBBER_STAMP"], "response_context", "Flags investigation responses that appear generic or unsupported."),
  detector("detectFurnisherResponseQuality", "response", "CREDITOR", RESPONSE_CONTEXT_FIELDS, "contextual", ["FURNISHER_RESPONSE_QUALITY"], "response_context", "Flags weak furnisher responses after disputes."),
  detector("detectConsumerStatementSuppression", "bureau", "BUREAU", [...ACCOUNT_FIELDS, "remarks", "disputeStatus"], "strong", ["CONSUMER_STATEMENT_SUPPRESSION"], "manual_review_prone", "Detects missing or suppressed consumer dispute statements."),

  detector("detectResponseMovMissing", "response", "BUREAU", RESPONSE_CONTEXT_FIELDS, "contextual", ["RESPONSE_MOV_MISSING"], "response_context", "Detects bureau responses missing method-of-verification information."),
  detector("detectResponseIncomplete", "response", "BUREAU", RESPONSE_CONTEXT_FIELDS, "contextual", ["RESPONSE_INCOMPLETE"], "response_context", "Detects materially incomplete bureau responses."),
  detector("detectResponseNoDocumentation", "response", "BUREAU", RESPONSE_CONTEXT_FIELDS, "contextual", ["RESPONSE_NO_DOCUMENTATION"], "response_context", "Detects response records with no attached documentation."),
  detector("detectResponseAddressMismatch", "response", "BUREAU", RESPONSE_CONTEXT_FIELDS, "contextual", ["RESPONSE_ADDRESS_MISMATCH"], "response_context", "Detects bureau response address mismatch evidence."),
  detector("detectResponseUnauthorized", "response", "BUREAU", RESPONSE_CONTEXT_FIELDS, "contextual", ["RESPONSE_UNAUTHORIZED"], "response_context", "Detects unauthorized or unsupported response handling."),
  detector("runAllResponseAuditDetectors", "response", "BUREAU", RESPONSE_CONTEXT_FIELDS, "contextual", ["RESPONSE_MOV_MISSING", "RESPONSE_INCOMPLETE", "RESPONSE_NO_DOCUMENTATION", "RESPONSE_ADDRESS_MISMATCH", "RESPONSE_UNAUTHORIZED"], "response_context", "Composite response-audit runner that delegates to the response detectors."),

  detector("detectBureauInvestigationFailure", "bureau", "BUREAU", RESPONSE_CONTEXT_FIELDS, "contextual", ["BUREAU_INVESTIGATION_FAILURE"], "response_context", "Checks whether bureau investigation duties appear unmet."),
  detector("detectBureauNotificationFailure", "bureau", "BUREAU", RESPONSE_CONTEXT_FIELDS, "contextual", ["BUREAU_NOTIFICATION_FAILURE"], "response_context", "Checks whether bureau notification duties appear unmet."),
  detector("detectBureauReinvestigationFailure", "bureau", "BUREAU", [...ACCOUNT_FIELDS, ...REPORT_CONTEXT_FIELDS], "strong", ["BUREAU_REINSERTION_VIOLATION"], "manual_review_prone", "Checks reinvestigation and reinsertion conditions across report artifacts."),
  detector("detectBureauAccessViolation", "bureau", "BUREAU", [...ACCOUNT_FIELDS, "analysisDate"], "strong", ["BUREAU_ACCESS_VIOLATION"], "manual_review_prone", "Detects report-access or file-disclosure issues."),
  detector("detectBureauDisputeMarkingFailure", "bureau", "BUREAU", [...ACCOUNT_FIELDS, "disputeStatus", ...RESPONSE_CONTEXT_FIELDS], "strong", ["BUREAU_DISPUTE_MARKING_FAILURE"], "evidence_critical", "Checks whether disputed accounts are marked consistently."),

  detector("detectFurnisherReagingViolation", "furnisher", "CREDITOR", [...ACCOUNT_FIELDS, "dateOfFirstDelinquency", ...REPORT_CONTEXT_FIELDS], "strong", ["FURNISHER_REAGING_VIOLATION"], "evidence_critical", "Detects apparent furnisher re-aging based on delinquency dates."),
  detector("detectFurnisherStatusCodeMismatch", "furnisher", "CREDITOR", [...ACCOUNT_FIELDS, "status", "remarks"], "strong", ["FURNISHER_STATUS_CODE_MISMATCH"], "evidence_critical", "Checks furnisher status codes against account context."),
  detector("detectFurnisherJointAccountViolation", "furnisher", "CREDITOR", [...ACCOUNT_FIELDS, "accountType", "remarks"], "strong", ["FURNISHER_JOINT_ACCOUNT_VIOLATION"], "manual_review_prone", "Flags joint-account reporting inconsistencies."),
  detector("detectFurnisherAuthorizedUserMisrepresentation", "furnisher", "CREDITOR", [...ACCOUNT_FIELDS, "accountType", "remarks"], "strong", ["FURNISHER_AUTHORIZED_USER_MISREPRESENTATION"], "manual_review_prone", "Detects authorized-user reporting that may be misrepresented."),
  detector("detectFurnisherPostDisputeRetaliation", "furnisher", "CREDITOR", [...ACCOUNT_FIELDS, "status", ...RESPONSE_CONTEXT_FIELDS, ...REPORT_CONTEXT_FIELDS], "strong", ["FURNISHER_POST_DISPUTE_RETALIATION"], "manual_review_prone", "Detects adverse furnisher changes after dispute activity."),

  detector("detectCollectorLicenseFailure", "collector", "COLLECTOR", [...ACCOUNT_FIELDS, "balance", "status"], "strong", ["COLLECTOR_LICENSE_FAILURE"], "manual_review_prone", "Checks collection agency licensing indicators."),
  detector("detectCollectorUnauthorizedFees", "collector", "COLLECTOR", [...ACCOUNT_FIELDS, "balance", ...REPORT_CONTEXT_FIELDS], "strong", ["COLLECTOR_UNAUTHORIZED_FEES"], "evidence_critical", "Detects unsupported fees or balance increases on collection accounts."),
  detector("detectCollectorDuplicateReporting", "collector", "COLLECTOR", [...ACCOUNT_FIELDS, "balance", "status"], "strong", ["COLLECTOR_DUPLICATE_REPORTING"], "evidence_critical", "Detects duplicate collector reporting for the same debt."),
  detector("detectCollectorStatuteRevivalAttempt", "collector", "COLLECTOR", [...ACCOUNT_FIELDS, "dateOfFirstDelinquency", "lastPaymentDate", ...REPORT_CONTEXT_FIELDS], "strong", ["COLLECTOR_STATUTE_REVIVAL_ATTEMPT"], "evidence_critical", "Checks whether collector activity appears to revive stale debt."),
  detector("detectDuplicateCollectionAssignment", "collector", "COLLECTOR", [...ACCOUNT_FIELDS, "balance", "status"], "strong", ["MULTIPLE_COLLECTOR_VIOLATION"], "evidence_critical", "Detects duplicate collection assignment patterns."),
  detector("detectCollectorPaymentAcknowledgmentViolation", "collector", "COLLECTOR", [...ACCOUNT_FIELDS, "lastPaymentDate", ...REPORT_CONTEXT_FIELDS], "strong", ["COLLECTOR_PAYMENT_ACKNOWLEDGMENT_VIOLATION"], "evidence_critical", "Checks payment acknowledgment reporting by collectors."),

  detector("detectCollectionLimitationExceeded", "collection", "COLLECTOR", [...ACCOUNT_FIELDS, "dateOfFirstDelinquency", "analysisDate"], "strong", ["COLLECTION_LIMITATION_EXCEEDED"], "evidence_critical", "Detects collection activity outside limitation windows."),
  detector("detectMixedFilePersonalInfoMismatch", "identity", "BUREAU", ["bureau", "creditorName", "remarks", "evidenceRefs"], "strong", ["MIXED_FILE_PERSONAL_INFO_MISMATCH"], "manual_review_prone", "Detects personal-information mismatch signals for mixed-file review."),
  detector("detectConsentWithdrawalNotHonored", "authorization", "CREDITOR", [...ACCOUNT_FIELDS, "remarks", "disputeStatus"], "strong", ["CONSENT_WITHDRAWAL_NOT_HONORED"], "manual_review_prone", "Detects indicators that consent withdrawal was not honored."),
  detector("detectFreezeViolationInquiry", "bureau", "BUREAU", ["bureau", "remarks", "evidenceRefs", "analysisDate"], "strong", ["FREEZE_PERIOD_VIOLATION"], "manual_review_prone", "Detects inquiry or access activity during a freeze period."),
  detector("detectDisclosureDeficiency", "disclosure", "BUREAU", [...ACCOUNT_FIELDS, "bureau", "reportArtifacts"], "strong", ["DISCLOSURE_DEFICIENCY"], "parser_sensitive", "Checks required disclosure fields for report completeness."),
] as const satisfies readonly ComplianceDetectorManifestEntry[];

const MANIFEST_BY_ID = new Map(
  COMPLIANCE_DETECTOR_MANIFEST.map((entry) => [entry.detectorId, entry]),
);

export function getComplianceDetectorManifestEntry(
  detectorId: string,
): ComplianceDetectorManifestEntry | null {
  return MANIFEST_BY_ID.get(detectorId) ?? null;
}

export function assertComplianceDetectorManifestEntry(
  detectorId: string,
): ComplianceDetectorManifestEntry {
  const entry = getComplianceDetectorManifestEntry(detectorId);
  if (!entry) {
    throw new Error(`Unknown compliance detector id: ${detectorId}`);
  }
  return entry;
}
