import type { DetectedViolation } from "./complianceDetectorTypes";
import {
  classifyAuthorityIssue,
  getLegalAuthorityById,
  hasFieldSpecificAuthority,
  type AuthorityIssueClassification,
  type LegalAuthoritySourceQuality,
  type LegalAuthoritySupportLevel,
} from "./legalAuthorityRegistry";
import type { ViolationCategory } from "./schema";

export const FORMAL_VIOLATION_ELIGIBILITY_VERSION = "formal-violation-eligibility-v2";

export const COMPLIANCE_FINDING_KINDS = [
  "regulatory_violation",
  "dispute_basis",
  "verification_issue",
  "inconsistency",
  "unverifiable_reporting",
  "ambiguity",
  "unsupported_reporting",
  "chronology_conflict",
  "manual_review_only",
] as const;

export type ComplianceFindingKind = (typeof COMPLIANCE_FINDING_KINDS)[number];

export const FINDING_CONFIDENCE_CLASSES = [
  "VERIFIED_REGULATORY_VIOLATION",
  "HIGH_CONFIDENCE_DISPUTE_BASIS",
  "REVIEW_RECOMMENDED",
  "INVESTIGATORY_SIGNAL_ONLY",
  "INSUFFICIENT_EVIDENCE",
] as const;

export type FindingConfidenceClass = (typeof FINDING_CONFIDENCE_CLASSES)[number];

export interface ComplianceFindingEligibility {
  sourceVersion: typeof FORMAL_VIOLATION_ELIGIBILITY_VERSION;
  findingKind: ComplianceFindingKind;
  confidenceClass: FindingConfidenceClass;
  formalViolationEligible: boolean;
  legalConclusionAllowed: boolean;
  explicitAuthorityMapped: boolean;
  deterministicBreachLogic: boolean;
  evidenceLinked: boolean;
  confidenceThresholdMet: boolean;
  confidenceScore: number;
  confidenceThreshold: number;
  authorityReferenceIds: string[];
  statutoryReferenceIds: string[];
  reportingStandardReferenceIds: string[];
  reviewReferenceIds: string[];
  authorityIssueClassifications: AuthorityIssueClassification[];
  reasonCodes: string[];
  consumerDisputeIntent: string;
  consumerLabel: string;
}

const DEFAULT_CONFIDENCE_THRESHOLD = 50;

const FORMAL_DETERMINISTIC_CATEGORIES = new Set<ViolationCategory>([
  "BANKRUPTCY_DISCHARGE_VIOLATION",
  "BUREAU_ACCESS_VIOLATION",
  "BUREAU_DISPUTE_MARKING_FAILURE",
  "BUREAU_INVESTIGATION_FAILURE",
  "BUREAU_NOTIFICATION_FAILURE",
  "BUREAU_REINSERTION_VIOLATION",
  "COLLECTION_LIMITATION_EXCEEDED",
  "COLLECTOR_PAYMENT_ACKNOWLEDGMENT_VIOLATION",
  "COLLECTOR_STATUTE_REVIVAL_ATTEMPT",
  "CONSENT_WITHDRAWAL_NOT_HONORED",
  "CONSUMER_STATEMENT_SUPPRESSION",
  "DISCLOSURE_DEFICIENCY",
  "FREEZE_PERIOD_VIOLATION",
  "FURNISHER_POST_DISPUTE_RETALIATION",
  "FURNISHER_REAGING_VIOLATION",
  "LAST_ACTIVITY_DATE_MANIPULATION",
  "PROCEDURAL_TIMING_VIOLATION",
  "RESPONSE_MOV_MISSING",
  "RESPONSE_UNAUTHORIZED",
  "STALE_REPORTING_FAILURE",
  "STATUTE_OF_LIMITATIONS",
  "ZOMBIE_DEBT_RESURRECTION",
]);

const INCONSISTENCY_CATEGORIES = new Set<ViolationCategory>([
  "ACCOUNT_STATUS_INCONSISTENCY",
  "CROSS_BUREAU_INCONSISTENCY",
  "CROSS_ENTITY_DISCREPANCY",
  "FURNISHER_STATUS_CODE_MISMATCH",
  "PAYMENT_HISTORY_MANIPULATION",
]);

const CHRONOLOGY_CATEGORIES = new Set<ViolationCategory>([
  "DATE_LOGIC_IMPOSSIBLE",
  "FURNISHER_REAGING_VIOLATION",
  "LAST_ACTIVITY_DATE_MANIPULATION",
  "RETROACTIVE_HISTORY_MANIPULATION",
  "STALE_REPORTING_FAILURE",
  "STATUTE_APPROACHING",
  "STATUTE_OF_LIMITATIONS",
  "TEMPORAL_MANIPULATION",
]);

const UNSUPPORTED_CATEGORIES = new Set<ViolationCategory>([
  "DOCUMENTATION_CHAIN_FAILURE",
  "PHANTOM_DEBT_UNVERIFIABLE",
  "RESPONSE_INCOMPLETE",
  "RESPONSE_MOV_MISSING",
  "RESPONSE_NO_DOCUMENTATION",
]);

const AMBIGUITY_CATEGORIES = new Set<ViolationCategory>([
  "COLLECTOR_DUPLICATE_REPORTING",
  "COLLECTOR_LICENSE_FAILURE",
  "MULTIPLE_COLLECTOR_VIOLATION",
  "RESPONSE_ADDRESS_MISMATCH",
]);

const MANUAL_REVIEW_CATEGORIES = new Set<ViolationCategory>([
  "CREDITOR_RESPONSE_QUALITY",
  "FURNISHER_RESPONSE_QUALITY",
  "IDENTITY_THEFT_VIOLATION",
  "INVESTIGATION_RUBBER_STAMP",
  "MIXED_FILE_PERSONAL_INFO_MISMATCH",
]);

function detailsOf(violation: DetectedViolation): Record<string, any> {
  return violation.technicalDetails && typeof violation.technicalDetails === "object"
    ? violation.technicalDetails
    : {};
}

function objectValue(value: unknown): Record<string, any> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : null;
}

function stringValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((candidate) => stringValue(candidate)).filter((candidate): candidate is string => Boolean(candidate));
}

function referenceId(ref: unknown): string | null {
  if (typeof ref === "string") return stringValue(ref);
  const record = objectValue(ref);
  return stringValue(record?.id) ?? stringValue(record?.regulationId);
}

function referenceCandidates(details: Record<string, any>): Array<Record<string, any> | string> {
  const deterministicRule = objectValue(details.deterministicRule);
  const references = [
    ...(Array.isArray(details.regulationReferences) ? details.regulationReferences : []),
    ...(Array.isArray(deterministicRule?.regulationReferences) ? deterministicRule.regulationReferences : []),
    ...stringArray(details.regulationIds),
  ];

  const seen = new Set<string>();
  return references.filter((ref) => {
    const id = referenceId(ref);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function authorityMetadata(ref: Record<string, any> | string) {
  const id = referenceId(ref);
  const authority = id ? getLegalAuthorityById(id) : undefined;
  const record = typeof ref === "string" ? {} : ref;
  const sourceQuality =
    (stringValue(record.sourceQuality) as LegalAuthoritySourceQuality | null) ??
    authority?.sourceQuality ??
    null;
  const supportLevel =
    (stringValue(record.supportLevel) as LegalAuthoritySupportLevel | null) ??
    authority?.supportLevel ??
    null;
  const citation = stringValue(record.citation) ?? authority?.citation ?? null;
  const statute = stringValue(record.statute) ?? authority?.statute ?? null;
  const classification = authority
    ? classifyAuthorityIssue(authority)
    : (stringValue(record.authorityIssueClassification) as AuthorityIssueClassification | null);

  return {
    id,
    sourceQuality,
    supportLevel,
    citation,
    statute,
    classification,
    allowsFieldRequiredLanguage: Boolean(record.allowsFieldRequiredLanguage ?? authority?.allowsFieldRequiredLanguage),
  };
}

function isPipedaCategoryPrinciple(input: {
  statute: string | null;
  supportLevel: LegalAuthoritySupportLevel | null;
}): boolean {
  return input.statute === "PIPEDA" && input.supportLevel === "category_principle";
}

function isExplicitStatutoryAuthority(ref: Record<string, any> | string): boolean {
  const metadata = authorityMetadata(ref);
  if (!metadata.id || metadata.sourceQuality !== "official" || !metadata.citation) return false;
  if (metadata.supportLevel === "registry_placeholder") return false;
  if (isPipedaCategoryPrinciple(metadata)) return false;
  return true;
}

function detailsAccountType(details: Record<string, any>): string | null {
  return stringValue(details.accountType) ?? stringValue(details.accountTypeCategory) ?? stringValue(details.accountCategory);
}

function detailsProvince(details: Record<string, any>): string | null {
  return stringValue(details.province) ?? stringValue(details.consumerProvince) ?? stringValue(details.jurisdiction);
}

function detailsFieldName(details: Record<string, any>): string | null {
  return stringValue(details.fieldName) ??
    stringValue(details.missingField) ??
    stringValue(details.canonicalField) ??
    stringValue(details.sourceField);
}

function isConfirmedFieldAuthority(
  ref: Record<string, any> | string,
  violation: DetectedViolation,
  details: Record<string, any>,
): boolean {
  const metadata = authorityMetadata(ref);
  if (metadata.classification !== "confirmed_legal_violation") return false;
  if (!metadata.id || metadata.supportLevel !== "field_requirement") return true;

  return hasFieldSpecificAuthority({
    violationCategory: violation.violationCategory,
    fieldName: detailsFieldName(details),
    accountType: detailsAccountType(details),
    regulationIds: [metadata.id],
    jurisdiction: detailsProvince(details),
  });
}

function evidenceLinked(details: Record<string, any>): boolean {
  const evidence = objectValue(details.evidenceLink) ?? objectValue(objectValue(details.deterministicRule)?.evidence);
  if (evidence) {
    return Boolean(
      stringValue(evidence.evidenceId) ||
        stringValue(evidence.fieldName) ||
        stringValue(evidence.textSnippet) ||
        objectValue(evidence.evidenceLocation) ||
        numberValue(evidence.reportArtifactId) !== null ||
        numberValue(evidence.pageNumber) !== null,
    );
  }

  return Boolean(
    stringValue(details.evidenceId) ||
      stringValue(details.fieldName) ||
      stringValue(details.textSnippet) ||
      stringValue(details.sourceField) ||
      numberValue(details.reportArtifactId) !== null ||
      numberValue(details.sourceReportArtifactId) !== null,
  );
}

function confidenceThreshold(details: Record<string, any>): number {
  return (
    numberValue(details.complianceConfidenceThreshold) ??
    numberValue(details.confidenceThreshold) ??
    numberValue(objectValue(details.findingEligibility)?.confidenceThreshold) ??
    DEFAULT_CONFIDENCE_THRESHOLD
  );
}

function parserRequiresReview(details: Record<string, any>): boolean {
  const gate = objectValue(details.extractionConfidenceGate);
  const defensibility = objectValue(details.defensibility);
  const status = [
    stringValue(gate?.status),
    stringValue(defensibility?.parserUncertaintyStatus),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /\b(parser_uncertain|needs_user_review|needs_parser_review)\b/.test(status);
}

function hasDeterministicRule(details: Record<string, any>): boolean {
  const deterministicRule = objectValue(details.deterministicRule);
  return Boolean(
    stringValue(details.deterministicRuleId) ||
      stringValue(details.detectorRuleId) ||
      stringValue(details.ruleName) ||
      stringValue(deterministicRule?.ruleId),
  );
}

function consumerLabelFor(kind: ComplianceFindingKind): string {
  switch (kind) {
    case "regulatory_violation":
      return "Regulatory compliance issue";
    case "verification_issue":
      return "Verification issue";
    case "inconsistency":
      return "Reporting inconsistency";
    case "unverifiable_reporting":
      return "Unverifiable reporting";
    case "ambiguity":
      return "Ambiguous ownership or reporting";
    case "unsupported_reporting":
      return "Unsupported reporting";
    case "chronology_conflict":
      return "Date or reporting-period concern";
    case "manual_review_only":
      return "Manual review needed";
    case "dispute_basis":
    default:
      return "Dispute basis";
  }
}

function nonFormalKind(category: ViolationCategory, details: Record<string, any>): ComplianceFindingKind {
  const evidence = objectValue(details.evidenceLink) ?? objectValue(objectValue(details.deterministicRule)?.evidence);
  const fieldName = detailsFieldName(details) ?? stringValue(evidence?.fieldName);
  if (category === "DOCUMENTATION_CHAIN_FAILURE" && fieldName) return "verification_issue";
  if (INCONSISTENCY_CATEGORIES.has(category)) return "inconsistency";
  if (CHRONOLOGY_CATEGORIES.has(category)) return "chronology_conflict";
  if (category === "PHANTOM_DEBT_UNVERIFIABLE") return "unverifiable_reporting";
  if (UNSUPPORTED_CATEGORIES.has(category)) return "unsupported_reporting";
  if (AMBIGUITY_CATEGORIES.has(category)) return "ambiguity";
  return "dispute_basis";
}

function confidenceClassFor(input: {
  category: ViolationCategory;
  formalViolationEligible: boolean;
  linkedEvidence: boolean;
  thresholdMet: boolean;
  parserReview: boolean;
  deterministicRule: boolean;
  deterministicBreachLogic: boolean;
}): FindingConfidenceClass {
  if (input.formalViolationEligible) return "VERIFIED_REGULATORY_VIOLATION";
  if (!input.linkedEvidence) return "INSUFFICIENT_EVIDENCE";
  if (!input.thresholdMet || input.parserReview || MANUAL_REVIEW_CATEGORIES.has(input.category)) {
    return "REVIEW_RECOMMENDED";
  }
  if (input.deterministicRule || input.deterministicBreachLogic) {
    return "HIGH_CONFIDENCE_DISPUTE_BASIS";
  }
  return "INVESTIGATORY_SIGNAL_ONLY";
}

export function classifyDetectedViolationEligibility(
  violation: DetectedViolation,
): ComplianceFindingEligibility {
  const details = detailsOf(violation);
  const references = referenceCandidates(details);
  const confidenceScore = Math.max(0, Math.min(100, Math.round(violation.confidenceScore ?? 0)));
  const threshold = confidenceThreshold(details);
  const thresholdMet = confidenceScore >= threshold;
  const linkedEvidence = evidenceLinked(details);
  const explicitStatutoryRefs = references.filter(isExplicitStatutoryAuthority);
  const confirmedFieldRefs = references.filter((ref) => isConfirmedFieldAuthority(ref, violation, details));
  const deterministicRule = hasDeterministicRule(details);
  const deterministicBreachLogic =
    confirmedFieldRefs.length > 0 ||
    (FORMAL_DETERMINISTIC_CATEGORIES.has(violation.violationCategory) && deterministicRule);
  const explicitAuthorityMapped = explicitStatutoryRefs.length > 0 || confirmedFieldRefs.length > 0;
  const parserReview = parserRequiresReview(details);
  const formalViolationEligible =
    explicitAuthorityMapped &&
    deterministicBreachLogic &&
    linkedEvidence &&
    thresholdMet &&
    !parserReview;

  const referenceMetadata = references.map(authorityMetadata);
  const authorityReferenceIds = referenceMetadata.map((ref) => ref.id).filter((id): id is string => Boolean(id)).sort();
  const reportingStandardReferenceIds = referenceMetadata
    .filter((ref) => ref.sourceQuality === "private_standard" || ref.supportLevel === "reporting_standard")
    .map((ref) => ref.id)
    .filter((id): id is string => Boolean(id))
    .sort();
  const statutoryReferenceIds = referenceMetadata
    .filter((ref) => ref.sourceQuality === "official")
    .map((ref) => ref.id)
    .filter((id): id is string => Boolean(id))
    .sort();
  const reviewReferenceIds = referenceMetadata
    .filter((ref) => ref.sourceQuality !== "official" || !isExplicitStatutoryAuthority({ id: ref.id ?? "" }))
    .map((ref) => ref.id)
    .filter((id): id is string => Boolean(id))
    .sort();
  const authorityIssueClassifications = [
    ...new Set(
      referenceMetadata
        .map((ref) => ref.classification)
        .filter((value): value is AuthorityIssueClassification => Boolean(value)),
    ),
  ].sort();

  const reasonCodes = [
    ...(explicitAuthorityMapped ? [] : ["NO_EXPLICIT_STATUTORY_AUTHORITY"]),
    ...(deterministicBreachLogic ? [] : ["NO_DETERMINISTIC_BREACH_LOGIC"]),
    ...(linkedEvidence ? [] : ["NO_EVIDENCE_LINK"]),
    ...(thresholdMet ? [] : ["CONFIDENCE_BELOW_THRESHOLD"]),
    ...(parserReview ? ["PARSER_OR_USER_REVIEW_REQUIRED"] : []),
  ];

  const findingKind = formalViolationEligible
    ? "regulatory_violation"
    : (!linkedEvidence || !thresholdMet || parserReview || MANUAL_REVIEW_CATEGORIES.has(violation.violationCategory))
      ? "manual_review_only"
      : nonFormalKind(violation.violationCategory, details);
  const consumerLabel = consumerLabelFor(findingKind);
  const confidenceClass = confidenceClassFor({
    category: violation.violationCategory,
    formalViolationEligible,
    linkedEvidence,
    thresholdMet,
    parserReview,
    deterministicRule,
    deterministicBreachLogic,
  });

  return {
    sourceVersion: FORMAL_VIOLATION_ELIGIBILITY_VERSION,
    findingKind,
    confidenceClass,
    formalViolationEligible,
    legalConclusionAllowed: formalViolationEligible,
    explicitAuthorityMapped,
    deterministicBreachLogic,
    evidenceLinked: linkedEvidence,
    confidenceThresholdMet: thresholdMet,
    confidenceScore,
    confidenceThreshold: threshold,
    authorityReferenceIds,
    statutoryReferenceIds,
    reportingStandardReferenceIds,
    reviewReferenceIds,
    authorityIssueClassifications,
    reasonCodes,
    consumerDisputeIntent: consumerLabel,
    consumerLabel,
  };
}

export function annotateDetectedViolationEligibility(
  violation: DetectedViolation,
): DetectedViolation {
  const details = detailsOf(violation);
  const findingEligibility = classifyDetectedViolationEligibility(violation);

  return {
    ...violation,
    technicalDetails: {
      ...details,
      findingEligibility,
      findingKind: findingEligibility.findingKind,
      findingConfidenceClass: findingEligibility.confidenceClass,
      formalViolationEligible: findingEligibility.formalViolationEligible,
      legalConclusionAllowed: findingEligibility.legalConclusionAllowed,
      consumerDisputeIntent: findingEligibility.consumerDisputeIntent,
    },
  };
}

export function annotateDetectedViolationsEligibility(
  violations: DetectedViolation[],
): DetectedViolation[] {
  return violations.map(annotateDetectedViolationEligibility);
}
