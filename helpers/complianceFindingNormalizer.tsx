import type { DetectedViolation } from "./complianceDetectorTypes";

const ENTITY_LABELS: Record<string, string> = {
  BUREAU: "the credit bureau",
  CREDITOR: "the creditor or furnisher",
  COLLECTOR: "the collection agency",
};

const TEXT_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bdispute\s+(this|the)\s+(account|tradeline|item|inquiry)\s+because\b/gi, replacement: "the $2 needs clarification because" },
  { pattern: /\bdispute\s+(this|the)\s+(account|tradeline|item|inquiry)\b/gi, replacement: "request clarification about this $2" },
  { pattern: /\bviolates?\s+(?:the\s+)?law\b/gi, replacement: "may not align with applicable requirements" },
  { pattern: /\bviolation\s+of\s+([A-Z0-9_. -]+)\b/gi, replacement: "potential inconsistency with $1" },
  { pattern: /\bdelete\s+(?:this|the)?\s*(?:account|tradeline|item|information)?\b/gi, replacement: "review and correct the reported information" },
  { pattern: /\bremove\s+(?:this|the)?\s*(?:account|tradeline|item|information|inquiry)?\b/gi, replacement: "review and correct the reported information" },
  { pattern: /\bremove\s+them\b/gi, replacement: "correct any unsupported information" },
  { pattern: /\bremoved\b/gi, replacement: "reviewed and corrected if unsupported" },
  { pattern: /\bremoval\b/gi, replacement: "correction pathway" },
  { pattern: /\bdeletion\b/gi, replacement: "correction pathway" },
  { pattern: /\bdispute(?:d|s|ing)?\b/gi, replacement: "clarification request" },
  { pattern: /\bdemand(?:ed|s|ing)?\b/gi, replacement: "request" },
  { pattern: /\bcomplain\b/gi, replacement: "request clarification" },
  { pattern: /\billegal(?:ly)?\b/gi, replacement: "not supported by the available record" },
  { pattern: /\bviolat(?:e|es|ed|ion|ions|ing)\b/gi, replacement: "potential inconsistency" },
  { pattern: /\bfraudulent(?:ly)?\b/gi, replacement: "potentially unauthorized or unsupported" },
  { pattern: /\bfraud\b/gi, replacement: "potential unauthorized activity" },
  { pattern: /\bprove\b/gi, replacement: "provide source documentation for" },
  { pattern: /\bproof\b/gi, replacement: "source documentation" },
  { pattern: /\bfailed to\b/gi, replacement: "does not show that it" },
  { pattern: /\bcouldn't\b/gi, replacement: "did not" },
  { pattern: /\bright away\b/gi, replacement: "within the applicable response timeframe" },
  { pattern: /\bimmediately\b/gi, replacement: "within the applicable response timeframe" },
  { pattern: /\bmust\b/gi, replacement: "should be reviewed to determine whether it should" },
  { pattern: /\bshould not be subjected to further collection activity\b/gi, replacement: "requires clarification about the current reporting or collection basis" },
  { pattern: /\btime-barred\b/gi, replacement: "potentially outside the applicable limitation period" },
  { pattern: /\bzombie debt\b/gi, replacement: "reappearing debt record" },
  { pattern: /\bphantom debt\b/gi, replacement: "unverified debt record" },
  { pattern: /\brubber-stamp\b/gi, replacement: "generic" },
  { pattern: /\bretaliation\b/gi, replacement: "post-request adverse change" },
  { pattern: /\bvictim to identity theft\b/gi, replacement: "affected by potential unauthorized activity" },
];

function compactWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function ensurePeriod(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function capitalizeFirst(text: string): string {
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
}

function sanitizeFindingText(text: string): string {
  let output = text;
  for (const rule of TEXT_REPLACEMENTS) {
    output = output.replace(rule.pattern, rule.replacement);
  }

  output = output.replace(/\band\s+request\s+correction\s+pathway\b/gi, "and needs a correction pathway if unsupported");
  output = output.replace(/\s+—\s+/g, " - ");
  return compactWhitespace(output);
}

function humanizeKey(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTechnicalDetails(violation: DetectedViolation): Record<string, any> {
  return violation.technicalDetails && typeof violation.technicalDetails === "object"
    ? violation.technicalDetails
    : {};
}

function firstStringValue(details: Record<string, any>, keys: string[]): string | null {
  for (const key of keys) {
    const value = details[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function firstDefinedValue(details: Record<string, any>, keys: string[]): unknown {
  for (const key of keys) {
    if (details[key] !== undefined && details[key] !== null) return details[key];
  }
  return null;
}

function formatEvidenceValue(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  const formatted =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  if (!formatted || formatted === "{}") return null;
  return formatted.length > 120 ? `${formatted.slice(0, 117)}...` : formatted;
}

function buildEvidenceReference(violation: DetectedViolation): string {
  const details = getTechnicalDetails(violation);
  const parts: string[] = [];
  const tradelineId = violation.tradelineId ?? details.tradelineId;
  const artifactId = details.reportArtifactId ?? details.sourceReportArtifactId;
  const fieldName = firstStringValue(details, ["fieldName", "field", "matchedField", "check", "issue"]);
  const detectedValue = formatEvidenceValue(firstDefinedValue(details, ["detectedValue", "matchedValue", "currentValue", "reportedValue", "balance", "status"]));
  const regulationIds = Array.isArray(details.regulationIds)
    ? details.regulationIds.filter((id) => typeof id === "string")
    : [];

  if (tradelineId !== undefined && tradelineId !== null) {
    parts.push(`tradeline ${tradelineId}`);
  }
  if (artifactId !== undefined && artifactId !== null) {
    parts.push(`report artifact ${artifactId}`);
  }
  if (fieldName) {
    parts.push(`field "${humanizeKey(fieldName)}"`);
  }
  if (detectedValue) {
    parts.push(`reported value "${detectedValue}"`);
  }
  if (regulationIds.length > 0) {
    parts.push(`reference ids ${regulationIds.join(", ")}`);
  }

  return parts.length > 0
    ? parts.join("; ")
    : "available report fields, extraction data, and attached evidence";
}

function buildUserExplanation(violation: DetectedViolation): string {
  const original = sanitizeFindingText(violation.userExplanation || "");
  const explanationWithoutExistingBasis = original
    .replace(/\s*Review basis:[\s\S]*$/i, "")
    .trim();
  const category = humanizeKey(violation.violationCategory || "reporting issue").toLowerCase();
  const base = capitalizeFirst(
    explanationWithoutExistingBasis ||
      `The available report data contains a potential ${category} item that needs clarification.`
  );
  const evidenceReference = buildEvidenceReference(violation);

  const framedBase = /^(the\s+)?(available|source|reported|credit report|account|this)\b/i.test(base)
    ? ensurePeriod(base)
    : `The available report data indicates: ${ensurePeriod(base)}`;

  return `${framedBase} Review basis: ${evidenceReference}.`;
}

function buildRecommendedAction(violation: DetectedViolation): string {
  const details = getTechnicalDetails(violation);
  const entity = violation.responsibleEntity
    ? ENTITY_LABELS[violation.responsibleEntity] || "the reporting party"
    : "the reporting party";
  const fieldName = firstStringValue(details, ["fieldName", "field", "matchedField"]);
  const fieldClause = fieldName ? ` for "${humanizeKey(fieldName)}"` : "";

  return `Ask ${entity} to review the cited report data${fieldClause}, provide the source documentation or reporting basis, explain any discrepancy, and describe the correction pathway for any field that cannot be verified.`;
}

export function normalizeDetectedViolation(
  violation: DetectedViolation
): DetectedViolation {
  return {
    ...violation,
    userExplanation: buildUserExplanation(violation),
    recommendedAction: buildRecommendedAction(violation),
  };
}

export function normalizeDetectedViolations(
  violations: DetectedViolation[]
): DetectedViolation[] {
  return violations.map(normalizeDetectedViolation);
}
