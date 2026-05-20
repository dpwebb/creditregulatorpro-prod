import { db } from "./db";
import {
  getLatestIngestProcessingJobForArtifact,
  recordIngestProcessingJobEvent,
} from "./ingestProcessingQueueService";
import type { Json } from "./schema";

type CleanupMode = "full_failed_ingest_cleanup" | "artifact_only_cleanup";
type CleanupDisposition = "non_destructive_remediation" | "destructive_delete";

type CleanupRecorder = {
  failed: (error: unknown, step: string) => Promise<void>;
  completed: (step: string) => Promise<void>;
};

type CleanupOptions = {
  recordLifecycle?: boolean;
  destructive?: boolean;
  confirmDestructive?: boolean;
  allowProductionDestructiveCleanup?: boolean;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  now?: () => Date;
};

const PRODUCTION_ENV_KEYS = ["NODE_ENV", "CRP_ENV", "FLOOT_ENV", "APP_ENV", "VERCEL_ENV", "DEPLOYMENT_ENV", "ENVIRONMENT"];
const PRODUCTION_SECRET_KEYS = ["FLOOT_DATABASE_URL", "DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL", "CRP_DATABASE_URL"];
const REMEDIATION_MARKER_VERSION = "failed-ingest-remediation-v1";

function sanitizeCleanupError(error: unknown): { code: string; reason: string } {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const sensitive = /%PDF|JVBERi0|data:application\/pdf;base64|raw report text|raw pdf text|full credit report|full report text|storageUrl|storage_url|bytesBase64|pdfBase64|postgres:\/\/|database_url|private key|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|bearer\s+[a-z0-9._-]+|session=|cookie=|\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b|\b\d{10,}\b/i.test(raw);
  return {
    code: "INGEST_CLEANUP_FAILED",
    reason: sensitive ? "Ingest cleanup step failed." : (raw.replace(/\s+/g, " ").trim() || "Ingest cleanup step failed.").slice(0, 180),
  };
}

function jsonRecord(value: unknown): Record<string, Json> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, Json>;
}

export function detectIngestCleanupProductionEnvironment(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): { productionLike: boolean; reason: string } {
  for (const key of PRODUCTION_ENV_KEYS) {
    const value = String(env[key] ?? "").trim().toLowerCase();
    if (value === "production" || value === "prod" || value.includes("production")) {
      return { productionLike: true, reason: `${key} indicates a production environment.` };
    }
  }
  for (const key of PRODUCTION_SECRET_KEYS) {
    const value = String(env[key] ?? "").trim().toLowerCase();
    if (!value) continue;
    if (value.includes("creditregulatorpro-prod") || value.includes("production") || value.includes("/prod") || value.includes("prod.")) {
      return { productionLike: true, reason: `${key} appears to reference a production database target.` };
    }
  }
  return { productionLike: false, reason: "" };
}

function assertDestructiveCleanupAllowed(options: CleanupOptions): void {
  if (options.destructive !== true) return;
  if (options.confirmDestructive !== true) {
    throw new Error("Destructive ingest cleanup requires explicit confirmDestructive=true.");
  }
  const productionEnvironment = detectIngestCleanupProductionEnvironment(options.env ?? process.env);
  if (productionEnvironment.productionLike && options.allowProductionDestructiveCleanup !== true) {
    throw new Error(`Refusing destructive ingest cleanup in a production-like environment: ${productionEnvironment.reason}`);
  }
}

async function createCleanupRecorder(
  artifactId: number,
  cleanupMode: CleanupMode,
  tradelineIds: number[] = [],
  disposition: CleanupDisposition,
  enabled = true,
  extraDetails: Record<string, Json> = {},
): Promise<CleanupRecorder> {
  if (!enabled) return { failed: async () => undefined, completed: async () => undefined };
  try {
    const job = await getLatestIngestProcessingJobForArtifact(artifactId);
    if (!job) return { failed: async () => undefined, completed: async () => undefined };
    const destructive = disposition === "destructive_delete";
    const baseDetails: Record<string, Json> = {
      artifactId,
      cleanupMode,
      cleanupDisposition: disposition,
      tradelineCount: tradelineIds.length,
      remediationRequired: !destructive,
      cleanupRequired: !destructive,
      preservedForOperatorReview: !destructive,
      destructiveCleanupPath: destructive,
      destructiveDeletionUsed: false,
      operatorDestructiveDeleteDefault: false,
      auditHistoryDeleted: false,
      rawReportBytesLogged: false,
      extractedReportTextLogged: false,
      ...extraDetails,
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
      completed: async (step: string) => {
        await recordIngestProcessingJobEvent({
          jobId: job.id,
          eventType: "operator_remediation_action",
          details: {
            ...baseDetails,
            cleanupStep: step,
            cleanupCompleted: true,
            destructiveDeletionUsed: destructive,
          },
        });
      },
    };
  } catch (error) {
    console.error(`[IngestCleanup] Failed to record cleanup lifecycle for artifactId ${artifactId}:`, sanitizeCleanupError(error).reason);
    return { failed: async () => undefined, completed: async () => undefined };
  }
}

async function markFailedIngestForRemediation(
  artifactId: number,
  cleanupMode: CleanupMode,
  tradelineIds: number[],
  options: CleanupOptions,
): Promise<void> {
  const now = options.now?.() ?? new Date();
  const markedAt = now.toISOString();
  const artifact = await db
    .selectFrom("reportArtifact")
    .select(["data"])
    .where("id", "=", artifactId)
    .executeTakeFirst();

  const artifactFound = Boolean(artifact);
  const lifecycle = await createCleanupRecorder(
    artifactId,
    cleanupMode,
    tradelineIds,
    "non_destructive_remediation",
    options.recordLifecycle !== false,
    {
      artifactFound,
      remediationMarkerVersion: REMEDIATION_MARKER_VERSION,
    },
  );

  if (!artifact) {
    await lifecycle.failed(new Error("Report artifact was not found for failed-ingest remediation marking."), "mark_remediation_required");
    return;
  }

  try {
    const currentData = jsonRecord(artifact.data);
    const previousMarker = jsonRecord(currentData.failedIngestCleanup);
    const marker: Record<string, Json> = {
      markerVersion: REMEDIATION_MARKER_VERSION,
      state: "remediation_required",
      remediationRequired: true,
      cleanupRequired: true,
      cleanupMode,
      artifactId,
      tradelineCount: tradelineIds.length,
      destructiveCleanupDefault: false,
      destructiveDeletionUsed: false,
      preservedForOperatorReview: true,
      operatorReviewRequired: true,
      firstMarkedAt: typeof previousMarker.firstMarkedAt === "string" ? previousMarker.firstMarkedAt : markedAt,
      lastMarkedAt: markedAt,
      rawReportBytesLogged: false,
      extractedReportTextLogged: false,
    };

    await db
      .updateTable("reportArtifact")
      .set({
        processingStatus: "failed",
        data: JSON.parse(JSON.stringify({
          ...currentData,
          extractionStatus: currentData.extractionStatus ?? "failed",
          failedIngestCleanup: marker,
        })) as Json,
      })
      .where("id", "=", artifactId)
      .execute();
  } catch (error) {
    await lifecycle.failed(error, "mark_remediation_required");
    console.error(`[IngestCleanup] Failed to mark failed ingest remediation for artifactId ${artifactId}:`, sanitizeCleanupError(error).reason);
    return;
  }

  console.log(`[IngestCleanup] Marked artifactId ${artifactId} failed and remediation-required; records preserved for operator review.`);
}

/**
 * Default failed-ingest handling is non-destructive. It marks the artifact failed
 * and remediation-required so operators can review the preserved artifact and
 * any created tradelines. Destructive deletion is retained only for explicit,
 * confirmed non-production/test paths.
 *
 * @param artifactId The ID of the report artifact to preserve for review
 * @param tradelineIds Optional array of created tradeline IDs to preserve
 */
export async function cleanupFailedIngest(artifactId: number, tradelineIds?: number[], options: CleanupOptions = {}) {
  const createdTradelineIds = tradelineIds ?? [];
  if (options.destructive === true) {
    await destructiveCleanupFailedIngest(artifactId, createdTradelineIds, options);
    return;
  }
  await markFailedIngestForRemediation(artifactId, "full_failed_ingest_cleanup", createdTradelineIds, options);
}

async function destructiveCleanupFailedIngest(artifactId: number, createdTradelineIds: number[], options: CleanupOptions): Promise<void> {
  assertDestructiveCleanupAllowed(options);
  const lifecycle = await createCleanupRecorder(
    artifactId,
    "full_failed_ingest_cleanup",
    createdTradelineIds,
    "destructive_delete",
    options.recordLifecycle !== false,
  );
  try {
    console.log(`[IngestCleanup] Starting explicit destructive cleanup for artifactId ${artifactId} with tradelineIds`, createdTradelineIds);

    if (createdTradelineIds.length > 0) {
      const packets = await db
        .selectFrom("packet")
        .select("id")
        .where("tradelineId", "in", createdTradelineIds)
        .execute();

      const packetIds = packets.map((p) => p.id);

      if (packetIds.length > 0) {
        await db.deleteFrom("evidenceEvent").where("packetId", "in", packetIds).execute();
        await db.deleteFrom("packetImpactAssessment").where("packetId", "in", packetIds).execute();
        await db.deleteFrom("packetComplianceAudit").where("packetId", "in", packetIds).execute();
      }

      await db.deleteFrom("packet").where("tradelineId", "in", createdTradelineIds).execute();
      await db.deleteFrom("obligationChallengeLog").where("tradelineId", "in", createdTradelineIds).execute();

      const obligationInstances = await db
        .selectFrom("obligationInstance")
        .select("id")
        .where("tradelineId", "in", createdTradelineIds)
        .execute();

      const oiIds = obligationInstances.map((oi) => oi.id);

      if (oiIds.length > 0) {
        await db.deleteFrom("deadlineEvent").where("obligationInstanceId", "in", oiIds).execute();
        await db.deleteFrom("successMetric").where("obligationInstanceId", "in", oiIds).execute();
      }

      await db.deleteFrom("obligationInstance").where("tradelineId", "in", createdTradelineIds).execute();
      await db.deleteFrom("creditorObligationTest").where("tradelineId", "in", createdTradelineIds).execute();
      await db.deleteFrom("metro2ValidationLog").where("tradelineId", "in", createdTradelineIds).execute();
      await db.deleteFrom("tradelineSnapshot").where("tradelineId", "in", createdTradelineIds).execute();
      await db.deleteFrom("tradelineArtifactPresence").where("tradelineId", "in", createdTradelineIds).execute();
      await db.deleteFrom("tradelinePaymentHistoryDetail").where("tradelineId", "in", createdTradelineIds).execute();
      await db.deleteFrom("tradelinePaymentHistory").where("tradelineId", "in", createdTradelineIds).execute();
      await db.deleteFrom("tradeline").where("id", "in", createdTradelineIds).execute();
    }

    await destructiveCleanupArtifactOnly(artifactId, {
      ...options,
      recordLifecycle: false,
    });
    await lifecycle.completed("full_failed_ingest_cleanup");
    console.log(`[IngestCleanup] Explicit destructive cleanup completed successfully for artifactId ${artifactId}`);
  } catch (error) {
    await lifecycle.failed(error, "full_failed_ingest_cleanup");
    console.error(`[IngestCleanup] Failed explicit destructive cleanup for artifactId ${artifactId}:`, sanitizeCleanupError(error).reason);
  }
}

/**
 * Default artifact-only failed-ingest handling is non-destructive. It marks the
 * artifact failed and remediation-required; the report artifact and related
 * extraction rows are preserved for operator review.
 *
 * @param artifactId The ID of the report artifact to preserve for review
 */
export async function cleanupArtifactOnly(artifactId: number, options: CleanupOptions = {}) {
  if (options.destructive === true) {
    await destructiveCleanupArtifactOnly(artifactId, options);
    return;
  }
  await markFailedIngestForRemediation(artifactId, "artifact_only_cleanup", [], options);
}

async function destructiveCleanupArtifactOnly(artifactId: number, options: CleanupOptions): Promise<void> {
  assertDestructiveCleanupAllowed(options);
  const lifecycle = await createCleanupRecorder(
    artifactId,
    "artifact_only_cleanup",
    [],
    "destructive_delete",
    options.recordLifecycle !== false,
  );
  try {
    console.log(`[IngestCleanup] Starting explicit destructive artifact cleanup for artifactId ${artifactId}`);

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

    await lifecycle.completed("artifact_only_cleanup");
    console.log(`[IngestCleanup] Explicit destructive artifact cleanup completed for artifactId ${artifactId}`);
  } catch (error) {
    await lifecycle.failed(error, "artifact_only_cleanup");
    console.error(`[IngestCleanup] Failed explicit destructive artifact cleanup for artifactId ${artifactId}:`, sanitizeCleanupError(error).reason);
  }
}
