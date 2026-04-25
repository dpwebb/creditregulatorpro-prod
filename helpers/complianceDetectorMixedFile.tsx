import type { Selectable } from "kysely";
import { db } from "./db";
import type { Tradeline } from "./schema";
import type { DetectedViolation } from "./complianceDetectorTypes";
import { parseISO, isValid, format } from "./dateUtils";
import { normalizeProvince } from "./canadianJurisdictions";

/**
 * Detects significant mismatches between the consumer's actual profile 
 * and the personal information reported on the credit file linked to this tradeline.
 */
export async function detectMixedFilePersonalInfoMismatch(
  tradeline: Selectable<Tradeline>
): Promise<DetectedViolation[]> {
  const violations: DetectedViolation[] = [];

  if (!tradeline.userId || !tradeline.reportArtifactId) return violations;

  const userAccount = await db
    .selectFrom("userAccount")
    .selectAll()
    .where("userId", "=", tradeline.userId)
    .executeTakeFirst();

  if (!userAccount) return violations;

  const reportInfo = await db
    .selectFrom("reportConsumerInfo")
    .selectAll()
    .where("reportArtifactId", "=", tradeline.reportArtifactId)
    .executeTakeFirst();

  if (!reportInfo) return violations;

  let dobMismatch = false;
  let nameMismatch = false;
  let addressMismatch = false;

  // Check DOB
  if (userAccount.dateOfBirth && reportInfo.dateOfBirth) {
    const userDob = typeof userAccount.dateOfBirth === "string" ? parseISO(userAccount.dateOfBirth) : new Date(userAccount.dateOfBirth);
    const reportDob = typeof reportInfo.dateOfBirth === "string" ? parseISO(reportInfo.dateOfBirth) : new Date(reportInfo.dateOfBirth);
    
    if (isValid(userDob) && isValid(reportDob)) {
      const userFormatted = format(userDob, "yyyy-MM-dd");
      const reportFormatted = format(reportDob, "yyyy-MM-dd");
      if (userFormatted !== reportFormatted) {
        dobMismatch = true;
      }
    }
  }

  // Check Name
  if (userAccount.fullName && reportInfo.fullName) {
    const userTokens = userAccount.fullName.toLowerCase().split(/\s+/);
    const reportTokens = reportInfo.fullName.toLowerCase().split(/\s+/);
    
    // Simple heuristic: if neither the first name nor last name matches well
    const lastUser = userTokens[userTokens.length - 1];
    const lastReport = reportTokens[reportTokens.length - 1];
    if (lastUser && lastReport && lastUser !== lastReport) {
      nameMismatch = true;
    }
  }

  // Check Province
  if (userAccount.province && reportInfo.province) {
    const normUserProv = normalizeProvince(userAccount.province);
    const normReportProv = normalizeProvince(reportInfo.province);
    if (normUserProv.toUpperCase() !== normReportProv.toUpperCase()) {
      addressMismatch = true;
    }
  }

  if (dobMismatch) {
    violations.push({
      violationCategory: "MIXED_FILE_PERSONAL_INFO_MISMATCH",
      severity: "ERROR",
      confidenceScore: 95,
      userExplanation: "The Date of Birth on this credit report does not match your actual Date of Birth, which strongly indicates a mixed file.",
      technicalDetails: {
        tradelineId: tradeline.id,
        userDob: userAccount.dateOfBirth,
        reportDob: reportInfo.dateOfBirth,
        detectedValue: "Date of Birth does not match",
        regulationIds: ["PIPEDA_4_6"],
      },
      recommendedAction: "Dispute the personal information section immediately to untangle your credit file from another person's data.",
      tradelineId: tradeline.id,
      responsibleEntity: "BUREAU",
    });
  }

  if (nameMismatch) {
    violations.push({
      violationCategory: "MIXED_FILE_PERSONAL_INFO_MISMATCH",
      severity: "WARNING",
      confidenceScore: 80,
      userExplanation: "The name listed on this credit report has significant differences from your actual name.",
      technicalDetails: {
        tradelineId: tradeline.id,
        userName: userAccount.fullName,
        reportName: reportInfo.fullName,
        detectedValue: "Last name does not match",
        regulationIds: ["PIPEDA_4_6"],
      },
      recommendedAction: "Review the accounts carefully. If you don't recognize them, dispute them as a mixed file error.",
      tradelineId: tradeline.id,
      responsibleEntity: "BUREAU",
    });
  }

  if (addressMismatch && !dobMismatch && !nameMismatch) {
    violations.push({
      violationCategory: "MIXED_FILE_PERSONAL_INFO_MISMATCH",
      severity: "WARNING",
      confidenceScore: 70,
      userExplanation: "The province listed on this credit report differs from your current province, which could point to an error or identity issue.",
      technicalDetails: {
        tradelineId: tradeline.id,
        userProvince: userAccount.province,
        reportProvince: reportInfo.province,
        detectedValue: "Province does not match",
        regulationIds: ["PIPEDA_4_6"],
      },
      recommendedAction: "Ensure your current address is updated with all creditors and the credit bureaus.",
      tradelineId: tradeline.id,
      responsibleEntity: "BUREAU",
    });
  }

  return violations;
}