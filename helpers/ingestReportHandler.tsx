import { db } from "./db";
import { UploadReportInput } from "./schemas";
import { Json } from "./schema";
import { SSEEvent } from "./sseStreamBuilder";
import { checkRateLimit, RateLimitConfig } from "./rateLimiter";
import { ResolvedUserSession } from "./ingestSessionResolver";
import { createReportArtifact } from "./ingestArtifactCreator";
import { z } from "zod";
import { updateArtifactProcessingStatus } from "./ingestProcessingStatus";
import { extractHtmlWithFallbackChain } from "./fallbackPdfExtractor";
import { cleanupFailedIngest, cleanupArtifactOnly } from "./ingestCleanup";
import { executeIngestPipeline, IngestPipelineError } from "./ingestCorePipeline";

type IngestInput = z.infer<typeof UploadReportInput>;

/**
 * Phase 1: Submit Extraction Request
 * Handles rate limiting, artifact creation, and initial DocStrange submission.
 */
export async function handleIngestSubmit(
  resolvedSession: ResolvedUserSession,
  input: IngestInput
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
      code: "RATE_LIMITED"
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

  if (input.mimeType === "application/pdf") {
    console.log("[Ingest] Attempting AI extraction...");
    const fallbackResult = await extractHtmlWithFallbackChain(input.bytesBase64);

    if (fallbackResult) {
      console.log(`[Ingest] ✓ Extraction succeeded via ${fallbackResult.source}`);
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
            docstrangeRawHtml: fallbackResult.html,
            extractionStatus: "extracted",
            extractionSource: fallbackResult.source,
          })) as Json
        })
        .where("id", "=", artifactId)
        .execute();

      return {
        success: true,
        artifactId,
        extractionStatus: "extracted",
      };
    }

    console.log("[Ingest] ✗ All extractors failed — cleaning up artifact");
    // Delete the artifact entirely since extraction failed; no point keeping a broken record
    await cleanupArtifactOnly(artifactId);

    return {
      success: false,
      error: `Document processing failed. Please try again or contact support.`,
      code: "EXTRACTION_FAILED",
    };
  } else {
    return {
      success: false,
      error: "Unsupported file type. Please upload a PDF.",
      code: "UNSUPPORTED_MIME_TYPE"
    };
  }
}

/**
 * Phase 2: Process Extraction Request
 * Handles polling (if async) and runs the rest of the ingestion pipeline.
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
    .select(["data", "region"])
    .where("id", "=", artifactId)
    .executeTakeFirst();

  if (!artifact) {
    send({ type: "error", error: "Artifact not found", code: "NOT_FOUND" });
    return;
  }

  // Mark artifact as actively processing
  await updateArtifactProcessingStatus(artifactId, "processing");

  const artifactData = (artifact.data ?? {}) as Record<string, unknown>;
  const region = artifact.region as string;
  const fileName = artifactData.fileName as string;
  const rawHtml = artifactData.docstrangeRawHtml as string | undefined;
  const extractionStatus = artifactData.extractionStatus as string | undefined;

  if (extractionStatus === "failed") {
    await cleanupFailedIngest(artifactId, []);
    send({ type: "error", error: "Extraction failed previously.", code: "EXTRACTION_FAILED" });
    return;
  }

  if (!rawHtml) {
    await cleanupFailedIngest(artifactId, []);
    send({ type: "error", error: "No extraction data found.", code: "EXTRACTION_FAILED" });
    return;
  }

  const context = { tradelineIds: [] as number[] };

  try {
    await executeIngestPipeline({
      user,
      userAccount,
      artifactId,
      region,
      fileName,
      rawHtml,
      send,
      context
    });
  } catch (error: unknown) {
    console.error(`[Ingest] Uncaught exception during pipeline for artifact ${artifactId}:`, error);
    
    // Mark the artifact processing status as "failed" before cleanup deletes it
    await updateArtifactProcessingStatus(artifactId, "failed");

    // Cleanup evidence events created by the missing tradeline check
    try {
      await db
        .deleteFrom("evidenceEvent")
        .where("description", "like", `%artifact ${artifactId}%`)
        .execute();
    } catch (cleanupErr) {
      console.error(`[Ingest] Failed to cleanup evidence events for artifact ${artifactId}:`, cleanupErr);
    }

    // Call cleanupFailedIngest to cascade-delete all orphaned data
    await cleanupFailedIngest(artifactId, context.tradelineIds);
    
    send({
      type: "error",
      error: error instanceof Error ? error.message : "An unexpected error occurred during report processing.",
      code: error instanceof IngestPipelineError ? error.code : "PROCESSING_FAILED"
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
  send: (event: SSEEvent) => void
) {
  const submitResult = await handleIngestSubmit(resolvedSession, input);
  
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