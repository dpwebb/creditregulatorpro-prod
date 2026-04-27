/**
 * Account type and status extractors for tradeline parsing.
 * Handles account types, status codes, responsibility, ECOA codes, etc.
 */

/**
 * Extracts the account type from a tradeline section.
 * Handles Canadian rating prefixes (R, I, M, O) and descriptive types.
 * Enhanced to handle TransUnion's multi-line "Account\nType:\n{TYPE} / {RESPONSIBILITY}" format.
 */
export function extractAccountType(text: string): string | null {
  const patterns = [
    // TransUnion format: "Account\nType:\nREVOLVING / INDIVIDUAL" or "Account\nType:\nINSTALLMENT / INDIVIDUAL"
    // Extract the type part before the slash
    /Account\s*\n\s*Type:\s*\n\s*([A-Z]+)\s*\/\s*[A-Z]+/i,
    // "Type: Revolving" or "Account Type: Credit Card"
    /(?:Account\s+)?Type[\s:]+([A-Za-z\s]+)(?:\n|$)/i,
    // Specific account types
    /\b(Credit Card|Line of Credit|Mortgage|Auto Loan|Personal Loan|Student Loan|Installment|Revolving|Open)\b/i,
    // Canadian rating codes (R=Revolving, I=Installment, M=Mortgage, O=Open)
    /\b([RIMO])\d\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let accountType = match[1].trim();

      // Expand single-letter codes
      if (accountType.length === 1) {
        const expansions: Record<string, string> = {
          R: "Revolving",
          I: "Installment",
          M: "Mortgage",
          O: "Open",
        };
        accountType = expansions[accountType.toUpperCase()] || accountType;
      }

      return accountType;
    }
  }

  return null;
}

/**
 * Maps TransUnion narrative codes to status descriptions.
 */
const TRANSUNION_NARRATIVE_CODES: Record<string, string> = {
  'AC': 'Account Closed',
  'WO': 'Write-off',
  'CG': 'Cancelled by Credit Grantor',
  'TC': 'Turned over to Collection',
  'CZ': 'Closed at Consumer Request',
  'CO': 'Charge-off',
  'RP': 'Repossession',
  'LS': 'Legal Action',
  'BK': 'Bankruptcy',
};

/**
 * Extracts the status/rating from a tradeline section.
 * Handles Canadian rating codes (R1-R9, etc.), descriptive statuses, and TransUnion narrative codes.
 */
export function extractStatus(text: string): string | null {
  const patterns = [
    // TransUnion narrative codes in payment history: "WO / CG" or "AC"
    /\b(AC|WO|CG|TC|CZ|CO|RP|LS|BK)(?:\s*\/\s*[A-Z]{2})?\b/,
    // Canadian rating codes: R1, R2, I1, M1, etc.
    /\b([RIMO][0-9])\b/,
    // "Status: Current" or "Status: Paid"
    /Status[\s:]+([A-Za-z\s-]+)(?:\n|$)/i,
    // Common status terms
    /\b(Open|Closed|Paid|Paid in Full|Current|Charge[-\s]?Off|Collection|Delinquent|In Good Standing|Paid as Agreed)\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const statusCode = match[1].trim().toUpperCase();
      
      // Check if it's a TransUnion narrative code
      if (TRANSUNION_NARRATIVE_CODES[statusCode]) {
        return TRANSUNION_NARRATIVE_CODES[statusCode];
      }
      
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Extracts the responsibility code (Individual, Joint, Authorized User, Cosigner).
 * Enhanced to handle TransUnion's multi-line format with "Account\nType:\n{TYPE} / {RESPONSIBILITY}".
 */
export function extractResponsibilityCode(text: string): string | null {
  const patterns = [
    // TransUnion format: "Account\nType:\nREVOLVING / INDIVIDUAL" - extract responsibility after slash
    /Account\s*\n\s*Type:\s*\n\s*[A-Z]+\s*\/\s*([A-Z]+)/i,
    // "Responsibility: Individual" or "Responsibility: Joint"
    /Responsibility[\s:]+([A-Za-z\s]+)(?:\n|$)/i,
    // "Account Holder: Individual"
    /Account\s+Holder[\s:]+([A-Za-z\s]+)(?:\n|$)/i,
    // Standalone responsibility terms
    /\b(Individual|Joint|Authorized\s+User|Co-?signer)\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const responsibility = match[1].trim();
      // Normalize the value
      const normalized = responsibility.toLowerCase();
      if (normalized.includes('individual')) return 'Individual';
      if (normalized.includes('joint')) return 'Joint';
      if (normalized.includes('authorized')) return 'Authorized User';
      if (normalized.includes('cosigner') || normalized.includes('co-signer')) return 'Cosigner';
    }
  }

  return null;
}

/**
 * Extracts the ECOA code (I, J, A, C, S, B, T, X, Z).
 */
export function extractEcoaCode(text: string): string | null {
  const patterns = [
    // "ECOA: I" or "ECOA Code: J"
    /ECOA(?:\s+Code)?[\s:]+([IJACSTBXZ])\b/i,
    // "ECOA: Individual" (map text to code)
    /ECOA[\s:]+([A-Za-z\s]+)(?:\n|$)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const ecoa = match[1].trim().toUpperCase();
      
      // If it's already a single letter code, return it
      if (ecoa.length === 1 && /[IJACSTBXZ]/.test(ecoa)) {
        return ecoa;
      }
      
      // Map text to ECOA code
      const mapping: Record<string, string> = {
        'INDIVIDUAL': 'I',
        'JOINT': 'J',
        'AUTHORIZED USER': 'A',
        'AUTHORIZED': 'A',
        'COSIGNER': 'C',
        'CO-SIGNER': 'C',
        'SHARED': 'S',
        'BUSINESS': 'B',
        'TERMINATED': 'T',
        'UNDESIGNATED': 'X',
        'MAKER': 'Z',
      };
      
      for (const [key, code] of Object.entries(mapping)) {
        if (ecoa.includes(key)) {
          return code;
        }
      }
    }
  }

  // Fallback: derive from responsibility if found
  const responsibility = extractResponsibilityCode(text);
  if (responsibility) {
    const responsibilityMapping: Record<string, string> = {
      'Individual': 'I',
      'Joint': 'J',
      'Authorized User': 'A',
      'Cosigner': 'C',
    };
    return responsibilityMapping[responsibility] || null;
  }

  return null;
}