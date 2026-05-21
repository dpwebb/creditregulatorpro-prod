const INFORMATION_NOT_PROVIDED = "Information not provided on report";
const ACCOUNT_NOT_PROVIDED = "Account number not provided on report";
const ACCOUNT_UNAVAILABLE = "Account identifier unavailable";

export const PACKET_REQUESTED_RESULT_FALLBACK =
  "Requested result: Verify the correct information, or remove/update the item if it cannot be supported.";

const PLACEHOLDER_VALUES = new Set([
  "",
  "unknown",
  "unknown account",
  "unknown creditor",
  "unknown collector",
  "not known",
  "not reported",
  "not provided",
  "not available",
  "information not provided on report",
  "n/a",
  "na",
  "-",
]);

type PacketEvidenceReferenceInput = {
  evidenceReference?: unknown;
  fieldName?: unknown;
  pageNumber?: unknown;
  excerpt?: unknown;
  accountNumber?: string | null;
  hasSourceReport?: boolean;
};

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlaceholder(value: unknown): boolean {
  if (value == null) return true;
  return PLACEHOLDER_VALUES.has(String(value).trim().toLowerCase());
}

function fieldKeySegment(value: unknown): string {
  const raw = String(value ?? "").trim();
  const withoutIndexes = raw.replace(/\[[^\]]*\]/g, "");
  const segments = withoutIndexes.split(/[./:]/).map((segment) => segment.trim()).filter(Boolean);
  return segments.at(-1) ?? raw;
}

function normalizedFieldKey(value: unknown): string {
  return fieldKeySegment(value).replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

function titleizeFieldKey(value: unknown): string {
  const segment = fieldKeySegment(value);
  const spaced = segment
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!spaced) return "Account information";
  return spaced.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

function isInternalReferenceField(value: unknown): boolean {
  const normalized = normalizedFieldKey(value);
  return (
    normalized.includes("artifactid") ||
    normalized.includes("reportartifact") ||
    normalized.includes("sourcereportartifact") ||
    normalized.includes("tradelineid") ||
    normalized.includes("evidenceid") ||
    normalized.includes("canonicalevidenceid") ||
    normalized.includes("ruleid") ||
    normalized.includes("referenceid")
  );
}

export function formatPacketFieldLabel(value: unknown): string {
  if (!hasText(String(value ?? ""))) return "Account information";
  const normalized = normalizedFieldKey(value);

  if (isInternalReferenceField(value)) return "Supporting reference";
  if (normalized === "lasreporteddate" || normalized === "lastreporteddate") return "Date last reported";
  if (normalized === "reporteddate" || normalized === "datereported") return "Date reported by the bureau";
  if (normalized === "accountnumber" || normalized === "account") return "Account";
  if (normalized === "balance" || normalized === "currentbalance") return "Balance reported";
  if (
    normalized === "name" ||
    normalized.includes("creditor") ||
    normalized.includes("collector") ||
    normalized.includes("collectionagency") ||
    normalized.includes("company") ||
    normalized.includes("furnisher")
  ) {
    return "Company reporting the account";
  }

  return titleizeFieldKey(value);
}

function parsePacketDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (!hasText(String(value ?? "")) || isPlaceholder(value)) return null;

  const raw = String(value).trim();
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatPacketDisplayDate(value: unknown): string {
  const date = parsePacketDate(value);
  if (!date) return INFORMATION_NOT_PROVIDED;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatPacketDisplayDateOrNull(value: unknown): string | null {
  const date = parsePacketDate(value);
  return date ? formatPacketDisplayDate(date) : null;
}

function cleanedAccountToken(value: unknown): string | null {
  if (isPlaceholder(value)) return null;
  const cleaned = String(value ?? "").replace(/[^A-Za-z0-9]/g, "");
  if (!cleaned || cleaned.length < 4 || isPlaceholder(cleaned)) return null;
  return cleaned;
}

export function hasReliablePacketAccountIdentifier(value: unknown): boolean {
  const cleaned = cleanedAccountToken(value);
  return Boolean(cleaned && /\d/.test(cleaned));
}

export function formatPacketAccountIdentifier(value: unknown): string {
  if (isPlaceholder(value)) return ACCOUNT_NOT_PROVIDED;
  const cleaned = cleanedAccountToken(value);
  if (!cleaned) return ACCOUNT_UNAVAILABLE;
  if (!/\d/.test(cleaned)) return ACCOUNT_UNAVAILABLE;
  return `Account ending ${cleaned.slice(-4)}`;
}

function isDateField(fieldName: unknown): boolean {
  const normalized = normalizedFieldKey(fieldName);
  return (
    normalized === "lasreporteddate" ||
    normalized === "lastreporteddate" ||
    normalized === "reporteddate" ||
    normalized === "datereported" ||
    normalized === "openeddate" ||
    normalized === "dateopened" ||
    normalized === "dateclosed" ||
    normalized === "dateoffirstdelinquency" ||
    normalized === "dateoflastpayment" ||
    normalized === "lastactivitydate" ||
    normalized.endsWith("date")
  );
}

function isAccountField(fieldName: unknown): boolean {
  const normalized = normalizedFieldKey(fieldName);
  return normalized === "account" || normalized === "accountnumber" || normalized.includes("accountnumber");
}

function isSinField(fieldName: unknown): boolean {
  const normalized = normalizedFieldKey(fieldName);
  return normalized.includes("sin") || normalized.includes("socialinsurance");
}

export function redactPacketSensitiveText(value: unknown, accountNumber?: string | null): string {
  let output = value instanceof Date ? formatPacketDisplayDate(value) : String(value ?? "");

  output = output
    .replace(/\bSIN\s*[:#]?\s*\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/gi, "SIN: [masked]")
    .replace(/\bS\.?I\.?N\.?\s*[:#]?\s*\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/gi, "SIN: [masked]")
    .replace(/\b\d{3}[-\s]\d{3}[-\s]\d{3}\b/g, "[masked SIN]");

  if (hasReliablePacketAccountIdentifier(accountNumber)) {
    const raw = String(accountNumber).trim();
    output = output.split(raw).join(formatPacketAccountIdentifier(raw));
    const normalized = raw.replace(/[^A-Za-z0-9]/g, "");
    if (normalized.length > 4) {
      output = output.split(normalized).join(formatPacketAccountIdentifier(normalized));
    }
  }

  return output
    .replace(/\b(?:source\s+report|report\s+artifact|artifact)\s*(?:id|#)?\s*[:#]?\s*[A-Za-z0-9._-]+\b/gi, "source report")
    .replace(/\btradeline\s*(?:id|#)?\s*[:#]?\s*[A-Za-z0-9._-]+\b/gi, "account record")
    .replace(/\b(?:sourceReportArtifactId|reportArtifactId|tradelineId|evidenceId|canonicalEvidenceId|ruleId|referenceId)\s*[:#]?\s*[A-Za-z0-9._-]+\b/gi, "supporting reference")
    .replace(/\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/g, "the applicable reporting requirements")
    .replace(/\b(?:lastReportedDate|Lastreporteddate|LasReportedDate|reportedDate|dateReported|accountNumber|currentBalance)\b/g, (match) => formatPacketFieldLabel(match))
    .replace(/\bfield\s*:\s*[^;,.]+/gi, "reported item")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatPacketDisplayValue(
  fieldName: unknown,
  value: unknown,
  accountNumber?: string | null,
): string {
  if (isAccountField(fieldName)) return formatPacketAccountIdentifier(value ?? accountNumber);
  if (isSinField(fieldName)) return "[masked]";
  if (isDateField(fieldName) || value instanceof Date || /^\d{4}-\d{2}-\d{2}T/.test(String(value ?? ""))) {
    return formatPacketDisplayDate(value);
  }
  if (isPlaceholder(value)) return INFORMATION_NOT_PROVIDED;
  return redactPacketSensitiveText(value, accountNumber) || INFORMATION_NOT_PROVIDED;
}

export function formatPacketExpectedValue(
  fieldName: unknown,
  value: unknown,
  accountNumber?: string | null,
): string {
  if (isPlaceholder(value)) return PACKET_REQUESTED_RESULT_FALLBACK;
  if ((isDateField(fieldName) || value instanceof Date) && !parsePacketDate(value)) {
    return PACKET_REQUESTED_RESULT_FALLBACK;
  }
  return formatPacketDisplayValue(fieldName, value, accountNumber);
}

function parsePageNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function pageNumberFromEvidenceText(value: unknown): number | null {
  if (!hasText(String(value ?? ""))) return null;
  const match = String(value).match(/\bpage\s*(\d+)\b/i);
  return match ? parsePageNumber(match[1]) : null;
}

function fieldNameFromEvidenceText(value: unknown): string | null {
  if (!hasText(String(value ?? ""))) return null;
  const match = String(value).match(/\bfield\s*:\s*([^;.]+)/i);
  return match?.[1]?.trim() || null;
}

export function formatPacketConsumerEvidenceReference(input: PacketEvidenceReferenceInput): string {
  const raw = String(input.evidenceReference ?? "").trim();
  if (raw.toLowerCase() === "needs manual review") return "Needs manual review";

  const fieldName = input.fieldName ?? fieldNameFromEvidenceText(raw);
  const pageNumber = parsePageNumber(input.pageNumber) ?? pageNumberFromEvidenceText(raw);
  const hasEvidence =
    input.hasSourceReport === true ||
    Boolean(pageNumber) ||
    hasText(String(input.excerpt ?? "")) ||
    hasText(raw);

  if (!hasEvidence) return "Needs manual review";

  const fieldLabel = hasText(String(fieldName ?? "")) ? formatPacketFieldLabel(fieldName) : null;
  if (fieldLabel && pageNumber) return `Relevant report section for ${fieldLabel} on page ${pageNumber}.`;
  if (fieldLabel) return `Relevant report section for ${fieldLabel}.`;
  if (pageNumber) return `Relevant report section on page ${pageNumber}.`;
  if (hasText(String(input.excerpt ?? ""))) return "Relevant report excerpt reviewed.";
  return "Relevant supporting information from the credit report.";
}
