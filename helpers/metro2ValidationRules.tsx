import { isAfter, isBefore, isValid, parseISO } from "./dateUtils";
import { ValidationSeverity } from "./schema";
import { formatCurrency } from "./formatters";

export type ValidationCategory =
  | "DATES"
  | "BALANCES"
  | "STATUS"
  | "HISTORY"
  | "SEGMENTS"
  | "COMPLETENESS";

export type ValidationResult = {
  valid: boolean;
  message?: string;
  expectedValue?: string;
  actualValue?: string;
};

export type Metro2ValidationRule = {
  ruleName: string;
  category: ValidationCategory;
  severity: ValidationSeverity;
  description: string;
  /**
   * Validates a given data object.
   * The data object is expected to be a flattened representation of a tradeline or segment.
   */
  validate: (data: any) => ValidationResult;
};

export type Metro2RuleSet = {
  version: string; // e.g., "2024", "2025"
  rules: Metro2ValidationRule[];
};

// --- Helper Functions ---

const isValidDate = (dateStr: string | null | undefined): boolean => {
  if (!dateStr) return false;
  const date = parseISO(dateStr);
  return isValid(date);
};

const getNumeric = (val: any): number => {
  const num = Number(val);
  return isNaN(num) ? 0 : num;
};

// --- Rules Implementation ---

const BaseSegmentRequiredFields: Metro2ValidationRule = {
  ruleName: "BASE_SEGMENT_REQUIRED",
  category: "COMPLETENESS",
  severity: "ERROR",
  description: "Ensures basic account information is present.",
  validate: (data: any) => {
    const required = [
      "accountNumber",
      "status",
      "openedDate",
      "currentBalance",
    ];

    if (data.isCollectionAccount) {
      const statusIdx = required.indexOf("status");
      if (statusIdx > -1) {
        required.splice(statusIdx, 1);
      }

      const openedDateIdx = required.indexOf("openedDate");
      if (openedDateIdx > -1) {
        required.splice(openedDateIdx, 1);
      }
    }

    const hasCreditorName = data.creditorName && data.creditorName.trim() !== "" && data.creditorName !== "Unknown";
    if (hasCreditorName) {
      const index = required.indexOf("accountNumber");
      if (index > -1) {
        required.splice(index, 1);
      }
    }
    
    const fieldNames: Record<string, string> = {
      accountNumber: "account number",
      status: "account status",
      openedDate: "date opened",
      currentBalance: "current balance"
    };

    const missing = required.filter(
      (field) => {
        const value = data[field];
        // Check for null, undefined, empty string, or "Unknown" (parser default)
        return value === undefined || value === null || value === "" || value === "Unknown";
      }
    );

    if (missing.length > 0) {
      const missingNames = missing.map(f => fieldNames[f] || f).join(", ");
      return {
        valid: false,
        message: `This account is missing important information: ${missingNames}`,
        expectedValue: "All required fields present",
        actualValue: `Missing: ${missingNames}`,
      };
    }
    return { valid: true };
  },
};

const DateLogicOpenedVsReported: Metro2ValidationRule = {
  ruleName: "DATE_OPENED_VS_REPORTED",
  category: "DATES",
  severity: "ERROR",
  description: "The date the account was opened cannot be after the date it was reported.",
  validate: (data: any) => {
    const reportedDate = data.reportedDate ?? data.reportDate;
    if (!data.openedDate || !reportedDate) return { valid: true }; // Skip if missing
    if (isAfter(parseISO(data.openedDate), parseISO(reportedDate))) {
      return {
        valid: false,
        message: "The date this account was opened is later than the date it was reported, which doesn't make sense.",
        expectedValue: `<= ${reportedDate}`,
        actualValue: data.openedDate,
      };
    }
    return { valid: true };
  },
};

const DateLastPaymentAfterReportDate: Metro2ValidationRule = {
  ruleName: "DATE_LAST_PAYMENT_AFTER_REPORT_DATE",
  category: "DATES",
  severity: "ERROR",
  description: "The date of last payment cannot be after the credit report date.",
  validate: (data: any) => {
    if (!data.dateOfLastPayment || !data.reportDate) return { valid: true };
    if (!isValidDate(data.dateOfLastPayment) || !isValidDate(data.reportDate)) return { valid: true };

    if (isAfter(parseISO(data.dateOfLastPayment), parseISO(data.reportDate))) {
      return {
        valid: false,
        message: "The last payment date is later than the credit report date, which is not possible.",
        expectedValue: `<= ${data.reportDate}`,
        actualValue: data.dateOfLastPayment,
      };
    }

    return { valid: true };
  },
};

const DateLogicDOFD: Metro2ValidationRule = {
  ruleName: "DATE_DOFD_LOGIC",
  category: "DATES",
  severity: "WARNING",
  description: "Checks if the date the account first went overdue makes sense.",
  validate: (data: any) => {
    // If account is delinquent, DOFD is usually required.
    // Simple check: if amountPastDue > 0, DOFD should exist.
    const pastDue = getNumeric(data.amountPastDue);
    if (pastDue > 0 && !data.dateOfFirstDelinquency) {
      return {
        valid: false,
        message: "This account has an overdue amount but doesn't say when it first went overdue.",
        expectedValue: "Valid Date",
        actualValue: "null",
      };
    }
    
    if (!data.isCollectionAccount && data.dateOfFirstDelinquency && data.openedDate) {
       if (isBefore(parseISO(data.dateOfFirstDelinquency), parseISO(data.openedDate))) {
         return {
            valid: false,
            message: "The date this account first went overdue is before it was opened, which doesn't make sense.",
            expectedValue: `>= ${data.openedDate}`,
            actualValue: data.dateOfFirstDelinquency
         }
       }
    }

    return { valid: true };
  },
};

const BalanceConsistencyPastDue: Metro2ValidationRule = {
  ruleName: "BALANCE_PAST_DUE_CONSISTENCY",
  category: "BALANCES",
  severity: "ERROR",
  description: "The overdue amount cannot be more than the total balance.",
  validate: (data: any) => {
    const status = (data.status || "").toUpperCase();
    const accountType = (data.accountType || "").toUpperCase();
    const mop = String(data.mop || data.mannerOfPayment || "");
    
    const isMop9 = mop.includes("9");
    const isBadDebtStatus = status.includes("CHARGE") || status.includes("CHARGEOFF") || status.includes("TRANSFERRED") || status.includes("COLLECTION") || status.includes("BAD DEBT") || status.includes("WRITEOFF") || status.includes("WRITE-OFF") || status.includes("97");
    const isCollectionAccount = accountType.includes("COLLECTION") || data.is_collection_account;

    if (isMop9 || isBadDebtStatus || isCollectionAccount) {
      return { valid: true };
    }

    const current = getNumeric(data.currentBalance);
    const pastDue = getNumeric(data.amountPastDue);

    if (pastDue > current && current > 0) {
      return {
        valid: false,
        message: "The overdue amount is more than the total balance, which doesn't add up.",
        expectedValue: `<= ${formatCurrency(current)}`,
        actualValue: formatCurrency(pastDue),
      };
    }
    return { valid: true };
  },
};

const BalanceExceedsCreditLimit: Metro2ValidationRule = {
  ruleName: "BALANCE_EXCEEDS_CREDIT_LIMIT",
  category: "BALANCES",
  severity: "ERROR",
  description: "The current balance cannot exceed the credit limit on a revolving account.",
  validate: (data: any) => {
    const current = getNumeric(data.currentBalance);
    const creditLimit = getNumeric(data.creditLimit);
    const accountType = String(data.accountType || "").toUpperCase();
    const portfolioType = String(data.portfolioType || "").toUpperCase();
    const isRevolving =
      portfolioType === "R" ||
      accountType.includes("REVOLV") ||
      accountType.includes("CREDIT CARD") ||
      accountType.includes("LINE OF CREDIT");

    if (isRevolving && creditLimit > 0 && current > creditLimit) {
      return {
        valid: false,
        message: `The balance ${formatCurrency(current)} exceeds the credit limit ${formatCurrency(creditLimit)} on this revolving account.`,
        expectedValue: `<= ${formatCurrency(creditLimit)}`,
        actualValue: formatCurrency(current),
      };
    }

    return { valid: true };
  },
};

const BalancePaidZero: Metro2ValidationRule = {
  ruleName: "BALANCE_PAID_ZERO",
  category: "BALANCES",
  severity: "ERROR",
  description: "Accounts marked as paid off must have a zero balance.",
  validate: (data: any) => {
    const status = (data.status || "").toUpperCase();
    const current = getNumeric(data.currentBalance);
    const pastDue = getNumeric(data.amountPastDue);

    // Common codes for paid/closed: 13 (Paid), 61 (Paid in full was collection), 62 (Paid in full was charge-off), etc.
    // Or string status like "Paid", "Closed"
    const isPaidStatus = ["13", "61", "62", "63", "64", "PAID", "PIF"].some(s => status.includes(s));

    if (isPaidStatus && (current > 0 || pastDue > 0)) {
      return {
        valid: false,
        message: "This account is marked as paid off but still shows money owed.",
        expectedValue: formatCurrency(0),
        actualValue: `Current: ${formatCurrency(current)}, PastDue: ${formatCurrency(pastDue)}`,
      };
    }
    return { valid: true };
  },
};

const CreditorNameRequired: Metro2ValidationRule = {
  ruleName: "CREDITOR_NAME_REQUIRED",
  category: "COMPLETENESS",
  severity: "ERROR",
  description: "The name of the company reporting the account must be present.",
  validate: (data: any) => {
    const creditorName = data.creditorName;
    if (!creditorName || creditorName.trim() === "" || creditorName === "Unknown") {
      return {
        valid: false,
        message: "This account doesn't say which company is reporting it.",
        expectedValue: "Valid creditor name",
        actualValue: creditorName || "null",
      };
    }
    return { valid: true };
  },
};

const DateClosedRequired: Metro2ValidationRule = {
  ruleName: "DATE_CLOSED_REQUIRED",
  category: "DATES",
  severity: "ERROR",
  description: "The closing date must be present for closed accounts.",
  validate: (data: any) => {
    const accountType = (data.accountType || "").toUpperCase();
    const status = (data.status || "").toUpperCase();
    const mop = String(data.mop || data.mannerOfPayment || "");
    const dateClosed = data.dateClosed;
    
    if (accountType.includes("OPEN")) {
      return { valid: true };
    }

    if (mop === "1" && status.startsWith("CZ")) {
      return { valid: true };
    }

    // Common closed status indicators
    const isClosedStatus = status.includes("CLOSED") || 
                          status.includes("PAID") || 
                          status.includes("SETTLED") ||
                          status.includes("13") || // Paid in full
                          status.includes("61") || // Paid in full, was collection
                          status.includes("62"); // Paid in full, was charge-off
    
    if (isClosedStatus && !dateClosed) {
      return {
        valid: false,
        message: "This account shows as closed but doesn't include a closing date.",
        expectedValue: "Valid closed date",
        actualValue: "null",
      };
    }
    return { valid: true };
  },
};

// --- Rule Sets ---

export const Metro2Rules2024: Metro2RuleSet = {
  version: "2024",
  rules: [
    BaseSegmentRequiredFields,
    DateLogicOpenedVsReported,
    DateLastPaymentAfterReportDate,
    DateLogicDOFD,
    BalanceConsistencyPastDue,
    BalanceExceedsCreditLimit,
    BalancePaidZero,
    CreditorNameRequired,
    DateClosedRequired,
  ],
};

export const Metro2Rules2025: Metro2RuleSet = {
  version: "2025",
  rules: [
    BaseSegmentRequiredFields,
    DateLogicOpenedVsReported,
    DateLastPaymentAfterReportDate,
    DateLogicDOFD,
    BalanceConsistencyPastDue,
    BalanceExceedsCreditLimit,
    BalancePaidZero,
    CreditorNameRequired,
    DateClosedRequired,
  ],
};

export const getRulesByYear = (year: number): Metro2RuleSet => {
  if (year >= 2025) return Metro2Rules2025;
  return Metro2Rules2024;
};
