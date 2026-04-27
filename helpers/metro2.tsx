import { isBefore, isAfter, isValid, format } from "./dateUtils";
import {
  getRulesByYear,
  Metro2ValidationRule,
  ValidationResult,
} from "./metro2ValidationRules";

// Re-export ValidationResult for convenience
export type { ValidationResult } from "./metro2ValidationRules";

export type TL = {
  amounts: {
    high: number;
    current: number;
    pastDue: number;
  };
  dates: {
    opened: Date | null;
    reported: Date | null;
    closed: Date | null;
    dofd: Date | null; // Date of First Delinquency
    chargeOff: Date | null;
  };
  status: string;
  remarkCodes: string[];
  payment: {
    scheduledMonthly: number;
  };
  creditorName?: string;
  creditLimit?: number;
  accountType?: string;
  portfolioType?: string;
  paymentPattern?: string;
  isCollectionAccount?: boolean;
};

export type CoherenceIssue = {
  code: string;
  detail: any;
};

/**
 * Detects logical inconsistencies and Metro2 compliance issues in a Tradeline object.
 */
export function detectCoherenceIssues(t: TL): CoherenceIssue[] {
  const issues: CoherenceIssue[] = [];

  // --- DATE_LOGIC_DOFDR ---
  // DOFD logic: Must be >= opened, <= closed (if closed exists), <= reported (if reported exists)
  // Also check if DOFD is missing for derogatory statuses (simple check: if pastDue > 0 or status implies derogatory, usually DOFD is needed, but here we stick to explicit date logic requested)

  if (t.dates.dofd) {
    if (t.dates.opened && isBefore(t.dates.dofd, t.dates.opened)) {
      issues.push({
        code: "DATE_LOGIC_DOFDR",
        detail: {
          message: "DOFD cannot be before Opened Date",
          dofd: t.dates.dofd,
          opened: t.dates.opened,
        },
      });
    }
    if (t.dates.closed && isAfter(t.dates.dofd, t.dates.closed)) {
      issues.push({
        code: "DATE_LOGIC_DOFDR",
        detail: {
          message: "DOFD cannot be after Closed Date",
          dofd: t.dates.dofd,
          closed: t.dates.closed,
        },
      });
    }
    if (t.dates.reported && isAfter(t.dates.dofd, t.dates.reported)) {
      issues.push({
        code: "DATE_LOGIC_DOFDR",
        detail: {
          message: "DOFD cannot be after Reported Date",
          dofd: t.dates.dofd,
          reported: t.dates.reported,
        },
      });
    }
  } else {
    // Check if DOFD is missing for derogatory statuses
    // Common derogatory statuses often imply past due.
    // If pastDue > 0, we generally expect a DOFD.
    if (t.amounts.pastDue > 0) {
      issues.push({
        code: "DATE_LOGIC_DOFDR",
        detail: {
          message: "Missing DOFD for account with Past Due amount",
          pastDue: t.amounts.pastDue,
        },
      });
    }
  }

  // --- METRO2_COHERENCE ---
  // Status contradicts balances/remarks
  const statusUpper = t.status.toUpperCase();

  // 1. PAID/CLOSED but current > 0
  if (
    (statusUpper.includes("PAID") || statusUpper.includes("CLOSED")) &&
    t.amounts.current > 0
  ) {
    issues.push({
      code: "METRO2_COHERENCE",
      detail: {
        message: "Status is PAID/CLOSED but Current Balance is > 0",
        status: t.status,
        currentBalance: t.amounts.current,
      },
    });
  }

  // 2. CHARGE* with current > 0 (Usually Charge Off means balance is moved, though sometimes it remains.
  // However, strict Metro2 often requires specific handling. The prompt implies this is an issue.)
  if (statusUpper.includes("CHARGE") && t.amounts.current > 0) {
    issues.push({
      code: "METRO2_COHERENCE",
      detail: {
        message: "Status indicates Charge Off but Current Balance is > 0",
        status: t.status,
        currentBalance: t.amounts.current,
      },
    });
  }

  // 3. "paid in full" remark while amounts > 0
  const hasPaidInFullRemark = t.remarkCodes.some((code) =>
    code.toLowerCase().includes("paid in full"),
  );
  if (
    hasPaidInFullRemark &&
    (t.amounts.current > 0 || t.amounts.pastDue > 0)
  ) {
    issues.push({
      code: "METRO2_COHERENCE",
      detail: {
        message: "Remark says 'Paid in Full' but balances exist",
        remarkCodes: t.remarkCodes,
        amounts: t.amounts,
      },
    });
  }

  // --- BALANCE_RECON ---
  // pastDue > current (> 0)
  if (
    t.amounts.current > 0 &&
    t.amounts.pastDue > t.amounts.current
  ) {
    issues.push({
      code: "BALANCE_RECON",
      detail: {
        message: "Past Due amount cannot be greater than Current Balance",
        pastDue: t.amounts.pastDue,
        current: t.amounts.current,
      },
    });
  }

  return issues;
}

/**
 * Converts a TL object to a flat data structure expected by Metro2 validation rules.
 */
function tlToFlatData(t: TL): Record<string, any> {
  return {
    accountNumber: "N/A", // TL doesn't have this field, using placeholder
    status: t.status,
    openedDate: t.dates.opened ? format(t.dates.opened, "yyyy-MM-dd") : null,
    reportDate: t.dates.reported ? format(t.dates.reported, "yyyy-MM-dd") : null,
    currentBalance: t.amounts.current,
    amountPastDue: t.amounts.pastDue,
    dateOfFirstDelinquency: t.dates.dofd ? format(t.dates.dofd, "yyyy-MM-dd") : null,
    dateClosed: t.dates.closed ? format(t.dates.closed, "yyyy-MM-dd") : null,
    dateOfLastPayment: null, // Not in TL type
    highCredit: t.amounts.high,
    scheduledMonthlyPayment: t.payment.scheduledMonthly,
    paymentHistoryProfile: null, // Not in TL type
    ecoaCode: null, // Not in TL type
    hasJ1Segment: false, // Not in TL type
    hasJ2Segment: false, // Not in TL type
    creditorName: t.creditorName,
    creditLimit: t.creditLimit,
    accountType: t.accountType,
    portfolioType: t.portfolioType,
    paymentPattern: t.paymentPattern,
    isCollectionAccount: t.isCollectionAccount ?? false,
    is_collection_account: t.isCollectionAccount ?? false,
  };
}

/**
 * Validates a tradeline using Metro2 validation rules for a specific version.
 * 
 * @param tradeline The tradeline object to validate
 * @param metro2Version Optional version string (e.g., "2024", "2025"). Defaults to current year.
 * @returns Array of validation results with rule details
 */
export function validateTradeline(
  tradeline: TL,
  metro2Version?: string
): Array<{
  ruleName: string;
  category: string;
  severity: string;
  valid: boolean;
  message?: string;
  expectedValue?: string;
  actualValue?: string;
}> {
  const year = metro2Version ? parseInt(metro2Version, 10) : new Date().getFullYear();
  const ruleSet = getRulesByYear(year);
  const flatData = tlToFlatData(tradeline);

  const results = ruleSet.rules.map((rule) => {
    const validationResult = rule.validate(flatData);
    return {
      ruleName: rule.ruleName,
      category: rule.category,
      severity: rule.severity,
      valid: validationResult.valid,
      message: validationResult.message,
      expectedValue: validationResult.expectedValue,
      actualValue: validationResult.actualValue,
    };
  });

  return results;
}

/**
 * Checks if the base segment has all required fields.
 * Base segment required fields typically include: account number, status, opened date, current balance.
 * 
 * @param tradeline The tradeline to check
 * @returns Object with isComplete flag and array of missing field names
 */
export function checkBaseSegmentCompleteness(tradeline: TL): {
  isComplete: boolean;
  missingFields: string[];
} {
  const missingFields: string[] = [];

  // Check critical base segment fields
  if (!tradeline.status || tradeline.status.trim() === "") {
    missingFields.push("status");
  }
  if (!tradeline.dates.opened) {
    missingFields.push("openedDate");
  }
  if (tradeline.amounts.current === null || tradeline.amounts.current === undefined) {
    missingFields.push("currentBalance");
  }

  return {
    isComplete: missingFields.length === 0,
    missingFields,
  };
}

/**
 * Validates J1/J2 segment presence based on account designation.
 * For joint accounts (ECOA code 2), J1 or J2 segments should be present.
 * 
 * Note: The TL type doesn't include ECOA code or J1/J2 segment flags,
 * so this function accepts them as optional parameters.
 * 
 * @param ecoaCode ECOA code (e.g., "1" = Individual, "2" = Joint)
 * @param hasJ1Segment Whether J1 segment is present
 * @param hasJ2Segment Whether J2 segment is present
 * @returns Validation result
 */
export function validateJ1J2SegmentPresence(
  ecoaCode?: string,
  hasJ1Segment?: boolean,
  hasJ2Segment?: boolean
): {
  valid: boolean;
  message?: string;
  expectedValue?: string;
  actualValue?: string;
} {
  if (!ecoaCode) {
    return { valid: true }; // Skip validation if ECOA code not provided
  }

  const ecoa = ecoaCode.toUpperCase();
  
  // ECOA Code 2 = Joint Contractual
  if (ecoa === "2") {
    if (!hasJ1Segment && !hasJ2Segment) {
      return {
        valid: false,
        message: "Joint account (ECOA 2) missing J1/J2 segment",
        expectedValue: "J1 or J2 segment present",
        actualValue: "None",
      };
    }
  }

  return { valid: true };
}