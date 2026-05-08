import { db } from "./db";
import { Selectable } from "kysely";
import { Tradeline, type CanadianProvince } from "./schema";
import { normalizeProvinceCode } from "./canadianJurisdictions";

function normalizedProvince(value: string | null | undefined): CanadianProvince | null {
  return normalizeProvinceCode(value);
}

/**
 * Resolves the province for a tradeline using a 3-step cascade:
 * 1. userAccount.province (from tradeline.userId)
 * 2. reportConsumerInfo.province (from tradeline.reportArtifactId)
 * 3. Latest reportConsumerInfo.province from any reportArtifact for the user
 *
 * Returns null if province cannot be determined.
 */
export async function resolveTradelineProvince(
  tradeline: Selectable<Tradeline>
): Promise<CanadianProvince | null> {
  return resolveProvinceByIds(tradeline.userId, tradeline.reportArtifactId);
}

/**
 * Resolves the province for a given user ID and report artifact ID using a 3-step cascade:
 * 1. userAccount.province (from userId)
 * 2. reportConsumerInfo.province (from reportArtifactId)
 * 3. Latest reportConsumerInfo.province from any reportArtifact for the user
 *
 * Returns null if province cannot be determined.
 */
export async function resolveProvinceByIds(
  userId: number | null,
  reportArtifactId: number | null
): Promise<CanadianProvince | null> {
  // Step 1: Check userAccount.province
  if (userId) {
    const userAccount = await db
      .selectFrom("userAccount")
      .select("province")
      .where("userId", "=", userId)
      .executeTakeFirst();

    const userAccountProvince = normalizedProvince(userAccount?.province);
    if (userAccountProvince) {
      return userAccountProvince;
    }

    const legacyUserAccount = await db
      .selectFrom("userAccount")
      .select("province")
      .where("id", "=", userId)
      .executeTakeFirst();

    const legacyUserAccountProvince = normalizedProvince(legacyUserAccount?.province);
    if (legacyUserAccountProvince) {
      return legacyUserAccountProvince;
    }
  }

  // Step 2: Check reportConsumerInfo.province (from reportArtifactId)
  if (reportArtifactId) {
    const reportInfo = await db
      .selectFrom("reportConsumerInfo")
      .select("province")
      .where("reportArtifactId", "=", reportArtifactId)
      .executeTakeFirst();

    const reportProvince = normalizedProvince(reportInfo?.province);
    if (reportProvince) {
      return reportProvince;
    }
  }

  // Step 3: Check latest reportConsumerInfo.province from any reportArtifact for the user
  if (userId) {
    const latestReportInfo = await db
      .selectFrom("reportConsumerInfo")
      .innerJoin(
        "reportArtifact",
        "reportArtifact.id",
        "reportConsumerInfo.reportArtifactId"
      )
      .select("reportConsumerInfo.province")
      .where("reportArtifact.userId", "=", userId)
      .where("reportConsumerInfo.province", "is not", null)
      .orderBy("reportArtifact.reportDate", "desc")
      .executeTakeFirst();

    const latestReportProvince = normalizedProvince(latestReportInfo?.province);
    if (latestReportProvince) {
      return latestReportProvince;
    }
  }

  // Return null if province cannot be determined
  return null;
}
