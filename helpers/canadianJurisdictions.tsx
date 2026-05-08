import type { CanadianProvince } from "./schema";

export const CANADIAN_JURISDICTIONS = [
  "Federal",
  "Alberta",
  "British Columbia",
  "Manitoba",
  "New Brunswick",
  "Newfoundland and Labrador",
  "Northwest Territories",
  "Nova Scotia",
  "Nunavut",
  "Ontario",
  "Prince Edward Island",
  "Quebec",
  "Saskatchewan",
  "Yukon",
] as const;

export type CanadianJurisdiction = (typeof CANADIAN_JURISDICTIONS)[number];

export const PROVINCE_CODE_MAP: Record<CanadianProvince, string> = {
  "AB": "Alberta",
  "BC": "British Columbia",
  "MB": "Manitoba",
  "NB": "New Brunswick",
  "NL": "Newfoundland and Labrador",
  "NT": "Northwest Territories",
  "NS": "Nova Scotia",
  "NU": "Nunavut",
  "ON": "Ontario",
  "PE": "Prince Edward Island",
  "QC": "Quebec",
  "SK": "Saskatchewan",
  "YT": "Yukon",
};

export const REVERSE_PROVINCE_CODE_MAP: Record<string, string> = Object.entries(
  PROVINCE_CODE_MAP
).reduce((acc, [code, name]) => {
  acc[name] = code;
  return acc;
}, {} as Record<string, string>);

const PROVINCE_ALIASES: Record<string, CanadianProvince> = {
  "NEWFOUNDLAND": "NL",
  "LABRADOR": "NL",
  "NEWFOUNDLAND & LABRADOR": "NL",
  "NEWFOUNDLAND AND LABRADOR": "NL",
  "QUEBEC": "QC",
  "YUKON TERRITORY": "YT",
};

export function normalizeProvinceCode(input: string | null | undefined): CanadianProvince | null {
  if (!input) return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  const upper = trimmed.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\./g, "");
  if (upper in PROVINCE_CODE_MAP) {
    return upper as CanadianProvince;
  }

  const matchedEntry = Object.entries(PROVINCE_CODE_MAP).find(
    ([, name]) => name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (matchedEntry) {
    return matchedEntry[0] as CanadianProvince;
  }

  return PROVINCE_ALIASES[upper] ?? null;
}

export function normalizeProvince(input: string): string {
  if (!input) return input;
  const trimmed = input.trim();
  const upperCode = trimmed.toUpperCase();

  if (PROVINCE_CODE_MAP[upperCode]) {
    return PROVINCE_CODE_MAP[upperCode];
  }

  const matchedName = Object.values(PROVINCE_CODE_MAP).find(
    (name) => name.toLowerCase() === trimmed.toLowerCase()
  );
  if (matchedName) {
    return matchedName;
  }

  return trimmed;
}
