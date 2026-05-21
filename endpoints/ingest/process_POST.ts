import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { createSSEStream, createSSEResponse, type SSEEvent } from "../../helpers/sseStreamBuilder";
import { updateArtifactProcessingStatus } from "../../helpers/ingestProcessingStatus";
import { shouldAllowRequestBoundIngestProcessing } from "../../helpers/ingestProcessingExecutionBoundary";
import {
  claimIngestProcessingJobById,
  enqueueIngestProcessingJob,
  getIngestProcessingWorkerLivenessReadOnly,
  getLatestIngestProcessingJobByIdempotencyKey,
  markIngestProcessingJobFailed,
  markIngestProcessingJobSucceeded,
  type IngestProcessingJobRecord,
  type IngestProcessingJobStatus,
} from "../../helpers/ingestProcessingQueueService";
import { buildIngestUploadStatusView } from "../../helpers/ingestUploadStatusPresenter";
import { handleIngestProcess } from "../../helpers/ingestReportHandler";
import type { ResolvedUserSession } from "../../helpers/ingestSessionResolver";
import { schema } from "./process_POST.schema";

const PROCESS_SOURCE = "authenticated_ingest_process";
const REQUEST_BOUND_WORKER_ID = "ingest-process-request-bound";
const REQUEST_BOUND_LEASE_SECONDS = 300;

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

async function queueOutput(job: IngestProcessingJobRecord, duplicate: boolean) {
  const workerLiveness = await getIngestProcessingWorkerLivenessReadOnly({ source: PROCESS_SOURCE }).catch(() => null);
  const statusView = buildIngestUploadStatusView({
    artifactId: job.reportArtifactId,
    artifactProcessingStatus: processingStatusForJob(job.status),
    job,
    workerLiveness,
  });
  return {
    ok: statusView.ok,
    queued: statusView.workerRequired,
    artifactId: job.reportArtifactId,
    storageUrl: String(job.reportArtifactId),
    jobId: job.id,
    queueStatus: job.status,
    processingStatus: statusView.processingStatus,
    uploadStatus: statusView.status,
    nextAction: statusView.nextAction,
    userMessage: statusView.userMessage,
    diagnosticCode: statusView.diagnosticCode,
    workerRequired: statusView.workerRequired,
    duplicate,
    retryAt: statusView.retryAt,
    errorCode: job.lastErrorCode,
    errorReason: job.lastErrorReason,
    workerLiveness,
    message: statusView.userMessage || messageForJob(job, duplicate),
  };
}

function requestBoundWorkerId(job: IngestProcessingJobRecord): string {
  return `${REQUEST_BOUND_WORKER_ID}-${job.id}`;
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
  let resolvedSession: ResolvedUserSession;
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
    resolvedSession = {
      user,
      userAccount,
      isAuthenticatedUpload: true,
    };

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

  // Return SSE status stream while processing this artifact immediately in the request-bound worker path.
  const stream = createSSEStream(async (send) => {
    try {
      const inlineGate = shouldAllowRequestBoundIngestProcessing();
      if (inlineGate.allowed && (job.status === "queued" || job.status === "failed")) {
        const workerId = requestBoundWorkerId(job);
        const claimedJob = await claimIngestProcessingJobById({
          jobId: job.id,
          workerId,
          leaseSeconds: REQUEST_BOUND_LEASE_SECONDS,
        });

        if (claimedJob) {
          let terminalEvent: SSEEvent | null = null;
          await handleIngestProcess(resolvedSession, input.artifactId, (event) => {
            if (event.type === "complete" || event.type === "error") {
              terminalEvent = event;
              return;
            }
            send(event);
          });

          if (terminalEvent?.type === "complete") {
            await markIngestProcessingJobSucceeded({
              job: claimedJob,
              workerId,
              resultSummary: {
                artifactId: claimedJob.reportArtifactId,
                requestBoundImmediateProcessing: true,
                endpointCutoverEnabled: true,
                parserOutputMutated: false,
                ocrBehaviorMutated: false,
                violationTruthMutated: false,
                evidenceBindingMutated: false,
                packetReadinessMutated: false,
                rawReportBytesLogged: false,
                extractedReportTextLogged: false,
              },
            });
            send(terminalEvent);
            return;
          }

          const safeErrorMessage = terminalEvent?.type === "error"
            ? terminalEvent.error
            : "Ingest processing ended without a final status.";
          await markIngestProcessingJobFailed({
            job: claimedJob,
            workerId,
            error: new Error(safeErrorMessage),
          });
          send(terminalEvent?.type === "error"
            ? terminalEvent
            : {
                type: "error",
                error: "Processing ended without a final status. Please try again or contact support if this continues.",
                code: "INGEST_PROCESSING_NO_TERMINAL_EVENT",
              });
          return;
        }
      }

      const output = await queueOutput(job, duplicate);
      const stage = output.uploadStatus === "stalled_no_worker_heartbeat"
        ? "stalled_no_worker_heartbeat"
        : stageForJob(job.status);
      const percent = percentForJob(job.status);
      const message = output.userMessage || messageForJob(job, duplicate);

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
        uploadStatus: output.uploadStatus,
        nextAction: output.nextAction,
        userMessage: output.userMessage,
        diagnosticCode: output.diagnosticCode,
        workerRequired: output.workerRequired,
        duplicate,
        retryAt: output.retryAt,
        errorCode: output.errorCode,
        errorReason: output.errorReason,
        inlineProcessingAllowed: inlineGate.allowed,
        inlineProcessingGateReason: inlineGate.reason,
        workerLiveness: output.workerLiveness,
      });

      send({ type: "complete", data: output });
    } catch (error) {
      console.error("Error in process stream:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      send({ type: "error", error: errorMessage, code: "PROCESSING_ERROR" });
    }
  });

  return createSSEResponse(stream);
}
