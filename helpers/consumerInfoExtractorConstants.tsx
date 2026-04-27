export const NAME_BLACKLIST = [
  "DISCLOSURE",
  "INFORMATION",
  "REPORT",
  "CREDIT",
  "EQUIFAX",
  "TRANSUNION",
  "BUREAU",
  "PERSONAL",
  "APPLICANT",
  "FILE",
  "PAGE",
  "CANADA",
  "CANADIAN",
  "CURRENT",
  "MAILING",
  "STREET",
  "ACCOUNT",
  "SUMMARY",
  "TRADELINE",
  "SECTION",
  "OVERVIEW",
];

export const PROVINCE_MAP: Record<string, string> = {
  "ALBERTA": "AB",
  "BRITISH COLUMBIA": "BC",
  "MANITOBA": "MB",
  "NEW BRUNSWICK": "NB",
  "NEWFOUNDLAND": "NL",
  "NOVA SCOTIA": "NS",
  "ONTARIO": "ON",
  "PRINCE EDWARD ISLAND": "PE",
  "QUEBEC": "QC",
  "SASKATCHEWAN": "SK",
  "YUKON": "YT",
};

export const POSTAL_CODE_PATTERN = /\b([A-Za-z]\d[A-Za-z][\s-]?\d[A-Za-z]\d)\b/;

export const PROVINCE_PATTERN = /\b(AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT|Alberta|British\s+Columbia|Manitoba|New\s+Brunswick|Newfoundland|Nova\s+Scotia|Ontario|Prince\s+Edward\s+Island|Quebec|Saskatchewan|Yukon)\b/i;

// Bureau corporate address patterns to skip
export const BUREAU_ADDRESS_INDICATORS = [
  "CONSUMER RELATIONS",
  "HARVESTER ROAD",
  "TRANSUNION",
  "EQUIFAX",
  "CREDIT BUREAU",
  "BUREAU",
  "CONSUMER RELATIONS CENTRE",
  "SUITE 201",
  "BURLINGTON",
];

// Known bureau addresses to skip entirely
export const BUREAU_ADDRESS_PATTERNS = [
  /3115\s+HARVESTER\s+ROAD/i,
  /CONSUMER\s+RELATIONS\s+CENTRE/i,
  /CONSUMER\s+RELATIONS/i,
  /P\.?O\.?\s+BOX.*(?:TRANSUNION|EQUIFAX)/i,
];

// Corporate indicators that suggest this is not a consumer address
export const CORPORATE_INDICATORS = [
  /SUITE\s+\d+/i,
  /CONSUMER\s+RELATIONS/i,
  /CREDIT\s+BUREAU/i,
  /BUREAU\s+(?:CENTER|CENTRE)/i,
];