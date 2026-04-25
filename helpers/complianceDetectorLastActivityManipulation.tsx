import { isAfter, parseISO, isValid } from "./dateUtils";
import { regulationRegistry } from "./regulationRegistry";
import type { Selectable } from "kysely";
import type { Tradeline, ReportArtifact } from "./schema";
import type { DetectedViolation } from "./complianceDetectorTypes";

interface PartialStandardizedData {
  lastActivityDate?: string | null;
  dateOfLastPayment?: string | null;
  [key: string]: any;
}

/**
 * Detects if a furnisher illegally moved the Date of Last Activity forward
 * to keep a negative item on the credit report longer, without any associated payment.
 */
export function detectLastActivityDateManipulation(
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

    const prevDLA = prevData.lastActivityDate;
    const currDLA = currData.lastActivityDate;

    const prevDLP = prevData.dateOfLastPayment;
    const currDLP = currData.dateOfLastPayment;

    if (prevDLA && currDLA && prevDLA !== currDLA) {
      const prevDate = parseISO(prevDLA);
      const currDate = parseISO(currDLA);

      if (
        isValid(prevDate) &&
        isValid(currDate) &&
        isAfter(currDate, prevDate)
      ) {
        // DLA moved forward in time. Check if Date of Last Payment changed.
        // If DLP is identical (or both are missing), the activity date was manipulated.
        if (prevDLP === currDLP) {
          violations.push({
            violationCategory: "LAST_ACTIVITY_DATE_MANIPULATION",
            severity: "ERROR",
            confidenceScore: 90,
            userExplanation:
              "The DATE OF LAST ACTIVITY was moved forward without a corresponding payment.",
            technicalDetails: {
              prevArtifactId: sortedArtifacts[i].id,
              currArtifactId: sortedArtifacts[i + 1].id,
              prevDLA,
              currDLA,
              prevDLP,
              currDLP,
              detectedValue: currDLA,
              regulationIds: ["PIPEDA_4_6"],
            },
            recommendedAction:
              "Dispute the manipulated Date of Last Activity and demand the account be deleted immediately for illegal re-aging.",
            tradelineId: tradeline.id,
            responsibleEntity: "CREDITOR",
          });
          break; // Stop after finding the manipulation to avoid duplicate alerts
        }
      }
    }
  }

  return violations;
}