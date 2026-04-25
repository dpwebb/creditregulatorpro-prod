import type { Selectable } from "kysely";
import { db } from "./db";
import type { Tradeline } from "./schema";
import type { DetectedViolation } from "./complianceDetectorTypes";
import { parseISO, isValid } from "./dateUtils";

function isWithinFreeze(dateToCheck: Date, effectiveDate: Date, endDate: Date | null): boolean {
  if (dateToCheck.getTime() < effectiveDate.getTime()) return false;
  if (endDate && dateToCheck.getTime() > endDate.getTime()) return false;
  return true;
}

/**
 * Detects if any hard inquiries or new accounts were opened during an active security freeze.
 */
export async function detectFreezeViolationInquiry(
  tradeline: Selectable<Tradeline>
): Promise<DetectedViolation[]> {
  const violations: DetectedViolation[] = [];

  if (!tradeline.userId || !tradeline.reportArtifactId) return violations;

  const activeFreezes = await db
    .selectFrom("identityTheftFreeze")
    .selectAll()
    .where("userId", "=", tradeline.userId)
    .where("freezeType", "=", "security_freeze")
    .where("status", "=", "active")
    .execute();

  if (activeFreezes.length === 0) return violations;

  // 1. Check if the tradeline itself was opened during an active freeze
  if (tradeline.openedDate) {
    const openedDate = typeof tradeline.openedDate === "string" ? parseISO(tradeline.openedDate) : new Date(tradeline.openedDate);
    if (isValid(openedDate)) {
      for (const freeze of activeFreezes) {
        if (!freeze.effectiveDate) continue;
        const effectiveDate = typeof freeze.effectiveDate === "string" ? parseISO(freeze.effectiveDate) : new Date(freeze.effectiveDate);
        if (!isValid(effectiveDate)) continue;

        let endDate: Date | null = null;
        if (freeze.thawDate) endDate = typeof freeze.thawDate === "string" ? parseISO(freeze.thawDate) : new Date(freeze.thawDate);
        else if (freeze.expirationDate) endDate = typeof freeze.expirationDate === "string" ? parseISO(freeze.expirationDate) : new Date(freeze.expirationDate);

        if (isWithinFreeze(openedDate, effectiveDate, endDate)) {
          violations.push({
            violationCategory: "FREEZE_PERIOD_VIOLATION",
            severity: "ERROR",
            confidenceScore: 95,
            userExplanation: "This account was opened while you had an active security freeze on your credit file.",
            technicalDetails: {
              tradelineId: tradeline.id,
              openedDate: openedDate.toISOString(),
              freezeId: freeze.id,
              freezeEffectiveDate: effectiveDate.toISOString(),
              detectedValue: "Account opened during active security freeze",
              regulationIds: ["ON_FAIRNESS_CRA_2017", "PIPEDA_4_3"],
            },
            recommendedAction: "Dispute this account immediately as it was likely opened fraudulently bypassing your security freeze.",
            tradelineId: tradeline.id,
            responsibleEntity: "BUREAU",
          });
          break; // Avoid duplicate alerts for the same tradeline
        }
      }
    }
  }

  // 2. Check inquiries
  const inquiries = await db
    .selectFrom("reportInquiry")
    .selectAll()
    .where("reportArtifactId", "=", tradeline.reportArtifactId)
    .where("inquiryType", "=", "hard")
    .execute();

  for (const inquiry of inquiries) {
    if (!inquiry.inquiryDate) continue;
    const inquiryDate = typeof inquiry.inquiryDate === "string" ? parseISO(inquiry.inquiryDate) : new Date(inquiry.inquiryDate);
    
    if (isValid(inquiryDate)) {
      for (const freeze of activeFreezes) {
        if (!freeze.effectiveDate) continue;
        const effectiveDate = typeof freeze.effectiveDate === "string" ? parseISO(freeze.effectiveDate) : new Date(freeze.effectiveDate);
        if (!isValid(effectiveDate)) continue;

        let endDate: Date | null = null;
        if (freeze.thawDate) endDate = typeof freeze.thawDate === "string" ? parseISO(freeze.thawDate) : new Date(freeze.thawDate);
        else if (freeze.expirationDate) endDate = typeof freeze.expirationDate === "string" ? parseISO(freeze.expirationDate) : new Date(freeze.expirationDate);

        if (isWithinFreeze(inquiryDate, effectiveDate, endDate)) {
          violations.push({
            violationCategory: "FREEZE_PERIOD_VIOLATION",
            severity: "ERROR",
            confidenceScore: 95,
            userExplanation: `A hard inquiry from ${inquiry.creditorName || "a creditor"} occurred while your credit file was frozen.`,
            technicalDetails: {
              tradelineId: tradeline.id,
              inquiryId: inquiry.id,
              inquiryDate: inquiryDate.toISOString(),
              freezeId: freeze.id,
              freezeEffectiveDate: effectiveDate.toISOString(),
              detectedValue: "Hard inquiry during active security freeze",
              regulationIds: ["ON_FAIRNESS_CRA_2017", "PIPEDA_4_3"],
            },
            recommendedAction: "Demand the removal of this inquiry, as your file should not have been accessible to creditors.",
            tradelineId: tradeline.id,
            responsibleEntity: "BUREAU",
          });
        }
      }
    }
  }

  return violations;
}