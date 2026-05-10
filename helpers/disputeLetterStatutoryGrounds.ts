import {
  getDisputeReasonStatutoryBasis,
  normalizeProvinceCode,
  type EquifaxDisputeReasonCode,
  type StatuteInfo,
} from "./equifaxDisputeReasons";
import type { TradelineDetails, ViolationDetails } from "./equifaxDisputeTemplate";
import {
  getFederalRegulationsForViolation,
  getRegulationsForViolation,
  type RegulationReference,
} from "./violationRegulationMap";

const MAX_STATUTORY_REFERENCES = 4;
const PROVINCE_PREFIX_PATTERN = /^([A-Z]{2})_/;

export interface SpecificStatutoryGroundsInput {
  disputeReasonCode?: EquifaxDisputeReasonCode | null;
  province?: string | null;
  statuteInfo?: StatuteInfo | null;
  violationCategory?: string | null;
  violationDetails?: ViolationDetails | null;
  tradelineDetails?: TradelineDetails | null;
  existingGrounds?: string | null;
}

function compactWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ensureSentence(text: string): string {
  const trimmed = compactWhitespace(text);
  if (!trimmed) return trimmed;
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function normalizeProvince(province?: string | null): string | undefined {
  if (!province?.trim()) return undefined;
  const normalized = normalizeProvinceCode(province.trim());
  return /^[A-Z]{2}$/.test(normalized) ? normalized : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function buildTechnicalDetails(input: SpecificStatutoryGroundsInput): Record<string, unknown> {
  const technicalDetails = { ...asRecord(input.violationDetails?.technicalDetails) };
  const province = normalizeProvince(
    input.province ?? (typeof technicalDetails.province === "string" ? technicalDetails.province : null)
  );

  if (province) technicalDetails.province = province;
  if (!technicalDetails.fieldName && input.violationDetails?.fieldName) {
    technicalDetails.fieldName = input.violationDetails.fieldName;
  }
  if (!technicalDetails.accountType && input.tradelineDetails?.accountType) {
    technicalDetails.accountType = input.tradelineDetails.accountType;
  }
  if (!technicalDetails.portfolioType && input.tradelineDetails?.isCollectionAccount) {
    technicalDetails.portfolioType = "collection";
  }
  if (!technicalDetails.accountStatus && input.tradelineDetails?.status) {
    technicalDetails.accountStatus = input.tradelineDetails.status;
  }
  if (!technicalDetails.balance && input.tradelineDetails?.balance) {
    technicalDetails.balance = input.tradelineDetails.balance;
  }
  if (!technicalDetails.expectedBalance && input.violationDetails?.expectedValue) {
    technicalDetails.expectedBalance = input.violationDetails.expectedValue;
  }

  return technicalDetails;
}

function getProvincePrefix(ref: RegulationReference): string | undefined {
  const match = ref.regulationId?.match(PROVINCE_PREFIX_PATTERN);
  return match?.[1];
}

function isOfficialStatutoryReference(ref: RegulationReference): boolean {
  if (ref.statute === "Metro2 CRRG") return false;
  if (ref.sourceQuality === "private_standard") return false;
  if (ref.authorityType === "reporting_standard") return false;

  return (
    ref.sourceQuality === "official" ||
    ref.authorityType === "statute" ||
    ref.authorityType === "privacy_principle" ||
    ref.statute === "PIPEDA" ||
    ref.statute === "Bankruptcy and Insolvency Act"
  );
}

function referencePriority(ref: RegulationReference, province?: string): number {
  const refProvince = getProvincePrefix(ref);
  if (province && refProvince === province && ref.supportLevel === "field_requirement") return 0;
  if (province && refProvince === province) return 1;
  if (ref.statute === "PIPEDA") return 2;
  if (ref.statute === "Bankruptcy and Insolvency Act") return 2;
  if (ref.sourceQuality === "official") return 3;
  return 4;
}

function selectRelevantReferences(refs: RegulationReference[], province?: string): RegulationReference[] {
  const seenKeys = new Set<string>();
  const seenText = new Set<string>();
  const selected: RegulationReference[] = [];

  const sorted = [...refs]
    .filter(isOfficialStatutoryReference)
    .filter((ref) => {
      const refProvince = getProvincePrefix(ref);
      return !province || !refProvince || refProvince === province;
    })
    .sort((a, b) => referencePriority(a, province) - referencePriority(b, province));

  for (const ref of sorted) {
    const key = ref.regulationId || `${ref.statute}|${ref.section}`;
    const textKey = normalizeForComparison(`${ref.statute} ${ref.section} ${ref.description}`);
    if (seenKeys.has(key) || seenText.has(textKey)) continue;

    seenKeys.add(key);
    seenText.add(textKey);
    selected.push(ref);

    if (selected.length >= MAX_STATUTORY_REFERENCES) break;
  }

  return selected;
}

function formatReference(ref: RegulationReference, index: number): string {
  const heading = [ref.statute, ref.section].filter(Boolean).join(", ");
  const relevantText = ensureSentence(ref.description || "No statutory text excerpt is stored for this mapped authority.");
  const application = ensureSentence(
    ref.specificApplication ||
      "This authority supports a review of whether the reported account information is accurate, complete, and verifiable."
  );
  const source = ref.sourceUrl ? `\n   Source: ${ref.sourceUrl}` : "";

  return `${index}. ${ensureSentence(heading)}\n   Relevant statutory text or authority excerpt: "${relevantText}"\n   Application to this account: ${application}${source}`;
}

function formatReferences(refs: RegulationReference[]): string {
  return [
    "Statutory grounds relied on for this dispute:",
    ...refs.map((ref, index) => formatReference(ref, index + 1)),
  ].join("\n\n");
}

function formatFallbackGrounds(input: SpecificStatutoryGroundsInput, province?: string): string {
  if (input.statuteInfo) {
    const heading = [input.statuteInfo.code, input.statuteInfo.sectionReference].filter(Boolean).join(", ");
    const text =
      input.statuteInfo.description ||
      input.existingGrounds ||
      "No statutory text excerpt is stored for this mapped statute version.";
    const source = input.statuteInfo.sourceUrl ? `\n   Source: ${input.statuteInfo.sourceUrl}` : "";

    return [
      "Statutory grounds relied on for this dispute:",
      `1. ${ensureSentence(heading || "Mapped consumer reporting statute")}\n   Relevant statutory text or authority excerpt: "${ensureSentence(text)}"\n   Application to this account: This statute supports review of whether the reported information is accurate, complete, and verifiable.${source}`,
    ].join("\n\n");
  }

  if (input.disputeReasonCode && province) {
    const basis = getDisputeReasonStatutoryBasis(input.disputeReasonCode, province);
    return [
      "Statutory grounds relied on for this dispute:",
      `1. ${province} consumer reporting authority.\n   Relevant statutory text or authority excerpt: "${ensureSentence(basis)}"\n   Application to this account: This authority supports review of the specific account information identified in this dispute.`,
    ].join("\n\n");
  }

  if (input.existingGrounds?.trim()) {
    return [
      "Statutory grounds relied on for this dispute:",
      `1. Mapped consumer reporting authority.\n   Relevant statutory text or authority excerpt: "${ensureSentence(input.existingGrounds)}"\n   Application to this account: This authority supports review of the specific account information identified in this dispute.`,
    ].join("\n\n");
  }

  return [
    "Statutory grounds relied on for this dispute:",
    '1. Applicable consumer reporting and privacy accuracy authority.\n   Relevant statutory text or authority excerpt: "No mapped statutory text excerpt is available for this finding; review the statute registry before final dispatch."\n   Application to this account: This dispute requires review of whether the reported account information is accurate, complete, and verifiable.',
  ].join("\n\n");
}

export function buildSpecificStatutoryGrounds(input: SpecificStatutoryGroundsInput): string {
  const violationCategory = input.violationDetails?.violationCategory ?? input.violationCategory ?? null;
  const technicalDetails = buildTechnicalDetails(input);
  const province = normalizeProvince(
    input.province ?? (typeof technicalDetails.province === "string" ? technicalDetails.province : null)
  );

  const refs = [
    ...getRegulationsForViolation({ violationCategory, technicalDetails }),
    ...getFederalRegulationsForViolation({ violationCategory, technicalDetails }),
  ];
  const selected = selectRelevantReferences(refs, province);

  if (selected.length > 0) {
    return formatReferences(selected);
  }

  return formatFallbackGrounds(input, province);
}
