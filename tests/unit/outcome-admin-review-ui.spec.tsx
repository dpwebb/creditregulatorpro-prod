import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useOutcomeRuns: vi.fn(),
  useOutcomeRun: vi.fn(),
  useOutcomeAdminReviewMutation: vi.fn(),
  reviewMutation: vi.fn(),
  refetchRuns: vi.fn(),
  listRun: null as any,
  detailRun: null as any,
}));

vi.mock("../../helpers/outcomeQueries", () => ({
  useOutcomeRuns: mocks.useOutcomeRuns,
  useOutcomeRun: mocks.useOutcomeRun,
  useOutcomeAdminReviewMutation: mocks.useOutcomeAdminReviewMutation,
}));

import { AdminRoute } from "../../components/ProtectedRoute";
import AdminOutcomeReviewsPage from "../../pages/admin-outcome-reviews";
import pageLayout from "../../pages/admin-outcome-reviews.pageLayout";

const summary = {
  corrected: 1,
  removed: 0,
  unchanged: 0,
  reinserted: 0,
  partiallyCorrected: 0,
  newIssue: 0,
  unresolved: 0,
  needsReview: 0,
  notComparable: 0,
  responseReceived: 0,
};

const finding = {
  id: 501,
  comparisonRunId: 22,
  userId: 1,
  disputePacketId: 12,
  disputePacketFindingId: 13,
  creditorObligationTestId: 14,
  previousTradelineId: 1001,
  laterTradelineId: 1002,
  outcomeType: "corrected",
  confidenceLevel: "high",
  matchingMethod: "exact_account_creditor_date",
  outcomeReasonCodes: ["status_changed"],
  previousSnapshot: {
    creditorName: "OUTCOME_UI_CREDITOR",
    maskedAccountNumber: "****1234",
    accountNumber: "1234567890123456",
    rawReportText: "SHOULD_NOT_RENDER_RAW_REPORT_TEXT",
    sin: "123-456-789",
    status: "OPEN",
  },
  laterSnapshot: {
    creditorName: "OUTCOME_UI_CREDITOR",
    maskedAccountNumber: "****1234",
    status: "CLOSED",
    storageUrl: "s3://secret/path",
  },
  evidenceIds: ["ev-safe"],
  evidenceLocationSnapshot: {
    page: 1,
    boundingBox: { x: 1, y: 2, width: 3, height: 4 },
    signedUrl: "https://example.test/file?x-goog-signature=secret",
  },
  responseDeadlineAt: null,
  responseReceivedAt: null,
  adminReviewStatus: "unreviewed",
  adminReviewNotes: null,
  reviewedBy: null,
  reviewedAt: null,
  reviewEvidenceIds: [],
  reviewSourceVersion: null,
  reviewAction: null,
  reviewUpdatedAt: null,
  createdAt: "2026-05-18T12:00:00.000Z",
  updatedAt: "2026-05-18T12:00:00.000Z",
};

const listRun = {
  id: 22,
  userId: 1,
  previousReportArtifactId: 275,
  laterReportArtifactId: 276,
  packetId: 12,
  bureauId: 7,
  comparisonScope: "packet_findings",
  status: "completed",
  sourceVersion: "outcome-comparison-v1",
  warnings: [],
  createdBy: 1,
  startedAt: "2026-05-18T12:00:00.000Z",
  completedAt: "2026-05-18T12:00:01.000Z",
  createdAt: "2026-05-18T12:00:00.000Z",
  updatedAt: "2026-05-18T12:00:00.000Z",
  adminReviewStatus: "unreviewed",
  adminReviewNotes: null,
  reviewedBy: null,
  reviewedAt: null,
  reviewUpdatedAt: null,
  summary,
};

const detailRun = {
  ...listRun,
  findingOutcomes: [finding],
};

function resetHookMocks() {
  mocks.listRun = listRun;
  mocks.detailRun = detailRun;
  mocks.reviewMutation.mockResolvedValue({ comparisonRun: detailRun });
  mocks.refetchRuns.mockResolvedValue(undefined);
  mocks.useOutcomeRuns.mockImplementation((filters: unknown) => ({
    data: { runs: mocks.listRun ? [mocks.listRun] : [], total: mocks.listRun ? 1 : 0 },
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: mocks.refetchRuns,
    filters,
  }));
  mocks.useOutcomeRun.mockImplementation((comparisonRunId: number | null) => ({
    data: comparisonRunId ? { comparisonRun: mocks.detailRun } : undefined,
    isLoading: false,
    isError: false,
    error: null,
  }));
  mocks.useOutcomeAdminReviewMutation.mockReturnValue({
    mutateAsync: mocks.reviewMutation,
    isPending: false,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetHookMocks();
});

describe("admin outcome review UI", () => {
  it("uses the admin route layout and renders the Outcome Reviews page", () => {
    expect(pageLayout[0]).toBe(AdminRoute);

    render(<AdminOutcomeReviewsPage />);

    expect(screen.getByRole("heading", { name: "Outcome Reviews" })).toBeInTheDocument();
    expect(screen.getByText(/Admin review changes review metadata only/i)).toBeInTheDocument();
    expect(screen.getByText(/Response documents remain evidence only/i)).toBeInTheDocument();
  });

  it("renders loading, empty, and error list states", () => {
    mocks.useOutcomeRuns.mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      isFetching: true,
      isError: false,
      error: null,
      refetch: mocks.refetchRuns,
    });
    const { unmount } = render(<AdminOutcomeReviewsPage />);
    expect(screen.getByText("Comparison Runs")).toBeInTheDocument();
    unmount();

    mocks.useOutcomeRuns.mockReturnValueOnce({
      data: { runs: [], total: 0 },
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: mocks.refetchRuns,
    });
    const emptyRender = render(<AdminOutcomeReviewsPage />);
    expect(screen.getByText("No outcome runs yet")).toBeInTheDocument();
    emptyRender.unmount();

    mocks.useOutcomeRuns.mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: true,
      error: new Error("Synthetic list failure"),
      refetch: mocks.refetchRuns,
    });
    render(<AdminOutcomeReviewsPage />);
    expect(screen.getByText("Unable to load outcome runs")).toBeInTheDocument();
    expect(screen.getByText("Synthetic list failure")).toBeInTheDocument();
  });

  it("renders runs and sends supported filters to the outcome list hook", async () => {
    render(<AdminOutcomeReviewsPage />);

    expect(screen.getByText("Comparison run #22")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Packet ID"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Previous report ID"), { target: { value: "275" } });
    fireEvent.change(screen.getByLabelText("Later report ID"), { target: { value: "276" } });
    fireEvent.change(screen.getByLabelText("Outcome type"), { target: { value: "corrected" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "completed" } });
    fireEvent.change(screen.getByLabelText("Limit"), { target: { value: "25" } });

    await waitFor(() => {
      expect(mocks.useOutcomeRuns).toHaveBeenCalledWith(
        expect.objectContaining({
          packetId: 12,
          previousReportArtifactId: 275,
          laterReportArtifactId: 276,
          outcomeType: "corrected",
          status: "completed",
          limit: 25,
        }),
      );
    });
  });

  it("loads detail, shows deterministic fields, preservation copy, and sanitized snapshots", async () => {
    render(<AdminOutcomeReviewsPage />);

    fireEvent.click(screen.getByRole("button", { name: /view details/i }));

    expect(await screen.findByText("Finding outcome #501")).toBeInTheDocument();
    expect(screen.getAllByText("corrected").length).toBeGreaterThan(0);
    expect(screen.getByText("exact account creditor date")).toBeInTheDocument();
    expect(screen.getByText("high")).toBeInTheDocument();
    expect(screen.getByText("status changed")).toBeInTheDocument();
    expect(screen.getAllByText(/Deterministic outcome fields are preserved/i).length).toBeGreaterThan(0);
    expect(document.body).toHaveTextContent("****1234");
    expect(screen.queryByText("SHOULD_NOT_RENDER_RAW_REPORT_TEXT")).not.toBeInTheDocument();
    expect(screen.queryByText("123-456-789")).not.toBeInTheDocument();
    expect(screen.queryByText("1234567890123456")).not.toBeInTheDocument();
    expect(screen.queryByText("s3://secret/path")).not.toBeInTheDocument();
    expect(screen.queryByText(/x-goog-signature/i)).not.toBeInTheDocument();
  });

  it("submits review_outcome with the correct payload", async () => {
    render(<AdminOutcomeReviewsPage />);

    fireEvent.click(screen.getByRole("button", { name: /view details/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Review Outcome" }));

    await waitFor(() => {
      expect(mocks.reviewMutation).toHaveBeenCalledWith(
        expect.objectContaining({
          comparisonRunId: 22,
          findingOutcomeId: 501,
          reviewAction: "review_outcome",
          reviewNotes: null,
        }),
      );
    });
  });

  it("validates notes and confirmation checkboxes for protected review actions", async () => {
    render(<AdminOutcomeReviewsPage />);

    fireEvent.click(screen.getByRole("button", { name: /view details/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Mark Needs Review" }));
    expect(await screen.findByText("This review action requires review notes.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Review notes"), {
      target: { value: "Confirmed for admin review. Deterministic result preserved." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm for Admin Review" }));
    expect(await screen.findByText("Confirm that this action does not change canonical facts.")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("I understand this does not change canonical facts."));
    fireEvent.click(screen.getByLabelText("I understand this does not activate regulation runtime truth."));
    fireEvent.click(screen.getByLabelText("I understand deterministic outcome fields are preserved."));
    fireEvent.click(screen.getByRole("button", { name: "Confirm for Admin Review" }));

    await waitFor(() => {
      expect(mocks.reviewMutation).toHaveBeenCalledWith(
        expect.objectContaining({
          reviewAction: "confirm_outcome",
          confirmNoCanonicalChange: true,
          confirmNoRuntimeActivation: true,
          confirmNoPacketMutation: true,
        }),
      );
    });

    fireEvent.change(screen.getByLabelText("Review notes"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Reject Match for Review Purposes" }));
    expect(await screen.findByText("This review action requires review notes.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reject Classification for Review Purposes" }));
    expect(await screen.findByText("This review action requires review notes.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Archive Review" }));
    expect(await screen.findByText("This review action requires review notes.")).toBeInTheDocument();
  });

  it("rejects sensitive or legal-conclusion review notes client-side", async () => {
    render(<AdminOutcomeReviewsPage />);

    fireEvent.click(screen.getByRole("button", { name: /view details/i }));
    fireEvent.change(await screen.findByLabelText("Review notes"), {
      target: { value: "SIN 123-456-789 should not be stored." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Mark Needs Review" }));

    expect(await screen.findByText("Review notes must not include full SIN-like values.")).toBeInTheDocument();
    expect(mocks.reviewMutation).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Review notes"), {
      target: { value: "The bureau violated the law." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Mark Needs Review" }));
    expect(await screen.findByText(/must stay neutral/i)).toBeInTheDocument();
  });

  it("does not render unsupported override controls or legal-conclusion labels", async () => {
    render(<AdminOutcomeReviewsPage />);
    fireEvent.click(screen.getByRole("button", { name: /view details/i }));

    await screen.findByText("Finding outcome #501");

    expect(screen.queryByRole("button", { name: /override/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /force outcome/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /make final truth/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^activate$/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/you won/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/entitled to damages/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/confirmed legal violation/i)).not.toBeInTheDocument();
  });

  it("keeps the UI source limited to outcome list, get, and admin-review endpoints", () => {
    const source = [
      readFileSync(join(process.cwd(), "helpers/outcomeQueries.tsx"), "utf8"),
      readFileSync(join(process.cwd(), "pages/admin-outcome-reviews.tsx"), "utf8"),
      readFileSync(join(process.cwd(), "helpers/adminSidebarRoutes.ts"), "utf8"),
      readFileSync(join(process.cwd(), "components/AppLayout.tsx"), "utf8"),
    ].join("\n");

    expect(source).toContain("list_GET.schema");
    expect(source).toContain("get_GET.schema");
    expect(source).toContain("admin-review_POST.schema");
    expect(source).not.toContain("compare_POST.schema");
    expect(source).not.toMatch(/\/_api\/parser|\/_api\/ocr|\/_api\/ingest\/process/i);
    expect(source).not.toMatch(/\/_api\/packet\/(?:readiness|build|create|save|send|delivery|pdf)/i);
    expect(source).not.toMatch(/\/_api\/violations\/run|\/_api\/creditor-validation\/run/i);
    expect(source).not.toMatch(/\/_api\/regulation-registry\/runtime-bridge\/activate/i);
    expect(source).not.toMatch(/\/_api\/admin\/override|\/_api\/furnisher\/packet/i);
    expect(source).not.toMatch(/\/_api\/report-artifact\/(?:create|update)|\/_api\/tradelines\/update/i);
  });
});
