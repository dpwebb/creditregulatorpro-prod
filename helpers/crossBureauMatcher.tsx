export interface MatchableTradeline {
  id: number;
  bureauId?: number | null;
  creditorId?: number | null;
  creditorName?: string | null;
  accountNumber?: string | null;
  balance?: number | string | null;
  currentBalance?: number | string | null;
}

/**
 * Normalizes creditor name for cross-bureau matching.
 * Converts to lower case, removes punctuation, and strips common corporate suffixes.
 */
function normalizeCreditorName(name: string | null | undefined): string {
  if (!name) return "";
  let n = name.toLowerCase();

  // Normalize accents
  n = n.replace(/[éèêë]/g, "e")
       .replace(/[àâ]/g, "a")
       .replace(/[ô]/g, "o")
       .replace(/[ùû]/g, "u")
       .replace(/[ç]/g, "c")
       .replace(/[îï]/g, "i");

  // Remove punctuation
  n = n.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");

  // Common suffixes to strip for better matching
  const suffixes = [
    "communications canada inc",
    "communications canada",
    "canada inc",
    "du canada",
    "inc",
    "ltée",
    "ltee",
    "ltd",
    "canada",
    "banque",
    "bank",
    "corp",
    "corporation",
    "société",
    "societe",
    "senc",
    "llc",
    "cie",
    "co",
    "company",
    "limited",
    "enr",
  ];

  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of suffixes) {
      if (n.endsWith(" " + suffix)) {
        n = n.substring(0, n.length - suffix.length - 1).trim();
        changed = true;
      }
    }
  }

  return n.replace(/\s+/g, " ").trim();
}

/**
 * Checks if two account numbers overlap, with special handling for masked formats.
 * e.g., "***485" and "123485" will match.
 */
function isAccountNumberMatch(
  acc1: string | null | undefined,
  acc2: string | null | undefined
): boolean {
  const normalizeAccountToken = (value: string | null | undefined): string => {
    if (value == null) return "";
    return String(value).toLowerCase().trim();
  };

  const a1 = normalizeAccountToken(acc1);
  const a2 = normalizeAccountToken(acc2);
  if (!a1 || !a2) return false;

  // Exclude placeholder account strings
  if (a1 === "unknown" || a2 === "unknown") return false;
  if (a1 === "not reported" || a2 === "not reported") return false;

  const clean1 = a1.replace(/\D/g, "");
  const clean2 = a2.replace(/\D/g, "");

  // If both have at least 3 digits, check if one ends with the other's digits
  if (clean1.length >= 3 && clean2.length >= 3) {
    return clean1.endsWith(clean2) || clean2.endsWith(clean1);
  }

  // Fallback for short alphanumeric account names
  const alnum1 = a1.replace(/[^a-z0-9]/g, "");
  const alnum2 = a2.replace(/[^a-z0-9]/g, "");

  if (alnum1.length > 0 && alnum2.length > 0) {
    return alnum1 === alnum2;
  }

  return false;
}

/**
 * Checks if creditors match using either primary creditorId or secondary name similarity.
 */
function isCreditorMatch(
  t1: MatchableTradeline,
  t2: MatchableTradeline
): boolean {
  // Primary match: exact ID match
  if (
    t1.creditorId != null &&
    t2.creditorId != null &&
    t1.creditorId === t2.creditorId
  ) {
    return true;
  }

  // Secondary match: normalized name similarity
  const n1 = normalizeCreditorName(t1.creditorName);
  const n2 = normalizeCreditorName(t2.creditorName);
  
  return n1 !== "" && n2 !== "" && n1 === n2;
}

/**
 * Extracts a numeric balance safely from generic tradeline objects.
 */
function getBalance(t: MatchableTradeline): number {
  const bal = t.balance ?? t.currentBalance;
  if (typeof bal === "string") return parseFloat(bal) || 0;
  if (typeof bal === "number") return bal;
  return 0;
}

/**
 * Finds the best cross-bureau matching sibling for a given tradeline.
 * Enforces different bureauId, creditor match, and account number overlap.
 * Uses balance closeness as a tie-breaker.
 */
export function findCrossBureauSibling<T extends MatchableTradeline>(
  tradeline: T,
  allTradelines: T[]
): T | null {
  if (tradeline.bureauId == null) return null;

  // 1 & 2: Same userId (assumed by caller filtering), Different bureauId
  const candidates = allTradelines.filter(
    (t) =>
      t.id !== tradeline.id &&
      t.bureauId != null &&
      t.bureauId !== tradeline.bureauId
  );

  // 3 & 4: Creditor primary/secondary matching
  const creditorMatched = candidates.filter((t) =>
    isCreditorMatch(t, tradeline)
  );

  // 5: Account number overlap requirement
  const accountMatched = creditorMatched.filter((t) =>
    isAccountNumberMatch(t.accountNumber, tradeline.accountNumber)
  );

  if (accountMatched.length === 0) {
    const normalizedAccount =
      tradeline.accountNumber == null
        ? ""
        : String(tradeline.accountNumber).toLowerCase().trim();
    const isAccEmpty =
      normalizedAccount === "" ||
      normalizedAccount === "unknown" ||
      normalizedAccount === "not reported";

    if (isAccEmpty && creditorMatched.length > 0) {
      const targetBal = getBalance(tradeline);
      const tolerance = targetBal * 0.1; // 10% tolerance
      
      let bestFallback: T | null = null;
      let minFallbackDiff = Infinity;

      for (const t of creditorMatched) {
        const bal = getBalance(t);
        const diff = Math.abs(bal - targetBal);
        if (diff <= tolerance && diff < minFallbackDiff) {
          minFallbackDiff = diff;
          bestFallback = t;
        }
      }

      if (bestFallback) return bestFallback;
    }
    return null;
  }
  if (accountMatched.length === 1) return accountMatched[0];

  // 6: Tie-breaker - closest balance
  const targetBal = getBalance(tradeline);

  let bestMatch = accountMatched[0];
  let minDiff = Math.abs(getBalance(bestMatch) - targetBal);

  for (let i = 1; i < accountMatched.length; i++) {
    const diff = Math.abs(getBalance(accountMatched[i]) - targetBal);
    if (diff < minDiff) {
      minDiff = diff;
      bestMatch = accountMatched[i];
    }
  }

  return bestMatch;
}

/**
 * Generates a Map linking all tradeline IDs to their closest cross-bureau sibling IDs.
 */
export interface CrossBureauMatch<T extends MatchableTradeline = MatchableTradeline> {
  source: T;
  target: T;
}

export interface BalanceDiscrepancy {
  tradelineIds: [number, number];
  bureaus: [number | null | undefined, number | null | undefined];
  balances: [number, number];
  accountNumber: string | null | undefined;
  creditorName: string | null | undefined;
}

/**
 * Detects discrepancies between balances of cross-bureau matched tradelines.
 */
export function detectBalanceDiscrepancies(matches: CrossBureauMatch[]): BalanceDiscrepancy[] {
  const discrepancies: BalanceDiscrepancy[] = [];
  const seenPairs = new Set<string>();

  for (const match of matches) {
    const { source, target } = match;
    const sourceBal = getBalance(source);
    const targetBal = getBalance(target);

    // Create a unique key for the pair to avoid duplicate logging (since A->B and B->A might both be matches)
    const pairKey = [source.id, target.id].sort((a, b) => a - b).join("-");
    
    if (Math.abs(sourceBal - targetBal) > 1 && !seenPairs.has(pairKey)) {
      seenPairs.add(pairKey);
      discrepancies.push({
        tradelineIds: [source.id, target.id],
        bureaus: [source.bureauId, target.bureauId],
        balances: [sourceBal, targetBal],
        accountNumber: source.accountNumber || target.accountNumber,
        creditorName: source.creditorName || target.creditorName,
      });
    }
  }

  if (discrepancies.length > 5) {
    console.warn(`[CrossBureauMatcher] Systemic issue detected: ${discrepancies.length} balance discrepancies across bureaus:`, discrepancies);
  }

  return discrepancies;
}

/**
 * Generates a Map linking all tradeline IDs to their closest cross-bureau sibling IDs.
 */
export function findAllCrossBureauPairs<T extends MatchableTradeline>(
  tradelines: T[]
): Map<number, number> {
  const map = new Map<number, number>();

  const matches: CrossBureauMatch<T>[] = [];

  for (const t of tradelines) {
    const sibling = findCrossBureauSibling(t, tradelines);
    if (sibling) {
      map.set(t.id, sibling.id);
      matches.push({ source: t, target: sibling });
    }
  }

  // Detect and log any balance discrepancies found during the match.
  detectBalanceDiscrepancies(matches);

  return map;
}
