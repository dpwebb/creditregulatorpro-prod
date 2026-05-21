import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  CreditFileProcessingStatus,
  isUploadActionDisabled,
} from "../../pages/upload";

describe("credit file upload processing status UI", () => {
  it("renders queued backend status as waiting for worker, not indefinite processing", () => {
    const onCheckStatus = vi.fn();
    render(
      <CreditFileProcessingStatus
        progress={{ stage: "queued", percent: 12, message: "Report processing has been queued." }}
        displayedProgress={12}
        outcome={{
          type: "queued_waiting_for_worker",
          artifactId: 701,
          message: "Your report was received and is waiting for processing. You can leave this page; we'll update your account when processing completes.",
          nextAction: "wait_for_worker",
          diagnosticCode: "INGEST_QUEUED_WAITING_FOR_WORKER",
        }}
        onCheckStatus={onCheckStatus}
      />,
    );

    expect(screen.getByText("Waiting for processing worker")).toBeInTheDocument();
    expect(screen.getByText("Your report was received and is waiting for processing. You can leave this page; we'll update your account when processing completes.")).toBeInTheDocument();
    expect(screen.queryByText(/keep this page open/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check status" }));
    expect(onCheckStatus).toHaveBeenCalledTimes(1);
  });

  it("renders running backend status as active processing", () => {
    render(
      <CreditFileProcessingStatus
        progress={{ stage: "running", percent: 35 }}
        displayedProgress={35}
        isCheckingStatus
      />,
    );

    expect(screen.getByText("Processing your credit file")).toBeInTheDocument();
    expect(screen.getByText("Processing is active. This usually takes a few moments.")).toBeInTheDocument();
    expect(screen.getByText("Checking processing status...")).toBeInTheDocument();
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
        onReviewResults={onReviewResults}
      />,
    );

    expect(screen.getByText("Credit file processed.")).toBeInTheDocument();
    expect(screen.getByText("Review your results.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review your results" }));
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

  it("shows status-check mode when processing goes stale", () => {
    const onCheckStatus = vi.fn();
    render(
      <CreditFileProcessingStatus
        progress={{ stage: "status_check", percent: 99 }}
        displayedProgress={99}
        outcome={{
          type: "stale",
          artifactId: 701,
          message: "Processing is taking longer than expected. Use Check status to refresh, or upload again if this does not change.",
          nextAction: "check_status",
          diagnosticCode: "INGEST_UI_STATUS_CHECK_TIMEOUT",
        }}
        onCheckStatus={onCheckStatus}
      />,
    );

    expect(screen.getByText("Check processing status")).toBeInTheDocument();
    expect(screen.getByText("Processing is taking longer than expected. Use Check status to refresh, or upload again if this does not change.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check status" }));
    expect(onCheckStatus).toHaveBeenCalledTimes(1);
  });
});
