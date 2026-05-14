import { beforeEach, describe, expect, it, vi } from "vitest";

import { BusinessRuleError } from "../../helpers/endpointErrorHandler";

const mocks = vi.hoisted(() => ({
  getServerUserSession: vi.fn(),
  createRuntimeBridgeMappingDraft: vi.fn(),
  listRuntimeBridgeMappings: vi.fn(),
  updateRuntimeBridgeMappingStatus: vi.fn(),
  createReconciliationCandidatesFromFindings: vi.fn(),
  approveRegulationCandidate: vi.fn(),
  upsertRegulationViolationMapping: vi.fn(),
}));

vi.mock("../../helpers/getServerUserSession", () => ({
  getServerUserSession: mocks.getServerUserSession,
}));

vi.mock("../../helpers/regulationRuntimeBridgeMappingService", () => ({
  RUNTIME_BRIDGE_MODES: ["shadow", "advisory", "limited_runtime"],
  RUNTIME_BRIDGE_REFERENCE_CLASSES: [
    "official_law",
    "regulator_guidance",
    "private_standard",
    "local_procedural",
    "internal_only",
  ],
  RUNTIME_BRIDGE_CONSUMER_WORDING_MODES: [
    "review_reference",
    "private_standard_reference",
    "procedural_reference",
    "internal_only",
  ],
  RUNTIME_BRIDGE_ACTIVATION_STATUSES: [
    "draft",
    "approved_for_shadow",
    "approved_for_advisory",
    "approved_for_limited_runtime",
    "active_limited_runtime",
    "paused",
    "rolled_back",
    "rejected",
    "archived",
  ],
  createRuntimeBridgeMappingDraft: mocks.createRuntimeBridgeMappingDraft,
  listRuntimeBridgeMappings: mocks.listRuntimeBridgeMappings,
  updateRuntimeBridgeMappingStatus: mocks.updateRuntimeBridgeMappingStatus,
}));

vi.mock("../../helpers/regulationReconciliationCandidateService", () => ({
  createReconciliationCandidatesFromFindings: mocks.createReconciliationCandidatesFromFindings,
}));

vi.mock("../../helpers/regulationRegistryService", () => ({
  approveRegulationCandidate: mocks.approveRegulationCandidate,
  upsertRegulationViolationMapping: mocks.upsertRegulationViolationMapping,
}));

import { handle as createMapping } from "../../endpoints/regulation-registry/runtime-bridge/create_POST";
import { handle as listMappings } from "../../endpoints/regulation-registry/runtime-bridge/list_GET";
import { handle as updateMappingStatus } from "../../endpoints/regulation-registry/runtime-bridge/update-status_POST";

function postRequest(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function getRequest(path: string) {
  return new Request(`http://localhost${path}`, { method: "GET" });
}

function createBody(overrides: Record<string, unknown> = {}) {
  return {
    bridgeMode: "shadow",
    deterministicRuleId: "deterministic-bridge-test",
    violationCategory: "BALANCE_CALCULATION_VIOLATION",
    staticReferenceId: "PIPEDA_4_6",
    dbRegulationId: "DB_TEST_REFERENCE",
    dbMappingId: 12,
    referenceClass: "official_law",
    consumerWordingMode: "review_reference",
    sourceVersion: "api-runtime-bridge-test",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.getServerUserSession.mockResolvedValue({
    user: { id: 10, role: "admin" },
  });
  mocks.createRuntimeBridgeMappingDraft.mockResolvedValue({
    id: 1,
    bridgeMode: "shadow",
    activationStatus: "draft",
    dbRegulationId: "DB_TEST_REFERENCE",
  });
  mocks.listRuntimeBridgeMappings.mockResolvedValue([
    {
      id: 1,
      bridgeMode: "shadow",
      activationStatus: "draft",
      dbRegulationId: "DB_TEST_REFERENCE",
    },
  ]);
  mocks.updateRuntimeBridgeMappingStatus.mockResolvedValue({
    id: 1,
    bridgeMode: "shadow",
    activationStatus: "approved_for_shadow",
    dbRegulationId: "DB_TEST_REFERENCE",
  });
});

describe("regulation runtime bridge mapping endpoints", () => {
  it("blocks non-admin create, list, and update before service work", async () => {
    mocks.getServerUserSession.mockResolvedValue({
      user: { id: 11, role: "user" },
    });

    const createResponse = await createMapping(
      postRequest("/_api/regulation-registry/runtime-bridge/create", createBody()),
    );
    const listResponse = await listMappings(
      getRequest("/_api/regulation-registry/runtime-bridge/list"),
    );
    const updateResponse = await updateMappingStatus(
      postRequest("/_api/regulation-registry/runtime-bridge/update-status", {
        mappingId: 1,
        activationStatus: "approved_for_shadow",
        activationReason: "Shadow review only.",
      }),
    );

    expect(createResponse.status).toBe(403);
    expect(listResponse.status).toBe(403);
    expect(updateResponse.status).toBe(403);
    expect(mocks.createRuntimeBridgeMappingDraft).not.toHaveBeenCalled();
    expect(mocks.listRuntimeBridgeMappings).not.toHaveBeenCalled();
    expect(mocks.updateRuntimeBridgeMappingStatus).not.toHaveBeenCalled();
  });

  it("lets admins create a draft bridge mapping without runtime activation parameters", async () => {
    const response = await createMapping(
      postRequest("/_api/regulation-registry/runtime-bridge/create", createBody()),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      mapping: {
        id: 1,
        bridgeMode: "shadow",
        activationStatus: "draft",
        dbRegulationId: "DB_TEST_REFERENCE",
      },
    });
    expect(mocks.createRuntimeBridgeMappingDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: 10,
        bridgeMode: "shadow",
        dbRegulationId: "DB_TEST_REFERENCE",
      }),
    );
    expect(mocks.createRuntimeBridgeMappingDraft.mock.calls[0][0]).not.toHaveProperty("activationStatus");
    expect(JSON.stringify(mocks.createRuntimeBridgeMappingDraft.mock.calls[0][0])).not.toMatch(
      /active_limited_runtime|activateRuntime|runtimeSelector/i,
    );
  });

  it("surfaces duplicate logical bridge mappings as a safe conflict", async () => {
    mocks.createRuntimeBridgeMappingDraft.mockRejectedValueOnce(
      new BusinessRuleError("Runtime bridge mapping already exists for this logical tuple", 409),
    );

    const response = await createMapping(
      postRequest("/_api/regulation-registry/runtime-bridge/create", createBody()),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Runtime bridge mapping already exists for this logical tuple",
    });
  });

  it("lets admins list and filter bridge mappings with bounded query options", async () => {
    const response = await listMappings(
      getRequest(
        "/_api/regulation-registry/runtime-bridge/list?bridgeMode=shadow&activationStatus=draft&deterministicRuleId=deterministic-bridge-test&violationCategory=BALANCE_CALCULATION_VIOLATION&staticReferenceId=PIPEDA_4_6&dbRegulationId=DB_TEST_REFERENCE&dbMappingId=12&referenceClass=official_law&consumerWordingMode=review_reference&limit=25",
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      mappings: [
        {
          id: 1,
          bridgeMode: "shadow",
          activationStatus: "draft",
          dbRegulationId: "DB_TEST_REFERENCE",
        },
      ],
    });
    expect(mocks.listRuntimeBridgeMappings).toHaveBeenCalledWith(
      expect.objectContaining({
        bridgeMode: "shadow",
        activationStatus: "draft",
        deterministicRuleId: "deterministic-bridge-test",
        violationCategory: "BALANCE_CALCULATION_VIOLATION",
        staticReferenceId: "PIPEDA_4_6",
        dbRegulationId: "DB_TEST_REFERENCE",
        dbMappingId: 12,
        referenceClass: "official_law",
        consumerWordingMode: "review_reference",
        limit: 25,
      }),
    );
    expect(mocks.listRuntimeBridgeMappings.mock.calls[0][0]).not.toEqual(
      expect.objectContaining({ includeTestManifest: true }),
    );
  });

  it("lets admins update to approved_for_shadow and approved_for_advisory as review-only states", async () => {
    const shadow = await updateMappingStatus(
      postRequest("/_api/regulation-registry/runtime-bridge/update-status", {
        mappingId: 1,
        activationStatus: "approved_for_shadow",
        activationReason: "Approved for shadow review only.",
      }),
    );
    mocks.updateRuntimeBridgeMappingStatus.mockResolvedValueOnce({
      id: 1,
      activationStatus: "approved_for_advisory",
      dbRegulationId: "DB_TEST_REFERENCE",
    });
    const advisory = await updateMappingStatus(
      postRequest("/_api/regulation-registry/runtime-bridge/update-status", {
        mappingId: 1,
        activationStatus: "approved_for_advisory",
        activationReason: "Approved for advisory review only.",
      }),
    );

    expect(shadow.status).toBe(200);
    expect(advisory.status).toBe(200);
    expect(mocks.updateRuntimeBridgeMappingStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        mappingId: 1,
        activationStatus: "approved_for_shadow",
        activationReason: "Approved for shadow review only.",
        adminUserId: 10,
      }),
    );
    expect(mocks.updateRuntimeBridgeMappingStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        mappingId: 1,
        activationStatus: "approved_for_advisory",
        activationReason: "Approved for advisory review only.",
        adminUserId: 10,
      }),
    );
  });

  it("surfaces approved_for_limited_runtime rollback and manifest validation", async () => {
    mocks.updateRuntimeBridgeMappingStatus.mockRejectedValueOnce(
      new BusinessRuleError("approved_for_limited_runtime requires rollbackStaticReferenceId"),
    );
    const missingRollback = await updateMappingStatus(
      postRequest("/_api/regulation-registry/runtime-bridge/update-status", {
        mappingId: 1,
        activationStatus: "approved_for_limited_runtime",
        activationReason: "Future limited runtime review only.",
        testManifest: { expectedRuntimeSource: "static_runtime" },
      }),
    );

    mocks.updateRuntimeBridgeMappingStatus.mockRejectedValueOnce(
      new BusinessRuleError("approved_for_limited_runtime requires testManifest"),
    );
    const missingManifest = await updateMappingStatus(
      postRequest("/_api/regulation-registry/runtime-bridge/update-status", {
        mappingId: 1,
        activationStatus: "approved_for_limited_runtime",
        activationReason: "Future limited runtime review only.",
        rollbackStaticReferenceId: "PIPEDA_4_6",
      }),
    );

    expect(missingRollback.status).toBe(400);
    await expect(missingRollback.json()).resolves.toEqual({
      error: "approved_for_limited_runtime requires rollbackStaticReferenceId",
    });
    expect(missingManifest.status).toBe(400);
    await expect(missingManifest.json()).resolves.toEqual({
      error: "approved_for_limited_runtime requires testManifest",
    });
  });

  it("rejects active_limited_runtime and unknown runtime activation fields", async () => {
    mocks.updateRuntimeBridgeMappingStatus.mockRejectedValueOnce(
      new BusinessRuleError("Runtime bridge activation is unavailable in this governance layer"),
    );
    const active = await updateMappingStatus(
      postRequest("/_api/regulation-registry/runtime-bridge/update-status", {
        mappingId: 1,
        activationStatus: "active_limited_runtime",
        activationReason: "Attempt runtime activation.",
      }),
    );
    expect(active.status).toBe(400);
    await expect(active.json()).resolves.toEqual({
      error: "Runtime bridge activation is unavailable in this governance layer",
    });

    const callsBefore = mocks.updateRuntimeBridgeMappingStatus.mock.calls.length;
    const unknownActivationField = await updateMappingStatus(
      postRequest("/_api/regulation-registry/runtime-bridge/update-status", {
        mappingId: 1,
        activationStatus: "approved_for_shadow",
        activationReason: "Shadow review only.",
        activateRuntimeTruth: true,
      }),
    );

    expect(unknownActivationField.status).toBe(400);
    expect(mocks.updateRuntimeBridgeMappingStatus.mock.calls).toHaveLength(callsBefore);
  });

  it("does not create reconciliation candidates or call existing registry active-state mutation services", async () => {
    await createMapping(
      postRequest("/_api/regulation-registry/runtime-bridge/create", createBody()),
    );
    await listMappings(
      getRequest("/_api/regulation-registry/runtime-bridge/list?dbRegulationId=DB_TEST_REFERENCE"),
    );
    await updateMappingStatus(
      postRequest("/_api/regulation-registry/runtime-bridge/update-status", {
        mappingId: 1,
        activationStatus: "approved_for_shadow",
        activationReason: "Shadow review only.",
      }),
    );

    expect(mocks.createReconciliationCandidatesFromFindings).not.toHaveBeenCalled();
    expect(mocks.approveRegulationCandidate).not.toHaveBeenCalled();
    expect(mocks.upsertRegulationViolationMapping).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.updateRuntimeBridgeMappingStatus.mock.calls)).not.toMatch(
      /mappingIdToActivate|regulationRecordIdToActivate|activeStatus.*active/i,
    );
  });
});
