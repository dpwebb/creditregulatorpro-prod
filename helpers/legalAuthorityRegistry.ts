import { regulationRegistry, type RegulationEntry } from "./regulationRegistry";
import type { CanadianProvince, ViolationCategory } from "./schema";

export type LegalAuthorityType =
  | "statute"
  | "privacy_principle"
  | "reporting_standard"
  | "procedural_rule"
  | "local_registry_entry";

export type LegalAuthoritySourceQuality =
  | "official"
  | "private_standard"
  | "local_registry";

export type LegalAuthoritySupportLevel =
  | "field_requirement"
  | "category_principle"
  | "procedural_requirement"
  | "reporting_standard"
  | "registry_placeholder";

export interface LocalLegalAuthority {
  id: string;
  regulationId: string;
  authorityType: LegalAuthorityType;
  sourceQuality: LegalAuthoritySourceQuality;
  supportLevel: LegalAuthoritySupportLevel;
  jurisdiction: string;
  province?: CanadianProvince;
  statute: string;
  citation: string;
  shortLabel: string;
  textExcerpt: string;
  sourceUrl: string | null;
  effectiveDate: string | null;
  violationCategories: ViolationCategory[];
  fieldNames: string[];
  accountTypes: string[];
  allowsFieldRequiredLanguage: boolean;
  searchableText: string;
}

export interface LegalAuthoritySearchInput {
  query?: string | null;
  regulationIds?: string[];
  violationCategory?: ViolationCategory | string | null;
  fieldName?: string | null;
  accountType?: string | null;
  jurisdiction?: string | null;
  supportLevel?: LegalAuthoritySupportLevel | null;
  limit?: number | null;
}

export interface LocalAuthorityLookupInput {
  violationCategory?: ViolationCategory | string | null;
  regulationIds?: string[];
}

const PIPEDA_SOURCE_URL = "https://laws-lois.justice.gc.ca/eng/acts/P-8.6/page-7.html";
const BIA_SOURCE_URL = "https://laws-lois.justice.gc.ca/eng/acts/B-3/";

const PROVINCE_SOURCE_URLS: Partial<Record<CanadianProvince, string>> = {
  BC: "https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/96082_01",
  MB: "https://web2.gov.mb.ca/laws/statutes/ccsm/c200e.php",
  NL: "https://www.assembly.nl.ca/Legislation/sr/statutes/c09-02.htm",
  NS: "https://nslegislature.ca/legc/bills/rulesstatutes/statutes/consumers/consumr.htm",
  ON: "https://www.ontario.ca/laws/statute/90c33",
  QC: "https://www.legisquebec.gouv.qc.ca/en/document/cs/P-39.1",
  YT: "https://laws.yukon.ca/cms/images/LEGISLATION/PRINCIPAL/2002/2002-0040/2002-0040.pdf",
};

const getProvinceFromRegulationId = (id: string): CanadianProvince | undefined => {
  const match = id.match(/^([A-Z]{2})_/);
  return match ? (match[1] as CanadianProvince) : undefined;
};

const getAuthorityType = (entry: RegulationEntry): LegalAuthorityType => {
  if (entry.authorityType) return entry.authorityType;
  if (entry.id.startsWith("METRO2_")) return "reporting_standard";
  if (entry.id === "INVESTIGATION_30_DAY") return "procedural_rule";
  if (entry.statute === "PIPEDA") return "privacy_principle";
  if (entry.statute.includes("Act") || entry.statute === "Bankruptcy and Insolvency Act") return "statute";
  return "local_registry_entry";
};

const getSourceQuality = (entry: RegulationEntry): LegalAuthoritySourceQuality => {
  if (entry.sourceQuality) return entry.sourceQuality;
  if (entry.id.startsWith("METRO2_")) return "private_standard";
  if (entry.id === "INVESTIGATION_30_DAY") return "local_registry";
  if (entry.statute === "PIPEDA" || entry.statute === "Bankruptcy and Insolvency Act") return "official";
  if (entry.citation.includes("(") || entry.citation === "Limitations Act") return "local_registry";
  return "official";
};

const getSupportLevel = (entry: RegulationEntry): LegalAuthoritySupportLevel => {
  if (entry.supportLevel) return entry.supportLevel;
  if (entry.id.startsWith("METRO2_")) return "reporting_standard";
  if (entry.id === "INVESTIGATION_30_DAY") return "procedural_requirement";
  if (entry.statute === "PIPEDA" || entry.statute === "Bankruptcy and Insolvency Act") return "category_principle";
  if (entry.citation.includes("(") || entry.citation === "Limitations Act") return "registry_placeholder";
  return "category_principle";
};

const getSourceUrl = (entry: RegulationEntry, province?: CanadianProvince): string | null => {
  if (entry.sourceUrl !== undefined) return entry.sourceUrl ?? null;
  if (entry.statute === "PIPEDA") return PIPEDA_SOURCE_URL;
  if (entry.statute === "Bankruptcy and Insolvency Act") return BIA_SOURCE_URL;
  if (province && PROVINCE_SOURCE_URLS[province]) return PROVINCE_SOURCE_URLS[province] ?? null;
  return null;
};

const normalize = (value: string | null | undefined): string =>
  String(value ?? "").trim().toLowerCase();

const tokenize = (value: string | null | undefined): string[] =>
  normalize(value).split(/[^a-z0-9_.-]+/).filter(Boolean);

const buildSearchableText = (entry: Omit<LocalLegalAuthority, "searchableText">): string =>
  [
    entry.id,
    entry.regulationId,
    entry.authorityType,
    entry.sourceQuality,
    entry.supportLevel,
    entry.jurisdiction,
    entry.province,
    entry.statute,
    entry.citation,
    entry.shortLabel,
    entry.textExcerpt,
    entry.sourceUrl,
    entry.violationCategories.join(" "),
    entry.fieldNames.join(" "),
    entry.accountTypes.join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const createAuthority = (entry: RegulationEntry): LocalLegalAuthority => {
  const province = entry.province ?? getProvinceFromRegulationId(entry.id);
  const supportLevel = getSupportLevel(entry);
  const authority: Omit<LocalLegalAuthority, "searchableText"> = {
    id: entry.id,
    regulationId: entry.id,
    authorityType: getAuthorityType(entry),
    sourceQuality: getSourceQuality(entry),
    supportLevel,
    jurisdiction: entry.jurisdiction ?? province ?? (entry.statute === "PIPEDA" || entry.statute === "Bankruptcy and Insolvency Act" ? "Federal" : "Universal"),
    province,
    statute: entry.statute,
    citation: entry.citation,
    shortLabel: entry.shortLabel,
    textExcerpt: entry.description,
    sourceUrl: getSourceUrl(entry, province),
    effectiveDate: entry.effectiveDate ?? null,
    violationCategories: entry.violationCategories,
    fieldNames: entry.fieldNames ?? [],
    accountTypes: entry.accountTypes ?? [],
    allowsFieldRequiredLanguage: entry.allowsFieldRequiredLanguage ?? supportLevel === "field_requirement",
  };

  return {
    ...authority,
    searchableText: buildSearchableText(authority),
  };
};

export const localLegalAuthorities: LocalLegalAuthority[] = Object.values(
  regulationRegistry.STATUTE_ENTRIES,
).map(createAuthority);

export function getLegalAuthoritiesByRegulationIds(regulationIds: string[]): LocalLegalAuthority[] {
  const wanted = new Set(regulationIds.filter(Boolean));
  return localLegalAuthorities.filter((authority) => wanted.has(authority.regulationId));
}

export function getLegalAuthorityById(id: string): LocalLegalAuthority | undefined {
  return localLegalAuthorities.find((authority) => authority.id === id || authority.regulationId === id);
}

export function isBonaFideLegalAuthority(authority: LocalLegalAuthority): boolean {
  return authority.sourceQuality === "official" || authority.sourceQuality === "private_standard";
}

export function getBonaFideLegalAuthorityById(id: string): LocalLegalAuthority | undefined {
  const authority = getLegalAuthorityById(id);
  return authority && isBonaFideLegalAuthority(authority) ? authority : undefined;
}

export function getBonaFideLegalAuthoritiesByRegulationIds(regulationIds: string[]): LocalLegalAuthority[] {
  return getLegalAuthoritiesByRegulationIds(regulationIds).filter(isBonaFideLegalAuthority);
}

export function getBonaFideLegalAuthoritiesForViolation(input: LocalAuthorityLookupInput): LocalLegalAuthority[] {
  const explicitIds = (input.regulationIds ?? []).filter((id) => typeof id === "string" && Boolean(id.trim()));
  const categoryIds =
    input.violationCategory && typeof input.violationCategory === "string"
      ? regulationRegistry.VIOLATION_REGULATION_MAP[input.violationCategory as ViolationCategory] ?? []
      : [];
  const ids = [...new Set(explicitIds.length > 0 ? explicitIds : categoryIds)];

  return getBonaFideLegalAuthoritiesByRegulationIds(ids);
}

export function hasBonaFideLegalAuthorityForViolation(input: LocalAuthorityLookupInput): boolean {
  return getBonaFideLegalAuthoritiesForViolation(input).length > 0;
}

export function searchLegalAuthorities(input: LegalAuthoritySearchInput = {}): LocalLegalAuthority[] {
  const queryTokens = tokenize(input.query);
  const regulationIdSet = new Set((input.regulationIds ?? []).filter(Boolean));
  const violationCategory = normalize(input.violationCategory);
  const fieldName = normalize(input.fieldName);
  const accountType = normalize(input.accountType);
  const jurisdiction = normalize(input.jurisdiction);
  const supportLevel = input.supportLevel ?? null;
  const limit = Math.max(1, Math.min(Number(input.limit ?? 50), 200));

  const scored = localLegalAuthorities
    .filter((authority) => {
      if (regulationIdSet.size > 0 && !regulationIdSet.has(authority.regulationId)) return false;
      if (supportLevel && authority.supportLevel !== supportLevel) return false;
      if (violationCategory && !authority.violationCategories.some((category) => normalize(category) === violationCategory)) return false;
      if (fieldName && !authority.fieldNames.some((field) => normalize(field) === fieldName)) return false;
      if (
        accountType &&
        authority.accountTypes.length > 0 &&
        !authority.accountTypes.some((type) => {
          const normalizedType = normalize(type);
          return normalizedType === accountType || accountType.includes(normalizedType) || normalizedType.includes(accountType);
        })
      ) {
        return false;
      }
      if (jurisdiction) {
        const authorityJurisdiction = normalize(authority.jurisdiction);
        const authorityProvince = normalize(authority.province);
        if (authorityJurisdiction !== jurisdiction && authorityProvince !== jurisdiction) return false;
      }
      if (queryTokens.length > 0 && !queryTokens.every((token) => authority.searchableText.includes(token))) return false;
      return true;
    })
    .map((authority) => {
      let score = 0;
      for (const token of queryTokens) {
        if (normalize(authority.regulationId) === token) score += 20;
        if (normalize(authority.citation).includes(token)) score += 8;
        if (normalize(authority.shortLabel).includes(token)) score += 5;
        if (normalize(authority.textExcerpt).includes(token)) score += 3;
      }
      if (authority.sourceQuality === "official") score += 2;
      if (authority.supportLevel === "field_requirement") score += 4;
      return { authority, score };
    })
    .sort((a, b) => b.score - a.score || a.authority.id.localeCompare(b.authority.id));

  return scored.slice(0, limit).map((row) => row.authority);
}

export function hasFieldSpecificAuthority(input: {
  violationCategory?: ViolationCategory | string | null;
  fieldName?: string | null;
  accountType?: string | null;
  regulationIds?: string[];
  jurisdiction?: string | null;
}): boolean {
  const fieldName = normalize(input.fieldName);
  if (!fieldName) return false;

  return searchLegalAuthorities({
    regulationIds: input.regulationIds,
    violationCategory: input.violationCategory,
    fieldName,
    accountType: input.accountType,
    jurisdiction: input.jurisdiction,
    supportLevel: "field_requirement",
    limit: 1,
  }).length > 0;
}
