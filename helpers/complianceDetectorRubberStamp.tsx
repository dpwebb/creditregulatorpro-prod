import { differenceInDays, parseISO, isValid } from "./dateUtils";
import type { Selectable } from "kysely";
import { regulationRegistry } from "./regulationRegistry";

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
import type { ObligationInstance } from "./schema";
import type { DetectedViolation } from "./complianceDetectorTypes";

/**
 * Detects "Rubber Stamp" investigations where responses are generated too fast
 * to be considered a reasonable investigation, or where responses explicitly
 * fail to address the actual items disputed.
 */
export function detectInvestigationRubberStamp(
  obligationInstances: Selectable<ObligationInstance>[]
): DetectedViolation[] {
  const violations: DetectedViolation[] = [];

  obligationInstances.forEach((instance) => {
    if (!instance.responseReceivedDate || !instance.challengeSentDate) return;

    const sentDate = safeParseDate(instance.challengeSentDate as any);
    const receivedDate = safeParseDate(instance.responseReceivedDate as any);

    let flaggedFastResponse = false;

    // Condition 1: Physically impossible investigation speed (< 3 calendar days)
    if (sentDate && receivedDate) {
      const daysToRespond = differenceInDays(receivedDate, sentDate);

      if (daysToRespond < 3 && daysToRespond >= 0) {
        violations.push({
          violationCategory: "INVESTIGATION_RUBBER_STAMP",
          severity: "ERROR",
          confidenceScore: 95,
          userExplanation: `The INVESTIGATION was completed in only ${daysToRespond} days.`,
          technicalDetails: {
            obligationInstanceId: instance.id,
            daysToRespond,
            detectedValue: daysToRespond,
            regulationIds: ["PIPEDA_4_10"],
          },
          recommendedAction:
            "Demand immediate deletion because they failed their legal obligation to conduct a reasonable, substantive investigation.",
          tradelineId: instance.tradelineId ?? undefined,
          responsibleEntity: "BUREAU",
        });
        flaggedFastResponse = true;
      }
    }

    // Condition 2: Addressed ZERO items while disputed items were provided
    if (!flaggedFastResponse) {
      const disputed = Array.isArray(instance.responseItemsDisputed)
        ? instance.responseItemsDisputed
        : [];
      const addressed = Array.isArray(instance.responseItemsAddressed)
        ? instance.responseItemsAddressed
        : [];

      if (disputed.length > 0 && addressed.length === 0) {
        violations.push({
          violationCategory: "INVESTIGATION_RUBBER_STAMP",
          severity: "ERROR",
          confidenceScore: 85,
          userExplanation:
            "The INVESTIGATION RESPONSE failed to address the specific DISPUTED ITEMS.",
          technicalDetails: {
            obligationInstanceId: instance.id,
            disputedCount: disputed.length,
            addressedCount: addressed.length,
            detectedValue: 0,
            regulationIds: ["PIPEDA_4_10"],
          },
          recommendedAction:
            "Point out that they completely ignored your actual dispute reasons and demand deletion for failure to properly investigate.",
          tradelineId: instance.tradelineId ?? undefined,
          responsibleEntity: "BUREAU",
        });
      }
    }
  });

  return violations;
}