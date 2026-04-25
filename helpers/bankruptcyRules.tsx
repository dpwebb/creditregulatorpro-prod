import { regulationRegistry } from "./regulationRegistry";
import { addYears, isBefore, isValid, parseISO, startOfDay, compareAsc } from "./dateUtils";
import {
  BankruptcyType,
  CanadianProvince,
  BankruptcyRecord,
} from "./schema";

/**
 * Canadian Bankruptcy & Insolvency Retention Rules Helper
 *
 * Implements retention policies based on:
 * 1. Personal Bankruptcy (1st time): 6-7 years from discharge depending on province
 * 2. Personal Bankruptcy (2nd+ time): 14 years from discharge
 * 3. Consumer Proposal: 3 years from completion or 6 years from filing (whichever is sooner)
 * 4. Division I Proposal: 3 years from completion
 * 5. Undischarged Bankruptcy: Indefinite
 */

// --- Types ---

export interface RetentionPeriodResult {
  years: number;
  months: number;
  anchorEvent: "FILING_DATE" | "DISCHARGE_DATE" | "COMPLETION_DATE" | "INDEFINITE";
  description: string;
}

// --- Constants ---

const PROVINCE_LABELS: Record<CanadianProvince, string> = {
  AB: "Alberta",
  BC: "British Columbia",
  MB: "Manitoba",
  NB: "New Brunswick",
  NL: "Newfoundland and Labrador",
  NS: "Nova Scotia",
  NT: "Northwest Territories",
  NU: "Nunavut",
  ON: "Ontario",
  PE: "Prince Edward Island",
  QC: "Quebec",
  SK: "Saskatchewan",
  YT: "Yukon",
};

const BANKRUPTCY_TYPE_LABELS: Record<BankruptcyType, string> = {
  BANKRUPTCY_DISCHARGED: "Discharged Bankruptcy",
  BANKRUPTCY_NOT_DISCHARGED: "Undischarged Bankruptcy",
  CONSUMER_PROPOSAL: "Consumer Proposal",
  DIVISION_I_PROPOSAL: "Division I Proposal",
  PERSONAL_BANKRUPTCY: "Personal Bankruptcy", // Generic fallback
};

// --- Helper Functions ---

/**
 * Returns the human-readable label for a province code.
 */
export const getProvinceLabel = (province: CanadianProvince): string => {
  return PROVINCE_LABELS[province] || province;
};

/**
 * Returns the human-readable label for a bankruptcy type.
 */
export const getBankruptcyTypeLabel = (type: BankruptcyType): string => {
  return BANKRUPTCY_TYPE_LABELS[type] || type;
};

/**
 * Helper to safely parse a date that might be a string, Date, null, or a Kysely Timestamp.
 */
const safeParseDate = (date: any): Date | null => {
  if (!date) return null;
  const parsed = typeof date === "string" ? parseISO(date) : (date as Date);
  return isValid(parsed) ? startOfDay(parsed) : null;
};

/**
 * Calculates the retention period rules based on type, province, and frequency.
 * Note: For Consumer Proposals, this returns the primary rule (3 years from completion),
 * but the actual calculation involves a comparison with filing date.
 */
export const calculateRetentionPeriod = (
  type: BankruptcyType,
  province: CanadianProvince,
  isFirstTime: boolean = true
): RetentionPeriodResult => {
  const rules = regulationRegistry.BANKRUPTCY_RETENTION_RULES;

  // 2. Personal Bankruptcy (Second or Subsequent)
  if (!isFirstTime && (type === "BANKRUPTCY_DISCHARGED" || type === "PERSONAL_BANKRUPTCY")) {
    return {
      years: rules.secondBankruptcy.years,
      months: 0,
      anchorEvent: "DISCHARGE_DATE",
      description: `${rules.secondBankruptcy.years} years from the date of discharge (2nd+ bankruptcy)`,
    };
  }

  // 5. Bankruptcy (Not Discharged)
  if (type === "BANKRUPTCY_NOT_DISCHARGED") {
    return {
      years: 0,
      months: 0,
      anchorEvent: "INDEFINITE",
      description: "Remains indefinitely until discharged",
    };
  }

  // 3. Consumer Proposal
  if (type === "CONSUMER_PROPOSAL") {
    return {
      years: rules.consumerProposal.fromCompletion,
      months: 0,
      anchorEvent: "COMPLETION_DATE",
      description: `${rules.consumerProposal.fromCompletion} years from completion or ${rules.consumerProposal.fromFiling} years from filing (whichever is sooner)`,
    };
  }

  // 4. Division I Proposal
  if (type === "DIVISION_I_PROPOSAL") {
    return {
      years: rules.divisionIProposal.fromCompletion,
      months: 0,
      anchorEvent: "COMPLETION_DATE",
      description: `${rules.divisionIProposal.fromCompletion} years from the date of completion`,
    };
  }

  // 1. Personal Bankruptcy (First Time)
  if (type === "BANKRUPTCY_DISCHARGED" || type === "PERSONAL_BANKRUPTCY") {
    const exceptions = rules.firstBankruptcy.exceptions as Record<string, number>;
    const years = exceptions[province] !== undefined ? exceptions[province] : rules.firstBankruptcy.generalYears;
    
    return {
      years,
      months: 0,
      anchorEvent: "DISCHARGE_DATE",
      description: `${years} years from the date of discharge`,
    };
  }

  // Fallback
  return {
    years: rules.firstBankruptcy.generalYears,
    months: 0,
    anchorEvent: "DISCHARGE_DATE",
    description: `Standard retention: ${rules.firstBankruptcy.generalYears} years from discharge`,
  };
};

/**
 * Calculates the exact expected removal date based on the provided dates and rules.
 * Returns null if necessary dates (like discharge date) are missing for the calculation.
 */
export const calculateExpectedRemovalDate = (
  filingDate: Date | string | null,
  dischargeDate: Date | string | null,
  completionDate: Date | string | null,
  type: BankruptcyType,
  province: CanadianProvince,
  isFirstTime: boolean = true
): Date | null => {
  const dFiling = safeParseDate(filingDate);
  const dDischarge = safeParseDate(dischargeDate);
  const dCompletion = safeParseDate(completionDate);

  // Undischarged bankruptcies have no removal date
  if (type === "BANKRUPTCY_NOT_DISCHARGED") {
    return null;
  }

  const rules = regulationRegistry.BANKRUPTCY_RETENTION_RULES;

  // Consumer Proposal: Min(Completion + 3y, Filing + 6y)
  if (type === "CONSUMER_PROPOSAL") {
    if (!dFiling) return null; // Filing date is mandatory for the "6 years from filing" cap
    
    const filingCapDate = addYears(dFiling, rules.consumerProposal.fromFiling);
    
    // If we have a completion date, we compare
    if (dCompletion) {
      const completionRuleDate = addYears(dCompletion, rules.consumerProposal.fromCompletion);
      // Return the earlier of the two dates
      return compareAsc(completionRuleDate, filingCapDate) < 0 
        ? completionRuleDate 
        : filingCapDate;
    }
    
    // If not completed yet, we can't determine the final date definitively if it relies on completion.
    // However, the rule "whichever comes first" implies a hard cap at Filing + 6.
    // But strictly speaking, if they default, it might change status. 
    // For this helper, if completion is missing, we cannot calculate the "3 years from completion" part.
    // We will return null to indicate "Pending Completion" unless we want to show the max date.
    // Let's return null to be safe, as the record isn't "complete" yet.
    return null; 
  }

  // Division I Proposal: Completion + 3y
  if (type === "DIVISION_I_PROPOSAL") {
    if (!dCompletion) return null;
    return addYears(dCompletion, rules.divisionIProposal.fromCompletion);
  }

  // Personal Bankruptcy (1st or 2nd+)
  if (type === "BANKRUPTCY_DISCHARGED" || type === "PERSONAL_BANKRUPTCY") {
    if (!dDischarge) return null; // Cannot calculate without discharge date

    const { years } = calculateRetentionPeriod(type, province, isFirstTime);
    return addYears(dDischarge, years);
  }

  return null;
};

/**
 * Returns a human-readable description of the retention rule applied.
 */
export const getRetentionRuleDescription = (
  type: BankruptcyType,
  province: CanadianProvince,
  isFirstTime: boolean = true
): string => {
  const { description } = calculateRetentionPeriod(type, province, isFirstTime);
  return description;
};

/**
 * Checks if a bankruptcy record is eligible for removal based on the current date.
 */
export const isEligibleForRemoval = (record: {
  filingDate: Date | string | null;
  dischargeDate: Date | string | null;
  completionDate: Date | string | null;
  bankruptcyType: BankruptcyType;
  province: CanadianProvince;
}): boolean => {
  // We need to infer isFirstTime. Since the schema doesn't have it, 
  // we'll assume true (1st time) unless we have external logic. 
  // In a real app, we might query other records for the same user.
  // For this helper, we'll default to true as per standard behavior.
  const isFirstTime = true; 

  const removalDate = calculateExpectedRemovalDate(
    record.filingDate,
    record.dischargeDate,
    record.completionDate,
    record.bankruptcyType,
    record.province,
    isFirstTime
  );

  if (!removalDate) return false;

  const today = startOfDay(new Date());
  // If removal date is in the past or today, it's eligible
  return isBefore(removalDate, today) || removalDate.getTime() === today.getTime();
};
