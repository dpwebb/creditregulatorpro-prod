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

export const PROVINCE_CODE_MAP: Record<string, string> = {
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