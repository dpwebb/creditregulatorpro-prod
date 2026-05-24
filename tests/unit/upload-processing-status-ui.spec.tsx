import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  CreditFileProcessingStatus,
  isUploadActionDisabled,
  recoverProcessingOutcomeAfterStatusRefreshFailure,
  shouldAttemptProcessingResume,
} from "../../pages/upload";

describe("credit file upload processing status UI", () => {
  it("renders queued backend status as a user-facing waiting-for-analysis state", () => {
    const onCheckStatus = vi.fn();
    const onViewUploadHistory = vi.fn();
    render(
      <CreditFileProcessingStatus
        progress={{ stage: "queued", percent: 12, message: "Report processing has been queued." }}
        displayedProgress={12}
        fileName="synthetic-report.pdf"
        uploadedAt={Date.parse("2026-05-21T16:30:00.000Z")}
        lastCheckedAt={Date.parse("2026-05-21T16:31:00.000Z")}
        nextCheckInSeconds={8}
        currentTimeMs={Date.parse("2026-05-21T16:31:00.000Z")}
        outcome={{
          type: "queued_waiting_for_worker",
          artifactId: 701,
          message: "Your report is uploaded and waiting for analysis to begin. You do not need to stay on this page; results will appear in your account when analysis is complete.",
          nextAction: "wait_for_worker",
          diagnosticCode: "INGEST_QUEUED_WAITING_FOR_WORKER",
        }}
        onCheckStatus={onCheckStatus}
        onViewUploadHistory={onViewUploadHistory}
      />,
    );

    expect(screen.getAllByText("Waiting for analysis to start").length).toBeGreaterThan(0);
    expect(screen.getByText("synthetic-report.pdf")).toBeInTheDocument();
    expect(screen.getByText("Your report is uploaded and waiting for analysis to begin. You do not need to stay on this page; results will appear in your account when analysis is complete.")).toBeInTheDocument();
    expect(screen.getByText("Report uploaded")).toBeInTheDocument();
    expect(screen.getByText("Reading report text")).toBeInTheDocument();
    expect(screen.getByText("Uploaded 1 minute ago. Most reports finish in 1-3 minutes.")).toBeInTheDocument();
    expect(screen.getByText("Next check in: 8 seconds")).toBeInTheDocument();
    expect(screen.getAllByText(/You do not need to stay on this page/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/worker/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/keep this page open/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check now" }));
    expect(onCheckStatus).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "View upload history" }));
    expect(onViewUploadHistory).toHaveBeenCalledTimes(1);
  });

  it("keeps the last known queued state when a status refresh fails", () => {
    const outcome = recoverProcessingOutcomeAfterStatusRefreshFailure({
      currentOutcome: {
        type: "queued_waiting_for_worker",
        artifactId: 701,
        message: "Your report is uploaded and waiting for analysis to begin.",
        nextAction: "wait_for_worker",
        diagnosticCode: "INGEST_QUEUED_WAITING_FOR_WORKER",
      },
      targetArtifactId: 701,
    });

    expect(outcome).toEqual(expect.objectContaining({
      type: "queued_waiting_for_worker",
      artifactId: 701,
      nextAction: "wait_for_worker",
      diagnosticCode: "INGEST_STATUS_REFRESH_UNAVAILABLE_LAST_KNOWN_QUEUED",
    }));
    expect(outcome.message).toMatch(/still waiting for analysis/i);
  });

  it("renders running backend status as active processing", () => {
    render(
      <CreditFileProcessingStatus
        progress={{ stage: "running", percent: 35 }}
        displayedProgress={35}
        isCheckingStatus
      />,
    );

    expect(screen.getByText("Reading report text")).toBeInTheDocument();
    expect(screen.getByText("Analysis is running. This usually takes a few moments.")).toBeInTheDocument();
    expect(screen.queryByText("This may take a few moments.")).not.toBeInTheDocument();
    expect(screen.getByText("Checking for updates...")).toBeInTheDocument();
  });

  it("disables duplicate submit actions while processing is active", () => {
    expect(isUploadActionDisabled({
      hasFile: true,
      isPending: false,
      isProcessingActive: true,
    })).toBe(true);

    expect(isUploadActionDisabled({
      hasFile: true,
      isPending: false,
      isProcessingActive: false,
    })).toBe(false);
  });

  it("shows a clear next action when processing succeeds", () => {
    const onReviewResults = vi.fn();
    render(
      <CreditFileProcessingStatus
        progress={null}
        displayedProgress={100}
        outcome={{ type: "success", artifactId: "42" }}
        completionSummary={{ totalTradelines: 2, actionableCount: 6 }}
        onReviewResults={onReviewResults}
      />,
    );

    expect(screen.getByText("Analysis complete")).toBeInTheDocument();
    expect(screen.getByText("Your report results are ready.")).toBeInTheDocument();
    expect(screen.getByText("accounts found").parentElement).toHaveTextContent("2");
    expect(screen.getByText("items may need review").parentElement).toHaveTextContent("6");
    fireEvent.click(screen.getByRole("button", { name: "View results" }));
    expect(onReviewResults).toHaveBeenCalledTimes(1);
  });

  it("shows a useful error when processing fails", () => {
    const onUploadAnother = vi.fn();
    render(
      <CreditFileProcessingStatus
        progress={null}
        displayedProgress={0}
        outcome={{
          type: "failed",
          message: "Processing could not be completed. Please upload the report again or contact support if the problem continues.",
        }}
        onUploadAnother={onUploadAnother}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Processing could not be completed. Please upload the report again or contact support if the problem continues.");
    fireEvent.click(screen.getByRole("button", { name: "Upload another report" }));
    expect(onUploadAnother).toHaveBeenCalledTimes(1);
  });

  it("shows manual-review instructions when processing requires operator review", () => {
    render(
      <CreditFileProcessingStatus
        progress={null}
        displayedProgress={0}
        outcome={{
          type: "manual_review_required",
          message: "Manual review is required before this report can continue. Support will review the upload and update your account.",
          diagnosticCode: "INGEST_MANUAL_REVIEW_REQUIRED",
        }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Manual review is required before this report can continue.");
  });

  it("shows delayed status-check mode when processing goes stale", () => {
    const onCheckStatus = vi.fn();
    render(
      <CreditFileProcessingStatus
        progress={{ stage: "status_check", percent: 99 }}
        displayedProgress={99}
        uploadedAt={Date.parse("2026-05-21T16:27:00.000Z")}
        currentTimeMs={Date.parse("2026-05-21T16:31:00.000Z")}
        outcome={{
          type: "stale",
          artifactId: 701,
          message: "This is taking longer than usual, but your report is still saved. We will keep checking for updates in your account.",
          nextAction: "check_status",
          diagnosticCode: "INGEST_UI_STATUS_CHECK_TIMEOUT",
        }}
        onCheckStatus={onCheckStatus}
      />,
    );

    expect(screen.getByText("Checking for updates")).toBeInTheDocument();
    expect(screen.getByText("This is taking longer than usual, but your report is still saved. We will keep checking for updates in your account.")).toBeInTheDocument();
    expect(screen.getByText("Processing has not started yet. You can leave this page; we will keep checking in your account.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check now" }));
    expect(onCheckStatus).toHaveBeenCalledTimes(1);
  });

  it("only retries process startup for queued or stale states that allow status checks", () => {
    expect(shouldAttemptProcessingResume({
      artifactId: 701,
      status: "queued_waiting_for_worker",
      canCheckStatus: true,
    })).toBe(true);
    expect(shouldAttemptProcessingResume({
      artifactId: 701,
      status: "stale",
      canCheckStatus: true,
    })).toBe(true);
    expect(shouldAttemptProcessingResume({
      artifactId: 701,
      status: "stalled_no_worker_heartbeat",
      canCheckStatus: true,
    })).toBe(false);
    expect(shouldAttemptProcessingResume({
      artifactId: 701,
      status: "failed",
      canCheckStatus: true,
    })).toBe(false);
    expect(shouldAttemptProcessingResume({
      artifactId: 701,
      status: "queued_waiting_for_worker",
      canCheckStatus: false,
    })).toBe(false);
  });

  it("shows a clear delayed state when queued processing has no worker heartbeat", () => {
    render(
      <CreditFileProcessingStatus
        progress={{ stage: "stalled_no_worker_heartbeat", percent: 99 }}
        displayedProgress={99}
        uploadedAt={Date.parse("2026-05-21T16:27:00.000Z")}
        currentTimeMs={Date.parse("2026-05-21T16:31:00.000Z")}
        outcome={{
          type: "stalled_no_worker_heartbeat",
          artifactId: 701,
          message: "Processing has not started yet. No action is needed from you, but this has been flagged for review if it does not clear.",
          nextAction: "contact_support",
          diagnosticCode: "INGEST_NO_WORKER_HEARTBEAT",
        }}
      />,
    );

    expect(screen.getByText("Processing appears delayed")).toBeInTheDocument();
    expect(screen.getByText("Delayed")).toBeInTheDocument();
    expect(screen.getByText("Processing has not started yet. No action is needed from you, but this has been flagged for review if it does not clear.")).toBeInTheDocument();
    expect(screen.getByText("Processing has not started yet. You can leave this page; we will keep checking in your account.")).toBeInTheDocument();
  });
});
