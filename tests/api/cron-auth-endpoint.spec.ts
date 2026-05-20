import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  scheduledToken: "synthetic-scheduled-scan-cron-token",
  retentionToken: "synthetic-retention-auto-purge-cron-token",
  legacyJwtSecret: "legacy-jwt-secret-substring-token-should-fail",
  deriveCronSecret: vi.fn((label: string) => {
    if (label === "regulation-registry-scan-cron") return "synthetic-scheduled-scan-cron-token";
    if (label === "retention-auto-purge-cron") return "synthetic-retention-auto-purge-cron-token";
    return `unexpected-${label}`;
  }),
  runRegulationUpdateScan: vi.fn(),
  previewRetention: vi.fn(),
  enforceRetention: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("../../helpers/cronSecret", () => ({
  deriveCronSecret: mocks.deriveCronSecret,
}));

vi.mock("../../helpers/regulationRegistryService", () => ({
  runRegulationUpdateScan: mocks.runRegulationUpdateScan,
}));

vi.mock("../../helpers/dataRetention", () => ({
  previewRetention: mocks.previewRetention,
  enforceRetention: mocks.enforceRetention,
}));

vi.mock("../../helpers/auditLogger", () => ({
  logAudit: mocks.logAudit,
}));

import { handle as scheduledScan } from "../../endpoints/regulation-registry/scheduled-scan_POST";
import { handle as retentionAutoPurge } from "../../endpoints/retention/auto-purge_POST";

function postRequest(path: string, token?: string, body: unknown = {}): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: JSON.stringify(body),
  });
}

function retentionSummary() {
  return {
    deletedPassExtractions: 0,
    deletedBankruptcyRecords: 0,
    deletedDiscriminationClaims: 0,
    deletedObligationChallengeLogs: 0,
    deletedTradelinePaymentHistories: 0,
    deletedPacketComplianceAudits: 0,
    deletedDeadlineEvents: 0,
    deletedEvidenceAttachments: 0,
    deletedSuccessMetrics: 0,
    deletedMetro2Logs: 0,
    deletedObligationInstances: 0,
    deletedEvidenceEvents: 0,
    deletedPackets: 0,
    deletedCreditorObligationTests: 0,
    deletedReportArtifacts: 0,
    deletedTradelines: 0,
    success: true,
    message: "Synthetic retention purge completed.",
  };
}

describe("cron route bearer authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runRegulationUpdateScan.mockResolvedValue({
      inserted: 0,
      skipped: 0,
      errors: [],
      candidateIds: [],
    });
    mocks.previewRetention.mockResolvedValue({
      ...retentionSummary(),
      message: "Synthetic retention preview completed.",
    });
    mocks.enforceRetention.mockResolvedValue(retentionSummary());
    mocks.logAudit.mockResolvedValue(undefined);
  });

  it("accepts scheduled regulation scan bearer token", async () => {
    const response = await scheduledScan(
      postRequest("/_api/regulation-registry/scheduled-scan", mocks.scheduledToken),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      inserted: 0,
      skipped: 0,
      errors: [],
      candidateIds: [],
    });
    expect(mocks.runRegulationUpdateScan).toHaveBeenCalledWith({
      mode: "scheduled",
      triggeredByUserId: null,
      fetchConfiguredSources: true,
      sourceDocuments: [],
    });
  });

  it("rejects scheduled regulation scan query token and missing token", async () => {
    const queryToken = await scheduledScan(
      new Request(`http://localhost/_api/regulation-registry/scheduled-scan?token=${mocks.scheduledToken}`, {
        method: "POST",
        body: "{}",
      }),
    );
    expect(queryToken.status).toBe(401);

    const missingToken = await scheduledScan(postRequest("/_api/regulation-registry/scheduled-scan"));
    expect(missingToken.status).toBe(401);
    expect(mocks.runRegulationUpdateScan).not.toHaveBeenCalled();
    await expect(queryToken.json()).resolves.toEqual({ error: "Unauthorized: Invalid or missing token" });
    await expect(missingToken.json()).resolves.toEqual({ error: "Unauthorized: Invalid or missing token" });
  });

  it("defaults retention auto-purge bearer token to preview without deleting", async () => {
    const response = await retentionAutoPurge(
      postRequest("/_api/retention/auto-purge", mocks.retentionToken),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      message: "Synthetic retention preview completed.",
    });
    expect(mocks.previewRetention).toHaveBeenCalledTimes(1);
    expect(mocks.enforceRetention).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("rejects retention auto-purge apply without explicit confirmation", async () => {
    const response = await retentionAutoPurge(
      postRequest("/_api/retention/auto-purge", mocks.retentionToken, { mode: "apply" }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("Retention apply requires confirmation"),
    });
    expect(mocks.previewRetention).not.toHaveBeenCalled();
    expect(mocks.enforceRetention).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("accepts retention auto-purge apply with bearer token and explicit confirmation", async () => {
    const response = await retentionAutoPurge(
      postRequest("/_api/retention/auto-purge", mocks.retentionToken, {
        mode: "apply",
        confirmation: "APPLY_RETENTION_PURGE",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      message: "Synthetic retention purge completed.",
    });
    expect(mocks.previewRetention).not.toHaveBeenCalled();
    expect(mocks.enforceRetention).toHaveBeenCalledWith(true);
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "DELETE",
        entityType: "REPORT_ARTIFACT",
        userId: 0,
        status: "SUCCESS",
        details: expect.objectContaining({
          operation: "AUTOMATED_RETENTION_PURGE",
          explicitConfirmation: true,
        }),
      }),
    );
  });

  it("rejects retention auto-purge query token, missing token, and legacy JWT substring token", async () => {
    const queryToken = await retentionAutoPurge(
      new Request(`http://localhost/_api/retention/auto-purge?token=${mocks.retentionToken}`, {
        method: "POST",
        body: "{}",
      }),
    );
    expect(queryToken.status).toBe(401);

    const missingToken = await retentionAutoPurge(postRequest("/_api/retention/auto-purge"));
    expect(missingToken.status).toBe(401);

    const legacyToken = await retentionAutoPurge(
      postRequest("/_api/retention/auto-purge", mocks.legacyJwtSecret.substring(0, 32)),
    );
    expect(legacyToken.status).toBe(401);

    expect(mocks.enforceRetention).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
    await expect(queryToken.json()).resolves.toEqual({ error: "Unauthorized: Invalid or missing token" });
    await expect(missingToken.json()).resolves.toEqual({ error: "Unauthorized: Invalid or missing token" });
    await expect(legacyToken.json()).resolves.toEqual({ error: "Unauthorized: Invalid or missing token" });
  });
});
