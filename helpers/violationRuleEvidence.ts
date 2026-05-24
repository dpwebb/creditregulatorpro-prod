import type { DetectedViolation } from "./complianceDetectorTypes";
import {
  authorityIssueLabel,
  classifyAuthorityIssue,
  getBonaFideLegalAuthorityById,
  hasFieldSpecificAuthority,
  type AuthorityIssueClassification,
} from "./legalAuthorityRegistry";
import { regulationRegistry, type RegulationEntry } from "./regulationRegistry";
import type { ViolationCategory } from "./schema";
import {
  annotateDetectedViolationEligibility,
  annotateDetectedViolationsEligibility,
  classifyDetectedViolationEligibility,
  type ComplianceFindingEligibility,
} from "./complianceFindingEligibility";
import {
  resolveEvidenceLocation,
  type EvidenceLocationResolveContext,
  type EvidenceLocationSummary,
} from "./evidenceLocationIndex";
import { evaluateViolationPacketConfidenceGate } from "./violationPacketConfidenceGate";

export interface DeterministicViolationEvidenceLink {
  tradelineId?: number;
  reportArtifactId?: number;
  evidenceId?: string;
  fieldName?: string;
  pageNumber?: number;
  textSnippet?: string;
  evidenceLocation?: EvidenceLocationSummary;
  source: "detector_technical_details";
}

export interface DeterministicViolationRuleEnvelope {
  ruleId: string;
  ruleVersion: "v1";
  violationType: ViolationCategory;
  factualTrigger: string;
  sourceFields: string[];
  evidence: DeterministicViolationEvidenceLink;
  regulationReferences: Array<
    Pick<RegulationEntry, "id" | "statute" | "citation" | "shortLabel"> & {
      textExcerpt?: string;
      sourceUrl?: string | null;
      sourceQuality?: string;
      supportLevel?: string;
      allowsFieldRequiredLanguage?: boolean;
      authorityIssueClassification?: AuthorityIssueClassification;
      authorityIssueLabel?: string;
    }
  >;
  explanation: string;
}

export interface ViolationDefensibilityMetadata {
  deterministicRuleId: string;
  ruleVersion?: string;
  issueType?: string;
  factualTrigger: string;
  sourceFields: string[];
  evidenceIds?: string[];
  hasEvidenceLink: boolean;
  hasEvidenceLocation?: boolean;
  regulationReferenceIds?: string[];
  regulationReferenceMode?: "static_runtime" | "db_approved" | "none";
  neutralExplanation?: string;
  packetEligibility?: {
    eligible: boolean;
    reasonCodes: string[];
  };
  adminReviewStatus?: string;
  parserUncertaintyStatus?: string;
  findingEligibility?: ComplianceFindingEligibility;
  sourceVersion?: string;
}

const DEFENSIBILITY_METADATA_SOURCE_VERSION = "defensibility-metadata-v2";

function detailsOf(violation: DetectedViolation): Record<string, any> {
  return violation.technicalDetails && typeof violation.technicalDetails === "object"
    ? violation.technicalDetails
    : {};
}

function firstString(details: Record<string, any>, keys: string[]): string | null {
  for (const key of keys) {
    const value = details[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function firstDefined(details: Record<string, any>, keys: string[]): unknown {
  for (const key of keys) {
    const value = details[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function stringValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function maskLongNumber(value: string): string {
  return value.replace(/\b\d{6,}\b/g, (match) => `...${match.slice(-4)}`);
}

function redactSensitiveText(value: string): string {
  return maskLongNumber(
    value
      .replace(/\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/g, "[redacted SIN]")
      .replace(/\b(?:SIN|social insurance number)\s*[:#-]?\s*[A-Z0-9 -]{6,}\b/gi, "[redacted SIN]"),
  );
}

function maskSensitiveValue(value: string, fieldName?: string | null): string {
  const field = fieldName?.toLowerCase() ?? "";
  if (field.includes("sin") || field.includes("socialinsurance")) return "[redacted SIN]";
  if (field.includes("account")) return maskLongNumber(value);
  return redactSensitiveText(value);
}

const RULE_FIELD_MAP: Record<string, string> = {
  BASE_SEGMENT_REQUIRED: "baseSegment",
  DATE_DOFD_LOGIC: "dateOfFirstDelinquency",
  DATE_REPORTED_LOGIC: "lastReportedDate",
  REPORT_DATE_REQUIRED: "lastReportedDate",
  DATE_LAST_PAYMENT_AFTER_REPORT_DATE: "dateOfLastPayment",
  DATE_CLOSED_REQUIRED: "dateClosed",
  BALANCE_EXCEEDS_CREDIT_LIMIT: "currentBalance",
  ACCOUNT_DESIGNATION_REQUIRED: "accountDesignation",
  CREDITOR_NAME_REQUIRED: "creditorName",
};

const REPORTING_STANDARD_REQUIRED_FIELD_RULES = new Set([
  "BASE_SEGMENT_REQUIRED",
]);

const CANADIAN_PROVINCES = new Set([
  "AB",
  "BC",
  "MB",
  "NB",
  "NL",
  "NS",
  "NT",
  "NU",
  "ON",
  "PE",
  "QC",
  "SK",
  "YT",
]);

function normalizeProvince(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const province = value.trim().toUpperCase();
  return CANADIAN_PROVINCES.has(province) ? province : null;
}

function provinceFromRegulationId(id: string): string | null {
  const match = id.match(/^([A-Z]{2})_/);
  return match && CANADIAN_PROVINCES.has(match[1]) ? match[1] : null;
}

function detailsProvince(details: Record<string, any>): string | null {
  return normalizeProvince(firstString(details, ["province", "consumerProvince", "jurisdiction"]));
}

function detailsAccountType(details: Record<string, any>): string | null {
  return firstString(details, ["accountType", "portfolioType", "accountClassification"]);
}

function inferredFieldName(violation: DetectedViolation): string | null {
  const details = detailsOf(violation);
  const direct = firstString(details, ["fieldName", "field", "matchedField"]);
  if (direct) return direct;

  const ruleName = firstString(details, ["ruleName", "detectorRuleName"]);
  if (ruleName && RULE_FIELD_MAP[ruleName]) return RULE_FIELD_MAP[ruleName];

  const message = [
    firstString(details, ["message", "reason", "issue"]),
    violation.userExplanation,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (message.includes("closing date") || message.includes("closed date")) return "dateClosed";
  if (message.includes("first went overdue") || message.includes("first delinquency")) return "dateOfFirstDelinquency";
  if (message.includes("sent to collections") || message.includes("assigned to collection")) return "dateAssignedToCollection";
  if (message.includes("account type")) return "accountType";
  if (message.includes("account number")) return "accountNumber";
  if (message.includes("original creditor") || message.includes("original company")) return "originalCreditorName";
  if (message.includes("monthly payment")) return "scheduledMonthlyPayment";
  if (message.includes("reported")) return "lastReportedDate";

  return null;
}

function isRegulationAllowedForProvince(id: string, province: string | null): boolean {
  const regulationProvince = provinceFromRegulationId(id);
  if (!regulationProvince) return true;
  return province ? regulationProvince === province : false;
}

function regulationIdsFromDetails(details: Record<string, any>): string[] {
  return Array.isArray(details.regulationIds)
    ? details.regulationIds.filter((id: unknown): id is string => typeof id === "string" && Boolean(id.trim()))
    : [];
}

function hasReportingStandardRequiredFieldAuthority(
  violation: DetectedViolation,
  details: Record<string, any>,
): boolean {
  const ruleName = firstString(details, ["ruleName", "detectorRuleName"]);
  if (!ruleName || !REPORTING_STANDARD_REQUIRED_FIELD_RULES.has(ruleName)) return false;

  const regulationIds = [
    ...new Set([
      ...regulationIdsFromDetails(details),
      ...(regulationRegistry.VIOLATION_REGULATION_MAP[violation.violationCategory] ?? []),
    ]),
  ];

  return regulationIds.some((id) => {
    if (!isRegulationAllowedForProvince(id, detailsProvince(details))) return false;
    const authority = getBonaFideLegalAuthorityById(id);
    return authority?.supportLevel === "reporting_standard";
  });
}

function formatTriggerValue(value: unknown, fieldName?: string | null): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  const masked = maskSensitiveValue(text, fieldName);
  return masked && masked !== "{}" ? masked.slice(0, 160) : null;
}

function compactWords(value: string, maxWords: number): string {
  return value.replace(/\s+/g, " ").trim().split(/\s+/).slice(0, maxWords).join(" ");
}

function sourceFields(details: Record<string, any>, inferredField?: string | null): string[] {
  const fields = [
    firstString(details, ["fieldName", "field", "matchedField", "check"]),
    inferredField,
    ...(["sourceFields", "fields"] as const).flatMap((key) =>
      Array.isArray(details[key])
        ? details[key].filter((value: unknown): value is string => typeof value === "string" && Boolean(value.trim()))
        : [],
    ),
  ].filter((value): value is string => Boolean(value));

  return [...new Set(fields)].sort();
}

function factualTrigger(violation: DetectedViolation): string {
  const details = detailsOf(violation);
  const issue = firstString(details, ["issue", "reason", "check", "condition"]);
  const fieldName = inferredFieldName(violation);
  const value = formatTriggerValue(
    firstDefined(details, [
      "detectedValue",
      "matchedValue",
      "currentValue",
      "reportedValue",
      "expectedValue",
      "balance",
      "status",
    ]),
    fieldName,
  );

  const parts = [
    issue ? `issue=${issue}` : null,
    fieldName ? `field=${fieldName}` : null,
    value ? `value=${value}` : null,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0
    ? parts.join("; ")
    : compactWords(redactSensitiveText(violation.userExplanation || violation.violationCategory), 30);
}

function evidenceLink(
  violation: DetectedViolation,
  context?: EvidenceLocationResolveContext,
): DeterministicViolationEvidenceLink {
  const details = detailsOf(violation);
  const existingEvidence = objectValue(details.evidenceLink);
  const pageNumber = Number(details.pageNumber ?? details.page ?? details.sourcePage);
  const fieldName = inferredFieldName(violation);
  const snippet = firstString(details, [
    "textSnippet",
    "sourceText",
    "evidenceSnippet",
    "excerpt",
    "rawSectionText",
  ]);
  const reportArtifactId = Number(
    existingEvidence?.reportArtifactId ??
      existingEvidence?.sourceReportArtifactId ??
      details.reportArtifactId ??
      details.sourceReportArtifactId,
  );
  const evidenceId = firstString(details, ["evidenceId", "canonicalEvidenceId"]) ??
    firstString(existingEvidence ?? {}, ["evidenceId", "canonicalEvidenceId"]);
  const evidenceFieldKey = firstString(details, ["fieldKey", "canonicalFieldKey"]) ??
    firstString(existingEvidence ?? {}, ["fieldKey", "canonicalFieldKey"]);
  const evidenceSourceField = firstString(details, ["sourceField", "canonicalField", "disputedField"]) ??
    firstString(existingEvidence ?? {}, ["sourceField", "canonicalField", "field"]);
  const evidenceLocation = resolveEvidenceLocation(context, {
    reportArtifactId,
    evidenceId,
    fieldKey: evidenceFieldKey,
    sourceField: evidenceSourceField,
    fieldName,
  });

  return {
    ...(existingEvidence ?? {}),
    ...(violation.tradelineId ?? details.tradelineId ? { tradelineId: Number(violation.tradelineId ?? details.tradelineId) } : {}),
    ...(Number.isFinite(reportArtifactId) && reportArtifactId > 0 ? { reportArtifactId } : {}),
    ...(evidenceId ? { evidenceId } : {}),
    ...(fieldName ? { fieldName } : {}),
    ...(Number.isFinite(pageNumber) ? { pageNumber } : {}),
    ...(snippet ? { textSnippet: compactWords(snippet, 40) } : {}),
    ...(evidenceLocation ? { evidenceLocation } : {}),
    source: "detector_technical_details",
  } as DeterministicViolationEvidenceLink;
}

function normalizedRuleId(details: Record<string, any>, category: ViolationCategory): string {
  const explicit = firstString(details, ["deterministicRuleId", "detectorRuleId"]);
  if (explicit) return explicit;

  const dynamicRuleId = firstDefined(details, ["dynamicRuleId"]);
  if (typeof dynamicRuleId === "number" && Number.isFinite(dynamicRuleId)) return `dynamic:${dynamicRuleId}`;
  if (typeof dynamicRuleId === "string" && dynamicRuleId.trim()) return `dynamic:${dynamicRuleId.trim()}`;

  const rawRuleId = details.ruleId;
  if (typeof rawRuleId === "number" && Number.isFinite(rawRuleId)) return `dynamic:${rawRuleId}`;
  if (typeof rawRuleId === "string" && rawRuleId.trim()) return rawRuleId.trim();

  return `deterministic-violation-${category.toLowerCase().replace(/_/g, "-")}-v1`;
}

function normalizedRuleVersion(details: Record<string, any>): string {
  const explicit = firstString(details, ["ruleVersion", "deterministicRuleVersion", "detectorRuleVersion"]);
  if (explicit) return explicit;
  const deterministicRule = objectValue(details.deterministicRule);
  const envelopeVersion = stringValue(deterministicRule?.ruleVersion);
  return envelopeVersion ?? "v1";
}

function meaningfulEvidenceLink(evidence: DeterministicViolationEvidenceLink | Record<string, unknown> | null): boolean {
  if (!evidence) return false;
  return Boolean(
    stringValue(evidence.evidenceId) ||
      stringValue(evidence.fieldName) ||
      stringValue(evidence.textSnippet) ||
      objectValue(evidence.evidenceLocation) ||
      (typeof evidence.reportArtifactId === "number" && Number.isFinite(evidence.reportArtifactId)) ||
      (typeof evidence.pageNumber === "number" && Number.isFinite(evidence.pageNumber)),
  );
}

function evidenceHasLocation(evidence: DeterministicViolationEvidenceLink | Record<string, unknown> | null): boolean {
  return Boolean(evidence && objectValue(evidence.evidenceLocation));
}

function evidenceIdsFrom(details: Record<string, any>, evidence: DeterministicViolationEvidenceLink): string[] {
  const ids = [
    ...(Array.isArray(details.evidenceIds) ? details.evidenceIds : []),
    details.evidenceId,
    details.canonicalEvidenceId,
    evidence.evidenceId,
  ]
    .map((value) => stringValue(value))
    .filter((value): value is string => Boolean(value));

  return [...new Set(ids)].sort();
}

function regulationReferenceIdsFrom(
  deterministicRule: DeterministicViolationRuleEnvelope,
  details: Record<string, any>,
): string[] {
  const ids = [
    ...deterministicRule.regulationReferences.map((ref) => ref.id),
    ...(Array.isArray(details.regulationReferences)
      ? details.regulationReferences.flatMap((ref: any) => [
          typeof ref === "string" ? ref : null,
          ref?.id,
          ref?.regulationId,
        ])
      : []),
  ]
    .map((value) => stringValue(value))
    .filter((value): value is string => Boolean(value));

  return [...new Set(ids)].sort();
}

function extractionGatePacketReady(details: Record<string, any>): boolean {
  const gate = objectValue(details.extractionConfidenceGate);
  return !gate || gate.packetReady !== false;
}

function parserUncertaintyStatus(
  details: Record<string, any>,
  validationStatus?: string | null,
): string {
  const gate = evaluateViolationPacketConfidenceGate({
    technicalDetails: details,
    validationStatus,
  });
  return gate.status;
}

function adminReviewStatus(input: {
  validationStatus?: string | null;
  userStatus?: string | null;
}): string {
  const userStatus = input.userStatus?.toLowerCase();
  if (userStatus === "dismissed" || userStatus === "verified") return userStatus;

  const validationStatus = input.validationStatus?.toUpperCase();
  if (validationStatus === "PARSER_UNCERTAIN" || validationStatus === "NEEDS_PARSER_REVIEW") return "parser_uncertain";
  if (validationStatus === "NEEDS_USER_REVIEW") return "needs_user_review";

  return userStatus || "active";
}

function packetEligibilitySummary(input: {
  details: Record<string, any>;
  hasEvidenceLink: boolean;
  validationStatus?: string | null;
  userStatus?: string | null;
}): { eligible: boolean; reasonCodes: string[] } {
  const gate = evaluateViolationPacketConfidenceGate({
    technicalDetails: input.details,
    validationStatus: input.validationStatus,
    userStatus: input.userStatus,
  });
  const reasonCodes: string[] = [];

  if (!input.hasEvidenceLink) {
    reasonCodes.push("MISSING_REQUIRED_EVIDENCE", "MANUAL_REVIEW_REQUIRED");
  }
  if (!extractionGatePacketReady(input.details)) {
    reasonCodes.push("EXTRACTION_CONFIDENCE_NOT_READY");
  }
  if (gate.blockerCode === "parser_uncertain") {
    reasonCodes.push("PARSER_UNCERTAIN");
  }
  if (gate.blockerCode === "violation_needs_review") {
    reasonCodes.push("NEEDS_USER_REVIEW");
  }
  if (input.userStatus?.toLowerCase() === "dismissed") {
    reasonCodes.push("DISMISSED_FINDING");
  }

  const uniqueCodes = [...new Set(reasonCodes)];
  return {
    eligible: input.hasEvidenceLink && gate.packetReady && extractionGatePacketReady(input.details) && uniqueCodes.length === 0,
    reasonCodes: uniqueCodes,
  };
}

function neutralRuleExplanation(trigger: string): string {
  const safeTrigger = redactSensitiveText(trigger);
  return safeTrigger
    ? `This item may require review because ${safeTrigger}.`
    : "This item may require review because the available evidence indicates a possible reporting issue.";
}

function isFieldSpecificReferenceAllowed(
  id: string,
  category: ViolationCategory,
  details: Record<string, any>,
  violation: DetectedViolation,
): boolean {
  const authority = getBonaFideLegalAuthorityById(id);
  if (!authority) return false;
  if (authority.supportLevel !== "field_requirement") return true;

  const fieldName = inferredFieldName(violation);
  if (!fieldName) return false;

  return hasFieldSpecificAuthority({
    violationCategory: category,
    fieldName,
    accountType: detailsAccountType(details),
    regulationIds: [id],
    jurisdiction: detailsProvince(details),
  });
}

function matchingFieldRequirementIds(
  category: ViolationCategory,
  details: Record<string, any>,
  violation: DetectedViolation,
): string[] {
  const fieldName = inferredFieldName(violation);
  if (!fieldName) return [];

  const accountType = detailsAccountType(details);
  if (!accountType) return [];

  const province = detailsProvince(details);
  if (!province) return [];

  return (regulationRegistry.VIOLATION_REGULATION_MAP[category] ?? []).filter((id) => {
    if (!isRegulationAllowedForProvince(id, province)) return false;
    const authority = getBonaFideLegalAuthorityById(id);
    if (!authority || authority.supportLevel !== "field_requirement") return false;

    return hasFieldSpecificAuthority({
      violationCategory: category,
      fieldName,
      accountType,
      regulationIds: [id],
      jurisdiction: province,
    });
  });
}

function regulationReferences(
  category: ViolationCategory,
  details: Record<string, any>,
  violation: DetectedViolation,
) {
  const explicitIds = regulationIdsFromDetails(details);
  const categoryIds = regulationRegistry.VIOLATION_REGULATION_MAP[category] ?? [];
  const fieldRequirementIds = matchingFieldRequirementIds(category, details, violation);
  const candidateIds = explicitIds.length > 0
    ? [...explicitIds, ...fieldRequirementIds]
    : categoryIds;
  const ids = [...new Set(candidateIds)];
  const province = detailsProvince(details);

  return ids
    .filter((id) => isRegulationAllowedForProvince(id, province))
    .filter((id) => isFieldSpecificReferenceAllowed(id, category, details, violation))
    .map((id) => {
      const entry = regulationRegistry.getRegulationById(id);
      const authority = getBonaFideLegalAuthorityById(id);
      if (!entry || !authority) return null;
      return {
        id: entry.id,
        statute: entry.statute,
        citation: entry.citation,
        shortLabel: entry.shortLabel,
        textExcerpt: authority?.textExcerpt,
        sourceUrl: authority?.sourceUrl ?? null,
        sourceQuality: authority?.sourceQuality,
        supportLevel: authority?.supportLevel,
        allowsFieldRequiredLanguage: authority?.allowsFieldRequiredLanguage ?? false,
        authorityIssueClassification: classifyAuthorityIssue(authority),
        authorityIssueLabel: authorityIssueLabel(authority),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
}

export function buildDeterministicViolationRuleEnvelope(
  violation: DetectedViolation,
  context?: EvidenceLocationResolveContext,
): DeterministicViolationRuleEnvelope | null {
  if (!violation.violationCategory) return null;
  const details = detailsOf(violation);
  const category = violation.violationCategory;
  const ruleId = normalizedRuleId(details, category);
  const trigger = factualTrigger(violation);
  const refs = regulationReferences(category, details, violation);
  const fieldName = inferredFieldName(violation);

  return {
    ruleId,
    ruleVersion: "v1",
    violationType: category,
    factualTrigger: trigger,
    sourceFields: sourceFields(details, fieldName),
    evidence: evidenceLink(violation, context),
    regulationReferences: refs,
    explanation: neutralRuleExplanation(trigger),
  };
}

export function buildViolationDefensibilityMetadata(
  violation: DetectedViolation,
  options: {
    validationStatus?: string | null;
    userStatus?: string | null;
  } = {},
): ViolationDefensibilityMetadata | null {
  const deterministicRule = buildDeterministicViolationRuleEnvelope(violation);
  if (!deterministicRule) return null;

  const details = detailsOf(violation);
  const evidence = deterministicRule.evidence;
  const hasEvidenceLink = meaningfulEvidenceLink(evidence);
  const evidenceIds = evidenceIdsFrom(details, evidence);
  const regulationReferenceIds = regulationReferenceIdsFrom(deterministicRule, details);
  const sourceFieldValues = deterministicRule.sourceFields.length > 0
    ? deterministicRule.sourceFields
    : ["tradeline"];
  const eligibilityDetails = {
    ...details,
    regulationIds: regulationReferenceIds,
    deterministicRule,
    regulationReferences: deterministicRule.regulationReferences,
    evidenceLink: evidence,
  };
  const findingEligibility = classifyDetectedViolationEligibility({
    ...violation,
    technicalDetails: eligibilityDetails,
  });

  return {
    deterministicRuleId: deterministicRule.ruleId,
    ruleVersion: normalizedRuleVersion(details),
    issueType: deterministicRule.violationType,
    factualTrigger: deterministicRule.factualTrigger,
    sourceFields: sourceFieldValues,
    ...(evidenceIds.length > 0 ? { evidenceIds } : {}),
    hasEvidenceLink,
    ...(evidenceHasLocation(evidence) ? { hasEvidenceLocation: true } : { hasEvidenceLocation: false }),
    ...(regulationReferenceIds.length > 0 ? { regulationReferenceIds } : {}),
    regulationReferenceMode: regulationReferenceIds.length > 0 ? "static_runtime" : "none",
    neutralExplanation: deterministicRule.explanation,
    packetEligibility: packetEligibilitySummary({
      details,
      hasEvidenceLink,
      validationStatus: options.validationStatus,
      userStatus: options.userStatus,
    }),
    adminReviewStatus: adminReviewStatus(options),
    parserUncertaintyStatus: parserUncertaintyStatus(details, options.validationStatus),
    findingEligibility,
    sourceVersion: DEFENSIBILITY_METADATA_SOURCE_VERSION,
  };
}

export function enrichDetectedViolationRuleEvidence(
  violation: DetectedViolation,
  context?: EvidenceLocationResolveContext,
): DetectedViolation {
  const deterministicRule = buildDeterministicViolationRuleEnvelope(violation, context);
  if (!deterministicRule) return violation;
  const resolvedRegulationIds = deterministicRule.regulationReferences.map((ref) => ref.id);
  const baseDetails = {
    ...detailsOf(violation),
    regulationIds: resolvedRegulationIds,
    deterministicRule,
    deterministicRuleId: deterministicRule.ruleId,
    regulationReferences: deterministicRule.regulationReferences,
    factualTrigger: deterministicRule.factualTrigger,
    sourceFields: deterministicRule.sourceFields,
    evidenceLink: deterministicRule.evidence,
  };
  const enrichedViolation = {
    ...violation,
    technicalDetails: baseDetails,
  };
  const eligibilityAnnotatedViolation = annotateDetectedViolationEligibility(enrichedViolation);

  return {
    ...eligibilityAnnotatedViolation,
    technicalDetails: {
      ...eligibilityAnnotatedViolation.technicalDetails,
      defensibility: buildViolationDefensibilityMetadata(eligibilityAnnotatedViolation),
    },
  };
}

export function enrichDetectedViolationDefensibilityMetadata(
  violation: DetectedViolation,
  options: {
    validationStatus?: string | null;
    userStatus?: string | null;
  } = {},
): DetectedViolation {
  const defensibility = buildViolationDefensibilityMetadata(violation, options);
  if (!defensibility) return violation;

  return {
    ...violation,
    technicalDetails: {
      ...annotateDetectedViolationEligibility(violation).technicalDetails,
      defensibility,
    },
  };
}

export function hasBonaFideLocalAuthorityLink(violation: DetectedViolation): boolean {
  const details = detailsOf(violation);
  const existingRefs = Array.isArray(details.regulationReferences) ? details.regulationReferences : null;
  if (existingRefs) {
    const province = detailsProvince(details);
    return existingRefs.some((ref: any) => {
      const id = typeof ref === "string" ? ref : ref?.id ?? ref?.regulationId;
      return (
        typeof id === "string" &&
        isRegulationAllowedForProvince(id, province) &&
        isFieldSpecificReferenceAllowed(id, violation.violationCategory, details, violation)
      );
    });
  }
  return (buildDeterministicViolationRuleEnvelope(violation)?.regulationReferences.length ?? 0) > 0;
}

function hasOwnDetail(details: Record<string, any>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(details, key);
}

function isMissingValue(value: unknown): boolean {
  if (value === undefined) return false;
  if (value === null || value === "") return true;
  const normalized = String(value).trim().toLowerCase();
  return ["null", "undefined", "missing", "missing or empty", "not reported", "unknown", "n/a", "na"].includes(normalized);
}

function hasMissingDetailValue(details: Record<string, any>, keys: string[]): boolean {
  return keys.some((key) => hasOwnDetail(details, key) && isMissingValue(details[key]));
}

export function isMissingInformationReviewIssue(violation: DetectedViolation): boolean {
  if (violation.violationCategory !== "DOCUMENTATION_CHAIN_FAILURE") return false;
  const fieldName = inferredFieldName(violation);
  if (!fieldName) return false;

  const details = detailsOf(violation);
  const text = [
    violation.userExplanation,
    firstString(details, ["message", "reason", "issue"]),
    firstString(details, ["reportedAs", "actualValue", "detectedValue"]),
    firstString(details, ["ruleName", "detectorRuleName"]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    hasMissingDetailValue(details, ["actualValue", "detectedValue", "reportedValue", "currentValue"]) ||
    /\bmissing\b/.test(text) ||
    /\bnot reported\b/.test(text) ||
    /\bdoes not\s+(say|show|include)\b/.test(text) ||
    /\bdoesn['\u2019]?t\s+(say|show|include)\b/.test(text) ||
    /\bno\s+[a-z\s-]*date\b/.test(text) ||
    /\brequired\b/.test(text)
  );
}

export function hasFieldSpecificAuthorityForMissingInformation(violation: DetectedViolation): boolean {
  if (!isMissingInformationReviewIssue(violation)) return true;

  const details = detailsOf(violation);
  const fieldName = inferredFieldName(violation);
  if (!fieldName) return false;

  const regulationIds = [
    ...new Set([
      ...regulationIdsFromDetails(details),
      ...(regulationRegistry.VIOLATION_REGULATION_MAP[violation.violationCategory] ?? []),
    ]),
  ];

  return (
    hasFieldSpecificAuthority({
      violationCategory: violation.violationCategory,
      fieldName,
      accountType: detailsAccountType(details),
      regulationIds,
      jurisdiction: detailsProvince(details),
    }) ||
    hasReportingStandardRequiredFieldAuthority(violation, details)
  );
}

export function filterViolationsWithLocalAuthorityLinks(
  violations: DetectedViolation[],
): DetectedViolation[] {
  return annotateDetectedViolationsEligibility(enrichDetectedViolationsRuleEvidence(violations));
}

export function enrichDetectedViolationsRuleEvidence(
  violations: DetectedViolation[],
  context?: EvidenceLocationResolveContext,
): DetectedViolation[] {
  return violations.map((violation) => enrichDetectedViolationRuleEvidence(violation, context));
}

export function enrichDetectedViolationsDefensibilityMetadata(
  violations: DetectedViolation[],
  options: {
    validationStatus?: string | null;
    userStatus?: string | null;
  } = {},
): DetectedViolation[] {
  return violations.map((violation) => enrichDetectedViolationDefensibilityMetadata(violation, options));
}

export function getDeterministicViolationStatutoryBasis(
  violation: DetectedViolation,
): string | null {
  const eligibility = classifyDetectedViolationEligibility(violation);
  if (!eligibility.formalViolationEligible) return null;

  const details = detailsOf(violation);
  const refs = Array.isArray(details.regulationReferences)
    ? details.regulationReferences
    : buildDeterministicViolationRuleEnvelope(violation)?.regulationReferences ?? [];

  const basis = refs
    .filter((ref: any) => ref?.sourceQuality === "official")
    .map((ref: any) => [ref.statute, ref.citation].filter(Boolean).join(" "))
    .filter((value: string) => value.trim());

  return basis.length > 0 ? basis.slice(0, 3).join("; ") : null;
}
