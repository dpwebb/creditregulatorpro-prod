import type { Selectable } from "kysely";
import { db } from "./db";
import type { Tradeline } from "./schema";
import type { DetectedViolation } from "./complianceDetectorTypes";
import { parseISO, isValid, isAfter } from "./dateUtils";

/**
 * Detects if a creditor or bureau continues to report or update information 
 * after the consumer has explicitly withdrawn consent.
 */
export async function detectConsentWithdrawalNotHonored(
  tradeline: Selectable<Tradeline>
): Promise<DetectedViolation[]> {
  const violations: DetectedViolation[] = [];

  if (!tradeline.lastReportedDate) return violations;

  const obligations = await db
    .selectFrom("obligationInstance")
    .selectAll()
    .where("tradelineId", "=", tradeline.id)
    .where("state", "=", "PROCEDURALLY_EXHAUSTED")
    .execute();

  let hasConsentWithdrawal = false;
  let withdrawalDate: Date | null = null;

  for (const obs of obligations) {
    const isConsentVector = obs.disputeVector && obs.disputeVector.toLowerCase().includes("consent_withdrawal");
    const isConsentNotes = obs.notes && (obs.notes.toLowerCase().includes("consent withdrawal") || obs.notes.toLowerCase().includes("withdraw consent"));
    
    if (isConsentVector || isConsentNotes) {
      hasConsentWithdrawal = true;
      const createdAt = obs.createdAt ? (typeof obs.createdAt === "string" ? parseISO(obs.createdAt) : new Date(obs.createdAt)) : null;
      if (createdAt && isValid(createdAt)) {
        if (!withdrawalDate || createdAt.getTime() > withdrawalDate.getTime()) {
          withdrawalDate = createdAt;
        }
      }
    }
  }

  if (hasConsentWithdrawal && withdrawalDate) {
    const reportedDate = typeof tradeline.lastReportedDate === "string" ? parseISO(tradeline.lastReportedDate) : new Date(tradeline.lastReportedDate);
    
    if (isValid(reportedDate) && isAfter(reportedDate, withdrawalDate)) {
      violations.push({
        violationCategory: "CONSENT_WITHDRAWAL_NOT_HONORED",
        severity: "ERROR",
        confidenceScore: 90,
        userExplanation: "This account was updated after you officially withdrew your consent to share information.",
        technicalDetails: {
          tradelineId: tradeline.id,
          withdrawalDate: withdrawalDate.toISOString(),
          lastReportedDate: reportedDate.toISOString(),
          detectedValue: "Reporting continued after consent withdrawal",
          regulationIds: ["PIPEDA_4_3_8"],
        },
        recommendedAction: "Demand the immediate deletion of this account, as continuing to process your data after consent withdrawal is a violation of PIPEDA.",
        tradelineId: tradeline.id,
        responsibleEntity: "CREDITOR",
      });
    }
  }

  return violations;
}