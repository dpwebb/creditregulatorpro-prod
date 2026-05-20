import { db } from "./db";
import {
  getLatestIngestProcessingJobForArtifact,
  recordIngestProcessingJobEvent,
} from "./ingestProcessingQueueService";
import type { Json } from "./schema";

type CleanupRecorder = {
  failed: (error: unknown, step: string) => Promise<void>;
};

type CleanupOptions = {
  recordLifecycle?: boolean;
};

function sanitizeCleanupError(error: unknown): { code: string; reason: string } {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const sensitive = /%PDF|JVBERi0|data:application\/pdf;base64|raw report text|raw pdf text|full credit report|full report text|storageUrl|storage_url|bytesBase64|pdfBase64|postgres:\/\/|database_url|private key|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|bearer\s+[a-z0-9._-]+|session=|cookie=|\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b|\b\d{10,}\b/i.test(raw);
  return {
    code: "INGEST_CLEANUP_FAILED",
    reason: sensitive ? "Ingest cleanup step failed." : (raw.replace(/\s+/g, " ").trim() || "Ingest cleanup step failed.").slice(0, 180),
  };
}

async function createCleanupRecorder(
  artifactId: number,
  cleanupMode: "full_failed_ingest_cleanup" | "artifact_only_cleanup",
  tradelineIds: number[] = [],
  enabled = true,
): Promise<CleanupRecorder> {
  if (!enabled) return { failed: async () => undefined };
  try {
    const job = await getLatestIngestProcessingJobForArtifact(artifactId);
    if (!job) return { failed: async () => undefined };
    const baseDetails: Record<string, Json> = {
      artifactId,
      cleanupMode,
      tradelineCount: tradelineIds.length,
      destructiveCleanupPath: true,
      operatorDestructiveDeleteDefault: false,
      auditHistoryDeleted: false,
      rawReportBytesLogged: false,
      extractedReportTextLogged: false,
    };
    await recordIngestProcessingJobEvent({
      jobId: job.id,
      eventType: "cleanup_attempted",
      details: baseDetails,
    });
    return {
      failed: async (error: unknown, step: string) => {
        const sanitized = sanitizeCleanupError(error);
        await recordIngestProcessingJobEvent({
          jobId: job.id,
          eventType: "cleanup_failed",
          details: {
            ...baseDetails,
            cleanupStep: step,
            cleanupCompleted: false,
          },
          errorCode: sanitized.code,
          errorReason: sanitized.reason,
        });
      },
    };
  } catch (error) {
    console.error(`[IngestCleanup] Failed to record cleanup lifecycle for artifactId ${artifactId}:`, sanitizeCleanupError(error).reason);
    return { failed: async () => undefined };
  }
}

/**
 * Cleans up all related records in the correct foreign-key order when an ingestion fails.
 * Wraps operations in try/catch to ensure cleanup failures don't mask the original error.
 * 
 * @param artifactId The ID of the report artifact to delete
 * @param tradelineIds Optional array of tradeline IDs to delete and cascade from
 */
export async function cleanupFailedIngest(artifactId: number, tradelineIds?: number[], options: CleanupOptions = {}) {
  const createdTradelineIds = tradelineIds ?? [];
  const lifecycle = await createCleanupRecorder(
    artifactId,
    "full_failed_ingest_cleanup",
    createdTradelineIds,
    options.recordLifecycle !== false,
  );
  try {
    console.log(`[IngestCleanup] Starting cleanup for artifactId ${artifactId} with tradelineIds`, createdTradelineIds);

    if (createdTradelineIds.length > 0) {
      // 1. Delete packet-related child records
      const packets = await db
        .selectFrom("packet")
        .select("id")
        .where("tradelineId", "in", createdTradelineIds)
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
      await db.deleteFrom("packet").where("tradelineId", "in", createdTradelineIds).execute();
      await db.deleteFrom("obligationChallengeLog").where("tradelineId", "in", createdTradelineIds).execute();

      // 3. Delete obligation instance-related child records
      const obligationInstances = await db
        .selectFrom("obligationInstance")
        .select("id")
        .where("tradelineId", "in", createdTradelineIds)
        .execute();
        
      const oiIds = obligationInstances.map(oi => oi.id);

      if (oiIds.length > 0) {
        console.log(`[IngestCleanup] Deleting deadline events and success metrics for obligation instances`, oiIds);
        await db.deleteFrom("deadlineEvent").where("obligationInstanceId", "in", oiIds).execute();
        await db.deleteFrom("successMetric").where("obligationInstanceId", "in", oiIds).execute();
      }

      // 4. Delete obligation instances and other direct tradeline children
      console.log(`[IngestCleanup] Deleting direct tradeline child records`);
      await db.deleteFrom("obligationInstance").where("tradelineId", "in", createdTradelineIds).execute();
      await db.deleteFrom("creditorObligationTest").where("tradelineId", "in", createdTradelineIds).execute();
      await db.deleteFrom("metro2ValidationLog").where("tradelineId", "in", createdTradelineIds).execute();
      await db.deleteFrom("tradelineSnapshot").where("tradelineId", "in", createdTradelineIds).execute();
      await db.deleteFrom("tradelineArtifactPresence").where("tradelineId", "in", createdTradelineIds).execute();
      await db.deleteFrom("tradelinePaymentHistoryDetail").where("tradelineId", "in", createdTradelineIds).execute();
      await db.deleteFrom("tradelinePaymentHistory").where("tradelineId", "in", createdTradelineIds).execute();

      // 5. Delete the tradelines themselves
      console.log(`[IngestCleanup] Deleting tradelines`);
      await db.deleteFrom("tradeline").where("id", "in", createdTradelineIds).execute();
    }

    // 6. Delete the artifact and its direct sub-tables
    await cleanupArtifactOnly(artifactId, { recordLifecycle: false });
    
    console.log(`[IngestCleanup] Full cleanup completed successfully for artifactId ${artifactId}`);
  } catch (error) {
    await lifecycle.failed(error, "full_failed_ingest_cleanup");
    console.error(`[IngestCleanup] Failed to cleanup ingest for artifactId ${artifactId}:`, sanitizeCleanupError(error).reason);
  }
}

/**
 * Deletes the artifact record and its directly associated pass extraction and report data.
 * Used for Phase 1 failures where no tradelines were created yet.
 * 
 * @param artifactId The ID of the report artifact to delete
 */
export async function cleanupArtifactOnly(artifactId: number, options: CleanupOptions = {}) {
  const lifecycle = await createCleanupRecorder(
    artifactId,
    "artifact_only_cleanup",
    [],
    options.recordLifecycle !== false,
  );
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
    await lifecycle.failed(error, "artifact_only_cleanup");
    console.error(`[IngestCleanup] Failed to cleanup artifact ${artifactId}:`, sanitizeCleanupError(error).reason);
  }
}
