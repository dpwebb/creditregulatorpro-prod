import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { createSSEStream, createSSEResponse } from "../../helpers/sseStreamBuilder";
import { updateArtifactProcessingStatus } from "../../helpers/ingestProcessingStatus";
import {
  enqueueIngestProcessingJob,
  getLatestIngestProcessingJobByIdempotencyKey,
  type IngestProcessingJobRecord,
  type IngestProcessingJobStatus,
} from "../../helpers/ingestProcessingQueueService";
import { schema } from "./process_POST.schema";

const PROCESS_SOURCE = "authenticated_ingest_process";

type ProcessArtifact = {
  id: number;
  userId: number | null;
  organizationId: number | null;
  region: string | null;
  sha256: string | null;
  data: unknown;
  processingStatus: string | null;
};

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function buildProcessIdempotencyKey(artifactId: number, userId: number): string {
  return `ingest.process.${artifactId.toString(36)}.${userId.toString(36)}`;
}

function processingStatusForJob(status: IngestProcessingJobStatus): string {
  switch (status) {
    case "queued":
      return "queued";
    case "running":
      return "processing";
    case "succeeded":
      return "completed";
    case "failed":
      return "failed";
    case "dead_lettered":
    case "canceled":
      return "failed";
  }
}

function stageForJob(status: IngestProcessingJobStatus): string {
  switch (status) {
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "succeeded":
      return "completed";
    case "failed":
      return "retry_scheduled";
    case "dead_lettered":
      return "dead_lettered";
    case "canceled":
      return "canceled";
  }
}

function percentForJob(status: IngestProcessingJobStatus): number {
  switch (status) {
    case "queued":
      return 12;
    case "running":
      return 35;
    case "succeeded":
      return 100;
    case "failed":
      return 15;
    case "dead_lettered":
    case "canceled":
      return 100;
  }
}

function messageForJob(job: IngestProcessingJobRecord, duplicate: boolean): string {
  if (job.status === "queued") {
    return duplicate
      ? "Report processing is already queued."
      : "Report processing has been queued.";
  }
  if (job.status === "running") return "Report processing is running in the ingest worker.";
  if (job.status === "succeeded") return "Report processing is complete.";
  if (job.status === "failed") return "Report processing failed and is queued for retry.";
  if (job.status === "dead_lettered") return "Report processing needs operator review before it can continue.";
  return "Report processing was canceled.";
}

function queueOutput(job: IngestProcessingJobRecord, duplicate: boolean) {
  const processingStatus = processingStatusForJob(job.status);
  return {
    ok: job.status !== "dead_lettered" && job.status !== "canceled",
    queued: job.status !== "succeeded",
    artifactId: job.reportArtifactId,
    storageUrl: String(job.reportArtifactId),
    jobId: job.id,
    queueStatus: job.status,
    processingStatus,
    workerRequired: job.status !== "succeeded",
    duplicate,
    retryAt: job.status === "failed" ? job.runAfter : null,
    errorCode: job.lastErrorCode,
    errorReason: job.lastErrorReason,
    message: messageForJob(job, duplicate),
  };
}

export async function handle(request: Request) {
  let input;
  try {
    const json = JSON.parse(await request.text());
    input = schema.parse(json);
    } catch (error) {
    return handleEndpointError(error);
  }

  // Verify session/user BEFORE entering SSE stream to prevent hanging
  let artifact: ProcessArtifact;
  let job: IngestProcessingJobRecord;
  let duplicate = false;
  try {
    const sessionData = await getServerUserSession(request);
    const user = sessionData.user;
    
    // Validate that the artifact belongs to the user
    const artifactRow = await db
      .selectFrom("reportArtifact")
      .select(["id", "userId", "organizationId", "region", "sha256", "data", "processingStatus"])
      .where("id", "=", input.artifactId)
      .executeTakeFirst() as ProcessArtifact | undefined;
      
    if (!artifactRow) {
      return new Response(JSON.stringify({ error: "Artifact not found" }), { status: 404 });
    }
    
    if (artifactRow.userId !== user.id) {
      return new Response(JSON.stringify({ error: "Unauthorized access to artifact" }), { status: 403 });
    }
    artifact = artifactRow;

    // Look up userAccount for that user
    const userAccount = await db
      .selectFrom("userAccount")
      .selectAll()
      .where("userId", "=", user.id)
      .executeTakeFirst();
      
    if (!userAccount) {
      throw new Error("User account profile not found. Please complete profile setup.");
    }

    const artifactData = jsonRecord(artifact.data);
    const idempotencyKey = buildProcessIdempotencyKey(input.artifactId, user.id);
    const latestJob = await getLatestIngestProcessingJobByIdempotencyKey(idempotencyKey);

    if (
      latestJob &&
      (
        latestJob.status === "succeeded" ||
        latestJob.status === "dead_lettered" ||
        latestJob.status === "canceled"
      )
    ) {
      job = latestJob;
      duplicate = true;
    } else {
      const enqueueResult = await enqueueIngestProcessingJob({
        reportArtifactId: input.artifactId,
        userId: user.id,
        organizationId: artifact.organizationId,
        actorUserId: user.id,
        source: PROCESS_SOURCE,
        idempotencyKey,
        payload: {
          region: artifact.region ?? "CA",
          mimeType: typeof artifactData.mimeType === "string" ? artifactData.mimeType : "application/pdf",
          artifactSha256: artifact.sha256,
          metadata: {
            uploadChannel: "authenticated_ingest",
            processEndpointCutover: true,
          },
        },
      });
      job = enqueueResult.job;
      duplicate = enqueueResult.status === "duplicate";

      if (job.status === "queued") {
        await updateArtifactProcessingStatus(input.artifactId, "queued");
      }
    }
  } catch (error) {
    console.error("Session/Artifact validation error:", error);
    return handleEndpointError(error);
  }

  // Return SSE status stream for compatibility while expensive work is owned by the worker.
  const stream = createSSEStream(async (send) => {
    try {
      const output = queueOutput(job, duplicate);
      const stage = stageForJob(job.status);
      const percent = percentForJob(job.status);
      const message = messageForJob(job, duplicate);

      send({
        type: "progress",
        stage,
        percent,
        message,
      });
      send({
        type: "status",
        stage,
        percent,
        message,
        artifactId: job.reportArtifactId,
        jobId: job.id,
        queueStatus: job.status,
        processingStatus: output.processingStatus,
        workerRequired: output.workerRequired,
        duplicate,
        retryAt: output.retryAt,
        errorCode: output.errorCode,
        errorReason: output.errorReason,
      });

      if (job.status === "dead_lettered") {
        send({
          type: "error",
          error: output.errorReason || "Report processing needs operator review before retry.",
          code: output.errorCode || "INGEST_JOB_DEAD_LETTERED",
        });
        return;
      }

      if (job.status === "canceled") {
        send({
          type: "error",
          error: output.errorReason || "Report processing was canceled.",
          code: output.errorCode || "INGEST_JOB_CANCELED",
        });
        return;
      }

      send({ type: "complete", data: output });
    } catch (error) {
      console.error("Error in process stream:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      send({ type: "error", error: errorMessage, code: "PROCESSING_ERROR" });
    }
  });

  return createSSEResponse(stream);
}
