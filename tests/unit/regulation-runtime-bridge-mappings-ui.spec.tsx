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
  listMappings: [] as unknown[],
  detailMappings: [] as unknown[],
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
import { RegulationRuntimeBridgeMappingsTab } from "../../components/RegulationRuntimeBridgeMappingsTab";

const mapping = {
  id: 77,
  bridgeMode: "shadow",
  activationStatus: "draft",
  deterministicRuleId: "UI_RULE_77",
  violationCategory: "UI_CATEGORY",
  staticReferenceId: "UI_STATIC_REF",
  dbRegulationId: "UI_DB_REF",
  dbMappingId: 12,
  referenceClass: "local_procedural",
  consumerWordingMode: "procedural_reference",
  rollbackStaticReferenceId: "UI_ROLLBACK_STATIC_REF",
  activationReason: "Governance review only.",
  sourceVersion: "ui-test-source",
  staticSnapshotHash: "static-hash",
  dbSnapshotHash: "db-hash",
  approvedBy: null,
  approvedAt: null,
  activatedBy: null,
  activatedAt: null,
  deactivatedBy: null,
  deactivatedAt: null,
  rollbackBy: null,
  rollbackAt: null,
  createdAt: "2026-05-14T12:00:00.000Z",
  updatedAt: "2026-05-14T12:30:00.000Z",
};

const detailMapping = {
  ...mapping,
  testManifest: {
    expectedRuntimeSource: "static_runtime",
    accountNumber: "123456789012",
    packetContent: "should not render",
  },
};

function resetHookMocks() {
  mocks.listMappings = [mapping];
  mocks.detailMappings = [detailMapping];
  mocks.updateStatus.mockResolvedValue({ mapping: detailMapping });
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
  mocks.useRegulationReconciliationCandidates.mockReturnValue({ data: { candidates: [] }, isLoading: false, error: null });
  mocks.useUpdateRegulationReconciliationCandidateStatus.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  mocks.useRuntimeBridgeMappings.mockImplementation((filters: { includeTestManifest?: boolean } = {}, options?: { enabled?: boolean }) => ({
    data: { mappings: filters.includeTestManifest && options?.enabled !== false ? mocks.detailMappings : mocks.listMappings },
    isLoading: false,
    error: null,
  }));
  mocks.useUpdateRuntimeBridgeMappingStatus.mockReturnValue({
    mutateAsync: mocks.updateStatus,
    isPending: false,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetHookMocks();
});

describe("regulation runtime bridge mappings admin UI", () => {
  it("adds the Runtime Bridge Mappings tab to the regulatory updates page", () => {
    render(<RegulatoryUpdatesPage />);

    expect(screen.getByRole("tab", { name: "Runtime Bridge Mappings" })).toBeInTheDocument();
  });

  it("renders mappings and sends supported list filters to the runtime bridge list hook", async () => {
    render(<RegulationRuntimeBridgeMappingsTab />);

    expect(screen.getByText("UI_RULE_77")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Bridge mode filter"), { target: { value: "shadow" } });
    fireEvent.change(screen.getByLabelText("Activation status filter"), { target: { value: "draft" } });
    fireEvent.change(screen.getByLabelText("Reference class filter"), { target: { value: "local_procedural" } });
    fireEvent.change(screen.getByLabelText("Consumer wording mode filter"), { target: { value: "procedural_reference" } });
    fireEvent.change(screen.getByLabelText("Deterministic rule ID filter"), { target: { value: "UI_RULE_77" } });
    fireEvent.change(screen.getByLabelText("Violation category filter"), { target: { value: "UI_CATEGORY" } });
    fireEvent.change(screen.getByLabelText("Static reference ID filter"), { target: { value: "UI_STATIC_REF" } });
    fireEvent.change(screen.getByLabelText("DB regulation ID filter"), { target: { value: "UI_DB_REF" } });
    fireEvent.change(screen.getByLabelText("DB mapping ID filter"), { target: { value: "12" } });

    await waitFor(() => {
      expect(mocks.useRuntimeBridgeMappings.mock.calls).toEqual(
        expect.arrayContaining([
          [
            expect.objectContaining({
              bridgeMode: "shadow",
              activationStatus: "draft",
              deterministicRuleId: "UI_RULE_77",
              violationCategory: "UI_CATEGORY",
              staticReferenceId: "UI_STATIC_REF",
              dbRegulationId: "UI_DB_REF",
              dbMappingId: 12,
              referenceClass: "local_procedural",
              consumerWordingMode: "procedural_reference",
            }),
          ],
        ]),
      );
    });
  });

  it("opens detail with safety messaging, bridge metadata, sanitized manifest summary, and rollback data", async () => {
    render(<RegulationRuntimeBridgeMappingsTab />);

    fireEvent.click(screen.getByRole("button", { name: /view details/i }));

    expect(await screen.findByText("Mapping #77")).toBeInTheDocument();
    expect(screen.getAllByText(/This mapping is governance-only/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Static runtime references remain active/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Governance summary")).toBeInTheDocument();
    expect(screen.getAllByText("UI_STATIC_REF").length).toBeGreaterThan(0);
    expect(screen.getAllByText("UI_DB_REF").length).toBeGreaterThan(0);
    expect(screen.getAllByText("UI_ROLLBACK_STATIC_REF").length).toBeGreaterThan(0);
    expect(screen.getByText("static_runtime")).toBeInTheDocument();
    expect(screen.queryByText("123456789012")).not.toBeInTheDocument();
    expect(screen.queryByText("should not render")).not.toBeInTheDocument();
  });

  it("validates review notes for shadow and advisory approvals and calls update-status for allowed actions", async () => {
    render(<RegulationRuntimeBridgeMappingsTab />);

    fireEvent.click(screen.getByRole("button", { name: /view details/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Approve for Shadow" }));

    expect(await screen.findByText("This review action requires review notes.")).toBeInTheDocument();
    expect(mocks.updateStatus).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Review notes"), {
      target: { value: "Reviewed for shadow only." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Approve for Shadow" }));

    await waitFor(() => {
      expect(mocks.updateStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          mappingId: 77,
          activationStatus: "approved_for_shadow",
          activationReason: "Reviewed for shadow only.",
        }),
      );
    });

    fireEvent.change(screen.getByLabelText("Review notes"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Approve for Advisory" }));
    expect(await screen.findByText("This review action requires review notes.")).toBeInTheDocument();
  });

  it("requires notes, rollback reference, test manifest, and confirmation for limited-runtime review", async () => {
    mocks.detailMappings = [{ ...mapping, testManifest: null }];
    render(<RegulationRuntimeBridgeMappingsTab />);

    fireEvent.click(screen.getByRole("button", { name: /view details/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Approve for Limited Runtime Review" }));

    expect(await screen.findByText("This review action requires review notes.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Review notes"), {
      target: { value: "Future limited runtime review only." },
    });
    fireEvent.change(screen.getByLabelText("Rollback static reference"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Approve for Limited Runtime Review" }));
    expect(await screen.findByText("Limited runtime review requires rollbackStaticReferenceId.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Rollback static reference"), {
      target: { value: "UI_ROLLBACK_STATIC_REF" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Approve for Limited Runtime Review" }));
    expect(await screen.findByText("Limited runtime review requires testManifest.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Limited runtime review test manifest"), {
      target: { value: "{\"expectedRuntimeSource\":\"static_runtime\"}" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Approve for Limited Runtime Review" }));
    expect(await screen.findByText("Confirm that this action does not activate runtime regulation truth.")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("I understand this does not activate runtime regulation truth."));
    fireEvent.click(screen.getByRole("button", { name: "Approve for Limited Runtime Review" }));

    await waitFor(() => {
      expect(mocks.updateStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          mappingId: 77,
          activationStatus: "approved_for_limited_runtime",
          activationReason: "Future limited runtime review only.",
          rollbackStaticReferenceId: "UI_ROLLBACK_STATIC_REF",
          testManifest: { expectedRuntimeSource: "static_runtime" },
        }),
      );
    });
  });

  it("requires a rejected reason before rejection", async () => {
    render(<RegulationRuntimeBridgeMappingsTab />);

    fireEvent.click(screen.getByRole("button", { name: /view details/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));

    expect(await screen.findByText("Rejected runtime bridge mappings require rejectedReason.")).toBeInTheDocument();
    expect(mocks.updateStatus).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Rejected reason"), {
      target: { value: "Not equivalent." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    await waitFor(() => {
      expect(mocks.updateStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          mappingId: 77,
          activationStatus: "rejected",
          activationReason: "Not equivalent.",
        }),
      );
    });
  });

  it("does not render activation controls or wire unsafe endpoint helpers", async () => {
    render(<RegulationRuntimeBridgeMappingsTab />);
    fireEvent.click(screen.getByRole("button", { name: /view details/i }));
    await screen.findByText("Mapping #77");

    expect(screen.queryByRole("button", { name: /^Activate$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Activate Runtime/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Make Runtime Truth/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Apply to Runtime/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Enforce$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Legal Violation/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Activate Limited Runtime/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Make DB Primary/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Replace Static Reference/i })).not.toBeInTheDocument();

    const componentSource = readFileSync(
      join(process.cwd(), "components", "RegulationRuntimeBridgeMappingsTab.tsx"),
      "utf8",
    );
    expect(componentSource).not.toMatch(/postRuntimeBridgeMappingCreate/);
    expect(componentSource).not.toMatch(/runtime-selector|runtimeSelector|selectRuntimeReference/);
    expect(componentSource).not.toMatch(/useDeactivateRegulation|useRestoreRegulation/);
    expect(componentSource).not.toMatch(/useSaveRegulationMapping|postRegulationMapping/);
    expect(componentSource).not.toMatch(/useReviewRegulationCandidate|postRegulationCandidateReview/);
    expect(componentSource).not.toMatch(/reconciliation-candidates\/create/);
    expect(componentSource).not.toMatch(/approveRegulationCandidate|upsertRegulationViolationMapping/);
  });
});
