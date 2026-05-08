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

export interface DeterministicViolationEvidenceLink {
  tradelineId?: number;
  reportArtifactId?: number;
  fieldName?: string;
  pageNumber?: number;
  textSnippet?: string;
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

function formatTriggerValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return text && text !== "{}" ? text.slice(0, 160) : null;
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
  );

  const parts = [
    issue ? `issue=${issue}` : null,
    fieldName ? `field=${fieldName}` : null,
    value ? `value=${value}` : null,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0
    ? parts.join("; ")
    : compactWords(violation.userExplanation || violation.violationCategory, 30);
}

function evidenceLink(violation: DetectedViolation): DeterministicViolationEvidenceLink {
  const details = detailsOf(violation);
  const pageNumber = Number(details.pageNumber ?? details.page ?? details.sourcePage);
  const fieldName = inferredFieldName(violation);
  const snippet = firstString(details, [
    "textSnippet",
    "sourceText",
    "evidenceSnippet",
    "excerpt",
    "rawSectionText",
  ]);

  return {
    ...(violation.tradelineId ?? details.tradelineId ? { tradelineId: Number(violation.tradelineId ?? details.tradelineId) } : {}),
    ...(details.reportArtifactId ?? details.sourceReportArtifactId
      ? { reportArtifactId: Number(details.reportArtifactId ?? details.sourceReportArtifactId) }
      : {}),
    ...(fieldName ? { fieldName } : {}),
    ...(Number.isFinite(pageNumber) ? { pageNumber } : {}),
    ...(snippet ? { textSnippet: compactWords(snippet, 40) } : {}),
    source: "detector_technical_details",
  };
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
): DeterministicViolationRuleEnvelope | null {
  if (!violation.violationCategory) return null;
  const details = detailsOf(violation);
  const category = violation.violationCategory;
  const ruleId =
    firstString(details, ["deterministicRuleId", "ruleId", "detectorRuleId"]) ??
    `deterministic-violation-${category.toLowerCase().replace(/_/g, "-")}-v1`;
  const trigger = factualTrigger(violation);
  const refs = regulationReferences(category, details, violation);
  const fieldName = inferredFieldName(violation);

  return {
    ruleId,
    ruleVersion: "v1",
    violationType: category,
    factualTrigger: trigger,
    sourceFields: sourceFields(details, fieldName),
    evidence: evidenceLink(violation),
    regulationReferences: refs,
    explanation: `Rule ${ruleId} fired because ${trigger}.`,
  };
}

export function enrichDetectedViolationRuleEvidence(
  violation: DetectedViolation,
): DetectedViolation {
  const deterministicRule = buildDeterministicViolationRuleEnvelope(violation);
  if (!deterministicRule) return violation;
  const resolvedRegulationIds = deterministicRule.regulationReferences.map((ref) => ref.id);

  return {
    ...violation,
    technicalDetails: {
      ...detailsOf(violation),
      regulationIds: resolvedRegulationIds,
      deterministicRule,
      deterministicRuleId: deterministicRule.ruleId,
      regulationReferences: deterministicRule.regulationReferences,
      factualTrigger: deterministicRule.factualTrigger,
      sourceFields: deterministicRule.sourceFields,
      evidenceLink: deterministicRule.evidence,
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
  return violations.filter(
    (violation) =>
      hasBonaFideLocalAuthorityLink(violation) &&
      hasFieldSpecificAuthorityForMissingInformation(violation),
  );
}

export function enrichDetectedViolationsRuleEvidence(
  violations: DetectedViolation[],
): DetectedViolation[] {
  return violations.map(enrichDetectedViolationRuleEvidence);
}

export function getDeterministicViolationStatutoryBasis(
  violation: DetectedViolation,
): string | null {
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
