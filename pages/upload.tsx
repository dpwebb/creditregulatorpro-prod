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

type UploadProgressState = { stage: string; percent: number; message?: string };
type ProcessingOutcome =
  | { type: "success"; artifactId: string }
  | {
      type: "queued_waiting_for_worker" | "failed" | "manual_review_required" | "stale";
      artifactId?: number | string | null;
      message: string;
      nextAction?: string | null;
      diagnosticCode?: string | null;
    };

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
    case "queued": return "Processing your credit file";
    case "running": return "Processing your credit file";
    case "retry_scheduled": return "Processing your credit file";
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
    case "compliance_scanning": return "Looking for rule violations...";
    case "finalizing": return "Almost done...";
    case "complete": return "Done! ✓";
    default: return stage.split('_').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
  }
};

const getProcessingStatusDetail = (stage: string) => {
  switch (stage) {
    case "queued":
      return "Your report was received and is waiting for processing. You can leave this page; we'll update your account when processing completes.";
    case "running":
      return "Processing is active. This usually takes a few moments.";
    case "status_check":
      return "Processing is taking longer than expected. Use Check status to refresh, or upload again if this does not change.";
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
  if (stage === "queued" || stage === "running" || stage === "retry_scheduled" || stage === "failed") {
    return stage === "queued" ? "Waiting for an ingest worker." : "This may take a few moments.";
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
  onReviewResults,
  onCheckStatus,
  onUploadAnother,
}: {
  progress: UploadProgressState | null;
  displayedProgress: number;
  isCheckingStatus?: boolean;
  outcome?: ProcessingOutcome | null;
  onReviewResults?: () => void;
  onCheckStatus?: () => void;
  onUploadAnother?: () => void;
}) {
  if (outcome?.type === "success") {
    return (
      <div className={styles.success} role="status">
        <ShieldCheck size={22} className={styles.successIcon} />
        <div className={styles.successContent}>
          <h3>Credit file processed.</h3>
          <p>Review your results.</p>
          {onReviewResults && (
            <Button onClick={onReviewResults} className={styles.dashboardButton}>
              Review your results
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (outcome?.type === "queued_waiting_for_worker") {
    return (
      <div className={styles.progressContainer} role="status" aria-live="polite">
        <div className={styles.processingStatusHeader}>
          <Info size={18} />
          <span className={styles.progressStage}>Waiting for processing worker</span>
          <span>Queued</span>
        </div>
        <div className={styles.progressDetail}>{outcome.message}</div>
        <div className={styles.statusActions}>
          {onCheckStatus && (
            <Button onClick={onCheckStatus} variant="outline" size="sm">
              Check status
            </Button>
          )}
          {onUploadAnother && (
            <Button onClick={onUploadAnother} variant="ghost" size="sm">
              Upload another report
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (outcome?.type === "stale") {
    return (
      <div className={styles.progressContainer} role="status" aria-live="polite">
        <div className={styles.processingStatusHeader}>
          <Info size={18} />
          <span className={styles.progressStage}>Check processing status</span>
          <span>Status check</span>
        </div>
        <div className={styles.progressDetail}>{outcome.message}</div>
        <div className={styles.statusActions}>
          {onCheckStatus && (
            <Button onClick={onCheckStatus} variant="outline" size="sm">
              Check status
            </Button>
          )}
          {onUploadAnother && (
            <Button onClick={onUploadAnother} variant="ghost" size="sm">
              Upload another report
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
        <div className={styles.progressMessage}>Checking processing status...</div>
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

  const navigate = useNavigate();
  const { authState } = useAuth();
  const { mutate: uploadReport, isPending, error } = useUploadReport((stage, percent, message) => {
    setUploadProgress({ stage, percent, message });
  });
  const isProcessingActive =
    isPending ||
    isCheckingProcessingStatus ||
    isQueuedProcessingActive(queuedProcessing?.queueStatus);

  const markProcessingSuccess = useCallback((artifactId: number | string) => {
    const normalizedArtifactId = String(artifactId);
    setUploadedArtifactId(normalizedArtifactId);
    setQueuedProcessing(null);
    activeProcessingStartedAtRef.current = null;
    setProcessingOutcome({ type: "success", artifactId: normalizedArtifactId });
    setUploadProgress({ stage: "complete", percent: 100, message: "Credit file processed. Review your results." });
    setDisplayedProgress(100);
    toast.success("Credit file processed.", {
      description: "Review your results.",
    });
  }, []);

  const markProcessingFailure = useCallback((
    message = "Processing could not be completed. Please upload the report again or contact support if the problem continues.",
    diagnosticCode: string | null = null,
  ) => {
    setQueuedProcessing(null);
    activeProcessingStartedAtRef.current = null;
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
  }, []);

  const applyStatusViewUpdate = useCallback((status: IngestProcessingStatusOutput) => {
    setUploadedArtifactId(String(status.artifactId));

    if (status.status === "completed") {
      markProcessingSuccess(status.artifactId);
      return;
    }

    if (status.status === "processing") {
      activeProcessingStartedAtRef.current ??= Date.now();
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
    setProcessingOutcome(nextOutcome);
    setUploadProgress(
      status.status === "queued_waiting_for_worker"
        ? { stage: "queued", percent: 12, message: status.userMessage }
        : status.status === "stale"
          ? { stage: "status_check", percent: Math.min(displayedProgress, 99), message: status.userMessage }
          : null,
    );
  }, [displayedProgress, markProcessingSuccess]);

  const refreshProcessingStatus = useCallback(async (artifactId?: number | string | null) => {
    const targetArtifactId = Number(artifactId ?? queuedProcessing?.artifactId ?? uploadedArtifactId);
    if (!Number.isFinite(targetArtifactId) || targetArtifactId <= 0) {
      return;
    }

    setIsCheckingProcessingStatus(true);
    try {
      const status = await getIngestProcessingStatus({ artifactId: targetArtifactId });
      applyStatusViewUpdate(status);
    } catch (statusError) {
      console.error("Failed to refresh upload processing status:", statusError);
      setProcessingOutcome({
        type: "stale",
        artifactId: targetArtifactId,
        message: "Processing status could not be refreshed. Try Check status again or contact support if this continues.",
        nextAction: "check_status",
        diagnosticCode: "INGEST_STATUS_REFRESH_FAILED",
      });
      setUploadProgress({ stage: "status_check", percent: Math.min(displayedProgress, 99) });
    } finally {
      setIsCheckingProcessingStatus(false);
    }
  }, [applyStatusViewUpdate, displayedProgress, queuedProcessing?.artifactId, uploadedArtifactId]);

  const applyQueuedProcessingUpdate = useCallback((data: QueuedProcessingOutputType) => {
    setUploadedArtifactId(String(data.artifactId));
    const uploadStatus = uploadStatusFromQueuedOutput(data);

    if (uploadStatus === "completed") {
      markProcessingSuccess(data.artifactId);
      return;
    }

    if (uploadStatus === "queued_waiting_for_worker") {
      activeProcessingStartedAtRef.current = null;
      setQueuedProcessing(null);
      setProcessingOutcome({
        type: "queued_waiting_for_worker",
        artifactId: data.artifactId,
        message: data.userMessage ?? "Your report was received and is waiting for processing. You can leave this page; we'll update your account when processing completes.",
        nextAction: data.nextAction ?? "wait_for_worker",
        diagnosticCode: data.diagnosticCode ?? "INGEST_QUEUED_WAITING_FOR_WORKER",
      });
      setUploadProgress({ stage: "queued", percent: 12, message: data.userMessage ?? data.message });
      return;
    }

    if (uploadStatus === "manual_review_required") {
      activeProcessingStartedAtRef.current = null;
      setQueuedProcessing(null);
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

    if (uploadStatus === "stale") {
      activeProcessingStartedAtRef.current = null;
      setQueuedProcessing(null);
      setProcessingOutcome({
        type: "stale",
        artifactId: data.artifactId,
        message: data.userMessage ?? "Processing is taking longer than expected. Use Check status to refresh, or upload again if this does not change.",
        nextAction: data.nextAction ?? "check_status",
        diagnosticCode: data.diagnosticCode ?? "INGEST_PROCESSING_STALE",
      });
      setUploadProgress({ stage: "status_check", percent: Math.min(displayedProgress, 99), message: data.userMessage ?? data.message });
      return;
    }

    activeProcessingStartedAtRef.current ??= Date.now();
    setProcessingOutcome(null);
    setQueuedProcessing(data);
    setUploadProgress({
      stage: data.queueStatus === "running" ? "running" : data.queueStatus,
      percent: data.queueStatus === "running" ? 35 : data.queueStatus === "failed" ? 15 : 12,
      message: data.userMessage ?? data.message,
    });
  }, [displayedProgress, markProcessingFailure, markProcessingSuccess]);

  useEffect(() => {
    if (!isProcessingActive || !uploadProgress) {
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
  }, [isProcessingActive, uploadProgress]);

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
          message: "Processing is taking longer than expected. Use Check status to refresh, or upload again if this does not change.",
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
                toast.info("Report waiting for processing", {
                  description: data.userMessage ?? "Your report was received and is waiting for processing. You can leave this page; we'll update your account when processing completes.",
                });
              } else if (uploadStatus === "processing") {
                toast.info("Processing is active", {
                  description: data.userMessage ?? "Processing is active. This usually takes a few moments.",
                });
              }
              return;
            }

            if (!isQueuedProcessingOutput(data)) {
              toast.success("Credit file processed.", {
                description: "Review your results.",
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
              onReviewResults={processingOutcome?.type === "success" && uploadedArtifactId
                ? () => navigate(`/upload-results/${uploadedArtifactId}`)
                : undefined}
              onCheckStatus={() => refreshProcessingStatus(processingOutcome?.type === "success" ? uploadedArtifactId : processingOutcome?.artifactId ?? uploadedArtifactId)}
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
