const MISSING_ACCOUNT_NUMBER_TOKENS = new Set([
  "UNKNOWN",
  "NA",
  "NAA",
  "NOTREPORTED",
  "NOTPROVIDED",
  "NOTPROVIDEDBYBUREAU",
  "NOTPROVIDEDBYCREDITBUREAU",
  "NOTSUPPLIED",
  "NOTSUPPLIEDBYBUREAU",
  "NOTSUPPLIEDBYCREDITBUREAU",
  "NOTAVAILABLE",
  "NOTAVAILABLEFROMBUREAU",
  "NOTAVAILABLEFROMCREDITBUREAU",
]);

export function normalizeAccountNumber(value: unknown): string | null {
  const normalized = String(value ?? "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();

  if (!normalized || MISSING_ACCOUNT_NUMBER_TOKENS.has(normalized)) {
    return null;
  }

  return normalized;
}

export function accountNumbersMatch(
  a: unknown,
  b: unknown,
): boolean {
  const left = normalizeAccountNumber(a);
  const right = normalizeAccountNumber(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const minLength = Math.min(left.length, right.length);
  return minLength >= 4 && (left.endsWith(right) || right.endsWith(left));
}
