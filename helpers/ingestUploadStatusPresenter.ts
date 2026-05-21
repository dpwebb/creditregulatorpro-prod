export type IngestUploadQueueStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "dead_lettered"
  | "canceled"
  | string;

export type IngestUploadStatus =
  | "queued_waiting_for_worker"
  | "processing"
  | "completed"
  | "failed"
  | "manual_review_required"
  | "stale";

export type IngestUploadNextAction =
  | "wait_for_worker"
  | "wait_for_processing"
  | "review_results"
  | "retry_upload"
  | "contact_support"
  | "manual_review"
  | "check_status";

export type IngestUploadStatusJob = {
  id: number;
  status: IngestUploadQueueStatus;
  reportArtifactId: number;
  userId?: number | null;
  runAfter?: string | null;
  lockedUntil?: string | null;
  updatedAt?: string | null;
  lastErrorCode?: string | null;
};

export type IngestUploadStatusView = {
  ok: boolean;
  artifactId: number;
  jobId: number | null;
  status: IngestUploadStatus;
  queueStatus: IngestUploadQueueStatus | null;
  processingStatus: string;
  nextAction: IngestUploadNextAction;
  userMessage: string;
  diagnosticCode: string;
  workerRequired: boolean;
  canLeavePage: boolean;
  canCheckStatus: boolean;
  retryAt: string | null;
  checkedAt: string;
};

type BuildStatusInput = {
  artifactId: number;
  artifactProcessingStatus?: string | null;
  job?: IngestUploadStatusJob | null;
  now?: Date;
};

const QUEUED_MESSAGE =
  "Your report was received and is waiting for processing. You can leave this page; we'll update your account when processing completes.";

const PROCESSING_MESSAGE = "Processing is active. This usually takes a few moments.";

const FAILED_MESSAGE =
  "Processing could not be completed. Please upload the report again or contact support if the problem continues.";

const MANUAL_REVIEW_MESSAGE =
  "Manual review is required before this report can continue. Support will review the upload and update your account.";

const STALE_MESSAGE =
  "Processing is taking longer than expected. Use Check status to refresh, or upload again if this does not change.";

function jobIsStale(job: IngestUploadStatusJob, now: Date): boolean {
  if (job.status !== "running" || !job.lockedUntil) return false;
  const lockedUntilMs = Date.parse(job.lockedUntil);
  return Number.isFinite(lockedUntilMs) && lockedUntilMs < now.getTime();
}

function statusView(input: Omit<IngestUploadStatusView, "checkedAt"> & { checkedAt?: string }): IngestUploadStatusView {
  return {
    ...input,
    checkedAt: input.checkedAt ?? new Date().toISOString(),
  };
}

export function buildIngestUploadStatusView(input: BuildStatusInput): IngestUploadStatusView {
  const now = input.now ?? new Date();
  const checkedAt = now.toISOString();
  const job = input.job ?? null;

  if (job) {
    if (jobIsStale(job, now)) {
      return statusView({
        ok: true,
        artifactId: input.artifactId,
        jobId: job.id,
        status: "stale",
        queueStatus: job.status,
        processingStatus: "stale",
        nextAction: "check_status",
        userMessage: STALE_MESSAGE,
        diagnosticCode: "INGEST_PROCESSING_STALE",
        workerRequired: true,
        canLeavePage: true,
        canCheckStatus: true,
        retryAt: null,
        checkedAt,
      });
    }

    switch (job.status) {
      case "queued":
        return statusView({
          ok: true,
          artifactId: input.artifactId,
          jobId: job.id,
          status: "queued_waiting_for_worker",
          queueStatus: job.status,
          processingStatus: "queued",
          nextAction: "wait_for_worker",
          userMessage: QUEUED_MESSAGE,
          diagnosticCode: "INGEST_QUEUED_WAITING_FOR_WORKER",
          workerRequired: true,
          canLeavePage: true,
          canCheckStatus: true,
          retryAt: null,
          checkedAt,
        });
      case "running":
        return statusView({
          ok: true,
          artifactId: input.artifactId,
          jobId: job.id,
          status: "processing",
          queueStatus: job.status,
          processingStatus: "processing",
          nextAction: "wait_for_processing",
          userMessage: PROCESSING_MESSAGE,
          diagnosticCode: "INGEST_PROCESSING_ACTIVE",
          workerRequired: true,
          canLeavePage: false,
          canCheckStatus: true,
          retryAt: null,
          checkedAt,
        });
      case "succeeded":
        return statusView({
          ok: true,
          artifactId: input.artifactId,
          jobId: job.id,
          status: "completed",
          queueStatus: job.status,
          processingStatus: "completed",
          nextAction: "review_results",
          userMessage: "Credit file processed. Review your results.",
          diagnosticCode: "INGEST_PROCESSING_COMPLETED",
          workerRequired: false,
          canLeavePage: true,
          canCheckStatus: false,
          retryAt: null,
          checkedAt,
        });
      case "failed":
        return statusView({
          ok: false,
          artifactId: input.artifactId,
          jobId: job.id,
          status: "failed",
          queueStatus: job.status,
          processingStatus: "failed",
          nextAction: "check_status",
          userMessage: FAILED_MESSAGE,
          diagnosticCode: job.lastErrorCode || "INGEST_PROCESSING_FAILED",
          workerRequired: true,
          canLeavePage: true,
          canCheckStatus: true,
          retryAt: job.runAfter ?? null,
          checkedAt,
        });
      case "dead_lettered":
        return statusView({
          ok: false,
          artifactId: input.artifactId,
          jobId: job.id,
          status: "manual_review_required",
          queueStatus: job.status,
          processingStatus: "manual_review_required",
          nextAction: "manual_review",
          userMessage: MANUAL_REVIEW_MESSAGE,
          diagnosticCode: job.lastErrorCode || "INGEST_MANUAL_REVIEW_REQUIRED",
          workerRequired: false,
          canLeavePage: true,
          canCheckStatus: true,
          retryAt: null,
          checkedAt,
        });
      case "canceled":
        return statusView({
          ok: false,
          artifactId: input.artifactId,
          jobId: job.id,
          status: "failed",
          queueStatus: job.status,
          processingStatus: "failed",
          nextAction: "retry_upload",
          userMessage: FAILED_MESSAGE,
          diagnosticCode: job.lastErrorCode || "INGEST_PROCESSING_CANCELED",
          workerRequired: false,
          canLeavePage: true,
          canCheckStatus: false,
          retryAt: null,
          checkedAt,
        });
      default:
        return statusView({
          ok: false,
          artifactId: input.artifactId,
          jobId: job.id,
          status: "stale",
          queueStatus: job.status,
          processingStatus: "stale",
          nextAction: "check_status",
          userMessage: STALE_MESSAGE,
          diagnosticCode: "INGEST_UNKNOWN_QUEUE_STATUS",
          workerRequired: true,
          canLeavePage: true,
          canCheckStatus: true,
          retryAt: null,
          checkedAt,
        });
    }
  }

  if (input.artifactProcessingStatus === "completed") {
    return statusView({
      ok: true,
      artifactId: input.artifactId,
      jobId: null,
      status: "completed",
      queueStatus: null,
      processingStatus: "completed",
      nextAction: "review_results",
      userMessage: "Credit file processed. Review your results.",
      diagnosticCode: "INGEST_ARTIFACT_COMPLETED",
      workerRequired: false,
      canLeavePage: true,
      canCheckStatus: false,
      retryAt: null,
      checkedAt,
    });
  }

  if (input.artifactProcessingStatus === "failed") {
    return statusView({
      ok: false,
      artifactId: input.artifactId,
      jobId: null,
      status: "failed",
      queueStatus: null,
      processingStatus: "failed",
      nextAction: "retry_upload",
      userMessage: FAILED_MESSAGE,
      diagnosticCode: "INGEST_ARTIFACT_FAILED",
      workerRequired: false,
      canLeavePage: true,
      canCheckStatus: false,
      retryAt: null,
      checkedAt,
    });
  }

  return statusView({
    ok: false,
    artifactId: input.artifactId,
    jobId: null,
    status: "stale",
    queueStatus: null,
    processingStatus: "stale",
    nextAction: "check_status",
    userMessage: STALE_MESSAGE,
    diagnosticCode: "INGEST_STATUS_NO_QUEUE_JOB",
    workerRequired: true,
    canLeavePage: true,
    canCheckStatus: true,
    retryAt: null,
    checkedAt,
  });
}
