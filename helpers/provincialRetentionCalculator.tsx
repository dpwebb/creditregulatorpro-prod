import { addYears, addMonths, isAfter, isBefore, differenceInDays, parseISO, isValid } from "./dateUtils";
import type { CanadianProvince, Tradeline } from "./schema";
import { regulationRegistry } from "./regulationRegistry";

export type AccountType = "regular" | "bankruptcy" | "consumer_proposal" | "judgment" | "collection";

export interface RetentionRule {
  retentionYears: number;
  statuteReference: string;
  description: string;
}

export interface RetentionRuleset {
  regular: RetentionRule;
  bankruptcyFirst: RetentionRule;
  bankruptcySecond: RetentionRule;
  consumerProposal: {
    yearsFromCompletion: number;
    yearsFromFiling: number;
    statuteReference: string;
  };
  judgment: RetentionRule;
  collection: RetentionRule;
}

export interface RetentionExpiryResult {
  expiryDate: Date;
  retentionYears: number;
  statuteReference: string;
  isExpired: boolean;
  daysRemaining: number;
  daysUntilExpiry: number; // Alias for daysRemaining for convenience
}

export interface ProactiveAlert {
  level: "WARNING" | "CRITICAL" | "EXPIRED";
  daysRemaining: number;
  message: string;
}

const DEFAULT_REFERENCE = "Provincial Consumer Reporting Act";

function buildRuleset(province: CanadianProvince, statRef: string): RetentionRuleset {
  const regularYears = regulationRegistry.RETENTION_PERIODS[province] ?? 6;
  
  const bankruptcyRules = regulationRegistry.BANKRUPTCY_RETENTION_RULES;
  let bankruptcyFirstYears = bankruptcyRules.firstBankruptcy.generalYears;
  
  // Apply exceptions for specific provinces
  if (province in bankruptcyRules.firstBankruptcy.exceptions) {
    bankruptcyFirstYears = (bankruptcyRules.firstBankruptcy.exceptions as any)[province];
  }

  return {
    regular: { retentionYears: regularYears, statuteReference: statRef, description: `Maximum ${regularYears} years from date of last activity or DOFD.` },
    bankruptcyFirst: { retentionYears: bankruptcyFirstYears, statuteReference: statRef, description: `First bankruptcy: ${bankruptcyFirstYears} years from date of discharge.` },
    bankruptcySecond: { retentionYears: bankruptcyRules.secondBankruptcy.years, statuteReference: statRef, description: `Multiple bankruptcies: ${bankruptcyRules.secondBankruptcy.years} years from date of discharge.` },
    consumerProposal: { yearsFromCompletion: bankruptcyRules.consumerProposal.fromCompletion, yearsFromFiling: bankruptcyRules.consumerProposal.fromFiling, statuteReference: statRef },
    judgment: { retentionYears: regularYears, statuteReference: statRef, description: `Judgments: ${regularYears} years from date of entry.` },
    collection: { retentionYears: regularYears, statuteReference: statRef, description: `Collections: ${regularYears} years from DOFD.` },
  };
}

const PROVINCIAL_RULES: Record<CanadianProvince, RetentionRuleset> = {
  ON: buildRuleset("ON", "R.S.O. 1990, c. C.33, s. 9(3)"),
  QC: buildRuleset("QC", "C.Q.L.R., c. P-40.1"),
  PE: buildRuleset("PE", "R.S.P.E.I. 1988, c. C-20, s. 10(3)"),
  BC: buildRuleset("BC", "S.B.C. 2004, c. 2, s. 19.13"),
  AB: buildRuleset("AB", "R.S.A. 2000, c. F-2, Part 6.1"),
  SK: buildRuleset("SK", "S.S. 2004, c. C-43.2, s. 22"),
  MB: buildRuleset("MB", "C.C.S.M. c. C200, s. 103(1)"),
  NB: buildRuleset("NB", "S.N.B. 2011, c. 146, s. 14"),
  NS: buildRuleset("NS", "R.S.N.S. 1989, c. 93, s. 9(3)"),
  NL: buildRuleset("NL", "R.S.N.L. 1990, c. C-32, s. 10(3)"),
  NT: buildRuleset("NT", "R.S.N.W.T. 1988, c. C-17"),
  NU: buildRuleset("NU", "R.S.N.W.T. (Nu) 1988, c. C-17"),
  YT: buildRuleset("YT", "R.S.Y. 2002, c. 40"),
};

/**
 * Retrieves the complete retention ruleset for a specified province.
 */
export function getProvinceRetentionRules(province: CanadianProvince): RetentionRuleset {
  return PROVINCIAL_RULES[province] || PROVINCIAL_RULES["ON"];
}

/**
 * Calculates the exact expiry date and status for an account based on provincial rules.
 */
export function calculateRetentionExpiry(
  province: CanadianProvince,
  accountType: AccountType,
  referenceDate: Date | string | null,
  isSecondBankruptcy: boolean = false,
  filingDate?: Date | string | null,
  asOfDate: Date | string = new Date()
): RetentionExpiryResult | null {
  if (!referenceDate) return null;

  const parsedDate = typeof referenceDate === "string" ? parseISO(referenceDate) : referenceDate;
  if (!isValid(parsedDate)) return null;

  let parsedFilingDate = filingDate ? (typeof filingDate === "string" ? parseISO(filingDate) : filingDate) : null;
  if (parsedFilingDate && !isValid(parsedFilingDate)) parsedFilingDate = null;

  const rules = getProvinceRetentionRules(province);
  let retentionYears = rules.regular.retentionYears;
  let statRef = rules.regular.statuteReference;

  if (accountType === "bankruptcy") {
    retentionYears = isSecondBankruptcy ? rules.bankruptcySecond.retentionYears : rules.bankruptcyFirst.retentionYears;
    statRef = isSecondBankruptcy ? rules.bankruptcySecond.statuteReference : rules.bankruptcyFirst.statuteReference;
  } else if (accountType === "consumer_proposal") {
    // Note: Consumer proposal logic usually takes the earlier of 3 years from completion or 6 from filing.
    // Assuming referenceDate here is the completion date. If filing date is used, manual adjustment is needed.
    retentionYears = rules.consumerProposal.yearsFromCompletion;
    statRef = rules.consumerProposal.statuteReference;
  } else if (accountType === "judgment") {
    retentionYears = rules.judgment.retentionYears;
    statRef = rules.judgment.statuteReference;
  } else if (accountType === "collection") {
    retentionYears = rules.collection.retentionYears;
    statRef = rules.collection.statuteReference;
  }

  let expiryDate = addYears(parsedDate, retentionYears);

  if (accountType === "consumer_proposal" && parsedFilingDate) {
    const filingExpiry = addYears(parsedFilingDate, rules.consumerProposal.yearsFromFiling);
    if (isBefore(filingExpiry, expiryDate)) {
      expiryDate = filingExpiry;
      retentionYears = rules.consumerProposal.yearsFromFiling;
    }
  }

  const now = typeof asOfDate === "string" ? parseISO(asOfDate) : asOfDate;
  if (!isValid(now)) return null;
  const isExpired = isAfter(now, expiryDate);
  const daysRemaining = differenceInDays(expiryDate, now);

  return {
    expiryDate,
    retentionYears,
    statuteReference: statRef,
    isExpired,
    daysRemaining,
    daysUntilExpiry: daysRemaining,
  };
}

/**
 * Generates proactive alerts for accounts approaching or past their retention expiry.
 */
export function calculateProactiveAlerts(
  tradeline: Pick<Tradeline, "dateOfFirstDelinquency" | "lastActivityDate" | "dateClosed" | "accountType" | "isCollectionAccount">,
  province: CanadianProvince
): ProactiveAlert[] {
  const alerts: ProactiveAlert[] = [];

  const referenceDateRaw = tradeline.dateOfFirstDelinquency ?? tradeline.lastActivityDate ?? tradeline.dateClosed;
  if (!referenceDateRaw) return alerts;

  let accountType: AccountType = "regular";
  if (tradeline.isCollectionAccount) {
    accountType = "collection";
  } else if (tradeline.accountType?.toLowerCase().includes("bankruptcy")) {
    accountType = "bankruptcy";
  }

      const result = calculateRetentionExpiry(province, accountType, referenceDateRaw as unknown as Date | string | null);
  if (!result) return alerts;

  if (result.isExpired) {
    alerts.push({
      level: "EXPIRED",
      daysRemaining: result.daysRemaining,
      message: `Account has exceeded the ${result.retentionYears}-year reporting limit under ${result.statuteReference} and should be reviewed for correction or removal under the mapped authority.`,
    });
  } else if (result.daysRemaining <= 30) {
    alerts.push({
      level: "CRITICAL",
      daysRemaining: result.daysRemaining,
      message: `Account will expire in ${result.daysRemaining} days (under 1 month). Prepare removal dispute.`,
    });
  } else if (result.daysRemaining <= 90) {
    alerts.push({
      level: "WARNING",
      daysRemaining: result.daysRemaining,
      message: `Account will expire in ${result.daysRemaining} days (under 3 months). Monitor for automatic removal.`,
    });
  }

  return alerts;
}
