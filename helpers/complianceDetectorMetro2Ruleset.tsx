import { format } from "./dateUtils";
import type { Selectable } from "kysely";
import type { Tradeline } from "./schema";
import type { DetectedViolation } from "./complianceDetectorTypes";
import { getRulesByYear, type ValidationCategory } from "./metro2ValidationRules";
import { db } from "./db";
import { isEffectivelyCollectionAccount } from "./complianceDetectorTypes";
import { regulationRegistry } from "./regulationRegistry";

/**
 * Maps Metro2 validation rule categories to ViolationCategory enum values.
 */
function mapMetro2CategoryToRegulationIds(
  category: ValidationCategory
): string[] {
  switch (category) {
    case "DATES":
      return ["PIPEDA_4_6", "METRO2_BASE_SEGMENT"];
    case "BALANCES":
      return ["PIPEDA_4_6"];
    case "STATUS":
      return ["PIPEDA_4_6_1"];
    case "HISTORY":
      return ["PIPEDA_4_6", "METRO2_PAYMENT_RATING"];
    case "SEGMENTS":
      return ["METRO2_J1_SEGMENT", "METRO2_J2_SEGMENT"];
    case "COMPLETENESS":
      return ["PIPEDA_4_6", "METRO2_BASE_SEGMENT"];
    default:
      return [];
  }
}

function mapMetro2CategoryToViolationCategory(
  category: ValidationCategory
): DetectedViolation["violationCategory"] {
  switch (category) {
    case "DATES":
      // TEMPORAL_MANIPULATION is reserved for date drift/re-aging detected in complianceDetectorTemporal.
      // Metro2 date errors (e.g. missing report date, invalid date logic) are data quality/documentation failures.
      return "DOCUMENTATION_CHAIN_FAILURE";
    case "BALANCES":
      return "BALANCE_CALCULATION_VIOLATION";
    case "STATUS":
      return "ACCOUNT_STATUS_INCONSISTENCY";
    case "HISTORY":
      return "PAYMENT_HISTORY_MANIPULATION";
    case "SEGMENTS":
    case "COMPLETENESS":
      return "DOCUMENTATION_CHAIN_FAILURE";
    default:
      return "DOCUMENTATION_CHAIN_FAILURE";
  }
}

function mapMetro2RuleNameToField(ruleName: string): string | null {
  switch (ruleName) {
    case "BASE_SEGMENT_REQUIRED":
      return "baseSegment";
    case "DATE_DOFD_LOGIC":
      return "dateOfFirstDelinquency";
    case "DATE_REPORTED_LOGIC":
    case "REPORT_DATE_REQUIRED":
      return "lastReportedDate";
    case "DATE_CLOSED_REQUIRED":
      return "dateClosed";
    case "ACCOUNT_DESIGNATION_REQUIRED":
      return "accountDesignation";
    case "CREDITOR_NAME_REQUIRED":
      return "creditorName";
    default:
      return null;
  }
}

/**
 * Detects Metro2 ruleset violations using the comprehensive Metro2 validation rules.
 * This runs all Metro2 validation rules from helpers/metro2ValidationRules including:
 * - BaseSegmentRequiredFields
 * - DateLogicOpenedVsReported
 * - DateLogicDOFD
 * - BalanceConsistencyPastDue
 * - BalancePaidZero
 * - PaymentHistoryFormat
 * - SegmentPresenceJoint
 */
export async function detectMetro2RulesetViolations(
  tradeline: Selectable<Tradeline>,
  metro2Version?: string
): Promise<DetectedViolation[]> {
  const violations: DetectedViolation[] = [];

  let creditorName = null;
  if (tradeline.creditorId) {
    const creditor = await db
      .selectFrom("creditor")
      .select("name")
      .where("id", "=", tradeline.creditorId)
      .executeTakeFirst();
    creditorName = creditor?.name || null;
  }

  // Derive portfolio type from account type if possible
  const accountTypeUpper = (tradeline.accountType || "").toUpperCase();
  let derivedPortfolioType = null;
  if (accountTypeUpper.includes("OPEN")) {
    derivedPortfolioType = "O";
  } else if (accountTypeUpper.includes("REVOLV") || accountTypeUpper.includes("CREDIT CARD") || accountTypeUpper.includes("LINE")) {
    derivedPortfolioType = "R";
  } else if (accountTypeUpper.includes("INSTALL") || accountTypeUpper.includes("LOAN")) {
    derivedPortfolioType = "I";
  } else if (accountTypeUpper.includes("MORTGAGE")) {
    derivedPortfolioType = "M";
  }

  // Derive ECOA code from account type if missing
  let derivedEcoaCode = tradeline.ecoaCode || null;
  if (!derivedEcoaCode && accountTypeUpper) {
    if (accountTypeUpper.includes("INDIVIDUAL")) derivedEcoaCode = "I";
    else if (accountTypeUpper.includes("JOINT")) derivedEcoaCode = "2";
    else if (accountTypeUpper.includes("AUTHORIZED")) derivedEcoaCode = "3";
  }

  // Build flat data structure for validation, including the actual accountNumber
  const flatData = {
    accountNumber: tradeline.accountNumber,
    creditorName,
    accountType: tradeline.accountType,
    portfolioType: derivedPortfolioType,
    paymentPattern: tradeline.paymentPattern,
    status: tradeline.status || "",
    openedDate: tradeline.openedDate ? format(new Date(tradeline.openedDate), "yyyy-MM-dd") : null,
        reportDate: tradeline.lastReportedDate ? format(new Date(tradeline.lastReportedDate), "yyyy-MM-dd") : null,
    currentBalance: Number(tradeline.currentBalance || tradeline.balance || 0),
    amountPastDue: Number(tradeline.amountPastDue || 0),
    dateOfFirstDelinquency: tradeline.dateOfFirstDelinquency 
      ? format(new Date(tradeline.dateOfFirstDelinquency), "yyyy-MM-dd") 
      : null,
    dateClosed: tradeline.dateClosed ? format(new Date(tradeline.dateClosed), "yyyy-MM-dd") : null,
    dateOfLastPayment: tradeline.dateOfLastPayment 
      ? format(new Date(tradeline.dateOfLastPayment), "yyyy-MM-dd") 
      : null,
    highCredit: Number(tradeline.highCredit || 0),
    scheduledMonthlyPayment: Number(tradeline.scheduledMonthlyPayment || 0),
    paymentHistoryProfile: tradeline.paymentHistoryProfile || null,
    ecoaCode: derivedEcoaCode,
    hasJ1Segment: tradeline.hasJ1Segment || false,
    hasJ2Segment: tradeline.hasJ2Segment || false,
    isCollectionAccount: isEffectivelyCollectionAccount(tradeline),
  };

  // Get validation rules for the specified version
  const year = metro2Version ? parseInt(metro2Version, 10) : new Date().getFullYear();
  const { rules } = getRulesByYear(year);

  // Run each validation rule directly against flat data
  const validationResults = rules.map((rule) => {
    const result = rule.validate(flatData);
    return {
      ruleName: rule.ruleName,
      category: rule.category,
      severity: rule.severity,
      valid: result.valid,
      message: result.message,
      expectedValue: result.expectedValue,
      actualValue: result.actualValue,
    };
  });

  // Convert validation results to DetectedViolation objects
  validationResults.forEach((result) => {
    if (!result.valid) {
      // Map severity - Metro2 uses ERROR/WARNING/INFO, which matches our ValidationSeverity
      const severity = result.severity as DetectedViolation["severity"];

      // Calculate confidence score based on severity
      const confidenceScore = severity === "ERROR" ? 100 : severity === "WARNING" ? 75 : 50;

      // Map category
      const violationCategory = mapMetro2CategoryToViolationCategory(result.category as ValidationCategory);
      const regulationIds = mapMetro2CategoryToRegulationIds(result.category as ValidationCategory);
      const fieldName = mapMetro2RuleNameToField(result.ruleName);

      // Build user explanation
      const userExplanation = result.message || "A reporting error was found.";

      violations.push({
        violationCategory,
        severity,
        confidenceScore,
        userExplanation,
        technicalDetails: {
          ruleName: result.ruleName,
          ruleCategory: result.category,
          ...(fieldName ? { fieldName } : {}),
          message: result.message,
          expectedValue: result.expectedValue,
          actualValue: result.actualValue,
          detectedValue: result.actualValue,
          accountType: tradeline.accountType,
          accountStatus: tradeline.status,
          metro2Version: metro2Version || new Date().getFullYear().toString(),
          regulationIds,
        },
        recommendedAction: 
          severity === "ERROR"
            ? "Ask the credit bureau to look into this and have the company fix it or remove the account."
            : "Ask the company to update this information on your report.",
        tradelineId: tradeline.id,
        responsibleEntity: "CREDITOR",
      });
    }
  });

  return violations;
}
