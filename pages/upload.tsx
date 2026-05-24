import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UploadCloud, FileUp, AlertCircle, Info, ChevronDown, ShieldCheck, Phone } from "lucide-react";
import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
import { HelpTooltip } from "../components/HelpTooltip";
import { Progress } from "../components/Progress";
import { Spinner } from "../components/Spinner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../components/Collapsible";


import { useUploadReport } from "../helpers/uploadQueries";
import { useAuth } from "../helpers/useAuth";
import { toast } from "sonner";
import { ConsumerInfoMismatchDialog } from "../components/ConsumerInfoMismatchDialog";
import { ConsumerInfoComparison } from "../helpers/fuzzyMatcher";
import { postUserProfile } from "../endpoints/user/profile_POST.schema";
import {
  isQueuedProcessingOutput,
  OutputType as UploadReportOutput,
  QueuedProcessingOutputType,
} from "../endpoints/ingest/report_POST.schema";
import { postProcess } from "../endpoints/ingest/process_POST.schema";
import {
  getIngestProcessingStatus,
  type OutputType as IngestProcessingStatusOutput,
} from "../endpoints/ingest/status_GET.schema";
import { getUploadResults } from "../endpoints/upload-results/get_GET.schema";
import type { IngestUploadStatus } from "../helpers/ingestUploadStatusPresenter";
import {
  FRONTEND_LIMITED_BETA_READINESS,
  FRONTEND_UPLOAD_LIMITS,
} from "../helpers/frontendProductionReadinessUx";
import { Helmet } from "react-helmet";
import styles from "./upload.module.css";

const AUTHENTICATED_UPLOAD_LIMIT = FRONTEND_UPLOAD_LIMITS.authenticatedReport;
const PROCESSING_POLL_INTERVAL_MS = 3_000;
const PROCESSING_STATUS_CHECK_TIMEOUT_MS = 30_000;
const STATUS_AUTO_REFRESH_INTERVAL_MS = 8_000;
const STATUS_CLOCK_TICK_MS = 1_000;
const DELAYED_PROCESSING_THRESHOLD_MS = 90_000;
const STALLED_PROCESSING_THRESHOLD_MS = 180_000;
const QUEUED_ANALYSIS_MESSAGE =
  "Your report is uploaded and waiting for analysis to begin. You do not need to stay on this page; results will appear in your account when analysis is complete.";
const DELAYED_ANALYSIS_MESSAGE =
  "This is taking longer than usual, but your report is still queued.";
const STALLED_ANALYSIS_MESSAGE =
  "Processing has not started yet. You can leave this page; we will keep checking in your account.";

type UploadProgressState = { stage: string; percent: number; message?: string };
type CompletionSummary = {
  totalTradelines?: number | null;
  actionableCount?: number | null;
  bureauName?: string | null;
};
type ProcessingOutcome =
  | { type: "success"; artifactId: string }
  | {
      type: "queued_waiting_for_worker" | "failed" | "manual_review_required" | "stalled_no_worker_heartbeat" | "stale";
      artifactId?: number | string | null;
      message: string;
      nextAction?: string | null;
      diagnosticCode?: string | null;
    };

export function recoverProcessingOutcomeAfterStatusRefreshFailure(input: {
  currentOutcome: ProcessingOutcome | null;
  targetArtifactId: number;
}): ProcessingOutcome {
  if (input.currentOutcome?.type === "queued_waiting_for_worker") {
    return {
      ...input.currentOutcome,
      artifactId: input.currentOutcome.artifactId ?? input.targetArtifactId,
      message: "Your report is still waiting for analysis to begin. The latest status refresh did not complete, but we will keep checking.",
      nextAction: "wait_for_worker",
      diagnosticCode: "INGEST_STATUS_REFRESH_UNAVAILABLE_LAST_KNOWN_QUEUED",
    };
  }

  return {
    type: "stale",
    artifactId: input.targetArtifactId,
    message: "The latest status check did not complete. Your report is still saved, and you can check again in a moment.",
    nextAction: "check_status",
    diagnosticCode: "INGEST_STATUS_REFRESH_FAILED",
  };
}

const ANALYSIS_STAGES = [
  "Report uploaded",
  "Waiting for analysis to start",
  "Reading report text",
  "Identifying accounts and tradelines",
  "Checking for report issues",
  "Preparing results",
] as const;

function isPendingOutcome(outcome: ProcessingOutcome | null | undefined): boolean {
  return (
    outcome?.type === "queued_waiting_for_worker" ||
    outcome?.type === "stale" ||
    outcome?.type === "stalled_no_worker_heartbeat"
  );
}

export function shouldAttemptProcessingResume(
  status: Pick<IngestProcessingStatusOutput, "artifactId" | "status" | "canCheckStatus"> | null | undefined,
): status is Pick<IngestProcessingStatusOutput, "artifactId" | "status" | "canCheckStatus"> {
  return Boolean(
    status?.canCheckStatus &&
    (status.status === "queued_waiting_for_worker" || status.status === "stale"),
  );
}

function formatClockTime(timestamp: number | null | undefined): string {
  if (!timestamp) return "Not checked yet";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatElapsedUpload(uploadedAt: number | null | undefined, nowMs: number): string {
  if (!uploadedAt) return "Uploaded just now. Most reports finish in 1-3 minutes.";
  const elapsedMs = Math.max(0, nowMs - uploadedAt);
  const elapsedMinutes = Math.floor(elapsedMs / 60_000);
  if (elapsedMinutes < 1) return "Uploaded just now. Most reports finish in 1-3 minutes.";
  if (elapsedMinutes === 1) return "Uploaded 1 minute ago. Most reports finish in 1-3 minutes.";
  return `Uploaded ${elapsedMinutes} minutes ago. Most reports finish in 1-3 minutes.`;
}

function getPendingDelayMessage(uploadedAt: number | null | undefined, nowMs: number): string | null {
  if (!uploadedAt) return null;
  const elapsedMs = Math.max(0, nowMs - uploadedAt);
  if (elapsedMs >= STALLED_PROCESSING_THRESHOLD_MS) return STALLED_ANALYSIS_MESSAGE;
  if (elapsedMs >= DELAYED_PROCESSING_THRESHOLD_MS) return DELAYED_ANALYSIS_MESSAGE;
  return null;
}

const getFriendlyStageName = (stage: string) => {
    if (stage.startsWith("pass_a_")) return "Reading your report...";
  if (stage.startsWith("full_")) return "Reading your report thoroughly...";
  
  switch (stage) {
    case "docstrange_connecting": return "Getting ready...";
    case "docstrange_uploading": return "Sending your file...";
    case "docstrange_processing": return "Reading your report...";
    case "docstrange_parsing": return "Finding your accounts...";
    case "docstrange_validating": return "Double-checking...";
    case "docstrange_complete": return "All done reading!";
    case "initializing": return "Getting ready...";
    case "queued": return "Waiting for analysis to start";
    case "running": return "Reading report text";
    case "retry_scheduled": return "Waiting for analysis to continue";
    case "status_check": return "Checking processing status";
    case "dead_lettered": return "Processing could not be completed";
    case "failed": return "Processing could not be completed";
    case "canceled": return "Processing could not be completed";
    case "user_setup": return "Setting up your profile...";
    case "creating_artifact": return "Saving your report...";
    case "extracting_text": return "Reading your file...";
    case "parsing_tradelines": return "Finding your accounts...";
    case "persisting_tradelines": return "Saving your information...";
    case "storing_comprehensive_data": return "Saving details...";
    case "validation": return "Checking for problems...";
    case "compliance_scanning": return "Checking for report issues...";
    case "finalizing": return "Almost done...";
    case "complete": return "Done! ✓";
    default: return stage.split('_').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
  }
};

const getProcessingStatusDetail = (stage: string) => {
  switch (stage) {
    case "queued":
      return QUEUED_ANALYSIS_MESSAGE;
    case "running":
      return "Analysis is running. This usually takes a few moments.";
    case "status_check":
      return "This is taking longer than usual, but your report is still saved. We will keep checking for updates in your account.";
    case "retry_scheduled":
    case "failed":
      return "Processing could not be completed. Please upload the report again or contact support if the problem continues.";
    case "dead_lettered":
    case "canceled":
      return "Processing could not be completed. Please retry or contact support.";
    default:
      return null;
  }
};

const getProcessingStatusNote = (stage: string) => {
  if (stage === "queued") {
    return "You can leave this page. Results will appear in your account when ready.";
  }
  return null;
};

export function isQueuedProcessingActive(status: string | null | undefined): boolean {
  return status === "running" || status === "processing";
}

function mapQueueStatusToUploadStatus(status: string | null | undefined): IngestUploadStatus {
  switch (status) {
    case "queued":
      return "queued_waiting_for_worker";
    case "running":
      return "processing";
    case "succeeded":
      return "completed";
    case "dead_lettered":
      return "manual_review_required";
    case "failed":
    case "canceled":
      return "failed";
    default:
      return "stale";
  }
}

function uploadStatusFromQueuedOutput(data: QueuedProcessingOutputType): IngestUploadStatus {
  return data.uploadStatus ?? mapQueueStatusToUploadStatus(data.queueStatus);
}

function outcomeFromStatusView(
  status: Pick<
    IngestProcessingStatusOutput,
    "artifactId" | "status" | "userMessage" | "nextAction" | "diagnosticCode"
  >,
): ProcessingOutcome | null {
  if (status.status === "completed") {
    return { type: "success", artifactId: String(status.artifactId) };
  }

  if (status.status === "processing") {
    return null;
  }

  return {
    type: status.status,
    artifactId: status.artifactId,
    message: status.userMessage,
    nextAction: status.nextAction,
    diagnosticCode: status.diagnosticCode,
  };
}

export function isUploadActionDisabled(input: {
  hasFile: boolean;
  isPending: boolean;
  isProcessingActive: boolean;
}): boolean {
  return !input.hasFile || input.isPending || input.isProcessingActive;
}

export function CreditFileProcessingStatus({
  progress,
  displayedProgress,
  isCheckingStatus = false,
  outcome = null,
  fileName = null,
  uploadedAt = null,
  lastCheckedAt = null,
  nextCheckInSeconds = null,
  manualStatusMessage = null,
  completionSummary = null,
  currentTimeMs = Date.now(),
  onReviewResults,
  onCheckStatus,
  onViewUploadHistory,
  onUploadAnother,
}: {
  progress: UploadProgressState | null;
  displayedProgress: number;
  isCheckingStatus?: boolean;
  outcome?: ProcessingOutcome | null;
  fileName?: string | null;
  uploadedAt?: number | null;
  lastCheckedAt?: number | null;
  nextCheckInSeconds?: number | null;
  manualStatusMessage?: string | null;
  completionSummary?: CompletionSummary | null;
  currentTimeMs?: number;
  onReviewResults?: () => void;
  onCheckStatus?: () => void;
  onViewUploadHistory?: () => void;
  onUploadAnother?: () => void;
}) {
  if (outcome?.type === "success") {
    return (
      <div className={styles.success} role="status">
        <ShieldCheck size={22} className={styles.successIcon} />
        <div className={styles.successContent}>
          <h3>Analysis complete</h3>
          <p>Your report results are ready.</p>
          {completionSummary ? (
            <div className={styles.completionStats}>
              {completionSummary.totalTradelines != null && (
                <div className={styles.completionStat}>
                  <strong>{completionSummary.totalTradelines}</strong>
                  <span>
                    account{completionSummary.totalTradelines === 1 ? "" : "s"} found
                  </span>
                </div>
              )}
              {completionSummary.actionableCount != null && (
                <div className={styles.completionStat}>
                  <strong>{completionSummary.actionableCount}</strong>
                  <span>
                    item{completionSummary.actionableCount === 1 ? "" : "s"} may need review
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className={styles.successNote}>Preparing your result summary...</p>
          )}
          {onReviewResults && (
            <Button onClick={onReviewResults} className={styles.dashboardButton}>
              View results
            </Button>
          )}
          {onViewUploadHistory && (
            <Button onClick={onViewUploadHistory} variant="ghost" size="sm">
              View upload history
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (isPendingOutcome(outcome)) {
    const pendingTitle =
      outcome.type === "stalled_no_worker_heartbeat"
        ? "Processing appears delayed"
        : outcome.type === "stale"
          ? "Checking for updates"
          : "Waiting for analysis to start";
    const pendingBadge =
      outcome.type === "stalled_no_worker_heartbeat"
        ? "Delayed"
        : outcome.type === "stale"
          ? "Checking"
          : "Waiting";
    const delayMessage = getPendingDelayMessage(uploadedAt, currentTimeMs);
    const nextCheckCopy =
      nextCheckInSeconds != null
        ? `Next check in: ${Math.max(0, nextCheckInSeconds)} second${Math.max(0, nextCheckInSeconds) === 1 ? "" : "s"}`
        : "Next check: scheduled automatically";

    return (
      <div className={`${styles.progressContainer} ${styles.pendingStatusCard}`} role="status" aria-live="polite">
        <div className={styles.pendingHeader}>
          <div className={styles.pendingHeaderTitle}>
            <Info size={18} />
            <div>
              <span className={styles.progressStage}>{pendingTitle}</span>
              {fileName && <span className={styles.pendingFileName}>{fileName}</span>}
            </div>
          </div>
          <span className={styles.pendingBadge}>{pendingBadge}</span>
        </div>

        <div className={styles.progressDetail}>{outcome.message || QUEUED_ANALYSIS_MESSAGE}</div>

        <ol className={styles.analysisTimeline} aria-label="Analysis progress">
          {ANALYSIS_STAGES.map((stage, index) => {
            const itemState = index === 0 ? "complete" : index === 1 ? "current" : "upcoming";
            return (
              <li key={stage} className={`${styles.timelineItem} ${styles[`timelineItem_${itemState}`]}`}>
                <span className={styles.timelineMarker}>{index + 1}</span>
                <span>{stage}</span>
              </li>
            );
          })}
        </ol>

        <div className={styles.statusTiming}>
          <span>{formatElapsedUpload(uploadedAt, currentTimeMs)}</span>
          <span>Last checked: {formatClockTime(lastCheckedAt)}</span>
          <span>{nextCheckCopy}</span>
        </div>

        {delayMessage && <div className={styles.delayNotice}>{delayMessage}</div>}

        <div className={styles.leaveNotice}>
          You do not need to stay on this page. Your report will continue processing and results will appear in your account when ready.
        </div>

        <Collapsible>
          <CollapsibleTrigger className={styles.statusInfoTrigger}>
            <span>What's happening?</span>
            <ChevronDown size={16} />
          </CollapsibleTrigger>
          <CollapsibleContent className={styles.statusInfoContent}>
            We received your file and are waiting for analysis to start. Once it begins, we will read the report text, identify accounts, check for report issues, and prepare your results.
          </CollapsibleContent>
        </Collapsible>

        {manualStatusMessage && (
          <div className={styles.progressMessage}>{manualStatusMessage}</div>
        )}

        <div className={styles.statusActions}>
          {onCheckStatus && (
            <Button onClick={onCheckStatus} variant="outline" size="sm">
              {isCheckingStatus ? "Checking..." : "Check now"}
            </Button>
          )}
          {onViewUploadHistory && (
            <Button onClick={onViewUploadHistory} variant="outline" size="sm">
              View upload history
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (outcome?.type === "failed" || outcome?.type === "manual_review_required") {
    return (
      <div className={styles.error} role="alert">
        <AlertCircle size={16} />
        <div>
          <span>{outcome.message}</span>
          <div className={styles.statusActions}>
            {outcome.type === "failed" && onUploadAnother && (
              <Button onClick={onUploadAnother} variant="outline" size="sm">
                Upload another report
              </Button>
            )}
            {outcome.type === "manual_review_required" && onCheckStatus && (
              <Button onClick={onCheckStatus} variant="outline" size="sm">
                Check status
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!progress) {
    return null;
  }

  const detail = getProcessingStatusDetail(progress.stage);
  const note = getProcessingStatusNote(progress.stage);

  return (
    <div className={styles.progressContainer} role="status" aria-live="polite">
      <div className={styles.processingStatusHeader}>
        <Spinner size="sm" aria-label="Processing credit file" />
        <span className={styles.progressStage}>
          {getFriendlyStageName(progress.stage)}
        </span>
        <span>{Math.round(displayedProgress)}%</span>
      </div>
      <Progress value={displayedProgress} />
      {detail && (
        <div className={styles.progressDetail}>
          {detail}
        </div>
      )}
      {note && <div className={styles.progressMessage}>{note}</div>}
      {isCheckingStatus && (
        <div className={styles.progressMessage}>Checking for updates...</div>
      )}
    </div>
  );
}

const getEstimatedProgressCap = (_stage: string, actualPercent: number) => {
  if (actualPercent >= 100) return 100;
  return 99;
};

const getProgressIncrement = (currentPercent: number) => {
  if (currentPercent < 35) return 1.2;
  if (currentPercent < 70) return 0.8;
  if (currentPercent < 90) return 0.45;
  return 0.2;
};

export function nextStatusCheckCountdownSeconds(input: {
  nextStatusCheckAt: number | null;
  statusClockNow: number;
  intervalMs?: number;
}): number | null {
  if (!input.nextStatusCheckAt) return null;
  const intervalSeconds = Math.ceil((input.intervalMs ?? STATUS_AUTO_REFRESH_INTERVAL_MS) / 1000);
  const secondsRemaining = Math.ceil((input.nextStatusCheckAt - input.statusClockNow) / 1000);
  return Math.max(0, Math.min(intervalSeconds, secondsRemaining));
}

export default function UploadPage() {
  
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Dialog state
  const [mismatchDialogOpen, setMismatchDialogOpen] = useState(false);
  const [pendingUploadResult, setPendingUploadResult] = useState<UploadReportOutput | null>(null);
  const [consumerComparison, setConsumerComparison] = useState<ConsumerInfoComparison | null>(null);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [uploadedArtifactId, setUploadedArtifactId] = useState<string | null>(null);
  
  // Progress state
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState | null>(null);
  const [displayedProgress, setDisplayedProgress] = useState(0);
  const slowProgressTickRef = useRef<number | null>(null);
  const activeProcessingStartedAtRef = useRef<number | null>(null);
  const [queuedProcessing, setQueuedProcessing] = useState<QueuedProcessingOutputType | null>(null);
  const [isCheckingProcessingStatus, setIsCheckingProcessingStatus] = useState(false);
  const [processingOutcome, setProcessingOutcome] = useState<ProcessingOutcome | null>(null);
  const [uploadReceivedAt, setUploadReceivedAt] = useState<number | null>(null);
  const [lastStatusCheckedAt, setLastStatusCheckedAt] = useState<number | null>(null);
  const [nextStatusCheckAt, setNextStatusCheckAt] = useState<number | null>(null);
  const [statusClockNow, setStatusClockNow] = useState(Date.now());
  const [manualStatusMessage, setManualStatusMessage] = useState<string | null>(null);
  const [completionSummary, setCompletionSummary] = useState<CompletionSummary | null>(null);

  const navigate = useNavigate();
  const { authState } = useAuth();
  const { mutate: uploadReport, isPending, error } = useUploadReport((stage, percent, message) => {
    setUploadProgress({ stage, percent, message });
  });
  const isWaitingForAnalysis = isPendingOutcome(processingOutcome);
  const isProcessingActive =
    isPending ||
    isCheckingProcessingStatus ||
    isQueuedProcessingActive(queuedProcessing?.queueStatus) ||
    isWaitingForAnalysis;

  const markProcessingSuccess = useCallback((artifactId: number | string) => {
    const normalizedArtifactId = String(artifactId);
    setUploadedArtifactId(normalizedArtifactId);
    setQueuedProcessing(null);
    activeProcessingStartedAtRef.current = null;
    setNextStatusCheckAt(null);
    setManualStatusMessage(null);
    setProcessingOutcome({ type: "success", artifactId: normalizedArtifactId });
    setUploadProgress({ stage: "complete", percent: 100, message: "Analysis complete. View your results." });
    setDisplayedProgress(100);
    toast.success("Analysis complete", {
      description: "Your report results are ready.",
    });
  }, []);

  const markProcessingFailure = useCallback((
    message = "Processing could not be completed. Please upload the report again or contact support if the problem continues.",
    diagnosticCode: string | null = null,
  ) => {
    setQueuedProcessing(null);
    activeProcessingStartedAtRef.current = null;
    setNextStatusCheckAt(null);
    setManualStatusMessage(null);
    setProcessingOutcome({
      type: "failed",
      message,
      diagnosticCode,
    });
    setUploadProgress(null);
    toast.error(message);
  }, []);

  const resetUploadForm = useCallback(() => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setQueuedProcessing(null);
    activeProcessingStartedAtRef.current = null;
    setProcessingOutcome(null);
    setUploadProgress(null);
    setDisplayedProgress(0);
    setUploadedArtifactId(null);
    setUploadReceivedAt(null);
    setLastStatusCheckedAt(null);
    setNextStatusCheckAt(null);
    setManualStatusMessage(null);
    setCompletionSummary(null);
  }, []);

  const applyStatusViewUpdate = useCallback((status: IngestProcessingStatusOutput) => {
    setUploadedArtifactId(String(status.artifactId));
    const checkedAtMs = Date.parse(status.checkedAt);
    const normalizedCheckedAt = Number.isFinite(checkedAtMs) ? checkedAtMs : Date.now();
    setLastStatusCheckedAt(normalizedCheckedAt);
    setStatusClockNow(normalizedCheckedAt);

    if (status.status === "completed") {
      setNextStatusCheckAt(null);
      markProcessingSuccess(status.artifactId);
      return;
    }

    if (status.status === "processing") {
      activeProcessingStartedAtRef.current ??= Date.now();
      setNextStatusCheckAt(normalizedCheckedAt + STATUS_AUTO_REFRESH_INTERVAL_MS);
      setProcessingOutcome(null);
      setQueuedProcessing({
        ok: status.ok,
        queued: status.workerRequired,
        artifactId: status.artifactId,
        storageUrl: String(status.artifactId),
        jobId: status.jobId ?? 0,
        queueStatus: status.queueStatus ?? "running",
        processingStatus: status.processingStatus,
        uploadStatus: status.status,
        nextAction: status.nextAction,
        userMessage: status.userMessage,
        diagnosticCode: status.diagnosticCode,
        workerRequired: status.workerRequired,
        duplicate: true,
        retryAt: status.retryAt,
        errorCode: null,
        errorReason: null,
        message: status.userMessage,
      });
      setUploadProgress({ stage: "running", percent: 35, message: status.userMessage });
      return;
    }

    const nextOutcome = outcomeFromStatusView(status);
    setQueuedProcessing(null);
    activeProcessingStartedAtRef.current = null;
    setNextStatusCheckAt(
      nextOutcome && isPendingOutcome(nextOutcome)
        ? normalizedCheckedAt + STATUS_AUTO_REFRESH_INTERVAL_MS
        : null,
    );
    setProcessingOutcome(nextOutcome);
    setUploadProgress(
      status.status === "queued_waiting_for_worker"
        ? { stage: "queued", percent: 12, message: status.userMessage }
        : status.status === "stale" || status.status === "stalled_no_worker_heartbeat"
          ? { stage: "status_check", percent: Math.min(displayedProgress, 99), message: status.userMessage }
          : null,
    );
  }, [displayedProgress, markProcessingSuccess]);

  const refreshProcessingStatus = useCallback(async (artifactId?: number | string | null) => {
    const targetArtifactId = Number(artifactId ?? queuedProcessing?.artifactId ?? uploadedArtifactId);
    if (!Number.isFinite(targetArtifactId) || targetArtifactId <= 0) {
      return null;
    }

    setIsCheckingProcessingStatus(true);
    try {
      const status = await getIngestProcessingStatus({ artifactId: targetArtifactId });
      applyStatusViewUpdate(status);
      return status;
    } catch (statusError) {
      console.error("Failed to refresh upload processing status:", statusError);
      const recoveredOutcome = recoverProcessingOutcomeAfterStatusRefreshFailure({
        currentOutcome: processingOutcome,
        targetArtifactId,
      });
      const checkedAt = Date.now();
      setLastStatusCheckedAt(checkedAt);
      setStatusClockNow(checkedAt);
      setNextStatusCheckAt(
        isPendingOutcome(recoveredOutcome)
          ? checkedAt + STATUS_AUTO_REFRESH_INTERVAL_MS
          : null,
      );
      setProcessingOutcome(recoveredOutcome);
      if (recoveredOutcome.type === "queued_waiting_for_worker") {
        setUploadProgress({ stage: "queued", percent: 12, message: recoveredOutcome.message });
      } else if (recoveredOutcome.type !== "success") {
        setUploadProgress({ stage: "status_check", percent: Math.min(displayedProgress, 99), message: recoveredOutcome.message });
      }
      return null;
    } finally {
      setIsCheckingProcessingStatus(false);
    }
  }, [applyStatusViewUpdate, displayedProgress, processingOutcome, queuedProcessing?.artifactId, uploadedArtifactId]);

  const applyQueuedProcessingUpdate = useCallback((data: QueuedProcessingOutputType) => {
    setUploadedArtifactId(String(data.artifactId));
    const uploadStatus = uploadStatusFromQueuedOutput(data);
    const checkedAt = Date.now();
    setLastStatusCheckedAt(checkedAt);
    setStatusClockNow(checkedAt);

    if (uploadStatus === "completed") {
      setNextStatusCheckAt(null);
      markProcessingSuccess(data.artifactId);
      return;
    }

    if (uploadStatus === "queued_waiting_for_worker") {
      activeProcessingStartedAtRef.current = null;
      setQueuedProcessing(null);
      setNextStatusCheckAt(checkedAt + STATUS_AUTO_REFRESH_INTERVAL_MS);
      setProcessingOutcome({
        type: "queued_waiting_for_worker",
        artifactId: data.artifactId,
        message: data.userMessage ?? QUEUED_ANALYSIS_MESSAGE,
        nextAction: data.nextAction ?? "wait_for_worker",
        diagnosticCode: data.diagnosticCode ?? "INGEST_QUEUED_WAITING_FOR_WORKER",
      });
      setUploadProgress({ stage: "queued", percent: 12, message: data.userMessage ?? data.message });
      return;
    }

    if (uploadStatus === "manual_review_required") {
      activeProcessingStartedAtRef.current = null;
      setQueuedProcessing(null);
      setNextStatusCheckAt(null);
      setProcessingOutcome({
        type: "manual_review_required",
        artifactId: data.artifactId,
        message: data.userMessage ?? "Manual review is required before this report can continue. Support will review the upload and update your account.",
        nextAction: data.nextAction ?? "manual_review",
        diagnosticCode: data.diagnosticCode ?? data.errorCode ?? "INGEST_MANUAL_REVIEW_REQUIRED",
      });
      setUploadProgress(null);
      return;
    }

    if (uploadStatus === "failed") {
      markProcessingFailure(data.userMessage, data.diagnosticCode ?? data.errorCode);
      return;
    }

    if (uploadStatus === "stalled_no_worker_heartbeat") {
      activeProcessingStartedAtRef.current = null;
      setQueuedProcessing(null);
      setNextStatusCheckAt(checkedAt + STATUS_AUTO_REFRESH_INTERVAL_MS);
      setProcessingOutcome({
        type: "stalled_no_worker_heartbeat",
        artifactId: data.artifactId,
        message: data.userMessage ?? "Processing has not started yet. No action is needed from you, but this has been flagged for review if it does not clear.",
        nextAction: data.nextAction ?? "contact_support",
        diagnosticCode: data.diagnosticCode ?? "INGEST_NO_WORKER_HEARTBEAT",
      });
      setUploadProgress({ stage: "stalled_no_worker_heartbeat", percent: Math.min(displayedProgress, 99), message: data.userMessage ?? data.message });
      return;
    }

    if (uploadStatus === "stale") {
      activeProcessingStartedAtRef.current = null;
      setQueuedProcessing(null);
      setNextStatusCheckAt(checkedAt + STATUS_AUTO_REFRESH_INTERVAL_MS);
      setProcessingOutcome({
        type: "stale",
        artifactId: data.artifactId,
        message: data.userMessage ?? "This is taking longer than usual, but your report is still saved. We will keep checking for updates in your account.",
        nextAction: data.nextAction ?? "check_status",
        diagnosticCode: data.diagnosticCode ?? "INGEST_PROCESSING_STALE",
      });
      setUploadProgress({ stage: "status_check", percent: Math.min(displayedProgress, 99), message: data.userMessage ?? data.message });
      return;
    }

    activeProcessingStartedAtRef.current ??= Date.now();
    setNextStatusCheckAt(checkedAt + STATUS_AUTO_REFRESH_INTERVAL_MS);
    setProcessingOutcome(null);
    setQueuedProcessing(data);
    setUploadProgress({
      stage: data.queueStatus === "running" ? "running" : data.queueStatus,
      percent: data.queueStatus === "running" ? 35 : data.queueStatus === "failed" ? 15 : 12,
      message: data.userMessage ?? data.message,
    });
  }, [displayedProgress, markProcessingFailure, markProcessingSuccess]);

  const resumeProcessingAfterStatusRefresh = useCallback(async (
    status: IngestProcessingStatusOutput | null,
  ): Promise<IngestUploadStatus | "resume_failed" | null> => {
    if (!shouldAttemptProcessingResume(status)) {
      return null;
    }

    setIsCheckingProcessingStatus(true);
    try {
      const result = await postProcess({ artifactId: status.artifactId });
      if (isQueuedProcessingOutput(result)) {
        const uploadStatus = uploadStatusFromQueuedOutput(result);
        applyQueuedProcessingUpdate(result);
        return uploadStatus;
      }

      markProcessingSuccess(result.storageUrl);
      return "completed";
    } catch (resumeError) {
      console.error("Failed to resume queued upload processing:", resumeError);
      const checkedAt = Date.now();
      const nextType = status.status === "queued_waiting_for_worker" ? "queued_waiting_for_worker" : "stale";
      const message =
        nextType === "queued_waiting_for_worker"
          ? "Your report is still waiting for analysis to begin. The latest restart check did not complete, but we will keep checking."
          : "The latest processing restart check did not complete. Your report is still saved, and we will keep checking.";

      setLastStatusCheckedAt(checkedAt);
      setStatusClockNow(checkedAt);
      setQueuedProcessing(null);
      activeProcessingStartedAtRef.current = null;
      setNextStatusCheckAt(checkedAt + STATUS_AUTO_REFRESH_INTERVAL_MS);
      setProcessingOutcome({
        type: nextType,
        artifactId: status.artifactId,
        message,
        nextAction: nextType === "queued_waiting_for_worker" ? "wait_for_worker" : "check_status",
        diagnosticCode: "INGEST_PROCESS_RESUME_FAILED",
      });
      setUploadProgress({
        stage: nextType === "queued_waiting_for_worker" ? "queued" : "status_check",
        percent: nextType === "queued_waiting_for_worker" ? 12 : Math.min(displayedProgress, 99),
        message,
      });
      return "resume_failed";
    } finally {
      setIsCheckingProcessingStatus(false);
    }
  }, [applyQueuedProcessingUpdate, displayedProgress, markProcessingSuccess]);

  useEffect(() => {
    if (!isProcessingActive || !uploadProgress || isWaitingForAnalysis) {
      setDisplayedProgress(uploadProgress?.percent ?? 0);
      slowProgressTickRef.current = null;
      return;
    }

    setDisplayedProgress((current) => Math.max(current, uploadProgress.percent));

    const intervalId = window.setInterval(() => {
      setDisplayedProgress((current) => {
        if (uploadProgress.percent >= 100) return 100;

        const cap = getEstimatedProgressCap(uploadProgress.stage, uploadProgress.percent);
        const floor = Math.max(current, uploadProgress.percent);

        if (floor >= cap) {
          return floor;
        }

        if (floor < 90) {
          slowProgressTickRef.current = null;
          return Math.min(90, floor + getProgressIncrement(floor));
        }

        const now = Date.now();
        if (slowProgressTickRef.current === null) {
          slowProgressTickRef.current = now;
          return floor;
        }

        if (now - slowProgressTickRef.current >= 10_000) {
          slowProgressTickRef.current = now;
          return Math.min(cap, floor + 1);
        }

        return floor;
      });
    }, 700);

    return () => window.clearInterval(intervalId);
  }, [isProcessingActive, isWaitingForAnalysis, uploadProgress]);

  useEffect(() => {
    if (!queuedProcessing || !isQueuedProcessingActive(queuedProcessing.queueStatus)) {
      return;
    }

    let canceled = false;
    const timeoutId = window.setTimeout(async () => {
      const activeSince = activeProcessingStartedAtRef.current ?? Date.now();
      if (Date.now() - activeSince >= PROCESSING_STATUS_CHECK_TIMEOUT_MS) {
        setQueuedProcessing(null);
        activeProcessingStartedAtRef.current = null;
        setProcessingOutcome({
          type: "stale",
          artifactId: queuedProcessing.artifactId,
          message: "This is taking longer than usual, but your report is still saved. We will keep checking for updates in your account.",
          nextAction: "check_status",
          diagnosticCode: "INGEST_UI_STATUS_CHECK_TIMEOUT",
        });
        setUploadProgress({ stage: "status_check", percent: Math.min(displayedProgress, 99) });
        return;
      }

      setIsCheckingProcessingStatus(true);
      try {
        const result = await postProcess({ artifactId: queuedProcessing.artifactId });
        if (canceled) return;

        if (isQueuedProcessingOutput(result)) {
          applyQueuedProcessingUpdate(result);
          return;
        }

        markProcessingSuccess(result.storageUrl);
      } catch (statusError) {
        if (canceled) return;
        console.error("Failed to refresh queued upload processing status:", statusError);
        markProcessingFailure();
      } finally {
        if (!canceled) {
          setIsCheckingProcessingStatus(false);
        }
      }
    }, PROCESSING_POLL_INTERVAL_MS);

    return () => {
      canceled = true;
      window.clearTimeout(timeoutId);
    };
  }, [applyQueuedProcessingUpdate, displayedProgress, markProcessingFailure, markProcessingSuccess, queuedProcessing]);

  useEffect(() => {
    const targetArtifactId = processingOutcome?.artifactId ?? uploadedArtifactId;
    if (!isPendingOutcome(processingOutcome) || !targetArtifactId || isCheckingProcessingStatus) {
      setNextStatusCheckAt((current) => (isPendingOutcome(processingOutcome) ? current : null));
      return;
    }

    const scheduledAt = Date.now() + STATUS_AUTO_REFRESH_INTERVAL_MS;
    setNextStatusCheckAt(scheduledAt);

    const timeoutId = window.setTimeout(() => {
      setManualStatusMessage(null);
      void refreshProcessingStatus(targetArtifactId)
        .then((status) => resumeProcessingAfterStatusRefresh(status));
    }, STATUS_AUTO_REFRESH_INTERVAL_MS);

    return () => window.clearTimeout(timeoutId);
  }, [
    isCheckingProcessingStatus,
    processingOutcome,
    refreshProcessingStatus,
    resumeProcessingAfterStatusRefresh,
    uploadedArtifactId,
  ]);

  useEffect(() => {
    if (!isWaitingForAnalysis) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setStatusClockNow(Date.now());
    }, STATUS_CLOCK_TICK_MS);

    return () => window.clearInterval(intervalId);
  }, [isWaitingForAnalysis]);

  useEffect(() => {
    const artifactId = Number(uploadedArtifactId);
    if (processingOutcome?.type !== "success" || !Number.isFinite(artifactId) || artifactId <= 0) {
      return;
    }

    let canceled = false;
    void getUploadResults({ artifactId })
      .then((results) => {
        if (canceled) return;
        setCompletionSummary({
          totalTradelines: results.stats.totalTradelines,
          actionableCount: results.stats.actionableCount,
          bureauName: results.metadata.bureauName,
        });
      })
      .catch((summaryError) => {
        if (!canceled) {
          console.warn("Failed to load upload completion summary:", summaryError);
        }
      });

    return () => {
      canceled = true;
    };
  }, [processingOutcome?.type, uploadedArtifactId]);

  const handleStatusCheckNow = useCallback(async () => {
    const targetArtifactId = processingOutcome?.type === "success"
      ? uploadedArtifactId
      : processingOutcome?.artifactId ?? uploadedArtifactId;
    setManualStatusMessage("Checking now...");
    const status = await refreshProcessingStatus(targetArtifactId);
    const resumedStatus = await resumeProcessingAfterStatusRefresh(status);
    const effectiveStatus = resumedStatus ?? status?.status;
    if (effectiveStatus === "completed") {
      setManualStatusMessage(null);
      return;
    }
    if (effectiveStatus === "processing") {
      setManualStatusMessage("Checked just now - analysis is running.");
      return;
    }
    if (effectiveStatus === "resume_failed") {
      setManualStatusMessage("Checked just now - processing is still queued, and we will keep checking.");
      return;
    }
    if (effectiveStatus === "stale" || effectiveStatus === "stalled_no_worker_heartbeat") {
      setManualStatusMessage("Checked just now - processing is delayed, but your report is saved.");
      return;
    }
    if (effectiveStatus === "queued_waiting_for_worker") {
      setManualStatusMessage("Checked just now - still waiting for analysis to start.");
      return;
    }
    setManualStatusMessage("Checked just now - we will keep checking for updates.");
  }, [processingOutcome, refreshProcessingStatus, resumeProcessingAfterStatusRefresh, uploadedArtifactId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.size > AUTHENTICATED_UPLOAD_LIMIT.maxBytes) {
        toast.error(`File is too large. Maximum size is ${AUTHENTICATED_UPLOAD_LIMIT.label}.`);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      
      // Validate file type
      const allowedExtensions = ['.pdf'];
      const fileExtension = '.' + selectedFile.name.split('.').pop()?.toLowerCase();
      if (!allowedExtensions.includes(fileExtension)) {
         toast.error("Unsupported file format. Please upload a PDF credit report.");
         if (fileInputRef.current) fileInputRef.current.value = "";
         return;
      }

      setFile(selectedFile);
      setQueuedProcessing(null);
      activeProcessingStartedAtRef.current = null;
      setProcessingOutcome(null);
      setUploadProgress(null);
      setDisplayedProgress(0);
      setUploadedArtifactId(null);
      setUploadReceivedAt(null);
      setLastStatusCheckedAt(null);
      setNextStatusCheckAt(null);
      setManualStatusMessage(null);
      setCompletionSummary(null);
    }
  };

  const handleUpload = async () => {
    if (!file || isProcessingActive) return;
    if (authState.type !== "authenticated") {
      toast.error("You must be logged in to upload reports.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64String = reader.result as string;
      const base64Content = base64String.split(",")[1];
      const mimeType = file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : file.type || "application/pdf";

      setUploadProgress({ stage: "initializing", percent: 0, message: "Preparing upload..." });
      setDisplayedProgress(0);
      slowProgressTickRef.current = null;
      activeProcessingStartedAtRef.current = null;
      setQueuedProcessing(null);
      setProcessingOutcome(null);
      const uploadStartedAt = Date.now();
      setUploadReceivedAt(uploadStartedAt);
      setStatusClockNow(uploadStartedAt);
      setLastStatusCheckedAt(null);
      setNextStatusCheckAt(null);
      setManualStatusMessage(null);
      setCompletionSummary(null);

      uploadReport(
        {
          bytesBase64: base64Content,
          fileName: file.name,
          mimeType,
          region: "CA",
        },
        {
          onSuccess: (data) => {
            if (isQueuedProcessingOutput(data)) {
              applyQueuedProcessingUpdate(data);
              const uploadStatus = uploadStatusFromQueuedOutput(data);
              if (uploadStatus === "queued_waiting_for_worker") {
                toast.info("Report uploaded", {
                  description: data.userMessage ?? QUEUED_ANALYSIS_MESSAGE,
                });
              } else if (uploadStatus === "stalled_no_worker_heartbeat") {
                toast.info("Analysis delayed", {
                  description: data.userMessage ?? "Processing has not started yet. No action is needed from you, but this has been flagged for review if it does not clear.",
                });
              } else if (uploadStatus === "processing") {
                toast.info("Analysis started", {
                  description: data.userMessage ?? "Analysis is running. This usually takes a few moments.",
                });
              }
              return;
            }

            if (!isQueuedProcessingOutput(data)) {
              toast.success("Analysis complete", {
                description: "Your report results are ready.",
              });
            }

            setUploadProgress({ stage: "complete", percent: 100, message: "Upload complete!" });
            // Store the artifact ID for navigation
            setUploadedArtifactId(data.storageUrl);
            
            // Check for consumer info mismatch
            if (data.consumerInfoComparison && !data.consumerInfoComparison.isMatch) {
              setPendingUploadResult(data);

              const cic = data.consumerInfoComparison;
              const extractedDob = cic.extractedInfo.dateOfBirth ? new Date(cic.extractedInfo.dateOfBirth) : null;
              const profileDob = cic.profileInfo.dateOfBirth ? new Date(cic.profileInfo.dateOfBirth) : null;

              // Compute per-field match flags to populate the details and mismatch flags
              const cityMatch = cic.extractedInfo.city === cic.profileInfo.city || !cic.extractedInfo.city || !cic.profileInfo.city;
              const provinceMatch = cic.extractedInfo.province === cic.profileInfo.province || !cic.extractedInfo.province || !cic.profileInfo.province;
              const postalCodeMatch = cic.extractedInfo.postalCode === cic.profileInfo.postalCode || !cic.extractedInfo.postalCode || !cic.profileInfo.postalCode;

              let dobMatch = true;
              if (extractedDob && profileDob) {
                dobMatch = extractedDob.toISOString().split("T")[0] === profileDob.toISOString().split("T")[0];
              }

              const normalizePhone = (p: string) => p.replace(/\D/g, "");
              const phoneMatch =
                !cic.extractedInfo.phone ||
                !cic.profileInfo.phone ||
                normalizePhone(cic.extractedInfo.phone) === normalizePhone(cic.profileInfo.phone);

              const comparisonData: ConsumerInfoComparison = {
                isMatch: cic.isMatch,
                nameMismatch: cic.nameMismatch,
                addressMismatch: cic.addressMismatch,
                cityMismatch: !cityMatch,
                provinceMismatch: !provinceMatch,
                postalCodeMismatch: !postalCodeMatch,
                dobMismatch: !dobMatch,
                phoneMismatch: !phoneMatch,
                extractedInfo: {
                  fullName: cic.extractedInfo.fullName,
                  addressLine1: cic.extractedInfo.addressLine1,
                  addressLine2: null,
                  city: cic.extractedInfo.city,
                  province: cic.extractedInfo.province,
                  postalCode: cic.extractedInfo.postalCode,
                  dateOfBirth: extractedDob,
                  dateOfBirthRaw: extractedDob ? extractedDob.toISOString().split("T")[0] : null,
                  phone: cic.extractedInfo.phone ?? null,
                  previousAddresses: [],
                  confidence: 0,
                },
                profileInfo: {
                  fullName: cic.profileInfo.fullName,
                  addressLine1: cic.profileInfo.addressLine1,
                  city: cic.profileInfo.city,
                  province: cic.profileInfo.province,
                  postalCode: cic.profileInfo.postalCode,
                  dateOfBirth: profileDob,
                  phone: cic.profileInfo.phone ?? null,
                },
                details: {
                  nameComparison: {
                    extracted: cic.extractedInfo.fullName,
                    profile: cic.profileInfo.fullName,
                    similarity: 0, // Not available from backend response
                  },
                  addressComparison: {
                    extracted: cic.extractedInfo.addressLine1,
                    profile: cic.profileInfo.addressLine1,
                    similarity: 0, // Not available from backend response
                  },
                  cityComparison: {
                    extracted: cic.extractedInfo.city,
                    profile: cic.profileInfo.city,
                    match: cityMatch,
                  },
                  provinceComparison: {
                    extracted: cic.extractedInfo.province,
                    profile: cic.profileInfo.province,
                    match: provinceMatch,
                  },
                  postalCodeComparison: {
                    extracted: cic.extractedInfo.postalCode,
                    profile: cic.profileInfo.postalCode,
                    match: postalCodeMatch,
                  },
                  dobComparison: {
                    extracted: extractedDob,
                    profile: profileDob,
                    match: dobMatch,
                  },
                  phoneComparison: {
                    extracted: cic.extractedInfo.phone ?? null,
                    profile: cic.profileInfo.phone ?? null,
                    match: phoneMatch,
                  },
                },
              };

              setConsumerComparison(comparisonData);
              setMismatchDialogOpen(true);
              return;
            }

            toast.success("Your report has been uploaded!", {
              description: `We found ${data.tradelinesCount} accounts. Taking you to the results...`,
            });

            // Navigate to the upload results page to see scan summary
            navigate(`/upload-results/${data.storageUrl}`);
          },
          onError: (_err) => {
            setUploadProgress(null);
            setQueuedProcessing(null);
            setNextStatusCheckAt(null);
            setManualStatusMessage(null);
            setProcessingOutcome({
              type: "failed",
              message: "Processing could not be completed. Please upload the report again or contact support if the problem continues.",
            });
            // Error toast handled by useUploadReport hook
          },
        }
      );
    };

    reader.onerror = () => {
      toast.error("Failed to read file");
    };

    reader.readAsDataURL(file);
  };

  const handleUpdateProfile = async () => {
    if (!consumerComparison) return;

    // Validate we have all required fields from extracted info
    const { fullName, addressLine1, city, province, postalCode, dateOfBirth, phone } = consumerComparison.extractedInfo;

    const missingFields: string[] = [];
    if (!fullName) missingFields.push("full name");
    if (!addressLine1) missingFields.push("address");
    if (!city) missingFields.push("city");
    if (!province) missingFields.push("province");
    if (!postalCode) missingFields.push("postal code");

    if (missingFields.length > 0) {
      toast.error(
        `Cannot update profile: missing ${missingFields.join(", ")} from the report. Please update your profile manually in Profile Settings.`
      );
      setMismatchDialogOpen(false);
      navigate("/my-accounts");
      return;
    }

    setIsUpdatingProfile(true);
    try {
      // Call profile update endpoint with extracted info
      await postUserProfile({
        fullName: fullName!,
        addressLine1: addressLine1!,
        addressLine2: null, // Extracted info doesn't usually have line 2 separate
        city: city!,
        province: province!,
        postalCode: postalCode!,
        dateOfBirth,
        phone,
      });
      toast.success("Profile updated with information from report");
      setMismatchDialogOpen(false);
      if (uploadedArtifactId) {
        navigate(`/upload-results/${uploadedArtifactId}`);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to update profile");
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleKeepCurrent = () => {
    setMismatchDialogOpen(false);
    toast.info("Proceeding with current profile information");
    if (uploadedArtifactId) {
      navigate(`/upload-results/${uploadedArtifactId}`);
    }
  };

  const handleCancelUpload = () => {
    setMismatchDialogOpen(false);
    setPendingUploadResult(null);
    setConsumerComparison(null);
    setUploadedArtifactId(null);
    setUploadProgress(null);
    toast.info("Upload cancelled. You can try again.");
    // Note: The report is technically already uploaded at this point.
    // In a real app we might want to delete it, but for now we just don't navigate.
  };

  return (
        <div className={styles.container}>
      <Helmet>
        <title>Upload Your Report</title>
      </Helmet>

      {consumerComparison && (
        <ConsumerInfoMismatchDialog
          open={mismatchDialogOpen}
          onOpenChange={setMismatchDialogOpen}
          comparison={consumerComparison}
          onUpdateProfile={handleUpdateProfile}
          onKeepCurrent={handleKeepCurrent}
          onCancel={handleCancelUpload}
          isUpdating={isUpdatingProfile}
        />
      )}

      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.iconWrapper}>
            <UploadCloud size={32} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className={styles.title}>Upload Your Credit Report</h1>
              <HelpTooltip 
                title="What Happens Next"
                content="We will read your report and find any problems right away."
              />
            </div>
            <p className={styles.subtitle}>
              Upload the original Equifax or TransUnion PDF and we'll check it for you
            </p>
          </div>
        </div>

        <div className={styles.regionBanner}>
          <Badge variant="default" className={styles.regionBadge}>
            🇨🇦 Canada Only
          </Badge>
          <span className={styles.regionInfo}>
            Your information is kept safe in Canada for 1 year.
          </span>
        </div>

        <div className={styles.readinessBanner}>
          <AlertCircle size={18} />
          <div>
            <strong>{FRONTEND_LIMITED_BETA_READINESS.classification}</strong>
            <span>
              Server file limit: {AUTHENTICATED_UPLOAD_LIMIT.label} PDF. Upload the original downloaded report with selectable text; photo or scanned PDFs may be held or rejected unless deterministic OCR is available and operator review is required.
            </span>
            <span>{FRONTEND_LIMITED_BETA_READINESS.uploadPolicy}</span>
          </div>
        </div>

        <div className={styles.helpCard}>
          <Collapsible>
            <CollapsibleTrigger className={styles.helpTrigger}>
              <div className={styles.helpHeader}>
                <Info className={styles.helpIcon} size={20} />
                <span className={styles.helpTitle}>Don't have your credit report yet?</span>
              </div>
              <ChevronDown className={styles.helpTriggerChevron} size={20} />
            </CollapsibleTrigger>
            <CollapsibleContent className={styles.helpContent}>
              <p className={styles.helpText}>You can get your free credit report online in about 5 minutes. Download the original PDF from the bureau, not a photo or scan.</p>
              
              <div className={styles.helpBureausGrid}>
                <div className={styles.helpBureauCard}>
                  <div className={styles.helpBureauHeader}>
                    <ShieldCheck size={20} color="var(--primary)" />
                    <h4>Equifax</h4>
                  </div>
                  <ol className={styles.helpSteps}>
                    <li>Create a free myEquifax account.</li>
                    <li>Log in and find your credit report.</li>
                    <li>Look for "Download" or "Save as PDF".</li>
                  </ol>
                  <Button asChild size="sm" variant="outline" className={styles.helpButton}>
                    <a href="https://my.equifax.ca/" target="_blank" rel="noopener noreferrer">
                      Get Equifax Report
                    </a>
                  </Button>
                  <div className={styles.helpPhone}>
                    <Phone size={14} /> 1-800-465-7166
                  </div>
                </div>

                <div className={styles.helpBureauCard}>
                  <div className={styles.helpBureauHeader}>
                    <ShieldCheck size={20} color="var(--secondary)" />
                    <h4>TransUnion</h4>
                  </div>
                  <ol className={styles.helpSteps}>
                    <li>Go to the TransUnion secure portal.</li>
                    <li>Answer questions to prove who you are.</li>
                    <li>Click the "Download PDF" button.</li>
                  </ol>
                  <Button asChild size="sm" variant="outline" className={styles.helpButton}>
                    <a href="https://ocs.transunion.ca/" target="_blank" rel="noopener noreferrer">
                      Get TransUnion Report
                    </a>
                  </Button>
                  <div className={styles.helpPhone}>
                    <Phone size={14} /> 1-800-663-9980
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <div className={styles.uploadArea}>
          <div className="flex items-center gap-2">
            <label className={styles.fileLabel}>
              {isProcessingActive ? "Processing in progress" : "Choose Your File"}
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileChange}
                className={styles.fileInput}
                accept=".pdf,application/pdf"
                disabled={isProcessingActive}
              />
            </label>
            <HelpTooltip 
              title="What You Can Upload"
              content={`Upload the original downloaded PDF with selectable text. Scanned or photo PDFs are not supported yet. Maximum size: ${AUTHENTICATED_UPLOAD_LIMIT.label}.`}
            />
          </div>
          
          {file && (
            <div className={styles.fileInfo}>
              <FileUp size={20} className={styles.fileIcon} />
              <span className={styles.fileName}>{file.name}</span>
              <span className={styles.fileSize}>
                {(file.size / 1024).toFixed(2)} KB
              </span>
            </div>
          )}

          <div className={styles.actions}>
            <Button
              onClick={handleUpload}
              disabled={isUploadActionDisabled({
                hasFile: Boolean(file),
                isPending,
                isProcessingActive,
              })}
              className={styles.uploadButton}
              size="lg"
            >
              {isProcessingActive ? "Processing your credit file" : "Upload My Report"}
            </Button>
          </div>

          {(isProcessingActive || processingOutcome) && (
            <CreditFileProcessingStatus
              progress={uploadProgress}
              displayedProgress={displayedProgress}
              isCheckingStatus={isCheckingProcessingStatus}
              outcome={processingOutcome}
              fileName={file?.name ?? null}
              uploadedAt={uploadReceivedAt}
              lastCheckedAt={lastStatusCheckedAt}
              nextCheckInSeconds={
                nextStatusCheckCountdownSeconds({
                  nextStatusCheckAt,
                  statusClockNow,
                })
              }
              manualStatusMessage={manualStatusMessage}
              completionSummary={completionSummary}
              currentTimeMs={statusClockNow}
              onReviewResults={processingOutcome?.type === "success" && uploadedArtifactId
                ? () => navigate(`/upload-results/${uploadedArtifactId}`)
                : undefined}
              onCheckStatus={handleStatusCheckNow}
              onViewUploadHistory={() => navigate("/my-accounts?tab=reports")}
              onUploadAnother={resetUploadForm}
            />
          )}

          {error && (
            <div className={styles.error}>
              <AlertCircle size={16} />
              <span>{error.message}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
