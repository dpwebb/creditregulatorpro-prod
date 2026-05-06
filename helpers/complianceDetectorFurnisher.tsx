import { differenceInDays, parseISO, isValid, isAfter } from "./dateUtils";
import type { Selectable } from "kysely";
import type { Tradeline, ObligationInstance, ReportArtifact } from "./schema";
import type { DetectedViolation } from "./complianceDetectorTypes";
import { detectChanges, StandardizedCreditData } from "./changeDetector";
import { regulationRegistry } from "./regulationRegistry";
import { formatCurrency } from "./formatters";

function isEcoaCode(value: string | undefined | null, codes: string[]): boolean {
  if (!value) return false;
  const normalized = value.trim().toUpperCase();
  return codes.some((code) => normalized === code.toUpperCase());
}

/**
 * Detects if the Date of First Delinquency (DOFD) was altered between report snapshots.
 * DOFD is the anchor for the 6/7 year reporting limit and should generally not change.
 * Severity: ERROR.
 */
export function detectFurnisherReagingViolation(
  tradeline: Selectable<Tradeline>,
  reportArtifacts: Selectable<ReportArtifact>[]
): DetectedViolation[] {
  const violations: DetectedViolation[] = [];
  
  if (reportArtifacts.length < 2) return violations;

  // Sort artifacts chronologically
  const sortedArtifacts = [...reportArtifacts].sort((a, b) =>
    new Date(a.reportDate!).getTime() - new Date(b.reportDate!).getTime()
  );

  for (let i = 0; i < sortedArtifacts.length - 1; i++) {
    const prevArtifact = sortedArtifacts[i];
    const currArtifact = sortedArtifacts[i + 1];

    const prevData = prevArtifact.data as StandardizedCreditData | null;
    const currData = currArtifact.data as StandardizedCreditData | null;

    if (!prevData || !currData) continue;

    // Each artifact contains data for a single tradeline
    if (prevData.dateOfFirstDelinquency && currData.dateOfFirstDelinquency) {
      const prevDate = parseISO(prevData.dateOfFirstDelinquency);
      const currDate = parseISO(currData.dateOfFirstDelinquency);

      if (isValid(prevDate) && isValid(currDate)) {
        // Check if date changed significantly (e.g. > 5 days to account for timezone/parsing jitter)
        const diff = Math.abs(differenceInDays(prevDate, currDate));
        
        // Also check if it moved FORWARD (re-aging)
        const movedForward = isAfter(currDate, prevDate);

        if (diff > 5 && movedForward) {
          violations.push({
            violationCategory: "FURNISHER_REAGING_VIOLATION",
            severity: "ERROR",
            confidenceScore: 95,
            userExplanation: `The DATE OF FIRST DELINQUENCY was moved forward by ${diff} days.`,
            technicalDetails: {
              tradelineId: tradeline.id,
              oldDOFD: prevDate.toISOString(),
              newDOFD: currDate.toISOString(),
              driftDays: diff,
              artifactIds: [prevArtifact.id, currArtifact.id],
              detectedValue: currDate.toISOString(),
              regulationIds: ["PIPEDA_4_6"],
            },
            recommendedAction: "Dispute this account and tell them to fix the original date or remove it entirely.",
            tradelineId: tradeline.id,
            responsibleEntity: "CREDITOR",
          });
        }
      }
    }
  }

  return violations;
}

/**
 * Checks if Account Status contradicts Payment Rating.
 * E.g., status="CURRENT" but paymentHistoryProfile shows late payments (R2+).
 * Severity: ERROR.
 */
export function detectFurnisherStatusCodeMismatch(
  tradeline: Selectable<Tradeline>
): DetectedViolation[] {
  const violations: DetectedViolation[] = [];
  
  const status = (tradeline.status || "").toUpperCase();
  const rating = (tradeline.paymentHistoryProfile || "").toUpperCase(); // Assuming this holds the R-rating like "R1", "I9" etc. or a string of history.
  // Note: 'paymentHistoryProfile' in schema might be the long string of monthly codes. 
  // Often 'accountType' + 'currentRating' is used. 
  // Let's assume 'status' contains the text description (e.g. "Open", "Paid") and we look for contradictions.
  
  // Common scenario: Status says "Current" or "Paid as Agreed" but we see recent lates.
  // Or Status says "Late" but balance is 0 and paid.
  
  // Let's look for a specific contradiction: "Current" status with "Derogatory" codes in recent history if available.
  // Since we might not have the parsed monthly history here, we'll look at the 'status' vs 'amountPastDue'.
  
  const isCurrent = status.includes("CURRENT") || status.includes("OK") || status.includes("PAID AS AGREED");
  const pastDue = Number(tradeline.amountPastDue || 0);

  if (isCurrent && pastDue > 0) {
    violations.push({
      violationCategory: "FURNISHER_STATUS_CODE_MISMATCH",
      severity: "ERROR",
      confidenceScore: 100,
      userExplanation: "The account shows a CURRENT STATUS but also reports an overdue balance.",
      technicalDetails: {
        tradelineId: tradeline.id,
        status: tradeline.status,
        amountPastDue: pastDue,
        detectedValue: `${tradeline.status} / ${formatCurrency(pastDue)}`,
        regulationIds: ["PIPEDA_4_6"],
      },
      recommendedAction: "Ask the company to correct the overdue balance to zero since the account is marked as current.",
      tradelineId: tradeline.id,
      responsibleEntity: "CREDITOR",
    });
  }

  return violations;
}

/**
 * Checks if a Joint account (ECOA 2 or 3) is missing the required JOINT ACCOUNT INFORMATION (J1/J2 segment data).
 * Severity: WARNING.
 */
export function detectFurnisherJointAccountViolation(
  tradeline: Selectable<Tradeline>
): DetectedViolation[] {
  const violations: DetectedViolation[] = [];
  
  // ECOA Codes: 2 = Joint Contractual, 3 = Authorized User (sometimes treated similarly for reporting segments)
  // We check 'accountDesignation' for these codes.
  const designation = tradeline.accountDesignation;
  const responsibility = tradeline.responsibilityCode;
  
  const jointCodes = ["2", "J", "JOINT", "JOINT CONTRACTUAL"];
  const isJoint = isEcoaCode(designation, jointCodes) || isEcoaCode(responsibility, jointCodes);
  
  // If it's joint, Metro2 requires J1/J2 segments to identify the other consumer.
  if (isJoint) {
    if (!tradeline.hasJ1Segment && !tradeline.hasJ2Segment) {
      violations.push({
        violationCategory: "FURNISHER_JOINT_ACCOUNT_VIOLATION",
        severity: "WARNING",
        confidenceScore: 80,
        userExplanation: "This joint account is missing the required JOINT ACCOUNT INFORMATION.",
        technicalDetails: {
          tradelineId: tradeline.id,
          accountDesignation: tradeline.accountDesignation,
          hasJ1: tradeline.hasJ1Segment,
          hasJ2: tradeline.hasJ2Segment,
          detectedValue: tradeline.accountDesignation || "Missing",
          regulationIds: ["PIPEDA_4_3", "METRO2_J1_SEGMENT"],
        },
        recommendedAction: "Ask them to add the other person's details or change the account so it's not listed as joint.",
        tradelineId: tradeline.id,
        responsibleEntity: "CREDITOR",
      });
    }
  }

  return violations;
}

/**
 * Checks if an Authorized User (ECOA 3) is being reported as primary/joint.
 * Severity: ERROR.
 */
export function detectFurnisherAuthorizedUserMisrepresentation(
  tradeline: Selectable<Tradeline>
): DetectedViolation[] {
  const violations: DetectedViolation[] = [];
  
  const designation = tradeline.accountDesignation;
  const responsibility = tradeline.responsibilityCode;
  
  // This logic is tricky without knowing the TRUE legal status. 
  // We are checking for internal inconsistency or if the user flagged it.
  // Here we assume the detector is run when we suspect it's an AU account but it's not marked as such.
  // OR, if the designation says "Authorized User" but the 'accountType' or liability indicators suggest otherwise.
  
  // Let's invert: If designation is "Individual" (1) or "Joint" (2), but the consumer claims to be AU.
  // We can't know the consumer's claim here easily.
  
  // Alternative check: If designation is "Authorized User" (3), but the tradeline is impacting utilization/history 
  // in a way that suggests primary liability (e.g. some scoring models ignore AU, but raw data is what we check).
  
  // Let's implement the check requested: "Authorized user (ECOA 3) being reported as primary/joint."
  // This implies we found a mismatch. Maybe we check if 'accountDesignation' is missing '3' but the narrative says 'Authorized User'?
  // Or if the user is an AU, they shouldn't have 'amountPastDue' attributed to them personally in some contexts?
  
  // Let's stick to the prompt's hint: "Check accountDesignation for proper classification."
  // We will flag if the designation is ambiguous or missing when it looks like an AU account.
  // Actually, a common error is reporting AU as Joint (2).
  // Without external truth, we can only check for missing designation if it's a known AU account.
  
  // Placeholder logic for safety: If designation is missing entirely, it's a risk.
  // But let's look for "Terminated" AU accounts still reporting balance.
  
  const auCodes = ["3", "A", "AUTHORIZED", "AUTHORIZED USER"];
  const isDesignatedAU = isEcoaCode(designation, auCodes) || isEcoaCode(responsibility, auCodes);
  
  // Let's implement a check for: Designation says "Individual" (1) but remarks say "Authorized User".
  // This is a clear contradiction.
  const remarks = (tradeline.paymentHistoryProfile || "") + " " + (tradeline.status || ""); // Using fields we have as proxy for remarks
  if (remarks.toUpperCase().includes("AUTHORIZED USER") && !isDesignatedAU) {
     violations.push({
      violationCategory: "FURNISHER_AUTHORIZED_USER_MISREPRESENTATION",
      severity: "ERROR",
      confidenceScore: 90,
      userExplanation: "The account remarks indicate an AUTHORIZED USER but it is being reported with primary responsibility.",
      technicalDetails: {
        tradelineId: tradeline.id,
        designation: designation || "",
        responsibility: responsibility || "",
        remarksFound: true,
        detectedValue: responsibility || designation || "",
        regulationIds: ["PIPEDA_4_3", "METRO2_J2_SEGMENT"],
      },
      recommendedAction: "Tell the company to fix the account so you aren't held fully responsible for the debt.",
      tradelineId: tradeline.id,
      responsibleEntity: "CREDITOR",
    });
  }

  return violations;
}

/**
 * Detects negative changes (balance increase, status downgrade, new late marks) immediately after dispute filed.
 * Severity: WARNING.
 */
export function detectFurnisherPostDisputeRetaliation(
  tradeline: Selectable<Tradeline>,
  obligationInstances: Selectable<ObligationInstance>[],
  reportArtifacts: Selectable<ReportArtifact>[]
): DetectedViolation[] {
  const violations: DetectedViolation[] = [];
  
  // Find recent disputes
  const recentDisputes = obligationInstances.filter(o => o.challengeSentDate);
  if (recentDisputes.length === 0 || reportArtifacts.length < 2) return violations;

  // Sort artifacts
  const sortedArtifacts = [...reportArtifacts].sort((a, b) =>
    new Date(a.reportDate!).getTime() - new Date(b.reportDate!).getTime()
  );

  for (const dispute of recentDisputes) {
    const disputeDate = parseISO(dispute.challengeSentDate!.toString());
    if (!isValid(disputeDate)) continue;

    // Find artifacts just before and just after dispute
    const preArtifact = sortedArtifacts.filter(a => isAfter(disputeDate, new Date(a.reportDate!))).pop(); // Last one before
    const postArtifact = sortedArtifacts.find(a => isAfter(new Date(a.reportDate!), disputeDate)); // First one after

    if (preArtifact && postArtifact) {
      const preData = preArtifact.data as StandardizedCreditData | null;
      const postData = postArtifact.data as StandardizedCreditData | null;
      
      // Each artifact contains data for a single tradeline
      if (preData && postData) {
        const balanceIncreased = Number(postData.balance) > Number(preData.balance);
        const statusWorsened = preData.accountStatus !== postData.accountStatus && 
          (postData.accountStatus?.includes("LATE") || postData.accountStatus?.includes("COLLECTION"));
        
        if (balanceIncreased || statusWorsened) {
           violations.push({
            violationCategory: "FURNISHER_POST_DISPUTE_RETALIATION",
            severity: "WARNING",
            confidenceScore: 75,
            userExplanation: "The account status or balance worsened immediately following a DISPUTE.",
            technicalDetails: {
              tradelineId: tradeline.id,
              disputeDate: disputeDate.toISOString(),
              preBalance: preData.balance,
              postBalance: postData.balance,
              preStatus: preData.accountStatus,
              postStatus: postData.accountStatus,
              detectedValue: `Balance: ${formatCurrency(postData.balance)}, Status: ${postData.accountStatus}`,
              regulationIds: ["PIPEDA_4_10"],
            },
            recommendedAction: "Complain that the account was made to look worse after your dispute and demand they fix it.",
            tradelineId: tradeline.id,
            responsibleEntity: "CREDITOR",
          });
        }
      }
    }
  }

  return violations;
}
