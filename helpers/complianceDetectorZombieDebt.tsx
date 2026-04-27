import type { Selectable } from "kysely";
import { regulationRegistry } from "./regulationRegistry";
import type { Tradeline, ReportArtifact } from "./schema";
import type { DetectedViolation } from "./complianceDetectorTypes";

interface PartialStandardizedData {
  balance?: number | null;
  accountStatus?: string | null;
  [key: string]: any;
}

/**
 * Detects 'Zombie Debt' - accounts that were previously marked as removed,
 * paid, deleted, or 0 balance, and then randomly re-appear with a balance.
 */
export function detectZombieDebtResurrection(
  tradeline: Selectable<Tradeline>,
  reportArtifacts: Selectable<ReportArtifact>[]
): DetectedViolation[] {
  const violations: DetectedViolation[] = [];

  if (reportArtifacts.length < 2) {
    return violations;
  }

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

    const prevStatus = (prevData.accountStatus || "").toLowerCase();
    const currStatus = (currData.accountStatus || "").toLowerCase();

    const wasDead =
      prevBalance === 0 ||
      prevStatus.includes("removed") ||
      prevStatus.includes("deleted") ||
      prevStatus.includes("paid");

    const isResurrected =
      currBalance > 0 ||
      currStatus.includes("active") ||
      currStatus.includes("collection") ||
      currStatus.includes("charge");

    // If it was dead and is now resurrected with a balance
    if (wasDead && isResurrected && currBalance > 0) {
      violations.push({
        violationCategory: "ZOMBIE_DEBT_RESURRECTION",
        severity: "ERROR",
        confidenceScore: 90,
        userExplanation:
          "This account transitioned from a CLOSED OR ZERO BALANCE state back to an ACTIVE state with a balance.",
        technicalDetails: {
          prevArtifactId: sortedArtifacts[i].id,
          currArtifactId: sortedArtifacts[i + 1].id,
          prevBalance,
          currBalance,
          prevStatus,
          currStatus,
          detectedValue: currBalance,
          regulationIds: ["PIPEDA_4_6"],
        },
        recommendedAction:
          "Demand immediate deletion of this 'Zombie Debt' which has been illegally resurrected on your credit report.",
        tradelineId: tradeline.id,
        responsibleEntity: "CREDITOR",
      });
      break;
    }
  }

  return violations;
}