import { differenceInMonths, parseISO, isValid } from "./dateUtils";
import { regulationRegistry } from "./regulationRegistry";
import type { Selectable } from "kysely";
import type { Tradeline, ReportArtifact } from "./schema";
import type { DetectedViolation } from "./complianceDetectorTypes";
import type { StandardizedCreditData } from "./changeDetector";

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

/**
 * Ranks payment history character codes to determine if a rating is "worse".
 * Assumes numeric chars 0-9 represent degree of lateness (1=30, 2=60, etc.),
 * and treats certain letters as derogatory. 
 */
function getRatingSeverity(char: string): number {
  if (!char) return -1;
  const upper = char.toUpperCase();
  if (/[0-9]/.test(upper)) {
    return parseInt(upper, 10);
  }
  // If it's a letter, usually means derogatory (e.g., Collection, Charge-off)
  // We'll give letters a high severity to catch changes from number -> letter.
  return 20; 
}

/**
 * Detects if past payment history was retroactively altered to look worse.
 */
export function detectRetroactiveHistoryManipulation(
  tradeline: Selectable<Tradeline>,
  reportArtifacts: Selectable<ReportArtifact>[]
): DetectedViolation[] {
  const violations: DetectedViolation[] = [];

  if (reportArtifacts.length < 2) return violations;

  // Sort chronologically
  const sortedArtifacts = [...reportArtifacts].sort((a, b) => {
    const timeA = a.reportDate ? new Date(a.reportDate).getTime() : 0;
    const timeB = b.reportDate ? new Date(b.reportDate).getTime() : 0;
    return timeA - timeB;
  });

  for (let i = 0; i < sortedArtifacts.length - 1; i++) {
    const prevArtifact = sortedArtifacts[i];
    const currArtifact = sortedArtifacts[i + 1];

    if (!prevArtifact.reportDate || !currArtifact.reportDate) continue;

    const prevDate = safeParseDate(prevArtifact.reportDate);
    const currDate = safeParseDate(currArtifact.reportDate);

    if (!prevDate || !currDate) continue;

    const prevData = prevArtifact.data as StandardizedCreditData | null;
    const currData = currArtifact.data as StandardizedCreditData | null;

    const prevHistory = prevData?.paymentHistory;
    const currHistory = currData?.paymentHistory;

    if (prevHistory && currHistory) {
      // Typically, index 0 is the most recent month reported in that snapshot.
      // So if currDate is 2 months after prevDate, index 2 in currHistory corresponds to index 0 in prevHistory.
      const diffMonths = differenceInMonths(currDate, prevDate);

      if (diffMonths >= 0) {
        let changed = false;
        let oldCode = "";
        let newCode = "";
        let offsetIndex = -1;

        // Compare overlapping months
        for (let j = 0; j < prevHistory.length; j++) {
          const currIndex = j + diffMonths;
          if (currIndex < currHistory.length) {
            const prevChar = prevHistory[j];
            const currChar = currHistory[currIndex];

            const prevSeverity = getRatingSeverity(prevChar);
            const currSeverity = getRatingSeverity(currChar);

            // If the rating got worse for a historical month
            if (prevSeverity >= 0 && currSeverity >= 0 && currSeverity > prevSeverity) {
              changed = true;
              oldCode = prevChar;
              newCode = currChar;
              offsetIndex = j;
              break;
            }
          }
        }

        if (changed) {
          violations.push({
            violationCategory: "RETROACTIVE_HISTORY_MANIPULATION",
            severity: "ERROR",
            confidenceScore: 97,
            userExplanation: "The past PAYMENT HISTORY was retroactively changed to a worse status.",
            technicalDetails: {
              tradelineId: tradeline.id,
              artifactIds: [prevArtifact.id, currArtifact.id],
              monthOffset: offsetIndex,
              oldCode,
              newCode,
              prevHistory,
              currHistory,
              detectedValue: `${oldCode} -> ${newCode}`,
              regulationIds: ["PIPEDA_4_6", "METRO2_PAYMENT_RATING"],
            },
            recommendedAction: "Dispute this account and demand they revert the illegal retroactive change to your payment history or delete the account.",
            responsibleEntity: "CREDITOR",
          });
        }
      }
    }
  }

  return violations;
}