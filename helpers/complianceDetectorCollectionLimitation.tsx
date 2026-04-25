import type { Selectable } from "kysely";
import { db } from "./db";
import type { Tradeline, CanadianProvince } from "./schema";
import type { DetectedViolation } from "./complianceDetectorTypes";
import { isEffectivelyCollectionAccount } from "./complianceDetectorTypes";
import { resolveTradelineProvince } from "./resolveTradelineProvince";
import { parseISO, isValid, differenceInDays } from "./dateUtils";
import { regulationRegistry } from "./regulationRegistry";

/**
 * Checks if a collection account has activity (new demands, balance increases, status changes)
 * AFTER the provincial collection limitation period has expired.
 * This is DIFFERENT from the reporting retention period.
 */
export async function detectCollectionLimitationExceeded(
  tradeline: Selectable<Tradeline>
): Promise<DetectedViolation[]> {
  const violations: DetectedViolation[] = [];

  const isCollection = isEffectivelyCollectionAccount(tradeline);
  if (!isCollection) return violations;

  const provinceStr = await resolveTradelineProvince(tradeline);
  if (!provinceStr) return violations;

  const province = provinceStr as CanadianProvince;
  const limitationYears = regulationRegistry.getCollectionLimitationYears(province);

  // Determine the reference date: later of DOFD, Date of Last Payment, or Last Activity Date
  let referenceDate: Date | null = null;
  const datesToCheck = [
    tradeline.dateOfFirstDelinquency,
    tradeline.dateOfLastPayment,
    tradeline.lastActivityDate,
  ];

  for (const dateStr of datesToCheck) {
    if (dateStr) {
      const parsed = typeof dateStr === "string" ? parseISO(dateStr) : new Date(dateStr);
      if (isValid(parsed)) {
        if (!referenceDate || parsed.getTime() > referenceDate.getTime()) {
          referenceDate = parsed;
        }
      }
    }
  }

  if (!referenceDate) return violations;

  let today = new Date();
  if (tradeline.reportArtifactId) {
    const artifact = await db.selectFrom("reportArtifact")
      .select(["reportDate", "createdAt"])
      .where("id", "=", tradeline.reportArtifactId)
      .executeTakeFirst();
    if (artifact) {
      if (artifact.reportDate) {
        const parsedReport = typeof artifact.reportDate === "string" ? parseISO(artifact.reportDate) : new Date(artifact.reportDate);
        if (isValid(parsedReport)) today = parsedReport;
      } else if (artifact.createdAt) {
        const parsedCreated = typeof artifact.createdAt === "string" ? parseISO(artifact.createdAt) : new Date(artifact.createdAt);
        if (isValid(parsedCreated)) today = parsedCreated;
      }
    }
  }

  // Calculate days since reference date
  const daysSinceReference = differenceInDays(today, referenceDate);
  const yearsSinceReference = daysSinceReference / 365.25;

  if (yearsSinceReference > limitationYears) {
    // Check if there's recent reporting activity (within last 12 months)
    let hasRecentActivity = false;
    if (tradeline.lastReportedDate) {
      const reportedDate = typeof tradeline.lastReportedDate === "string" 
        ? parseISO(tradeline.lastReportedDate) 
        : new Date(tradeline.lastReportedDate);
      if (isValid(reportedDate)) {
        const daysSinceReported = differenceInDays(today, reportedDate);
        if (daysSinceReported <= 365) {
          hasRecentActivity = true;
        }
      }
    }

    if (hasRecentActivity) {
      violations.push({
        violationCategory: "COLLECTION_LIMITATION_EXCEEDED",
        severity: "ERROR",
        confidenceScore: 90,
        userExplanation: `This collection account has been reported or updated recently, but it is past the legal time limit (${limitationYears} years in ${province}) for collection action.`,
        technicalDetails: {
          tradelineId: tradeline.id,
          province,
          limitationYears,
          referenceDate: referenceDate.toISOString(),
          lastReportedDate: tradeline.lastReportedDate,
          detectedValue: yearsSinceReference,
          regulationIds: [`${province}_LIMITATIONS_ACT`],
        },
        recommendedAction: `Dispute this account on the grounds that it is statute-barred under the ${province} Limitations Act and should not be subjected to further collection activity.`,
        tradelineId: tradeline.id,
        responsibleEntity: "COLLECTOR",
      });
    }
  }

  return violations;
}