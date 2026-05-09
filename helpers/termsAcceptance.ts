function normalizeNumericVersion(value: string): string {
  const parts = value.split(".").map((part) => part.replace(/^0+(?=\d)/, ""));

  while (parts.length > 1 && /^0*$/.test(parts[parts.length - 1])) {
    parts.pop();
  }

  return parts.join(".");
}

export function normalizeTermsVersion(value: string | null | undefined): string | null {
  const cleaned = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^terms[-_\s]*/i, "")
    .replace(/^version[-_\s]*/i, "")
    .replace(/^v(?=\d)/i, "")
    .trim();

  if (!cleaned) return null;

  return /^\d+(?:\.\d+)*$/.test(cleaned)
    ? normalizeNumericVersion(cleaned)
    : cleaned;
}

export function termsVersionsMatch(
  acceptedVersion: string | null | undefined,
  currentVersion: string | null | undefined
): boolean {
  const normalizedCurrent = normalizeTermsVersion(currentVersion);
  if (!normalizedCurrent) return true;

  return normalizeTermsVersion(acceptedVersion) === normalizedCurrent;
}

export function needsTermsAcceptance(input: {
  role: string;
  termsAcceptedAt: string | null | undefined;
  termsAcceptedVersion: string | null | undefined;
  currentTermsVersion: string | null | undefined;
}): boolean {
  if (input.role === "admin" || input.role === "support") return false;
  if (!input.termsAcceptedAt) return true;

  return !termsVersionsMatch(input.termsAcceptedVersion, input.currentTermsVersion);
}
