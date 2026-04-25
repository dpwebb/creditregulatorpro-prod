import type { Selectable } from "kysely";
import type { Tradeline, ReportArtifact } from "./schema";
import type { DetectedViolation } from "./complianceDetectorTypes";
import { isEffectivelyCollectionAccount } from "./complianceDetectorTypes";
import { regulationRegistry } from "./regulationRegistry";

/**
 * Detects if a collection agency received a payment (indicated by a balance decrease)
 * but failed to acknowledge it by updating the Date of Last Payment.
 */
export function detectCollectorPaymentAcknowledgmentViolation(
  tradeline: Selectable<Tradeline>,
  reportArtifacts: Selectable<ReportArtifact>[]
): DetectedViolation[] {
  const violations: DetectedViolation[] = [];

  // Only apply to collection accounts
  if (!isEffectivelyCollectionAccount(tradeline)) {
    return violations;
  }

  // Need at least two snapshots to compare changes
  if (reportArtifacts.length < 2) return violations;

  // Sort artifacts chronologically by reportDate
  const sortedArtifacts = [...reportArtifacts].sort((a, b) => {
        const dateA = a.reportDate ? new Date(a.reportDate as unknown as string).getTime() : 0;
    const dateB = b.reportDate ? new Date(b.reportDate as unknown as string).getTime() : 0;
    return dateA - dateB;
  });

  for (let i = 0; i < sortedArtifacts.length - 1; i++) {
    const prevData = sortedArtifacts[i].data as any;
    const currData = sortedArtifacts[i + 1].data as any;

    if (!prevData || !currData) continue;

    const prevBalance = Number(prevData.balance || prevData.currentBalance || 0);
    const currBalance = Number(currData.balance || currData.currentBalance || 0);

    const prevDate = prevData.dateOfLastPayment;
    const currDate = currData.dateOfLastPayment;

    // Check if balance decreased (indicating a payment was made or a credit applied)
    if (currBalance < prevBalance && prevBalance > 0) {
      // If the balance went down but the date of last payment didn't change, they might have failed to acknowledge the payment properly.
      if (prevDate === currDate && currDate) {
        violations.push({
          violationCategory: "COLLECTOR_PAYMENT_ACKNOWLEDGMENT_VIOLATION",
          severity: "ERROR",
          confidenceScore: 85,
          userExplanation: "The collection agency reduced your balance (likely a payment) but failed to update the Date of Last Payment to reflect it.",
          technicalDetails: {
            tradelineId: tradeline.id,
            previousBalance: prevBalance,
            currentBalance: currBalance,
            dateOfLastPayment: currDate,
            detectedValue: currBalance,
            regulationIds: regulationRegistry.VIOLATION_REGULATION_MAP["COLLECTOR_PAYMENT_ACKNOWLEDGMENT_VIOLATION"] || [],
          },
          recommendedAction: "Demand that the collection agency properly acknowledge your payment by updating your history, or remove the collection account.",
          tradelineId: tradeline.id,
          responsibleEntity: "COLLECTOR",
        });
        
        // Break after finding the first violation to avoid duplicating alerts for the same tradeline
        break;
      }
    }
  }

  return violations;
}