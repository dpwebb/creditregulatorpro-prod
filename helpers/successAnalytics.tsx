import { db } from "./db";
import { sql } from "kysely";

// Define what constitutes a "successful" outcome for analytics purposes
const SUCCESS_OUTCOMES = ["DELETED", "CORRECTED", "REMOVED", "UPDATED", "SILENT_CORRECTION", "SILENT_DELETION"];

/**
 * Records a success metric for a completed obligation challenge.
 * Automatically fetches related entity IDs to populate the metric record.
 */
export const recordSuccess = async (
  obligationInstanceId: number,
  outcome: string,
  responseTimeDays: number | null
) => {
  // 1. Fetch details needed for the metric
  const obligation = await db
    .selectFrom("obligationInstance")
    .innerJoin("tradeline", "obligationInstance.tradelineId", "tradeline.id")
    .select([
      "obligationInstance.id",
      "obligationInstance.disputeVector",
      "obligationInstance.userId",
      "tradeline.bureauId",
      "tradeline.creditorId",
      "tradeline.id as tradelineId",
    ])
    .where("obligationInstance.id", "=", obligationInstanceId)
    .executeTakeFirst();

  if (!obligation) {
    throw new Error(`Obligation instance ${obligationInstanceId} not found`);
  }

  // 2. Insert success metric
  await db
    .insertInto("successMetric")
    .values({
      obligationInstanceId,
      outcome,
      responseTimeDays,
      disputeVector: obligation.disputeVector,
      bureauId: obligation.bureauId,
      creditorId: obligation.creditorId,
      region: "CA",
      recordedAt: new Date(),
      // violationCategory is optional, can be inferred or passed if available. 
      // For now we leave it null or it could be passed as an arg if needed.
    })
    .execute();

  // 3. Update the obligation instance itself
  await db
    .updateTable("obligationInstance")
    .set({
      successOutcome: outcome,
      responseStatus: "COMPLETED",
    })
    .where("id", "=", obligationInstanceId)
    .execute();

  return { success: true };
};

/**
 * Calculates success rates grouped by dispute vector.
 */
export const getSuccessRateByVector = async (userId: number) => {
  const metrics = await db
    .selectFrom("successMetric")
    .innerJoin("obligationInstance", "successMetric.obligationInstanceId", "obligationInstance.id")
    .where("obligationInstance.userId", "=", userId)
    .where("successMetric.region", "=", "CA")
    .select([
      "successMetric.disputeVector",
      sql<number>`count(*)`.as("totalChallenges"),
      sql<number>`sum(case when outcome in (${sql.join(SUCCESS_OUTCOMES)}) then 1 else 0 end)`.as("successCount"),
      sql<number>`avg(response_time_days)`.as("avgResponseDays"),
    ])
    .groupBy("successMetric.disputeVector")
    .execute();

  return metrics.map((m) => ({
    vector: m.disputeVector || "Unknown",
    totalChallenges: Number(m.totalChallenges),
    successCount: Number(m.successCount),
    successRate: Number(m.totalChallenges) > 0 ? Number(m.successCount) / Number(m.totalChallenges) : 0,
    avgResponseDays: Number(m.avgResponseDays) || 0,
  }));
};

/**
 * Calculates success rates grouped by creditor.
 */
export const getSuccessRateByCreditor = async (userId: number) => {
  const metrics = await db
    .selectFrom("successMetric")
    .innerJoin("obligationInstance", "successMetric.obligationInstanceId", "obligationInstance.id")
    .leftJoin("creditor", "successMetric.creditorId", "creditor.id")
    .where("obligationInstance.userId", "=", userId)
    .where("successMetric.region", "=", "CA")
    .select([
      "successMetric.creditorId",
      "creditor.name as creditorName",
      sql<number>`count(*)`.as("totalChallenges"),
      sql<number>`sum(case when outcome in (${sql.join(SUCCESS_OUTCOMES)}) then 1 else 0 end)`.as("successCount"),
    ])
    .groupBy(["successMetric.creditorId", "creditor.name"])
    .execute();

  return metrics.map((m) => ({
    creditorId: m.creditorId,
    creditorName: m.creditorName || "Unknown Creditor",
    totalChallenges: Number(m.totalChallenges),
    successCount: Number(m.successCount),
    successRate: Number(m.totalChallenges) > 0 ? Number(m.successCount) / Number(m.totalChallenges) : 0,
  }));
};

/**
 * Calculates success rates grouped by bureau.
 */
export const getSuccessRateByBureau = async (userId: number) => {
  const metrics = await db
    .selectFrom("successMetric")
    .innerJoin("obligationInstance", "successMetric.obligationInstanceId", "obligationInstance.id")
    .leftJoin("bureau", "successMetric.bureauId", "bureau.id")
    .where("obligationInstance.userId", "=", userId)
    .where("successMetric.region", "=", "CA")
    .select([
      "successMetric.bureauId",
      "bureau.name as bureauName",
      sql<number>`count(*)`.as("totalChallenges"),
      sql<number>`sum(case when outcome in (${sql.join(SUCCESS_OUTCOMES)}) then 1 else 0 end)`.as("successCount"),
    ])
    .groupBy(["successMetric.bureauId", "bureau.name"])
    .execute();

  return metrics.map((m) => ({
    bureauId: m.bureauId,
    bureauName: m.bureauName || "Unknown Bureau",
    totalChallenges: Number(m.totalChallenges),
    successCount: Number(m.successCount),
    successRate: Number(m.totalChallenges) > 0 ? Number(m.successCount) / Number(m.totalChallenges) : 0,
  }));
};

/**
 * Calculates success rates grouped by violation category.
 */
export const getSuccessRateByViolationCategory = async (userId: number) => {
  const metrics = await db
    .selectFrom("successMetric")
    .innerJoin("obligationInstance", "successMetric.obligationInstanceId", "obligationInstance.id")
    .where("obligationInstance.userId", "=", userId)
    .where("successMetric.region", "=", "CA")
    .select([
      "successMetric.violationCategory",
      sql<number>`count(*)`.as("totalChallenges"),
      sql<number>`sum(case when outcome in (${sql.join(SUCCESS_OUTCOMES)}) then 1 else 0 end)`.as("successCount"),
    ])
    .groupBy("successMetric.violationCategory")
    .execute();

  return metrics.map((m) => ({
    violationCategory: m.violationCategory || "Uncategorized",
    totalChallenges: Number(m.totalChallenges),
    successCount: Number(m.successCount),
    successRate: Number(m.totalChallenges) > 0 ? Number(m.successCount) / Number(m.totalChallenges) : 0,
  }));
};

/**
 * Gets overall dashboard metrics for the user.
 */
export const getOverallSuccessMetrics = async (userId: number) => {
  const result = await db
    .selectFrom("successMetric")
    .innerJoin("obligationInstance", "successMetric.obligationInstanceId", "obligationInstance.id")
    .where("obligationInstance.userId", "=", userId)
    .where("successMetric.region", "=", "CA")
    .select([
      sql<number>`count(*)`.as("totalChallenges"),
      sql<number>`sum(case when outcome in (${sql.join(SUCCESS_OUTCOMES)}) then 1 else 0 end)`.as("successCount"),
      sql<number>`avg(response_time_days)`.as("avgResponseDays"),
      sql<number>`sum(case when escalation_count > 0 then 1 else 0 end)`.as("escalatedCount"), // Assuming escalation_count exists or we infer it
    ])
    .executeTakeFirst();

  const total = Number(result?.totalChallenges || 0);
  const success = Number(result?.successCount || 0);
  
  // For exhaustion rate, we need to query tradelines that are marked as exhausted
  const exhaustionResult = await db
    .selectFrom("packet")
    .where("userId", "=", userId)
    .where("terminalLabel", "=", "PHASE 4: PROCEDURAL EXHAUSTION — PENDING")
    .select(sql<number>`count(distinct tradeline_id)`.as("exhaustedCount"))
    .executeTakeFirst();
    
  const exhaustedCount = Number(exhaustionResult?.exhaustedCount || 0);
  // Total tradelines for denominator
  const tradelineResult = await db
    .selectFrom("tradeline")
    .where("userId", "=", userId)
    .select(sql<number>`count(*)`.as("totalTradelines"))
    .executeTakeFirst();
  const totalTradelines = Number(tradelineResult?.totalTradelines || 0);

  return {
    totalChallenges: total,
    successRate: total > 0 ? success / total : 0,
    avgResponseDays: Number(result?.avgResponseDays || 0),
    escalationRate: 0, // Placeholder as we don't have direct escalation count in successMetric yet
    exhaustionRate: totalTradelines > 0 ? exhaustedCount / totalTradelines : 0,
  };
};