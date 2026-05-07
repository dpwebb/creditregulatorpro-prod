const PLACEHOLDER_VALUES = new Set([
  "unknown",
  "unknown creditor",
  "unknown bureau",
  "not provided",
  "not provided by bureau",
  "not reported",
  "not available",
  "n/a",
  "na",
  "-",
  "--",
]);

export function hasReportedAccountValue(value: string | number | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized.length > 0 && !PLACEHOLDER_VALUES.has(normalized);
}

export function accountDisplayName(value: string | null | undefined): string {
  return hasReportedAccountValue(value) ? String(value).trim() : "Account from your report";
}

export function accountDisplayNameNote(value: string | null | undefined): string | null {
  return hasReportedAccountValue(value) ? null : "Company name was not clear on this report";
}

export function bureauDisplayName(value: string | null | undefined): string {
  return hasReportedAccountValue(value) ? String(value).trim() : "Bureau not listed";
}

export function accountNumberDisplay(value: string | null | undefined): string {
  return hasReportedAccountValue(value) ? String(value).trim() : "Account number not provided";
}

export function reportedFieldDisplay(value: string | number | null | undefined): string | number {
  return hasReportedAccountValue(value) ? value! : "Not reported";
}
