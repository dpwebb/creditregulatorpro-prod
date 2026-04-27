import { db } from "./db";

/**
 * Cleans up all related records in the correct foreign-key order when an ingestion fails.
 * Wraps operations in try/catch to ensure cleanup failures don't mask the original error.
 * 
 * @param artifactId The ID of the report artifact to delete
 * @param tradelineIds Optional array of tradeline IDs to delete and cascade from
 */
export async function cleanupFailedIngest(artifactId: number, tradelineIds?: number[]) {
  try {
    console.log(`[IngestCleanup] Starting cleanup for artifactId ${artifactId} with tradelineIds`, tradelineIds);

    if (tradelineIds && tradelineIds.length > 0) {
      // 1. Delete packet-related child records
      const packets = await db
        .selectFrom("packet")
        .select("id")
        .where("tradelineId", "in", tradelineIds)
        .execute();
        
      const packetIds = packets.map(p => p.id);

      if (packetIds.length > 0) {
        console.log(`[IngestCleanup] Deleting evidence events, packet impact assessments, and compliance audits for packets`, packetIds);
        await db.deleteFrom("evidenceEvent").where("packetId", "in", packetIds).execute();
        await db.deleteFrom("packetImpactAssessment").where("packetId", "in", packetIds).execute();
        await db.deleteFrom("packetComplianceAudit").where("packetId", "in", packetIds).execute();
      }

      // 2. Delete packets and challenge logs by tradeline
      console.log(`[IngestCleanup] Deleting packets and obligation challenge logs for tradelines`);
      await db.deleteFrom("packet").where("tradelineId", "in", tradelineIds).execute();
      await db.deleteFrom("obligationChallengeLog").where("tradelineId", "in", tradelineIds).execute();

      // 3. Delete obligation instance-related child records
      const obligationInstances = await db
        .selectFrom("obligationInstance")
        .select("id")
        .where("tradelineId", "in", tradelineIds)
        .execute();
        
      const oiIds = obligationInstances.map(oi => oi.id);

      if (oiIds.length > 0) {
        console.log(`[IngestCleanup] Deleting deadline events and success metrics for obligation instances`, oiIds);
        await db.deleteFrom("deadlineEvent").where("obligationInstanceId", "in", oiIds).execute();
        await db.deleteFrom("successMetric").where("obligationInstanceId", "in", oiIds).execute();
      }

      // 4. Delete obligation instances and other direct tradeline children
      console.log(`[IngestCleanup] Deleting direct tradeline child records`);
      await db.deleteFrom("obligationInstance").where("tradelineId", "in", tradelineIds).execute();
      await db.deleteFrom("creditorObligationTest").where("tradelineId", "in", tradelineIds).execute();
      await db.deleteFrom("metro2ValidationLog").where("tradelineId", "in", tradelineIds).execute();
      await db.deleteFrom("tradelineSnapshot").where("tradelineId", "in", tradelineIds).execute();
      await db.deleteFrom("tradelineArtifactPresence").where("tradelineId", "in", tradelineIds).execute();
      await db.deleteFrom("tradelinePaymentHistoryDetail").where("tradelineId", "in", tradelineIds).execute();
      await db.deleteFrom("tradelinePaymentHistory").where("tradelineId", "in", tradelineIds).execute();

      // 5. Delete the tradelines themselves
      console.log(`[IngestCleanup] Deleting tradelines`);
      await db.deleteFrom("tradeline").where("id", "in", tradelineIds).execute();
    }

    // 6. Delete the artifact and its direct sub-tables
    await cleanupArtifactOnly(artifactId);
    
    console.log(`[IngestCleanup] Full cleanup completed successfully for artifactId ${artifactId}`);
  } catch (error) {
    console.error(`[IngestCleanup] Failed to cleanup ingest for artifactId ${artifactId}:`, error);
  }
}

/**
 * Deletes the artifact record and its directly associated pass extraction and report data.
 * Used for Phase 1 failures where no tradelines were created yet.
 * 
 * @param artifactId The ID of the report artifact to delete
 */
export async function cleanupArtifactOnly(artifactId: number) {
  try {
    console.log(`[IngestCleanup] Deleting artifact and associated pass data for artifactId ${artifactId}`);
    
    await db.deleteFrom("passExtraction").where("reportArtifactId", "=", artifactId).execute();
    await db.deleteFrom("reportConsumerInfo").where("reportArtifactId", "=", artifactId).execute();
    await db.deleteFrom("reportCreditScore").where("reportArtifactId", "=", artifactId).execute();
    await db.deleteFrom("reportInquiry").where("reportArtifactId", "=", artifactId).execute();
    await db.deleteFrom("reportPublicRecord").where("reportArtifactId", "=", artifactId).execute();
    await db.deleteFrom("reportConsumerStatement").where("reportArtifactId", "=", artifactId).execute();
    await db.deleteFrom("reportEmploymentInfo").where("reportArtifactId", "=", artifactId).execute();
    await db.deleteFrom("tradelineArtifactPresence").where("reportArtifactId", "=", artifactId).execute();
    await db.deleteFrom("tradelinePaymentHistoryDetail").where("reportArtifactId", "=", artifactId).execute();
    await db.deleteFrom("tradelinePaymentHistory").where("reportArtifactId", "=", artifactId).execute();
    await db.deleteFrom("passAEditLog").where("reportArtifactId", "=", artifactId).execute();

    await db.deleteFrom("reportArtifact").where("id", "=", artifactId).execute();
    
    console.log(`[IngestCleanup] Successfully cleaned up artifactId ${artifactId}`);
  } catch (error) {
    console.error(`[IngestCleanup] Failed to cleanup artifact ${artifactId}:`, error);
  }
}
