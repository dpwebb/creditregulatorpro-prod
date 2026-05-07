import type { DetectedViolation } from "./complianceDetectorTypes";
import { getBonaFideLegalAuthorityById } from "./legalAuthorityRegistry";
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

function isRegulationAllowedForProvince(id: string, province: string | null): boolean {
  const regulationProvince = provinceFromRegulationId(id);
  if (!regulationProvince) return true;
  return province ? regulationProvince === province : false;
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

function sourceFields(details: Record<string, any>): string[] {
  const fields = [
    firstString(details, ["fieldName", "field", "matchedField", "check"]),
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
  const fieldName = firstString(details, ["fieldName", "field", "matchedField"]);
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
    ...(firstString(details, ["fieldName", "field", "matchedField"]) ? { fieldName: firstString(details, ["fieldName", "field", "matchedField"])! } : {}),
    ...(Number.isFinite(pageNumber) ? { pageNumber } : {}),
    ...(snippet ? { textSnippet: compactWords(snippet, 40) } : {}),
    source: "detector_technical_details",
  };
}

function regulationReferences(category: ViolationCategory, details: Record<string, any>) {
  const explicitIds = Array.isArray(details.regulationIds)
    ? details.regulationIds.filter((id: unknown): id is string => typeof id === "string" && Boolean(id.trim()))
    : [];
  const categoryIds = regulationRegistry.VIOLATION_REGULATION_MAP[category] ?? [];
  const ids = [...new Set(explicitIds.length > 0 ? explicitIds : categoryIds)];
  const province = detailsProvince(details);

  return ids
    .filter((id) => isRegulationAllowedForProvince(id, province))
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
  const refs = regulationReferences(category, details);

  return {
    ruleId,
    ruleVersion: "v1",
    violationType: category,
    factualTrigger: trigger,
    sourceFields: sourceFields(details),
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
      return typeof id === "string" && isRegulationAllowedForProvince(id, province) && Boolean(getBonaFideLegalAuthorityById(id));
    });
  }
  return (buildDeterministicViolationRuleEnvelope(violation)?.regulationReferences.length ?? 0) > 0;
}

export function filterViolationsWithLocalAuthorityLinks(
  violations: DetectedViolation[],
): DetectedViolation[] {
  return violations.filter(hasBonaFideLocalAuthorityLink);
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
    .map((ref: any) => [ref.statute, ref.citation].filter(Boolean).join(" "))
    .filter((value: string) => value.trim());

  return basis.length > 0 ? basis.slice(0, 3).join("; ") : null;
}
