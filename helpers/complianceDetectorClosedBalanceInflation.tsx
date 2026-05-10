import type { Selectable } from "kysely";
import { regulationRegistry } from "./regulationRegistry";
import type { Tradeline, ReportArtifact } from "./schema";
import type { DetectedViolation } from "./complianceDetectorTypes";

// The shape extracted in changeDetector
interface PartialStandardizedData {
  balance?: number | null;
  accountStatus?: string | null;
  [key: string]: any;
}

/**
 * Flags if a closed account's balance increases across reporting periods.
 */
export function detectClosedAccountBalanceInflation(
  tradeline: Selectable<Tradeline>,
  reportArtifacts: Selectable<ReportArtifact>[]
): DetectedViolation[] {
  const violations: DetectedViolation[] = [];
  const currentStatus = (tradeline.status || "").toLowerCase();

  // If currently open/active, it might not apply, though we do check historical statuses
  if (!currentStatus.includes("closed") && !currentStatus.includes("paid")) {
    return violations;
  }

  if (reportArtifacts.length < 2) {
    return violations;
  }

  // Sort chronologically (oldest first)
  const sortedArtifacts = [...reportArtifacts].sort((a, b) => {
    const timeA = a.reportDate ? new Date(a.reportDate).getTime() : 0;
    const timeB = b.reportDate ? new Date(b.reportDate).getTime() : 0;
    return timeA - timeB;
  });

  for (let i = 0; i < sortedArtifacts.length - 1; i++) {
    const prevData = sortedArtifacts[i].data as PartialStandardizedData | null;
    const currData = sortedArtifacts[i + 1].data as PartialStandardizedData | null;

    if (!prevData || !currData) continue;

    const prevBalance = Number(prevData.balance) || 0;
    const currBalance = Number(currData.balance) || 0;

    const prevStatus = (
      prevData.accountStatus ||
      tradeline.status ||
      ""
    ).toLowerCase();

    // If it was already marked as closed, the balance should strictly decrease or stay flat.
    if (prevStatus.includes("closed") && currBalance > prevBalance) {
      violations.push({
        violationCategory: "CLOSED_ACCOUNT_BALANCE_INFLATION",
        severity: "ERROR",
        confidenceScore: 95,
        userExplanation:
          "This account's BALANCE increased after it was CLOSED.",
        technicalDetails: {
          prevArtifactId: sortedArtifacts[i].id,
          currArtifactId: sortedArtifacts[i + 1].id,
          prevBalance,
          currBalance,
          prevStatus,
          detectedValue: currBalance,
          regulationIds: ["PIPEDA_4_6"],
        },
        recommendedAction:
          "Request verification of the balance change and ask for correction or removal if the reporting cannot be supported.",
        tradelineId: tradeline.id,
        responsibleEntity: "CREDITOR",
      });
      break; // One hit is enough per tradeline
    }
  }

  return violations;
}
