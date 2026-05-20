import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = Record<string, unknown> | null;

const mocks = vi.hoisted(() => ({
  getServerUserSession: vi.fn(),
  previewRetention: vi.fn(),
  enforceRetention: vi.fn(),
  logAudit: vi.fn(),
  queryQueue: [] as QueryResult[],
  selectTables: [] as string[],
  db: {
    selectFrom: vi.fn(),
    fn: {
      count: vi.fn(() => ({ as: vi.fn((alias: string) => alias) })),
    },
  },
}));

vi.mock("../../helpers/getServerUserSession", () => ({
  getServerUserSession: mocks.getServerUserSession,
}));

vi.mock("../../helpers/dataRetention", () => ({
  previewRetention: mocks.previewRetention,
  enforceRetention: mocks.enforceRetention,
}));

vi.mock("../../helpers/auditLogger", () => ({
  logAudit: mocks.logAudit,
}));

vi.mock("../../helpers/db", () => ({
  db: mocks.db,
}));

import { handle as retentionAdmin } from "../../endpoints/admin/retention_POST";
import { handle as retentionStats } from "../../endpoints/admin/retention/stats_GET";

function retentionSummary(message: string) {
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
    message,
  };
}

function postAdminRetention(body: unknown = {}) {
  return new Request("http://localhost/_api/admin/retention", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function getAdminStats() {
  return new Request("http://localhost/_api/admin/retention/stats", {
    method: "GET",
  });
}

function makeSelectBuilder(result: QueryResult) {
  const builder: Record<string, any> = {};
  for (const method of ["select", "where", "orderBy", "limit"] as const) {
    builder[method] = vi.fn(() => builder);
  }
  builder.executeTakeFirst = vi.fn(async () => result);
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queryQueue.length = 0;
  mocks.selectTables.length = 0;
  mocks.getServerUserSession.mockResolvedValue({
    user: { id: 101, role: "admin", email: "synthetic.admin@example.invalid" },
  });
  mocks.previewRetention.mockResolvedValue(retentionSummary("Synthetic retention preview completed."));
  mocks.enforceRetention.mockResolvedValue(retentionSummary("Synthetic retention apply completed."));
  mocks.logAudit.mockResolvedValue({ success: true });
  mocks.db.selectFrom.mockImplementation((table: string) => {
    mocks.selectTables.push(table);
    return makeSelectBuilder(mocks.queryQueue.shift() ?? null);
  });
});

describe("retention preview/apply guard", () => {
  it("defaults admin retention requests to preview without deleting", async () => {
    const response = await retentionAdmin(postAdminRetention());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      message: "Synthetic retention preview completed.",
    });
    expect(mocks.previewRetention).toHaveBeenCalledTimes(1);
    expect(mocks.enforceRetention).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("rejects destructive admin apply without explicit confirmation", async () => {
    const applyWithoutConfirmation = await retentionAdmin(postAdminRetention({ mode: "apply" }));
    expect(applyWithoutConfirmation.status).toBe(400);
    await expect(applyWithoutConfirmation.json()).resolves.toMatchObject({
      error: expect.stringContaining("Retention apply requires confirmation"),
    });

    const legacyConfirmOnly = await retentionAdmin(postAdminRetention({ confirmDelete: true }));
    expect(legacyConfirmOnly.status).toBe(400);

    expect(mocks.previewRetention).not.toHaveBeenCalled();
    expect(mocks.enforceRetention).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("allows destructive admin apply with explicit confirmation and records audit evidence", async () => {
    const response = await retentionAdmin(postAdminRetention({
      mode: "apply",
      confirmation: "APPLY_RETENTION_PURGE",
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      message: "Synthetic retention apply completed.",
    });
    expect(mocks.previewRetention).not.toHaveBeenCalled();
    expect(mocks.enforceRetention).toHaveBeenCalledWith(true);
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "DELETE",
        entityType: "REPORT_ARTIFACT",
        userId: 101,
        status: "SUCCESS",
        details: expect.objectContaining({
          operation: "MANUAL_RETENTION_ENFORCEMENT",
          explicitConfirmation: true,
        }),
      }),
    );
  });

  it("keeps retention stats available for admins", async () => {
    mocks.queryQueue.push(
      { count: "2" },
      { count: "3" },
      { count: "4" },
      { count: "5" },
      { timestamp: new Date("2026-05-20T10:00:00.000Z") },
    );

    const response = await retentionStats(getAdminStats());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      eligibleForDeletion: 14,
      breakdown: [
        { table: "report_artifact", count: 2 },
        { table: "tradeline", count: 3 },
        { table: "packet", count: 4 },
        { table: "evidence_event", count: 5 },
      ],
      lastRun: "2026-05-20T10:00:00.000Z",
    });
    expect(mocks.selectTables).toEqual([
      "reportArtifact",
      "tradeline",
      "packet",
      "evidenceEvent",
      "auditLog",
    ]);
  });
});
