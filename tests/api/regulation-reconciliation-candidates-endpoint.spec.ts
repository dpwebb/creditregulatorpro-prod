import { beforeEach, describe, expect, it, vi } from "vitest";

import { BusinessRuleError } from "../../helpers/endpointErrorHandler";

const mocks = vi.hoisted(() => ({
  getServerUserSession: vi.fn(),
  createReconciliationCandidatesFromFindings: vi.fn(),
  listRegulationReconciliationCandidates: vi.fn(),
  updateRegulationReconciliationCandidateStatus: vi.fn(),
}));

vi.mock("../../helpers/getServerUserSession", () => ({
  getServerUserSession: mocks.getServerUserSession,
}));

vi.mock("../../helpers/regulationReconciliationCandidateService", () => ({
  createReconciliationCandidatesFromFindings: mocks.createReconciliationCandidatesFromFindings,
  listRegulationReconciliationCandidates: mocks.listRegulationReconciliationCandidates,
  updateRegulationReconciliationCandidateStatus: mocks.updateRegulationReconciliationCandidateStatus,
}));

import { handle as createCandidates } from "../../endpoints/regulation-registry/reconciliation-candidates/create_POST";
import { handle as listCandidates } from "../../endpoints/regulation-registry/reconciliation-candidates/list_GET";
import { handle as updateCandidateStatus } from "../../endpoints/regulation-registry/reconciliation-candidates/update-status_POST";

function postRequest(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function getRequest(path: string) {
  return new Request(`http://localhost${path}`, { method: "GET" });
}

function finding() {
  return {
    staticReferenceId: "PIPEDA_4_6",
    mismatchType: "missing_db_registry_record",
    severity: "high",
    message: "Static runtime reference PIPEDA_4_6 has no matching DB governance registry record.",
    recommendedAction: "Review as inert governance candidate.",
    staticSnapshotHash: "static-hash",
    dbSnapshotHash: "db-hash",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.getServerUserSession.mockResolvedValue({
    user: { id: 10, role: "admin" },
  });
  mocks.createReconciliationCandidatesFromFindings.mockResolvedValue({
    createdCandidates: [{ id: 1, activeStatus: "inert", reviewStatus: "pending_review" }],
    existingCandidates: [],
  });
  mocks.listRegulationReconciliationCandidates.mockResolvedValue([
    {
      id: 1,
      candidateType: "missing_db_registry_record_candidate",
      reviewStatus: "pending_review",
      activeStatus: "inert",
    },
  ]);
  mocks.updateRegulationReconciliationCandidateStatus.mockResolvedValue({
    id: 1,
    reviewStatus: "needs_source",
    activeStatus: "inert",
  });
});

describe("regulation reconciliation candidate endpoints", () => {
  it("blocks non-admin candidate creation before service work", async () => {
    mocks.getServerUserSession.mockResolvedValueOnce({
      user: { id: 11, role: "user" },
    });

    const response = await createCandidates(
      postRequest("/_api/regulation-registry/reconciliation-candidates/create", {
        findings: [finding()],
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.createReconciliationCandidatesFromFindings).not.toHaveBeenCalled();
  });

  it("blocks non-admin candidate listing before service work", async () => {
    mocks.getServerUserSession.mockResolvedValueOnce({
      user: { id: 11, role: "user" },
    });

    const response = await listCandidates(
      getRequest("/_api/regulation-registry/reconciliation-candidates/list"),
    );

    expect(response.status).toBe(403);
    expect(mocks.listRegulationReconciliationCandidates).not.toHaveBeenCalled();
  });

  it("blocks non-admin status updates before service work", async () => {
    mocks.getServerUserSession.mockResolvedValueOnce({
      user: { id: 11, role: "user" },
    });

    const response = await updateCandidateStatus(
      postRequest("/_api/regulation-registry/reconciliation-candidates/update-status", {
        candidateId: 1,
        reviewStatus: "needs_source",
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.updateRegulationReconciliationCandidateStatus).not.toHaveBeenCalled();
  });

  it("lets admins create candidates from supplied reconciliation findings", async () => {
    const response = await createCandidates(
      postRequest("/_api/regulation-registry/reconciliation-candidates/create", {
        reconciliationRunId: "api-run-1",
        findings: [finding()],
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      createdCandidates: [{ id: 1, activeStatus: "inert", reviewStatus: "pending_review" }],
      existingCandidates: [],
    });
    expect(mocks.createReconciliationCandidatesFromFindings).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: 10,
        reconciliationRunId: "api-run-1",
        findings: [expect.objectContaining({ mismatchType: "missing_db_registry_record" })],
      }),
    );
  });

  it("keeps duplicate create idempotent through existing candidate reuse", async () => {
    mocks.createReconciliationCandidatesFromFindings.mockResolvedValueOnce({
      createdCandidates: [],
      existingCandidates: [{ id: 1, activeStatus: "inert", reviewStatus: "pending_review" }],
    });

    const response = await createCandidates(
      postRequest("/_api/regulation-registry/reconciliation-candidates/create", {
        reconciliationRunId: "api-run-duplicate",
        findings: [finding()],
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      createdCandidates: [],
      existingCandidates: [{ id: 1, activeStatus: "inert", reviewStatus: "pending_review" }],
    });
  });

  it("lets admins list and filter inert candidates", async () => {
    const response = await listCandidates(
      getRequest(
        "/_api/regulation-registry/reconciliation-candidates/list?candidateType=missing_db_registry_record_candidate&severity=high&reviewStatus=pending_review&staticReferenceId=PIPEDA_4_6",
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      candidates: [
        {
          id: 1,
          candidateType: "missing_db_registry_record_candidate",
          reviewStatus: "pending_review",
          activeStatus: "inert",
        },
      ],
    });
    expect(mocks.listRegulationReconciliationCandidates).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateType: "missing_db_registry_record_candidate",
        severity: "high",
        reviewStatus: "pending_review",
        staticReferenceId: "PIPEDA_4_6",
      }),
    );
  });

  it("lets admins update status without runtime activation parameters", async () => {
    const response = await updateCandidateStatus(
      postRequest("/_api/regulation-registry/reconciliation-candidates/update-status", {
        candidateId: 1,
        reviewStatus: "approved_for_mapping_review",
        reviewNotes: "Approved for later review only.",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      candidate: {
        id: 1,
        reviewStatus: "needs_source",
        activeStatus: "inert",
      },
    });
    expect(mocks.updateRegulationReconciliationCandidateStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: 1,
        reviewStatus: "approved_for_mapping_review",
        reviewNotes: "Approved for later review only.",
        adminUserId: 10,
      }),
    );
    expect(JSON.stringify(mocks.updateRegulationReconciliationCandidateStatus.mock.calls[0][0])).not.toMatch(
      /activate|runtime|mappingIdToActivate|regulationRecordIdToActivate/i,
    );
  });

  it("surfaces rejected-reason validation from the inert service", async () => {
    mocks.updateRegulationReconciliationCandidateStatus.mockRejectedValueOnce(
      new BusinessRuleError("Rejected reconciliation candidates require a rejectedReason"),
    );

    const response = await updateCandidateStatus(
      postRequest("/_api/regulation-registry/reconciliation-candidates/update-status", {
        candidateId: 1,
        reviewStatus: "rejected",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Rejected reconciliation candidates require a rejectedReason",
    });
  });

  it("does not expose any endpoint path that activates runtime mapping", async () => {
    await updateCandidateStatus(
      postRequest("/_api/regulation-registry/reconciliation-candidates/update-status", {
        candidateId: 1,
        reviewStatus: "approved_for_registry_update",
        reviewNotes: "Approved for later registry review only.",
      }),
    );

    expect(mocks.updateRegulationReconciliationCandidateStatus).toHaveBeenCalledWith(
      expect.not.objectContaining({
        activeStatus: "active",
        reviewStatus: "approved",
      }),
    );
  });
});
