import type { Selectable } from "kysely";
import type { Tradeline } from "./schema";
import type { DetectedViolation } from "./complianceDetectorTypes";
import { isEffectivelyCollectionAccount } from "./complianceDetectorTypes";
import { regulationRegistry } from "./regulationRegistry";

/**
 * Detects Metro2 data quality violations - missing required fields and completeness issues.
 */
export async function detectMetro2FieldViolations(
  tradeline: Selectable<Tradeline>
): Promise<DetectedViolation[]> {
  const violations: DetectedViolation[] = [];

  const isCollection = isEffectivelyCollectionAccount(tradeline);

  // 2. Missing First Delinquency Date on delinquent accounts
  const pastDue = Number(tradeline.amountPastDue || 0);
  const status = (tradeline.status || "").toUpperCase();
  
  const mopStr = String((tradeline as any).mopCode || (tradeline as any).paymentRating || (tradeline as any).mop || "").toUpperCase();
  const isCancelDerogatory = status.includes("CANCEL") && status.includes("DEROGATORY");
  const isTC = status.split(",").some(s => s.trim().startsWith("TC"));
  
  let hasSignificant90dDelinquency = false;
  if (tradeline.paymentPattern) {
    const match = tradeline.paymentPattern.match(/90d:\s*(\d+)/i);
    if (match && parseInt(match[1], 10) >= 3) {
      hasSignificant90dDelinquency = true;
    }
  }

  const isDelinquent = pastDue > 0 || 
    status.includes("DELINQ") || 
    status.includes("CHARGE") || 
    status.includes("DEFAULT") ||
    status.includes("BAD DEBT") ||
    status.includes("WRIT") ||
    mopStr === "9" ||
    isCancelDerogatory ||
    isTC ||
    hasSignificant90dDelinquency;

    // Collection accounts, charge-offs, and transferred accounts may legitimately lack
  // a DOFD — they use dateAssignedToCollection or chargeOffDate instead.
  const isCollectionOrChargeOff =
    isEffectivelyCollectionAccount(tradeline) ||
    status.includes("CHARGE") ||
    status.includes("WRIT") ||
    status.includes("BAD DEBT") ||
    status.includes("TRANSFER");

  const hasAlternateDateAnchor =
    !!tradeline.dateAssignedToCollection || !!tradeline.chargeOffDate;

  if (isDelinquent && !tradeline.dateOfFirstDelinquency) {
    if (isCollectionOrChargeOff && hasAlternateDateAnchor) {
      // Legitimate — collection/charge-off with an alternate date anchor; skip
    } else if (isCollectionOrChargeOff && !hasAlternateDateAnchor) {
      // Collection with NO date anchors at all — flag but at lower confidence
      violations.push({
        violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
        severity: "WARNING",
        confidenceScore: 75,
        userExplanation: "This collection account doesn't say when it first went overdue or when it was sent to collections. At least one of those dates is required.",
        technicalDetails: {
          fieldName: "dateOfFirstDelinquency",
          expectedValue: "Valid date when account first became delinquent or was assigned to collection",
          actualValue: null,
          detectedValue: null,
          reportedAs: "Missing",
          accountStatus: tradeline.status,
          amountPastDue: pastDue,
          isCollectionAccount: true,
          hasDateAssignedToCollection: !!tradeline.dateAssignedToCollection,
          hasChargeOffDate: !!tradeline.chargeOffDate,
          regulationIds: ["METRO2_BASE_SEGMENT", "PIPEDA_4_6"],
        },
        recommendedAction: "Ask the collection agency to add the date it was sent to collections, or have it removed.",
        tradelineId: tradeline.id,
        responsibleEntity: "CREDITOR",
      });
    } else {
      // Non-collection delinquent account missing DOFD — original high-confidence flag
      violations.push({
        violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
        severity: "ERROR",
        confidenceScore: 98,
        userExplanation: "This account fell behind on payments, but the report doesn't say when that first happened. That date is required.",
        technicalDetails: {
          fieldName: "dateOfFirstDelinquency",
          expectedValue: "Valid date when account first became delinquent",
          actualValue: null,
          detectedValue: null,
          reportedAs: "Missing",
          accountStatus: tradeline.status,
          amountPastDue: pastDue,
          regulationIds: ["METRO2_BASE_SEGMENT", "PIPEDA_4_6"],
        },
        recommendedAction: "Ask the company to add the date this account first went overdue, or have it removed from your report.",
        tradelineId: tradeline.id,
        responsibleEntity: "CREDITOR",
      });
    }
  }

  // 3. Missing Date of Last Activity on open accounts
  const balance = Number(tradeline.balance || (tradeline as any).currentBalance || 0);
  const isClosed = tradeline.dateClosed !== null;
  // const hasBalance = balance > 0; // Removed per new requirements to check all open accounts

    const hasDateOfLastPayment = Boolean(tradeline.dateOfLastPayment);

  // Exclude collection, charge-off, MOP 9, and transferred accounts — these legitimately lack payment activity
  const statusForActivity = (tradeline.status || "").toUpperCase();
    const mopForActivity = ((tradeline as any).mopCode || (tradeline as any).paymentRating || "").toString().toUpperCase();
  const isExcludedFromActivityCheck =
    isEffectivelyCollectionAccount(tradeline) ||
    statusForActivity.includes("CHARGE") ||
    statusForActivity.includes("WRIT") ||
    statusForActivity.includes("TRANSFER") ||
    statusForActivity.includes("BAD DEBT") ||
    mopForActivity.includes("9") ||
    mopForActivity.includes("COLLECTION");

  if (!isClosed && !hasDateOfLastPayment && !isExcludedFromActivityCheck) {
    violations.push({
      violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
      severity: "WARNING",
      confidenceScore: 85,
      userExplanation: "This active account doesn't show any recent activity date. The company should be reporting when they last updated it.",
      technicalDetails: {
        fieldName: "dateOfLastPayment",
        expectedValue: "Valid date of last account activity",
        actualValue: null,
        detectedValue: null,
        reportedAs: "Missing",
        currentBalance: balance,
        accountStatus: tradeline.status,
        isClosed: false,
        regulationIds: ["METRO2_BASE_SEGMENT", "PIPEDA_4_6"],
      },
      recommendedAction: "Ask the company to add the date of last activity, or have it removed.",
      tradelineId: tradeline.id,
      responsibleEntity: "CREDITOR",
    });
  }

    // 4. Additional Metro2 validation - check for missing scheduled monthly payment on open accounts
  const scheduledPaymentRaw = tradeline.scheduledMonthlyPayment;
  const scheduledPayment = Number(scheduledPaymentRaw || 0);
  const isActuallyOpenAccount = (tradeline.accountType || "").toUpperCase().includes("OPEN");
  const acctTypeForPayment = (tradeline.accountType || "").toUpperCase();
  const statusForPayment = (tradeline.status || "").toUpperCase();
  const mopForPayment = ((tradeline as any).mopCode || (tradeline as any).paymentRating || "").toString().toUpperCase();
  const isExcludedFromPaymentCheck =
    isEffectivelyCollectionAccount(tradeline) ||
    statusForPayment.includes("CHARGE") ||
    statusForPayment.includes("WRIT") ||
    statusForPayment.includes("TRANSFER") ||
    statusForPayment.includes("BAD DEBT") ||
    mopForPayment.includes("9") ||
    mopForPayment.includes("COLLECTION") ||
    acctTypeForPayment.includes("REVOLV") ||
    acctTypeForPayment.includes("CREDIT CARD") ||
    acctTypeForPayment.includes("LINE");
  if (scheduledPaymentRaw != null && !isClosed && scheduledPayment === 0 && !isActuallyOpenAccount && !isExcludedFromPaymentCheck) {
    violations.push({
      violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
      severity: "INFO",
      confidenceScore: 70,
      userExplanation: "This open account doesn't show a monthly payment amount. The company should be reporting how much you pay each month.",
      technicalDetails: {
        fieldName: "scheduledMonthlyPayment",
        expectedValue: "Valid payment amount > 0",
        actualValue: 0,
        detectedValue: 0,
        reportedAs: "Not reported or zero",
        currentBalance: balance,
        regulationIds: ["METRO2_BASE_SEGMENT"],
      },
      recommendedAction: "Ask the company to report your normal monthly payment, or have it removed.",
      tradelineId: tradeline.id,
      responsibleEntity: "CREDITOR",
    });
  }

  // 5. Missing account type
  if (!tradeline.accountType || tradeline.accountType.trim() === "") {
    violations.push({
      violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
      severity: "WARNING",
      confidenceScore: 90,
      userExplanation: "This account doesn't say what type it is (for example, a loan or credit card). That information is required.",
      technicalDetails: {
        fieldName: "accountType",
        expectedValue: "Valid account type code",
        actualValue: null,
        detectedValue: null,
        reportedAs: "Missing or empty",
        regulatoryBasis: regulationRegistry.STATUTE_ENTRIES["METRO2_CLASSIFICATION"]?.description || "Metro2 Classification",
        regulationIds: ["METRO2_CLASSIFICATION"],
      },
      recommendedAction: "Ask the company to add the account type, or have it removed.",
      tradelineId: tradeline.id,
      responsibleEntity: "CREDITOR",
    });
  }

  // 6. Missing Creditor Name - PIPEDA Accuracy Principle
  // Note: creditorId is a foreign key, but we should also verify the actual name is present
  if (!tradeline.creditorId) {
    violations.push({
      violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
      severity: "ERROR",
      confidenceScore: 95,
      userExplanation: "This account doesn't say which company is reporting it. That information is required.",
      technicalDetails: {
        fieldName: "creditorId",
        expectedValue: "Valid creditor identification",
        actualValue: null,
        detectedValue: null,
        reportedAs: "Missing",
        regulatoryBasis: regulationRegistry.STATUTE_ENTRIES["PIPEDA_4_6"]?.description || "PIPEDA Accuracy Principle",
        regulationIds: ["PIPEDA_4_6", "METRO2_BASE_SEGMENT"],
      },
      recommendedAction: "Ask to have this account removed — it doesn't identify who is reporting it.",
      tradelineId: tradeline.id,
      responsibleEntity: "CREDITOR",
    });
  }

  // 7. Missing Original Creditor Name for collection accounts - Provincial Collection Agency Acts
  if (isCollection && !tradeline.originalCreditorName) {
    violations.push({
      violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
      severity: "ERROR",
      confidenceScore: 98,
      userExplanation: "This collection account doesn't say who you originally owed the money to. That information is required.",
      technicalDetails: {
        fieldName: "originalCreditorName",
        expectedValue: "Valid original creditor name",
        actualValue: null,
        detectedValue: null,
        reportedAs: "Missing",
        isCollectionAccount: true,
        regulatoryBasis: "Provincial Collection Agency Acts, Metro2 CRRG Standards",
        regulationIds: ["METRO2_BASE_SEGMENT", "PIPEDA_4_6"],
      },
      recommendedAction: "Ask to have this collection removed — it doesn't name the original company you owed.",
      tradelineId: tradeline.id,
      responsibleEntity: "CREDITOR",
    });
  }

    // 8. [REMOVED] Credit Limit check — handled by CREDIT_LIMIT_REQUIRED in metro2ValidationRules
  // with proper MOP 9, collection, charge-off, and closed account exclusions.

  const accountTypeUpper = (tradeline.accountType || "").toUpperCase();

    // 9. [REMOVED] High Credit check — handled by HIGH_CREDIT_REQUIRED in metro2ValidationRules
  // with proper MOP 9, collection, charge-off, and closed account exclusions.
  const isOpenAccount = accountTypeUpper.includes("OPEN");

    // 10. [REMOVED] Payment History Profile check — handled by PAYMENT_HISTORY_REQUIRED in metro2ValidationRules
  // with proper MOP 9, collection, charge-off, bankruptcy, and closed account exclusions.

    // 11. [REMOVED] Date Closed check — handled by DATE_CLOSED_REQUIRED in metro2ValidationRules.
  const statusUpper = (tradeline.status || "").toUpperCase();

  // 12. Missing Date Assigned to Collection for collection accounts - Provincial Collection Agency Acts
  if (isCollection && !tradeline.dateAssignedToCollection) {
    violations.push({
      violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
      severity: "ERROR",
      confidenceScore: 97,
      userExplanation: "This collection account doesn't say when it was sent to collections. That date is required.",
      technicalDetails: {
        fieldName: "dateAssignedToCollection",
        expectedValue: "Valid assignment date",
        actualValue: null,
        detectedValue: null,
        reportedAs: "Missing",
        isCollectionAccount: true,
        regulatoryBasis: "Provincial Collection Agency Acts, Metro2 CRRG Standards",
        regulationIds: ["METRO2_BASE_SEGMENT", "PIPEDA_4_6"],
      },
      recommendedAction: "Ask the collection agency to add the date it was sent to collections, or have it removed.",
      tradelineId: tradeline.id,
      responsibleEntity: "CREDITOR",
    });
  }

  // 13. Missing Terms information for installment accounts - Metro2 CRRG Standards
  const isInstallmentAccount = accountTypeUpper.includes("INSTALL") || 
                               accountTypeUpper.includes("LOAN") || 
                               accountTypeUpper.includes("MORTGAGE");
  const terms = tradeline.terms;
  
  if (isInstallmentAccount && !isClosed && (!terms || terms.trim() === "")) {
    violations.push({
      violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
      severity: "WARNING",
      confidenceScore: 82,
      userExplanation: "This loan account doesn't say how long the loan is for (for example, 36 months or 60 months).",
      technicalDetails: {
        fieldName: "terms",
        expectedValue: "Valid loan terms (e.g., 36 months, 60 months)",
        actualValue: null,
        detectedValue: null,
        reportedAs: "Missing or empty",
        accountType: tradeline.accountType,
        regulatoryBasis: "Metro2 CRRG Installment Account Standards",
        regulationIds: ["METRO2_BASE_SEGMENT"],
      },
      recommendedAction: "Ask the company to add the loan length, or have it removed.",
      tradelineId: tradeline.id,
      responsibleEntity: "CREDITOR",
    });
  }

  // 14. Missing Date Reported
  if (!isCollection && !isClosed && !tradeline.lastReportedDate) {
    violations.push({
      violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
      severity: "WARNING",
      confidenceScore: 80,
      userExplanation: "This account doesn't show when it was last reported. The company should be updating this regularly.",
      technicalDetails: {
        fieldName: "lastReportedDate",
        expectedValue: "Valid date",
        actualValue: null,
        detectedValue: null,
        reportedAs: "Missing",
        regulationIds: ["METRO2_BASE_SEGMENT", "PIPEDA_4_6"],
      },
      recommendedAction: "Ask the company to add the date they last reported this account.",
      tradelineId: tradeline.id,
      responsibleEntity: "CREDITOR",
    });
  }

  // 16. Missing Charge-off Date for write-off/charge-off accounts
  const isChargeOffStatus = status.includes("WO") ||
    status.includes("WRITE-OFF") ||
    status.includes("WRITEOFF") ||
    status.includes("WRITE OFF") ||
    status.includes("CHARGE-OFF") ||
    status.includes("CHARGEOFF") ||
    status.includes("CHARGED OFF");

  if (isChargeOffStatus && !tradeline.chargeOffDate) {
    violations.push({
      violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
      severity: "ERROR",
      confidenceScore: 97,
      userExplanation: "The company says this debt was written off as a loss, but they didn't report when that happened. That date is required.",
      technicalDetails: {
        fieldName: "chargeOffDate",
        expectedValue: "Valid charge-off date",
        actualValue: null,
        detectedValue: null,
        reportedAs: "Missing",
        accountStatus: tradeline.status,
        regulationIds: ["METRO2_BASE_SEGMENT", "PIPEDA_4_6"],
      },
      recommendedAction: "Ask the company to report when this account was written off, or have it removed from your report.",
      tradelineId: tradeline.id,
      responsibleEntity: "CREDITOR",
    });
  }

  // 17. MOP consistency check
  if (tradeline.openedDate) {
    const openedDate = new Date(tradeline.openedDate);
    if (!isNaN(openedDate.getTime())) {
      const now = new Date();
      const monthsOpen = (now.getFullYear() - openedDate.getFullYear()) * 12 + (now.getMonth() - openedDate.getMonth());
      
      if (monthsOpen > 6) {
        const isWO = status.includes("WO") || status.includes("WRITE");
        const isCollectionStatus = status.includes("TC") || isTC || isCollection;
        
        if ((isWO || isCancelDerogatory || isCollectionStatus) && mopStr === "0") {
          violations.push({
            violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
            severity: "WARNING",
            confidenceScore: 85,
            userExplanation: `This account has been open for ${monthsOpen} months, but the payment rating still says 'too new to rate.' That doesn't match the negative status on the account.`,
            technicalDetails: {
              fieldName: "paymentRating",
              expectedValue: "Non-zero rating reflecting the derogatory status",
              actualValue: mopStr,
              detectedValue: mopStr,
              reportedAs: "0",
              monthsOpen,
              accountStatus: tradeline.status,
              regulationIds: ["METRO2_BASE_SEGMENT", "PIPEDA_4_6"],
            },
            recommendedAction: "Ask the company to fix the payment rating so it matches the account status, or have it removed.",
            tradelineId: tradeline.id,
            responsibleEntity: "CREDITOR",
          });
        }
      }
    }
  }

  return violations;
}
