import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueuedProcessingOutputType } from "../../endpoints/ingest/report_POST.schema";
import type { OutputType as IngestProcessingStatusOutput } from "../../endpoints/ingest/status_GET.schema";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  uploadReportMutate: vi.fn(),
  getIngestProcessingStatus: vi.fn(),
  postProcess: vi.fn(),
  getUploadResults: vi.fn(),
  toastSuccess: vi.fn(),
  toastInfo: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  };
});

vi.mock("../../helpers/useAuth", () => ({
  useAuth: () => ({
    authState: {
      type: "authenticated",
      user: { id: 10, email: "consumer@example.test", role: "user" },
    },
  }),
}));

vi.mock("../../helpers/uploadQueries", () => ({
  useUploadReport: () => ({
    mutate: mocks.uploadReportMutate,
    isPending: false,
    error: null,
  }),
}));

vi.mock("../../endpoints/ingest/status_GET.schema", () => ({
  getIngestProcessingStatus: mocks.getIngestProcessingStatus,
}));

vi.mock("../../endpoints/ingest/process_POST.schema", () => ({
  postProcess: mocks.postProcess,
}));

vi.mock("../../endpoints/upload-results/get_GET.schema", () => ({
  getUploadResults: mocks.getUploadResults,
}));

vi.mock("sonner", () => ({
  toast: {
    success: mocks.toastSuccess,
    info: mocks.toastInfo,
    error: mocks.toastError,
  },
}));

import UploadPage, { nextStatusCheckCountdownSeconds } from "../../pages/upload";

class ImmediateFileReader {
  result: string | ArrayBuffer | null = "data:application/pdf;base64,JVBERi0xLjQK";
  onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;
  onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;

  readAsDataURL() {
    this.onload?.call(this as unknown as FileReader, {} as ProgressEvent<FileReader>);
  }
}

function queuedOutput(overrides: Partial<QueuedProcessingOutputType> = {}): QueuedProcessingOutputType {
  return {
    ok: true,
    queued: true,
    artifactId: 701,
    storageUrl: "701",
    jobId: 9101,
    queueStatus: "queued",
    processingStatus: "queued",
    uploadStatus: "queued_waiting_for_worker",
    nextAction: "wait_for_worker",
    userMessage: "Your report is uploaded and waiting for analysis to begin. You do not need to stay on this page; results will appear in your account when analysis is complete.",
    diagnosticCode: "INGEST_QUEUED_WAITING_FOR_WORKER",
    workerRequired: true,
    duplicate: false,
    retryAt: null,
    errorCode: null,
    errorReason: null,
    message: "Report processing has been queued.",
    ...overrides,
  };
}

function statusOutput(overrides: Partial<IngestProcessingStatusOutput> = {}): IngestProcessingStatusOutput {
  return {
    ok: true,
    artifactId: 701,
    jobId: 9101,
    status: "queued_waiting_for_worker",
    queueStatus: "queued",
    processingStatus: "queued",
    nextAction: "wait_for_worker",
    userMessage: "Your report is uploaded and waiting for analysis to begin. You do not need to stay on this page; results will appear in your account when analysis is complete.",
    diagnosticCode: "INGEST_QUEUED_WAITING_FOR_WORKER",
    workerRequired: true,
    canLeavePage: true,
    canCheckStatus: true,
    retryAt: null,
    checkedAt: "2026-05-21T16:31:00.000Z",
    ...overrides,
  };
}

function renderUploadPage() {
  return render(
    <MemoryRouter>
      <UploadPage />
    </MemoryRouter>,
  );
}

async function uploadQueuedReport() {
  mocks.uploadReportMutate.mockImplementationOnce((_input, options) => {
    options?.onSuccess?.(queuedOutput());
  });

  renderUploadPage();
  const file = new File(["%PDF-1.4 synthetic"], "Transunion David Webb Consumer Disclosure.pdf", {
    type: "application/pdf",
  });
  fireEvent.change(screen.getByLabelText(/Choose Your File/i), {
    target: { files: [file] },
  });
  fireEvent.click(screen.getByRole("button", { name: "Upload My Report" }));

  await waitFor(() => expect(mocks.uploadReportMutate).toHaveBeenCalledTimes(1));
  expect((await screen.findAllByText("Waiting for analysis to start")).length).toBeGreaterThan(0);
}

async function uploadQueuedReportWithAct() {
  mocks.uploadReportMutate.mockImplementationOnce((_input, options) => {
    options?.onSuccess?.(queuedOutput());
  });

  renderUploadPage();
  const file = new File(["%PDF-1.4 synthetic"], "Transunion David Webb Consumer Disclosure.pdf", {
    type: "application/pdf",
  });

  await act(async () => {
    fireEvent.change(screen.getByLabelText(/Choose Your File/i), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Upload My Report" }));
  });

  expect(mocks.uploadReportMutate).toHaveBeenCalledTimes(1);
  expect(screen.getAllByText("Waiting for analysis to start").length).toBeGreaterThan(0);
}

beforeEach(() => {
  vi.stubGlobal("FileReader", ImmediateFileReader);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("upload processing resume flow", () => {
  it("caps the visible next-check countdown at the configured interval", () => {
    expect(nextStatusCheckCountdownSeconds({
      nextStatusCheckAt: 9_000,
      statusClockNow: 0,
      intervalMs: 8_000,
    })).toBe(8);
  });

  it("counts down to the scheduled queued-status refresh instead of resetting during the waiting card", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-21T16:31:00.000Z"));
    mocks.getIngestProcessingStatus.mockResolvedValue(statusOutput());
    mocks.postProcess.mockResolvedValue(queuedOutput());

    await uploadQueuedReportWithAct();
    expect(screen.getByText("Next check in: 8 seconds")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(7_000);
    });
    expect(screen.getByText("Next check in: 1 second")).toBeInTheDocument();
    expect(mocks.getIngestProcessingStatus).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(mocks.getIngestProcessingStatus).toHaveBeenCalledWith({ artifactId: 701 });
    expect(mocks.postProcess).toHaveBeenCalledWith({ artifactId: 701 });
  });

  it("refreshes status and resumes queued processing when Check now sees resumable work", async () => {
    mocks.getIngestProcessingStatus.mockResolvedValueOnce(statusOutput());
    mocks.postProcess.mockResolvedValueOnce(queuedOutput({
      queueStatus: "running",
      processingStatus: "processing",
      uploadStatus: "processing",
      userMessage: "Analysis is running. This usually takes a few moments.",
      message: "Analysis is running. This usually takes a few moments.",
    }));

    await uploadQueuedReport();
    fireEvent.click(screen.getByRole("button", { name: "Check now" }));

    await waitFor(() => expect(mocks.getIngestProcessingStatus).toHaveBeenCalledWith({ artifactId: 701 }));
    await waitFor(() => expect(mocks.postProcess).toHaveBeenCalledWith({ artifactId: 701 }));
    expect(await screen.findByText("Analysis is running. This usually takes a few moments.")).toBeInTheDocument();
  });

  it("shows backend failure instead of retrying a terminal failed status", async () => {
    mocks.getIngestProcessingStatus.mockResolvedValueOnce(statusOutput({
      ok: false,
      status: "failed",
      queueStatus: "failed",
      processingStatus: "failed",
      nextAction: "check_status",
      userMessage: "Processing could not be completed. Please upload the report again or contact support if the problem continues.",
      diagnosticCode: "INGEST_PROCESSING_FAILED",
    }));

    await uploadQueuedReport();
    fireEvent.click(screen.getByRole("button", { name: "Check now" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Processing could not be completed. Please upload the report again or contact support if the problem continues.");
    expect(mocks.postProcess).not.toHaveBeenCalled();
  });
});
