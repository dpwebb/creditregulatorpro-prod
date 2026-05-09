import { parseISO, isValid, isAfter, differenceInMonths } from "./dateUtils";
import type { Selectable } from "kysely";
import type { Tradeline, ReportArtifact, CanadianProvince } from "./schema";
import type { DetectedViolation } from "./complianceDetectorTypes";
import { detectChanges, StandardizedCreditData } from "./changeDetector";
import { resolveTradelineProvince } from "./resolveTradelineProvince";
import { regulationRegistry } from "./regulationRegistry";
import { calculateRetentionExpiry, AccountType } from "./provincialRetentionCalculator";

/**
 * Safely parses a date input which might be a Date object, an ISO string, or null/undefined.
 */
function safeParseDate(dateInput: Date | string | null | undefined): Date | null {
  if (!dateInput) return null;
  
  if (dateInput instanceof Date) {
    return isValid(dateInput) ? dateInput : null;
  }
  
  if (typeof dateInput === 'string') {
    const parsed = parseISO(dateInput);
    return isValid(parsed) ? parsed : null;
  }
  
  return null;
}

function laterDate(left: Date, right: Date): Date {
  return isAfter(left, right) ? left : right;
}

/**
 * Detects significant date shifts across report artifacts, which may indicate manipulation.
 */
export function detectTemporalManipulation(
  tradeline: Selectable<Tradeline>,
  reportArtifacts: Selectable<ReportArtifact>[]
): DetectedViolation[] {
  const violations: DetectedViolation[] = [];
  if (reportArtifacts.length < 2) {
    return violations;
  }

  // Sort artifacts by report date to compare them chronologically
  const sortedArtifacts = [...reportArtifacts].sort((a, b) =>
    new Date(a.reportDate!).getTime() - new Date(b.reportDate!).getTime()
  );

  for (let i = 0; i < sortedArtifacts.length - 1; i++) {
    const prevArtifact = sortedArtifacts[i];
    const currArtifact = sortedArtifacts[i + 1];

    const prevData = prevArtifact.data as StandardizedCreditData | null;
    const currData = currArtifact.data as StandardizedCreditData | null;

    if (prevData && currData) {
      const changes = detectChanges(prevData, currData);
      const temporalChanges = changes.filter(
        (c) => c.changeType === "TEMPORAL" && (c.driftAmount ?? 0) > 30
      );

      temporalChanges.forEach((change) => {
        violations.push({
          violationCategory: "TEMPORAL_MANIPULATION",
          severity: "ERROR",
          confidenceScore: 95,
          userExplanation: `Important dates on this account were changed by ${change.driftAmount} days between reports. That's a red flag.`,
          technicalDetails: {
            fieldName: change.fieldName,
            oldValue: change.oldValue,
            newValue: change.newValue,
            driftDays: change.driftAmount,
            comparedArtifacts: [prevArtifact.id, currArtifact.id],
            detectedValue: change.newValue,
            regulationIds: ["PIPEDA_4_6"],
          },
          recommendedAction: "Dispute this account because the dates were changed between reports.",
          tradelineId: tradeline.id,
          responsibleEntity: "CREDITOR",
        });
      });
    }
  }

  return violations;
}

/**
 * Checks if an account is past the provincial reporting limit.
 */
export async function detectStatuteOfLimitations(
  tradeline: Selectable<Tradeline>,
  analysisDate: Date = new Date()
): Promise<DetectedViolation[]> {
  const violations: DetectedViolation[] = [];
  
  const statusText = (tradeline.status || "").toLowerCase();
  const typeText = (tradeline.accountType || "").toLowerCase();
  const tradelineRecord = tradeline as Record<string, unknown>;
  const sourceText = (typeof tradelineRecord.sourceText === "string" ? tradelineRecord.sourceText : "").toLowerCase();
  const ratingDescText = (typeof tradelineRecord.ratingCodeDescription === "string" ? tradelineRecord.ratingCodeDescription : "").toLowerCase();
  const ratingCodeText = (typeof tradelineRecord.ratingCode === "string" ? tradelineRecord.ratingCode : "").toLowerCase();
  
  const closedIndicators = ["closed", "paid", "settled", "transferred", "charged off", "charge-off", "charge off", "write-off", "write off", "collection", "cancelled", "cancel"];
  const hasClosedIndicator = closedIndicators.some(indicator => 
    statusText.includes(indicator) || ratingDescText.includes(indicator)
  );
  const hasClosedSourceNarrative =
    /(?:^|[^a-z0-9])cz(?:[^a-z0-9]|$)/i.test(sourceText) ||
    /(?:^|[^a-z0-9])wo(?:[^a-z0-9]|$)/i.test(sourceText) ||
    sourceText.includes("closed at consumer") ||
    sourceText.includes("bad debt write-off") ||
    sourceText.includes("account turned over to collection");

  const badDebtRegex = /^[oir][789]$/i;
  const hasBadDebtCode = badDebtRegex.test(statusText) || badDebtRegex.test(ratingCodeText);

  const appearsClosed = hasClosedIndicator || hasClosedSourceNarrative || hasBadDebtCode;

  // In Canada, provincial retention limits apply to ALL closed accounts,
// not just derogatory ones. Only skip OPEN accounts that were never delinquent.
const pastDue = Number(tradeline.amountPastDue) || 0;
if (
!appearsClosed &&
!tradeline.dateOfFirstDelinquency &&
(tradeline.mop === "0" || tradeline.mop === "1") &&
pastDue === 0
  ) {
    return violations;
  }

  // Priority-based reference date selection
  const referenceValue = 
    tradeline.dateOfFirstDelinquency ?? 
    tradeline.lastActivityDate ?? 
    // NOTE: dateOfLastPayment should only be populated from source data when the actual payment amount > $0
    tradeline.dateOfLastPayment ?? 
    tradeline.dateClosed ?? 
    tradeline.openedDate;

  const referenceDateSource = tradeline.dateOfFirstDelinquency ? "dateOfFirstDelinquency" :
    tradeline.lastActivityDate ? "lastActivityDate" :
    tradeline.dateOfLastPayment ? "dateOfLastPayment" :
    tradeline.dateClosed ? "dateClosed" : "openedDate";

  const referenceDate = safeParseDate(referenceValue);

  if (!referenceDate) {
    return violations;
  }

  if (referenceDateSource === "openedDate") {
    const lastReported = safeParseDate(tradeline.lastReportedDate);
    const posted = safeParseDate(tradeline.postedDate);
    const isWithin12Months = (d: Date | null) => {
      if (!d) return false;
      const diff = differenceInMonths(analysisDate, d);
      return diff >= -12 && diff <= 12;
    };

    if (isWithin12Months(lastReported) || isWithin12Months(posted)) {
      return violations;
    }
  }

  const province = await resolveTradelineProvince(tradeline) as CanadianProvince | null;

  if (!province) {
    console.log(`Cannot determine province for tradeline ${tradeline.id}: all lookups returned null. Skipping statute of limitations check.`);
    return violations;
  }

  let accountType: AccountType = "regular";
  
  if (tradeline.isCollectionAccount || statusText.includes("collection") || typeText.includes("collection")) {
    accountType = "collection";
  } else if (statusText.includes("bankruptcy") || typeText.includes("bankruptcy")) {
    accountType = "bankruptcy";
  } else if (statusText.includes("judgment") || typeText.includes("judgment")) {
    accountType = "judgment";
  } else if (statusText.includes("proposal") || typeText.includes("proposal")) {
    accountType = "consumer_proposal";
  }

  const effectiveAnalysisDate = laterDate(new Date(), analysisDate);
  const expiryResult = calculateRetentionExpiry(province, accountType, referenceDate, false, undefined, effectiveAnalysisDate);
  if (!expiryResult) {
    return violations;
  }

  const { isExpired, expiryDate, retentionYears, statuteReference, daysRemaining } = expiryResult;

  if (isExpired && appearsClosed) {
    violations.push({
      violationCategory: "STATUTE_OF_LIMITATIONS",
      severity: "ERROR",
      confidenceScore: 90,
      userExplanation: `This debt is past the ${retentionYears}-year reporting limit for your credit report. It should be reviewed for correction if the reporting is unsupported.`,
      technicalDetails: {
        referenceDate: referenceDate.toISOString(),
        reportingLimitDate: expiryDate.toISOString(),
        isPastLimit: isExpired,
        status: tradeline.status,
        referenceDateSource,
        detectedValue: referenceDate.toISOString(),
          province,
          retentionYears,
          statutoryReference: statuteReference,
          regulationIds: ["PIPEDA_4_5", `${province}_CRA_REPORTING_LIMIT`],
        },
        recommendedAction: `Ask the credit bureau to review whether this account remains reportable because it is past the ${retentionYears}-year reporting limit.`,
      tradelineId: tradeline.id,
      responsibleEntity: "BUREAU",
    });
  } else if (!isExpired && appearsClosed) {
    const monthsRemaining = differenceInMonths(expiryDate, effectiveAnalysisDate);
    if (monthsRemaining <= 6 && monthsRemaining >= 0) {
      violations.push({
        violationCategory: "STATUTE_APPROACHING",
        severity: "WARNING",
        confidenceScore: 90,
        userExplanation: `This account is approaching the ${retentionYears}-year reporting limit for your report in ${monthsRemaining} months. After that date, the credit bureau should review whether it remains reportable.`,
        technicalDetails: {
          referenceDate: referenceDate.toISOString(),
          reportingLimitDate: expiryDate.toISOString(),
          isPastLimit: isExpired,
          daysRemaining,
          monthsRemaining,
          status: tradeline.status,
          referenceDateSource,
          detectedValue: referenceDate.toISOString(),
          province,
          retentionYears,
          statutoryReference: statuteReference,
          regulationIds: ["PIPEDA_4_5", `${province}_CRA_REPORTING_LIMIT`],
        },
        recommendedAction: `Monitor this account. In ${monthsRemaining} months, ask the credit bureau to review whether it remains reportable under the mapped reporting-limit authority.`,
        tradelineId: tradeline.id,
        responsibleEntity: "BUREAU",
      });
    }
  }

  // NOTE: The opened date alone is NOT a valid basis for a statute of limitations
  // violation in Canada. Only the DOFD (date of first delinquency) determines the
  // reporting window. Do not flag accounts simply for being old.

  return violations;
}
