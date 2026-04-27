/**
 * Normalizes account status to a canonical keyword.
 */
export function extractCanonicalStatus(status: string): string | null {
  const s = status.toUpperCase().trim();
  
  // Handle Canadian credit rating codes: [R/O/I/M/C] followed by 1-9
  const ratingMatch = s.match(/^[ROIMC]([1-9])/);
  if (ratingMatch) {
    const digit = ratingMatch[1];
    switch (digit) {
      case '1': return "CURRENT";
      case '2':
      case '3':
      case '4': return "DELINQUENT";
      case '5': return "COLLECTION";
      case '6':
      case '7': return "CONSUMER PROPOSAL";
      case '8': return "REPOSSESSION";
            case '9': return "CHARGE OFF";
    }
  }
  
  if (s.includes("CHARGE") || s.includes("CHARGED OFF") || s.includes("BAD DEBT")) return "CHARGE OFF";
  if (s.includes("COLLECTION")) return "COLLECTION";
  if (s.includes("SETTLE")) return "SETTLED";
  if (s.includes("PAID")) return "PAID";
  if (s.includes("DELINQUENT") || s.includes("LATE") || s.includes("PAST DUE")) return "DELINQUENT";
  if (s.includes("CURRENT") || s.includes("PAYS AS AGREED") || s.includes("OK")) return "CURRENT";
  if (s.includes("CLOSED")) return "CLOSED";
  if (s.includes("OPEN")) return "OPEN";
  
  return null;
}

/**
 * Normalizes account type to a canonical keyword.
 */
export function extractCanonicalAccountType(type: string): string | null {
  const t = type.toUpperCase();
  
  if (t.includes("MORTGAGE")) return "MORTGAGE";
  if (t.includes("REVOLVING") || t.includes("CREDIT CARD")) return "REVOLVING";
  if (t.includes("INSTALLMENT") || t.includes("LOAN")) return "INSTALLMENT";
  if (t.includes("LINE OF CREDIT")) return "LINE OF CREDIT";
  if (t.includes("COLLECTION")) return "COLLECTION";
  if (t.includes("OPEN")) return "OPEN";
  
  return null;
}

/**
 * Converts rating codes or status strings to human-readable descriptions for UI display.
 */
export function normalizeStatusForDisplay(status: string): string {
  const s = status.toUpperCase().trim();
  const ratingMatch = s.match(/^[ROIMC]([1-9])/);
  if (ratingMatch) {
    const digit = ratingMatch[1];
    switch (digit) {
      case '1': return "Current – Pays as Agreed";
      case '2': return "Late 30 Days";
      case '3': return "Late 60 Days";
      case '4': return "Late 90 Days";
      case '5': return "Collection Account";
      case '6':
      case '7': return "Consumer Proposal";
      case '8': return "Repossession";
      case '9': return "Bad Debt / Charge Off";
    }
  }
  
  return status;
}