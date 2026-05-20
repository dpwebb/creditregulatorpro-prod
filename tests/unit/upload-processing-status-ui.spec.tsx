import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  CreditFileProcessingStatus,
  isUploadActionDisabled,
} from "../../pages/upload";

describe("credit file upload processing status UI", () => {
  it("renders queued backend status as a user-friendly processing state", () => {
    render(
      <CreditFileProcessingStatus
        progress={{ stage: "queued", percent: 12, message: "Report processing has been queued." }}
        displayedProgress={12}
      />,
    );

    expect(screen.getByText("Processing your credit file")).toBeInTheDocument();
    expect(screen.getByText("Your file has been received. The system is reviewing it now. Please keep this page open until processing completes.")).toBeInTheDocument();
    expect(screen.getByText("This may take a few moments.")).toBeInTheDocument();
    expect(screen.getByLabelText("Processing credit file")).toBeInTheDocument();
    expect(screen.queryByText(/queued/i)).not.toBeInTheDocument();
  });

  it("renders running backend status as a waiting state", () => {
    render(
      <CreditFileProcessingStatus
        progress={{ stage: "running", percent: 35 }}
        displayedProgress={35}
        isCheckingStatus
      />,
    );

    expect(screen.getByText("Processing your credit file")).toBeInTheDocument();
    expect(screen.getByText("Your file has been received. The system is reviewing it now. Please keep this page open until processing completes.")).toBeInTheDocument();
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
    render(
      <CreditFileProcessingStatus
        progress={null}
        displayedProgress={0}
        outcome={{
          type: "failure",
          message: "Processing could not be completed. Please retry or contact support.",
        }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Processing could not be completed. Please retry or contact support.");
  });
});
