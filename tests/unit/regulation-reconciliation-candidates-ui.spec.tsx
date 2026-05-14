import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useRegulationRegistry: vi.fn(),
  useRegulationCandidates: vi.fn(),
  useRegulationMappings: vi.fn(),
  useCreateRegulationCandidate: vi.fn(),
  useReviewRegulationCandidate: vi.fn(),
  useDeactivateRegulation: vi.fn(),
  useRestoreRegulation: vi.fn(),
  useRebuildRegulationIndex: vi.fn(),
  useScanRegulationRegistry: vi.fn(),
  useSaveRegulationMapping: vi.fn(),
  useRegulationReconciliationCandidates: vi.fn(),
  useUpdateRegulationReconciliationCandidateStatus: vi.fn(),
  useRuntimeBridgeMappings: vi.fn(),
  useUpdateRuntimeBridgeMappingStatus: vi.fn(),
  updateStatus: vi.fn(),
  listCandidates: [] as unknown[],
  detailCandidates: [] as unknown[],
}));

vi.mock("../../helpers/useRegulationRegistry", () => ({
  useRegulationRegistry: mocks.useRegulationRegistry,
  useRegulationCandidates: mocks.useRegulationCandidates,
  useRegulationMappings: mocks.useRegulationMappings,
  useCreateRegulationCandidate: mocks.useCreateRegulationCandidate,
  useReviewRegulationCandidate: mocks.useReviewRegulationCandidate,
  useDeactivateRegulation: mocks.useDeactivateRegulation,
  useRestoreRegulation: mocks.useRestoreRegulation,
  useRebuildRegulationIndex: mocks.useRebuildRegulationIndex,
  useScanRegulationRegistry: mocks.useScanRegulationRegistry,
  useSaveRegulationMapping: mocks.useSaveRegulationMapping,
  useRegulationReconciliationCandidates: mocks.useRegulationReconciliationCandidates,
  useUpdateRegulationReconciliationCandidateStatus: mocks.useUpdateRegulationReconciliationCandidateStatus,
  useRuntimeBridgeMappings: mocks.useRuntimeBridgeMappings,
  useUpdateRuntimeBridgeMappingStatus: mocks.useUpdateRuntimeBridgeMappingStatus,
}));

import RegulatoryUpdatesPage from "../../pages/regulatory-updates";
import { RegulationReconciliationCandidatesTab } from "../../components/RegulationReconciliationCandidatesTab";

const candidate = {
  id: 7,
  candidateType: "citation_mismatch_candidate",
  sourceFindingType: "citation_mismatch",
  staticReferenceId: "PIPEDA_4_6",
  dbRegulationId: "db-pipeda-46",
  dbMappingId: 3,
  deterministicRuleId: "rule-pipeda-46",
  jurisdiction: "Federal",
  category: "credit_reporting",
  mismatchSummary: "Static citation does not match DB governance citation.",
  sourceUrl: "https://example.test/source",
  citation: "PIPEDA Schedule 1, 4.6",
  effectiveDate: "2026-01-02T00:00:00.000Z",
  staticSnapshotHash: "static-hash",
  dbSnapshotHash: "db-hash",
  reconciliationRunId: "run-2026-05-13",
  mismatchHash: "mismatch-hash",
  severity: "high",
  reviewStatus: "pending_review",
  activeStatus: "inert",
  createdAt: "2026-05-13T12:00:00.000Z",
  reviewedAt: null,
};

const detailCandidate = {
  ...candidate,
  oldValue: {
    title: "Static PIPEDA reference",
    rawExtractedText: "should not render",
    sin: "123-456-789",
  },
  proposedValue: {
    title: "DB PIPEDA reference",
    recommendedAction: "Review the citation mismatch.",
    accountNumber: "123456789012",
  },
};

function resetHookMocks() {
  mocks.listCandidates = [candidate];
  mocks.detailCandidates = [detailCandidate];
  mocks.updateStatus.mockResolvedValue({ candidate: detailCandidate });
  mocks.useRegulationRegistry.mockReturnValue({ data: { regulations: [] }, isLoading: false });
  mocks.useRegulationCandidates.mockReturnValue({ data: { candidates: [] }, isLoading: false });
  mocks.useRegulationMappings.mockReturnValue({ data: { mappings: [] }, isLoading: false });
  mocks.useCreateRegulationCandidate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  mocks.useReviewRegulationCandidate.mockReturnValue({ mutate: vi.fn(), isPending: false });
  mocks.useDeactivateRegulation.mockReturnValue({ mutate: vi.fn(), isPending: false });
  mocks.useRestoreRegulation.mockReturnValue({ mutate: vi.fn(), isPending: false });
  mocks.useRebuildRegulationIndex.mockReturnValue({ mutate: vi.fn(), isPending: false });
  mocks.useScanRegulationRegistry.mockReturnValue({ mutate: vi.fn(), isPending: false });
  mocks.useSaveRegulationMapping.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  mocks.useRegulationReconciliationCandidates.mockImplementation((_filters: unknown, options?: { enabled?: boolean }) => ({
    data: { candidates: options?.enabled ? mocks.detailCandidates : mocks.listCandidates },
    isLoading: false,
    error: null,
  }));
  mocks.useUpdateRegulationReconciliationCandidateStatus.mockReturnValue({
    mutateAsync: mocks.updateStatus,
    isPending: false,
  });
  mocks.useRuntimeBridgeMappings.mockReturnValue({ data: { mappings: [] }, isLoading: false, error: null });
  mocks.useUpdateRuntimeBridgeMappingStatus.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetHookMocks();
});

describe("regulation reconciliation candidates admin UI", () => {
  it("adds the Reconciliation Candidates tab to the regulatory updates page", () => {
    render(<RegulatoryUpdatesPage />);

    expect(screen.getByRole("tab", { name: "Reconciliation Candidates" })).toBeInTheDocument();
  });

  it("renders candidates and sends list filters to the reconciliation list hook", async () => {
    render(<RegulationReconciliationCandidatesTab />);

    expect(screen.getByText("Static citation does not match DB governance citation.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Candidate type filter"), {
      target: { value: "citation_mismatch_candidate" },
    });
    fireEvent.change(screen.getByLabelText("Severity filter"), { target: { value: "high" } });
    fireEvent.change(screen.getByLabelText("Review status filter"), {
      target: { value: "pending_review" },
    });
    fireEvent.change(screen.getByLabelText("Static reference ID filter"), {
      target: { value: "PIPEDA_4_6" },
    });
    fireEvent.change(screen.getByLabelText("DB regulation ID filter"), {
      target: { value: "db-pipeda-46" },
    });
    fireEvent.change(screen.getByLabelText("Deterministic rule ID filter"), {
      target: { value: "rule-pipeda-46" },
    });
    fireEvent.change(screen.getByLabelText("Reconciliation run ID filter"), {
      target: { value: "run-2026-05-13" },
    });

    await waitFor(() => {
      expect(mocks.useRegulationReconciliationCandidates.mock.calls).toEqual(
        expect.arrayContaining([
          [
            expect.objectContaining({
              candidateType: "citation_mismatch_candidate",
              severity: "high",
              reviewStatus: "pending_review",
              staticReferenceId: "PIPEDA_4_6",
              dbRegulationId: "db-pipeda-46",
              deterministicRuleId: "rule-pipeda-46",
              reconciliationRunId: "run-2026-05-13",
            }),
          ],
        ]),
      );
    });
  });

  it("shows detail data, sanitized snapshots, and inert safety messaging", async () => {
    render(<RegulationReconciliationCandidatesTab />);

    fireEvent.click(screen.getByRole("button", { name: /view details/i }));

    expect(await screen.findByText("Candidate #7")).toBeInTheDocument();
    expect(screen.getAllByText("Static citation does not match DB governance citation.").length).toBeGreaterThan(0);
    expect(screen.getByText("Static reference snapshot")).toBeInTheDocument();
    expect(screen.getByText("DB governance snapshot")).toBeInTheDocument();
    expect(screen.getByText("Review the citation mismatch.")).toBeInTheDocument();
    expect(screen.getAllByText("inert").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Review actions do not change runtime references/i).length).toBeGreaterThan(0);
    expect(screen.queryByText("should not render")).not.toBeInTheDocument();
    expect(screen.queryByText("123-456-789")).not.toBeInTheDocument();
    expect(screen.queryByText("123456789012")).not.toBeInTheDocument();
  });

  it("submits needs_source as a review-only status update", async () => {
    render(<RegulationReconciliationCandidatesTab />);

    fireEvent.click(screen.getByRole("button", { name: /view details/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Mark Needs Source" }));

    await waitFor(() => {
      expect(mocks.updateStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          candidateId: 7,
          reviewStatus: "needs_source",
        }),
      );
    });
  });

  it("requires notes and confirmation before approval-for-review actions", async () => {
    render(<RegulationReconciliationCandidatesTab />);

    fireEvent.click(screen.getByRole("button", { name: /view details/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Approve for Mapping Review" }));

    expect(await screen.findByText("Approval-for-review actions require review notes.")).toBeInTheDocument();
    expect(mocks.updateStatus).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Review notes"), {
      target: { value: "Reviewed for later mapping analysis only." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Approve for Registry Update Review" }));

    expect(await screen.findByText("Confirm that this action does not activate runtime regulation truth.")).toBeInTheDocument();
    expect(mocks.updateStatus).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText("I understand this does not activate runtime regulation truth."));
    fireEvent.click(screen.getByRole("button", { name: "Approve for Registry Update Review" }));

    await waitFor(() => {
      expect(mocks.updateStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          candidateId: 7,
          reviewStatus: "approved_for_registry_update",
          reviewNotes: "Reviewed for later mapping analysis only.",
        }),
      );
    });
  });

  it("requires a rejected reason before rejection", async () => {
    render(<RegulationReconciliationCandidatesTab />);

    fireEvent.click(screen.getByRole("button", { name: /view details/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));

    expect(await screen.findByText("Rejected reconciliation candidates require a rejected reason.")).toBeInTheDocument();
    expect(mocks.updateStatus).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Rejected reason"), {
      target: { value: "Insufficient source support." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    await waitFor(() => {
      expect(mocks.updateStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          candidateId: 7,
          reviewStatus: "rejected",
          rejectedReason: "Insufficient source support.",
        }),
      );
    });
  });

  it("does not add runtime activation controls or wire unsafe endpoint helpers", () => {
    render(<RegulationReconciliationCandidatesTab />);

    expect(screen.queryByRole("button", { name: /^Activate$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Make Runtime Truth/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Apply to Runtime/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Enforce$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Legal Violation/i })).not.toBeInTheDocument();

    const componentSource = readFileSync(
      join(process.cwd(), "components", "RegulationReconciliationCandidatesTab.tsx"),
      "utf8",
    );
    expect(componentSource).not.toMatch(/postRegulationCandidateReview|useReviewRegulationCandidate/);
    expect(componentSource).not.toMatch(/postRegulationMapping|useSaveRegulationMapping/);
    expect(componentSource).not.toMatch(/useDeactivateRegulation|useRestoreRegulation/);
    expect(componentSource).not.toMatch(/approveRegulationCandidate|upsertRegulationViolationMapping/);
  });
});
