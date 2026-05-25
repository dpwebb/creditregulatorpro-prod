import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  listState: {
    data: { artifacts: [], total: 0 },
    isFetching: false,
    error: null as Error | null,
  },
  createArtifact: vi.fn(),
  deleteArtifact: vi.fn(),
}));

vi.mock("../../helpers/reportArtifactQueries", () => ({
  useReportArtifactList: () => mocks.listState,
  useCreateReportArtifact: () => ({ mutate: mocks.createArtifact, isPending: false }),
  useDeleteReportArtifact: () => ({ mutate: mocks.deleteArtifact, isPending: false }),
}));

vi.mock("../../helpers/tradelineQueries", () => ({
  useTradelineList: () => ({ data: { tradelines: [] } }),
}));

vi.mock("../../components/BureauBadge", () => ({
  BureauBadge: ({ bureauName }: { bureauName?: string | null }) => (
    <span>{bureauName || "Unknown bureau"}</span>
  ),
}));

import ReportArtifactsPage from "../../pages/report-artifacts";

function renderPage() {
  return render(
    <MemoryRouter>
      <ReportArtifactsPage />
    </MemoryRouter>,
  );
}

function artifact(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 991,
    artifactType: "credit_report",
    reportDate: "2026-05-20T00:00:00.000Z",
    metro2Version: null,
    sha256: "synthetic-sha",
    createdAt: "2026-05-20T00:00:00.000Z",
    userId: 42,
    organizationId: null,
    region: "CA",
    tradelineId: null,
    crrgYear: null,
    expiresAt: null,
    validationRulesApplied: null,
    processingStatus: "completed",
    fileName: "TransUnion report.pdf",
    tradelineAccountNumber: null,
    tradelineAccountType: null,
    linkedAccountCount: 2,
    bureauName: "TransUnion",
    storageStatus: "available",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listState = {
    data: { artifacts: [], total: 0 },
    isFetching: false,
    error: null,
  };
});

afterEach(() => {
  cleanup();
});

describe("ReportArtifactsPage", () => {
  it("renders a friendly empty state for a verified user with no report artifacts", () => {
    renderPage();

    expect(screen.getByText("No files uploaded yet.")).toBeInTheDocument();
    expect(screen.getByText("Upload a credit report to start reviewing your accounts.")).toBeInTheDocument();
    expect(screen.queryByText("Error loading report artifacts. Please try again.")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upload Report" })).toHaveAttribute("href", "/upload");
  });

  it("renders valid artifacts normally", () => {
    mocks.listState = {
      data: { artifacts: [artifact()], total: 1 },
      isFetching: false,
      error: null,
    };

    renderPage();

    expect(screen.getByText("TransUnion report.pdf")).toBeInTheDocument();
    expect(screen.getByText("Analysis complete")).toBeInTheDocument();
    expect(screen.getByText("2 accounts found")).toBeInTheDocument();
    expect(screen.getByTitle("View Results")).toHaveAttribute("href", "/upload-results/991");
  });

  it("renders stale artifacts as item-level unavailable instead of crashing the tab", () => {
    mocks.listState = {
      data: { artifacts: [artifact({ storageStatus: "missing" })], total: 1 },
      isFetching: false,
      error: null,
    };

    renderPage();

    expect(screen.getByText("TransUnion report.pdf")).toBeInTheDocument();
    expect(screen.getByText("File unavailable")).toBeInTheDocument();
    expect(screen.getByTitle("File unavailable")).toBeDisabled();
    expect(screen.queryByText("Error loading report artifacts. Please try again.")).not.toBeInTheDocument();
  });
});
