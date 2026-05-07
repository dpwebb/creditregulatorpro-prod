import { db } from "./db";
import { Selectable } from "kysely";
import { Tradeline } from "./schema";

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
): Promise<string | null> {
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
): Promise<string | null> {
  // Step 1: Check userAccount.province
  if (userId) {
    const userAccount = await db
      .selectFrom("userAccount")
      .select("province")
      .where("userId", "=", userId)
      .executeTakeFirst();

    if (userAccount?.province) {
      return userAccount.province;
    }

    const legacyUserAccount = await db
      .selectFrom("userAccount")
      .select("province")
      .where("id", "=", userId)
      .executeTakeFirst();

    if (legacyUserAccount?.province) {
      return legacyUserAccount.province;
    }
  }

  // Step 2: Check reportConsumerInfo.province (from reportArtifactId)
  if (reportArtifactId) {
    const reportInfo = await db
      .selectFrom("reportConsumerInfo")
      .select("province")
      .where("reportArtifactId", "=", reportArtifactId)
      .executeTakeFirst();

    if (reportInfo?.province) {
      return reportInfo.province;
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

    if (latestReportInfo?.province) {
      return latestReportInfo.province;
    }
  }

  // Return null if province cannot be determined
  return null;
}
