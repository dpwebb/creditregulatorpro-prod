import { db } from "./db";
import { UploadReportInput } from "./schemas";
import { Json } from "./schema";
import { SSEEvent } from "./sseStreamBuilder";
import { checkRateLimit, RateLimitConfig } from "./rateLimiter";
import { ResolvedUserSession } from "./ingestSessionResolver";
import { createReportArtifact } from "./ingestArtifactCreator";
import { z } from "zod";
import { updateArtifactProcessingStatus } from "./ingestProcessingStatus";
import { cleanupFailedIngest } from "./ingestCleanup";
import { executeIngestPipeline, IngestPipelineError } from "./ingestCorePipeline";
import {
  assertTextBasedCreditReportPdf,
  isScannedPdfUnsupportedError,
} from "./creditReportPdfEligibility";
import { logRejectedScannedPdfUpload } from "./creditReportUploadRejectionAudit";

type IngestInput = z.infer<typeof UploadReportInput>;

/**
 * Phase 1: Submit Extraction Request.
 * Stores the uploaded PDF and queues canonical parser-first extraction for Phase 2.
 */
export async function handleIngestSubmit(
  resolvedSession: ResolvedUserSession,
  input: IngestInput,
  request?: Request
): Promise<{
  success: boolean;
  error?: string;
  code?: string;
  artifactId?: number;
  extractionStatus?: "extracted" | "failed";
}> {
  const { user } = resolvedSession;

  const rateLimitResult = await checkRateLimit(
    user.id.toString(),
    "UPLOAD",
    RateLimitConfig.UPLOAD.maxAttempts,
    RateLimitConfig.UPLOAD.windowMinutes
  );

  if (!rateLimitResult.allowed) {
    const remainingMinutes = Math.ceil(
      (rateLimitResult.resetAt.getTime() - Date.now()) / (60 * 1000)
    );
    return {
      success: false,
      error: `Too many upload attempts. Please try again in ${remainingMinutes} minutes.`,
      code: "RATE_LIMITED",
    };
  }

  const isPdfUpload = input.mimeType === "application/pdf" || input.fileName.toLowerCase().endsWith(".pdf");
  if (!isPdfUpload) {
    return {
      success: false,
      error: "Unsupported file type. Please upload a PDF.",
      code: "UNSUPPORTED_MIME_TYPE",
    };
  }

  try {
    await assertTextBasedCreditReportPdf({
      bytesBase64: input.bytesBase64,
      mimeType: "application/pdf",
    });
  } catch (error) {
    if (isScannedPdfUnsupportedError(error)) {
      await logRejectedScannedPdfUpload({
        route: "authenticated_ingest",
        userId: user.id,
        bytesBase64: input.bytesBase64,
        mimeType: "application/pdf",
        quality: error.quality,
        request,
      });

      return {
        success: false,
        error: error.message,
        code: error.code,
      };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unable to validate PDF text.",
      code: "PDF_TEXT_VALIDATION_FAILED",
    };
  }

  const artifactResult = await createReportArtifact({
    userId: user.id,
    organizationId: user.organizationId || null,
    bytesBase64: input.bytesBase64,
    fileName: input.fileName,
    mimeType: input.mimeType,
    region: input.region,
  });

  const artifactId = artifactResult.artifactId;
  const currentArtifactData = (await db
    .selectFrom("reportArtifact")
    .select("data")
    .where("id", "=", artifactId)
    .executeTakeFirst())?.data as Record<string, unknown> ?? {};

  await db
    .updateTable("reportArtifact")
    .set({
      data: JSON.parse(JSON.stringify({
        ...currentArtifactData,
        extractionStatus: "ready",
        extractionSource: "pending",
        extractionProvenance: {
          strategy: "deterministic_pdf_text_state_machine",
          source: "pending",
          normalizedByAi: false,
          sourceEvidence: "pdf_bytes",
          artifactSha256: artifactResult.sha256,
        },
      })) as Json,
    })
    .where("id", "=", artifactId)
    .execute();

  return {
    success: true,
    artifactId,
    extractionStatus: "extracted",
  };
}

/**
 * Phase 2: Process Extraction Request.
 * Runs canonical extraction from the stored PDF and continues ingestion.
 */
export async function handleIngestProcess(
  resolvedSession: ResolvedUserSession,
  artifactId: number,
  send: (event: SSEEvent) => void
): Promise<void> {
  send({ type: "progress", stage: "initializing", percent: 0 });
  await Promise.resolve();

  const { user, userAccount } = resolvedSession;

  const artifact = await db
    .selectFrom("reportArtifact")
    .select(["data", "region", "storageUrl"])
    .where("id", "=", artifactId)
    .executeTakeFirst();

  if (!artifact) {
    send({ type: "error", error: "Artifact not found", code: "NOT_FOUND" });
    return;
  }

  await updateArtifactProcessingStatus(artifactId, "processing");

  const artifactData = (artifact.data ?? {}) as Record<string, unknown>;
  const region = artifact.region as string;
  const fileName = (artifactData.fileName as string | undefined) || "credit-report.pdf";
  const mimeType = (artifactData.mimeType as string | undefined) || "application/pdf";
  const extractionStatus = artifactData.extractionStatus as string | undefined;

  if (extractionStatus === "failed") {
    await cleanupFailedIngest(artifactId, []);
    send({ type: "error", error: "Extraction failed previously.", code: "EXTRACTION_FAILED" });
    return;
  }

  if (!artifact.storageUrl) {
    await cleanupFailedIngest(artifactId, []);
    send({ type: "error", error: "No report PDF data found.", code: "EXTRACTION_FAILED" });
    return;
  }

  const context = {
    tradelineIds: [] as number[],
    createdTradelineIds: [] as number[],
    updatedTradelineIds: [] as number[],
  };

  try {
    await executeIngestPipeline({
      user,
      userAccount,
      artifactId,
      region,
      fileName,
      bytesBase64: artifact.storageUrl,
      mimeType,
      send,
      context,
    });
  } catch (error: unknown) {
    console.error(`[Ingest] Uncaught exception during pipeline for artifact ${artifactId}:`, error);

    await updateArtifactProcessingStatus(artifactId, "failed");

    try {
      await db
        .deleteFrom("evidenceEvent")
        .where("description", "like", `%artifact ${artifactId}%`)
        .execute();
    } catch (cleanupErr) {
      console.error(`[Ingest] Failed to cleanup evidence events for artifact ${artifactId}:`, cleanupErr);
    }

    await cleanupFailedIngest(artifactId, context.createdTradelineIds);

    send({
      type: "error",
      error: error instanceof Error ? error.message : "An unexpected error occurred during report processing.",
      code: error instanceof IngestPipelineError ? error.code : "PROCESSING_FAILED",
    });
    return;
  }
}

/**
 * Backward compatibility wrapper.
 */
export async function handleIngestReport(
  resolvedSession: ResolvedUserSession,
  input: IngestInput,
  send: (event: SSEEvent) => void,
  request?: Request
) {
  const submitResult = await handleIngestSubmit(resolvedSession, input, request);

  if (!submitResult.success) {
    send({ type: "error", error: submitResult.error || "Unknown error", code: submitResult.code });
    return;
  }

  if (submitResult.extractionStatus === "failed") {
    send({ type: "error", error: "Extraction failed during submission.", code: "EXTRACTION_FAILED" });
    return;
  }

  await handleIngestProcess(resolvedSession, submitResult.artifactId!, send);
}
