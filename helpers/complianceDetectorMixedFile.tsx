import type { Selectable } from "kysely";
import { db } from "./db";
import type { Tradeline } from "./schema";
import type { DetectedViolation } from "./complianceDetectorTypes";
import { parseISO, isValid, format } from "./dateUtils";
import { normalizeProvince } from "./canadianJurisdictions";

type MixedFileSignalInput = {
  userFullName?: string | null;
  reportFullName?: string | null;
  userDateOfBirth?: string | Date | null;
  reportDateOfBirth?: string | Date | null;
  userProvince?: string | null;
  reportProvince?: string | null;
};

export type MixedFileSignals = {
  dobMismatch: boolean;
  nameMismatch: boolean;
  addressMismatch: boolean;
  shouldReportNameMismatch: boolean;
  shouldReportAddressMismatch: boolean;
};

function toDateOnly(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = typeof value === "string" ? parseISO(value) : new Date(value);
  return isValid(date) ? format(date, "yyyy-MM-dd") : null;
}

function normalizedLastName(value: string | null | undefined): string | null {
  const tokens = value
    ?.toLowerCase()
    .replace(/[^a-z\s'-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  return tokens?.length ? tokens[tokens.length - 1] : null;
}

export function evaluateMixedFileSignals(input: MixedFileSignalInput): MixedFileSignals {
  let dobMismatch = false;
  let nameMismatch = false;
  let addressMismatch = false;

  const userDob = toDateOnly(input.userDateOfBirth);
  const reportDob = toDateOnly(input.reportDateOfBirth);
  if (userDob && reportDob && userDob !== reportDob) {
    dobMismatch = true;
  }

  const userLastName = normalizedLastName(input.userFullName);
  const reportLastName = normalizedLastName(input.reportFullName);
  if (userLastName && reportLastName && userLastName !== reportLastName) {
    nameMismatch = true;
  }

  if (input.userProvince && input.reportProvince) {
    const normUserProv = normalizeProvince(input.userProvince);
    const normReportProv = normalizeProvince(input.reportProvince);
    if (normUserProv.toUpperCase() !== normReportProv.toUpperCase()) {
      addressMismatch = true;
    }
  }

  return {
    dobMismatch,
    nameMismatch,
    addressMismatch,
    shouldReportNameMismatch: nameMismatch && (dobMismatch || addressMismatch),
    shouldReportAddressMismatch: addressMismatch && !dobMismatch && !nameMismatch,
  };
}

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

  const signals = evaluateMixedFileSignals({
    userFullName: userAccount.fullName,
    reportFullName: reportInfo.fullName,
    userDateOfBirth: userAccount.dateOfBirth,
    reportDateOfBirth: reportInfo.dateOfBirth,
    userProvince: userAccount.province,
    reportProvince: reportInfo.province,
  });

  if (signals.dobMismatch) {
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

  if (signals.shouldReportNameMismatch) {
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

  if (signals.shouldReportAddressMismatch) {
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
