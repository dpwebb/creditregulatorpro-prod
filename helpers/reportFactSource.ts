export const FACT_SOURCE_KINDS = {
  ACCOUNT_BOUND_FIELD: "ACCOUNT_BOUND_FIELD",
  ACCOUNT_APPLIED_CODE: "ACCOUNT_APPLIED_CODE",
  GLOBAL_LEGEND_DEFINITION: "GLOBAL_LEGEND_DEFINITION",
  BUREAU_DISCLOSURE_TEXT: "BUREAU_DISCLOSURE_TEXT",
  SUMMARY_OR_HEADER_DATA: "SUMMARY_OR_HEADER_DATA",
  CONSUMER_IDENTITY_DATA: "CONSUMER_IDENTITY_DATA",
  AMBIGUOUS_TEXT: "AMBIGUOUS_TEXT",
  UNBOUND_TEXT: "UNBOUND_TEXT",
} as const;

export type FactSourceKind = (typeof FACT_SOURCE_KINDS)[keyof typeof FACT_SOURCE_KINDS];

export const EVIDENCE_ROLES = {
  TRIGGER_EVIDENCE: "TRIGGER_EVIDENCE",
  INTERPRETIVE_SUPPORT: "INTERPRETIVE_SUPPORT",
} as const;

export type EvidenceRole = (typeof EVIDENCE_ROLES)[keyof typeof EVIDENCE_ROLES];

const TRANSUNION_CODE_DEFINITION =
  /\b(?:AC|CG|TC|WO|CZ|CO|RP|LS|BK)\s*[-:]\s*[A-Za-z][A-Za-z /-]*/i;

const TRANSUNION_LEGEND_SECTION =
  /\bLegend\b\s*:?\s*(?=(?:AC|CG|TC|WO|CZ|CO|RP|LS|BK)\s*[-:]|(?:AC|CG|TC|WO|CZ|CO|RP|LS|BK)\b)[\s\S]*$/i;

export function stripGlobalLegendDefinitions(text: string | null | undefined): string {
  if (!text) return "";
  return String(text).replace(TRANSUNION_LEGEND_SECTION, " ");
}

export function isGlobalLegendDefinitionText(text: string | null | undefined): boolean {
  if (!text) return false;
  return TRANSUNION_CODE_DEFINITION.test(String(text));
}

export function accountBoundSourceText(text: string | null | undefined): string {
  const withoutLegend = stripGlobalLegendDefinitions(text);
  return isGlobalLegendDefinitionText(withoutLegend) ? "" : withoutLegend;
}

export function accountBoundStatusText(status: string | null | undefined): string {
  if (!status) return "";
  const trimmed = stripGlobalLegendDefinitions(status).trim();
  return isGlobalLegendDefinitionText(trimmed) ? "" : trimmed;
}
