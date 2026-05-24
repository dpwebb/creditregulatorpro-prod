import { differenceInDays, parseISO, isValid, isAfter } from "./dateUtils";
import type { Selectable } from "kysely";
import { db } from "./db";
import type { Tradeline, ObligationInstance, ReportArtifact, CanadianProvince } from "./schema";
import type { DetectedViolation } from "./complianceDetectorTypes";
import { isEffectivelyCollectionAccount } from "./complianceDetectorTypes";
import { StandardizedCreditData } from "./changeDetector";
import { validateCollectionAgencyName, getRegistryLookupUrl } from "./collectionAgencyRegistry";
import { resolveTradelineProvince } from "./resolveTradelineProvince";
import { findLicensedAgency } from "./licensedAgencyQueries";
import { regulationRegistry } from "./regulationRegistry";
import { accountNumbersMatch } from "./accountNumberIdentity";

/**
 * Checks collection agency name validity without requiring province context.
 * Used as a fallback when province cannot be determined.
 */
function validateAgencyNameBasic(agencyName: string): string[] {
  const flags: string[] = [];

  if (!agencyName || agencyName.trim() === "" || agencyName.toLowerCase() === "unknown") {
    flags.push("Agency name is missing or unknown. Collection reporting identity should be verified.");
    return flags;
  }

  const nameUpper = agencyName.toUpperCase();

  // Check for proper corporate suffixes
  const hasCorporateSuffix = /\b(INC|LTD|CORP|LLC|ULC|INCORPORATED|LIMITED|CORPORATION)\b/.test(nameUpper);
  if (!hasCorporateSuffix) {
    flags.push("Missing corporate suffix (Inc, Ltd, Corp). Legitimate licensed collection agencies usually operate as registered corporations.");
  }

  // Check for generic, non-specific names that obscure identity
  const genericNames = ["COLLECTION DEPT", "RECOVERY DEPT", "CREDIT SERVICES", "ACCOUNTS RECEIVABLE"];
  for (const generic of genericNames) {
    if (nameUpper.includes(generic) && nameUpper.length < generic.length + 8) {
      flags.push(`Uses generic or internal-sounding name ("${generic}"). The reporting identity should be verified against available registry or account records.`);
      break;
    }
  }

  // Suspicious formatting (e.g., masking in the name)
  if (/[*X]{3,}/.test(nameUpper)) {
    flags.push("Name contains masking characters. The collection agency identity should be verified from source records.");
  }

  return flags;
}

/**
 * Placeholder: Collection agency not licensed in province.
 * Severity: ERROR.
 */
export async function detectCollectorLicenseFailure(
  tradeline: Selectable<Tradeline>
): Promise<DetectedViolation[]> {
  const violations: DetectedViolation[] = [];

  const isCollection = isEffectivelyCollectionAccount(tradeline);
  
  if (!isCollection) return violations;

  const resolvedName = tradeline.collectionAgencyName || "";

  if (!resolvedName || resolvedName.trim() === "") {
    if (tradeline.creditorId && tradeline.originalCreditorName) {
      const creditor = await db
        .selectFrom("creditor")
        .select("name")
        .where("id", "=", tradeline.creditorId)
        .executeTakeFirst();
      
      if (creditor && creditor.name) {
        const cName = creditor.name.toUpperCase();
        const ocName = tradeline.originalCreditorName.toUpperCase();
        if (
          (cName.length > 3 && cName.includes(ocName)) ||
          (ocName.length > 3 && ocName.includes(cName))
        ) {
          return violations;
        }
      }
    }
  }

  const provinceStr = await resolveTradelineProvince(tradeline);
  let dbCheckResult: any = { checked: false };
    
  if (provinceStr) {
    const province = provinceStr as CanadianProvince;

    // DB lookup step
    const dbAgency = await findLicensedAgency(resolvedName, province);
    if (dbAgency) {
      dbCheckResult = { checked: true, found: true, status: dbAgency.licenseStatus };
      if (dbAgency.licenseStatus === "active") {
        return violations;
      }
    } else {
      dbCheckResult = { checked: true, found: false };
    }

    const validation = validateCollectionAgencyName(resolvedName, province);
      
    if (!validation.isLikelyLicensed && validation.flags.length > 0) {
      const lookupUrl = getRegistryLookupUrl(province);
      const urlText = lookupUrl ? ` You can verify their status here: ${lookupUrl}` : "";
        
      violations.push({
        violationCategory: "COLLECTOR_LICENSE_FAILURE",
        severity: "ERROR",
        confidenceScore: validation.confidence,
        userExplanation: `This COLLECTION AGENCY may not be licensed in your province.`,
        technicalDetails: {
          tradelineId: tradeline.id,
          agencyName: resolvedName,
          province,
          flags: validation.flags,
          detectedValue: resolvedName,
          registryUrl: lookupUrl || null,
          dbCheckResult,
          regulationIds: [`${province}_COLLECTION_ACT`],
        },
        recommendedAction: `Request verification of the collection agency identity and licensing record in ${province}.${urlText}`,
        tradelineId: tradeline.id,
        responsibleEntity: "COLLECTOR",
      });
    }
  } else {
    // Province unknown — still validate the agency name using basic heuristics
    const flags = validateAgencyNameBasic(resolvedName);

    if (flags.length > 0) {
      violations.push({
        violationCategory: "COLLECTOR_LICENSE_FAILURE",
        severity: "ERROR",
        confidenceScore: 70,
        userExplanation: `There are concerns regarding the identity of this COLLECTION AGENCY${resolvedName ? ` ("${resolvedName}")` : ""}.`,
        technicalDetails: {
          tradelineId: tradeline.id,
          agencyName: resolvedName || null,
          province: null,
          flags,
          detectedValue: resolvedName || null,
          registryUrl: null,
          dbCheckResult,
          regulationIds: regulationRegistry.VIOLATION_REGULATION_MAP["COLLECTOR_LICENSE_FAILURE"] || [],
        },
        recommendedAction: "Request written verification of the collection agency identity and its basis for collecting this debt.",
        tradelineId: tradeline.id,
        responsibleEntity: "COLLECTOR",
      });
    }
  }

  return violations;
}

/**
 * Checks if there are multiple collection agencies reporting the same debt at the same time.
 * If the current tradeline is older, flag it for removal.
 */
export async function detectDuplicateCollectionAssignment(
  tradeline: Selectable<Tradeline>
): Promise<DetectedViolation[]> {
  const violations: DetectedViolation[] = [];

  const isCollection = isEffectivelyCollectionAccount(tradeline);
  if (!isCollection) return violations;

  const duplicates = await db
    .selectFrom("tradeline")
    .selectAll()
    .where("userId", "=", tradeline.userId as number)
    .where("id", "!=", tradeline.id as number)
    .execute();

  for (const dup of duplicates) {
    const isDupCollection = isEffectivelyCollectionAccount(dup);
    if (!isDupCollection) continue;

    const sameDebtMatch = getSameCollectionDebtMatch(tradeline, dup);

    if (sameDebtMatch.matched) {
      const tradelineDate = tradeline.dateAssignedToCollection || tradeline.openedDate;
      const dupDate = dup.dateAssignedToCollection || dup.openedDate;

      let isOlder = false;

      if (tradelineDate && dupDate) {
        const tTime = new Date(tradelineDate as string | number | Date).getTime();
        const dTime = new Date(dupDate as string | number | Date).getTime();

        if (!isNaN(tTime) && !isNaN(dTime) && dTime > tTime) {
          isOlder = true;
        }
      }

      const otherAgencyName = cleanStoredCollectionAgencyName(dup.collectionAgencyName) || "another collection agency";
      const accountNumberText = sameDebtMatch.accountNumberMatch
        ? ` Both collection accounts use account number ${tradeline.accountNumber}.`
        : "";
      const userExplanation = isOlder
        ? `This appears to be the same debt as the account reported by ${otherAgencyName}.${accountNumberText} The older collection listing should be verified against the reassignment records.`
        : `This appears to be the same debt as the account reported by ${otherAgencyName}.${accountNumberText} The duplicate collection reporting should be verified.`;

      violations.push({
        violationCategory: "MULTIPLE_COLLECTOR_VIOLATION",
        severity: "ERROR",
        confidenceScore: 90,
        userExplanation,
        technicalDetails: {
          duplicateTradelineId: dup.id,
          otherAgencyName,
          accountNumber: tradeline.accountNumber,
          sameAccountNumber: sameDebtMatch.accountNumberMatch,
          otherBalance: Number(dup.balance || (dup as any).currentBalance || 0),
          otherDateAssigned: dupDate,
          matchedOn: sameDebtMatch.matchedOn,
          regulationIds: regulationRegistry.VIOLATION_REGULATION_MAP["MULTIPLE_COLLECTOR_VIOLATION"] || [],
        },
        recommendedAction: "Request verification of the duplicate listing and ask that unsupported duplicate reporting be corrected or removed.",
        tradelineId: tradeline.id,
        responsibleEntity: "COLLECTOR",
      });
      break;
    }
  }

  return violations;
}

/**
 * Checks if Fees/interest added beyond original debt without authorization.
 * Severity: ERROR.
 */
export async function detectCollectorUnauthorizedFees(
  tradeline: Selectable<Tradeline>,
  reportArtifacts: Selectable<ReportArtifact>[]
): Promise<DetectedViolation[]> {
  const violations: DetectedViolation[] = [];
  
  const balance = Number(tradeline.balance || (tradeline as any).currentBalance || 0);
  // Only use highCredit because creditLimit is typically inherited from the original account
  // and doesn't represent the actual debt amount assigned to collections.
  const originalAmount = Number(tradeline.highCredit || 0);

  // If balance is significantly higher than original, and it's a collection account.
  const isCollection = isEffectivelyCollectionAccount(tradeline);
  
  if (isCollection && originalAmount > 0 && balance > originalAmount * 1.25) {
    // 25% buffer for legitimate pre-judgment interest if allowed, but usually collection fees are restricted.
    violations.push({
      violationCategory: "COLLECTOR_UNAUTHORIZED_FEES",
      severity: "ERROR",
      confidenceScore: 80,
      userExplanation: "The CURRENT BALANCE is significantly higher than the original debt.",
      technicalDetails: {
        tradelineId: tradeline.id,
        currentBalance: balance,
        originalAmount: originalAmount,
        difference: balance - originalAmount,
        detectedValue: balance - originalAmount,
        regulationIds: regulationRegistry.VIOLATION_REGULATION_MAP["COLLECTOR_UNAUTHORIZED_FEES"] || [],
      },
      recommendedAction: "Ask the collection agency to verify the balance increase and provide a fee or interest breakdown.",
      tradelineId: tradeline.id,
      responsibleEntity: "COLLECTOR",
    });
  }

  return violations;
}

/**
 * Checks if Same debt reported under multiple account numbers by same collector.
 * Severity: ERROR.
 */
export async function detectCollectorDuplicateReporting(
  tradeline: Selectable<Tradeline>
): Promise<DetectedViolation[]> {
  if (!tradeline.creditorId || !tradeline.originalCreditorName) return [];

  // Query for other tradelines with same creditor (collector) and same original creditor
  const duplicates = await db
    .selectFrom("tradeline")
    .selectAll()
    .where("creditorId", "=", tradeline.creditorId)
    .where("originalCreditorName", "=", tradeline.originalCreditorName)
    .where("bureauId", "=", tradeline.bureauId as number)
    .where("userId", "=", tradeline.userId as number)
    .where("id", "!=", tradeline.id as number)
    .execute();

  const violations: DetectedViolation[] = [];

  for (const dup of duplicates) {
    const bal1 = Number(tradeline.balance || (tradeline as any).currentBalance || 0);
    const bal2 = Number(dup.balance || (dup as any).currentBalance || 0);
    
    const diff = Math.abs(bal1 - bal2);
    const maxBal = Math.max(bal1, bal2);

    if (diff < 50 || (maxBal > 0 && diff / maxBal <= 0.15)) {
      violations.push({
        violationCategory: "COLLECTOR_DUPLICATE_REPORTING",
        severity: "ERROR",
        confidenceScore: 95,
        userExplanation: "This debt is reported as multiple DUPLICATE ACCOUNTS by the same collection agency.",
        technicalDetails: {
          tradelineId: tradeline.id,
          duplicateTradelineId: dup.id,
          collectorId: tradeline.creditorId,
          originalCreditor: tradeline.originalCreditorName,
          detectedValue: dup.id,
          regulationIds: regulationRegistry.VIOLATION_REGULATION_MAP["COLLECTOR_DUPLICATE_REPORTING"] || [],
        },
        recommendedAction: "Request verification of the duplicate accounts and correction or removal of any unsupported duplicate reporting.",
        tradelineId: tradeline.id,
        responsibleEntity: "COLLECTOR",
      });
      // Break after finding one to avoid spamming violations for the same issue
      break;
    }
  }

  return violations;
}

/**
 * Checks if Collector trying to restart limitation clock (Statute Revival).
 * Detect if DOFD advanced forward (reset) after activity.
 * Severity: WARNING.
 */
export async function detectCollectorStatuteRevivalAttempt(
  tradeline: Selectable<Tradeline>,
  reportArtifacts: Selectable<ReportArtifact>[]
): Promise<DetectedViolation[]> {
  const violations: DetectedViolation[] = [];
  
  if (reportArtifacts.length < 2) return violations;

  // Sort artifacts
  const sortedArtifacts = [...reportArtifacts].sort((a, b) =>
    new Date(a.reportDate!).getTime() - new Date(b.reportDate!).getTime()
  );

  // Similar to re-aging, but specifically looking for it in the context of a Collection account
  // and potentially correlated with a recent payment or contact (which we might not know, but we see the date shift).
  
  const isCollection = isEffectivelyCollectionAccount(tradeline);
  if (!isCollection) return [];

  for (let i = 0; i < sortedArtifacts.length - 1; i++) {
    const prevArtifact = sortedArtifacts[i];
    const currArtifact = sortedArtifacts[i + 1];

    const prevData = prevArtifact.data as StandardizedCreditData | null;
    const currData = currArtifact.data as StandardizedCreditData | null;

    // Each artifact contains data for a single tradeline
    if (prevData?.dateOfFirstDelinquency && currData?.dateOfFirstDelinquency) {
      const prevDate = parseISO(prevData.dateOfFirstDelinquency);
      const currDate = parseISO(currData.dateOfFirstDelinquency);

      if (isValid(prevDate) && isValid(currDate) && isAfter(currDate, prevDate)) {
        const diff = differenceInDays(currDate, prevDate);
        
        if (diff > 30) { // Significant shift
           violations.push({
            violationCategory: "COLLECTOR_STATUTE_REVIVAL_ATTEMPT",
            severity: "WARNING",
            confidenceScore: 90,
            userExplanation: `The DATE OF FIRST DELINQUENCY was moved forward by ${diff} days.`,
            technicalDetails: {
              tradelineId: tradeline.id,
              oldDOFD: prevDate.toISOString(),
              newDOFD: currDate.toISOString(),
              shiftDays: diff,
              detectedValue: diff,
              regulationIds: regulationRegistry.VIOLATION_REGULATION_MAP["COLLECTOR_STATUTE_REVIVAL_ATTEMPT"] || [],
            },
            recommendedAction: "Request verification of the date change and correction if the source records do not support it.",
            tradelineId: tradeline.id,
            responsibleEntity: "COLLECTOR",
          });
        }
      }
    }
  }

  return violations;
}

function normalizedComparableText(value: string | null | undefined): string {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textLooksSimilar(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizedComparableText(a);
  const right = normalizedComparableText(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function cleanStoredCollectionAgencyName(value: string | null | undefined): string | null {
  const cleaned = (value || "")
    .replace(
      /\s+(Date\s+Assigned|Member\s+Name|Phone\s+Number|Member\s+Number|First\s+Delinquency|Account\s+Number|Amount|Status|Balance|Narrative|Date\s+Paid\/Settled|Date\s+Verified|Last\s+Payment\s+Date)\b[\s\S]*$/i,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || null;
}

function sameCalendarDay(a: Date | string | null | undefined, b: Date | string | null | undefined): boolean {
  if (!a || !b) return false;
  const left = new Date(a);
  const right = new Date(b);
  if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) return false;
  return left.toISOString().slice(0, 10) === right.toISOString().slice(0, 10);
}

export function getSameCollectionDebtMatch(
  tradeline: Selectable<Tradeline>,
  duplicate: Selectable<Tradeline>
): { matched: boolean; matchedOn: string; accountNumberMatch: boolean } {
  const accountNumberMatch = accountNumbersMatch(tradeline.accountNumber, duplicate.accountNumber);
  const dofdMatch = sameCalendarDay(tradeline.dateOfFirstDelinquency, duplicate.dateOfFirstDelinquency);
  const assignmentDateMatch = sameCalendarDay(tradeline.dateAssignedToCollection, duplicate.dateAssignedToCollection);
  const sameOriginalCreditor = textLooksSimilar(tradeline.originalCreditorName, duplicate.originalCreditorName);
  const sameBureau = Boolean(tradeline.bureauId && duplicate.bureauId && tradeline.bureauId === duplicate.bureauId);

  if (accountNumberMatch && dofdMatch) {
    return { matched: true, matchedOn: "account_number_dofd", accountNumberMatch };
  }

  if (accountNumberMatch && sameOriginalCreditor) {
    return { matched: true, matchedOn: "account_number_original_creditor", accountNumberMatch };
  }

  if (accountNumberMatch && sameBureau) {
    return { matched: true, matchedOn: "account_number_same_bureau", accountNumberMatch };
  }

  if (accountNumberMatch && assignmentDateMatch) {
    return { matched: true, matchedOn: "account_number_assignment_date", accountNumberMatch };
  }

  if (sameOriginalCreditor && sameBureau && duplicate.creditorId !== tradeline.creditorId) {
    return { matched: true, matchedOn: "original_creditor_same_bureau", accountNumberMatch };
  }

  return { matched: false, matchedOn: "", accountNumberMatch };
}
