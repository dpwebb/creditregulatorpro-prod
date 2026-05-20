import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    selectFrom: vi.fn(),
    updateTable: vi.fn(),
    deleteFrom: vi.fn(),
  },
  getLatestIngestProcessingJobForArtifact: vi.fn(),
  recordIngestProcessingJobEvent: vi.fn(),
}));

vi.mock("../../helpers/db", () => ({
  db: mocks.db,
}));

vi.mock("../../helpers/ingestProcessingQueueService", () => ({
  getLatestIngestProcessingJobForArtifact: mocks.getLatestIngestProcessingJobForArtifact,
  recordIngestProcessingJobEvent: mocks.recordIngestProcessingJobEvent,
}));

import {
  cleanupArtifactOnly,
  cleanupFailedIngest,
  detectIngestCleanupProductionEnvironment,
} from "../../helpers/ingestCleanup";

let currentArtifactData: Record<string, unknown>;
let updatePayloads: Array<Record<string, unknown>>;

function selectBuilder(table: string) {
  const builder: Record<string, any> = {};
  builder.select = vi.fn(() => builder);
  builder.where = vi.fn(() => builder);
  builder.execute = vi.fn(async () => {
    if (table === "packet" || table === "obligationInstance") return [];
    return [];
  });
  builder.executeTakeFirst = vi.fn(async () => {
    if (table === "reportArtifact") {
      return {
        data: currentArtifactData,
      };
    }
    return null;
  });
  return builder;
}

function updateBuilder(table: string) {
  const builder: Record<string, any> = {};
  builder.set = vi.fn((payload: Record<string, unknown>) => {
    updatePayloads.push({ table, ...payload });
    if (table === "reportArtifact" && payload.data && typeof payload.data === "object") {
      currentArtifactData = payload.data as Record<string, unknown>;
    }
    return builder;
  });
  builder.where = vi.fn(() => builder);
  builder.execute = vi.fn(async () => []);
  return builder;
}

function deleteBuilder() {
  const builder: Record<string, any> = {};
  builder.where = vi.fn(() => builder);
  builder.execute = vi.fn(async () => []);
  return builder;
}

function assertNoSensitiveLeak(value: unknown) {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain("SHOULD_NOT_STORE_RAW_REPORT_TEXT");
  expect(serialized).not.toContain("4111111111111111");
  expect(serialized).not.toMatch(/raw report text|raw pdf text|full credit report|storageUrl|storage_url|bytesBase64|pdfBase64/i);
}

describe("ingest cleanup lifecycle visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentArtifactData = {
      marker: "synthetic-cleanup-test",
      extractionStatus: "ready",
    };
    updatePayloads = [];
    mocks.db.selectFrom.mockImplementation((table: string) => selectBuilder(table));
    mocks.db.updateTable.mockImplementation((table: string) => updateBuilder(table));
    mocks.db.deleteFrom.mockImplementation(() => deleteBuilder());
    mocks.getLatestIngestProcessingJobForArtifact.mockResolvedValue({
      id: 9001,
      status: "running",
      attemptCount: 1,
      actorUserId: 12,
    });
    mocks.recordIngestProcessingJobEvent.mockResolvedValue({});
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("marks failed cleanup lifecycle without deleting report artifacts", async () => {
    await expect(cleanupArtifactOnly(77, { now: () => new Date("2026-05-20T12:00:00.000Z") })).resolves.toBeUndefined();

    expect(mocks.db.deleteFrom).not.toHaveBeenCalled();
    expect(mocks.db.updateTable).toHaveBeenCalledWith("reportArtifact");
    expect(updatePayloads[0]).toMatchObject({
      table: "reportArtifact",
      processingStatus: "failed",
    });
    expect(updatePayloads[0].data).toMatchObject({
      extractionStatus: "ready",
      failedIngestCleanup: {
        state: "remediation_required",
        remediationRequired: true,
        cleanupRequired: true,
        cleanupMode: "artifact_only_cleanup",
        artifactId: 77,
        tradelineCount: 0,
        destructiveCleanupDefault: false,
        destructiveDeletionUsed: false,
        preservedForOperatorReview: true,
      },
    });

    expect(mocks.recordIngestProcessingJobEvent).toHaveBeenCalledWith(expect.objectContaining({
      jobId: 9001,
      eventType: "cleanup_attempted",
      details: expect.objectContaining({
        artifactId: 77,
        cleanupMode: "artifact_only_cleanup",
        cleanupDisposition: "non_destructive_remediation",
        remediationRequired: true,
        cleanupRequired: true,
        preservedForOperatorReview: true,
        destructiveCleanupPath: false,
        destructiveDeletionUsed: false,
        operatorDestructiveDeleteDefault: false,
      }),
    }));
    assertNoSensitiveLeak(mocks.recordIngestProcessingJobEvent.mock.calls);
  });

  it("preserves tradelines and related violation-search records by default", async () => {
    await expect(cleanupFailedIngest(88, [101, 102], {
      now: () => new Date("2026-05-20T12:00:00.000Z"),
    })).resolves.toBeUndefined();

    expect(mocks.db.deleteFrom).not.toHaveBeenCalled();
    expect(updatePayloads[0].data).toMatchObject({
      failedIngestCleanup: expect.objectContaining({
        cleanupMode: "full_failed_ingest_cleanup",
        tradelineCount: 2,
        preservedForOperatorReview: true,
      }),
    });
    expect(mocks.recordIngestProcessingJobEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "cleanup_attempted",
      details: expect.objectContaining({
        tradelineCount: 2,
        destructiveCleanupPath: false,
        auditHistoryDeleted: false,
      }),
    }));
  });

  it("keeps remediation marking idempotent and bounded", async () => {
    const now = () => new Date("2026-05-20T12:00:00.000Z");

    await cleanupFailedIngest(99, [301], { now });
    await cleanupFailedIngest(99, [301], { now });

    expect(mocks.db.deleteFrom).not.toHaveBeenCalled();
    expect(updatePayloads).toHaveLength(2);
    expect(currentArtifactData.failedIngestCleanup).toMatchObject({
      markerVersion: "failed-ingest-remediation-v1",
      state: "remediation_required",
      firstMarkedAt: "2026-05-20T12:00:00.000Z",
      lastMarkedAt: "2026-05-20T12:00:00.000Z",
      tradelineCount: 1,
      destructiveDeletionUsed: false,
    });
    expect(Array.isArray((currentArtifactData.failedIngestCleanup as Record<string, unknown>).events)).toBe(false);
  });

  it("requires explicit confirmation before destructive artifact cleanup", async () => {
    await expect(cleanupArtifactOnly(77, {
      destructive: true,
      env: { CRP_ENV: "local" },
    })).rejects.toThrow(/confirmDestructive=true/i);

    expect(mocks.db.deleteFrom).not.toHaveBeenCalled();

    await expect(cleanupArtifactOnly(77, {
      destructive: true,
      confirmDestructive: true,
      env: { CRP_ENV: "local" },
    })).resolves.toBeUndefined();

    const deletedTables = mocks.db.deleteFrom.mock.calls.map((call) => call[0]);
    expect(deletedTables).toContain("reportArtifact");
    expect(mocks.recordIngestProcessingJobEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "cleanup_attempted",
      details: expect.objectContaining({
        cleanupDisposition: "destructive_delete",
        destructiveCleanupPath: true,
      }),
    }));
    expect(mocks.recordIngestProcessingJobEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "operator_remediation_action",
      details: expect.objectContaining({
        cleanupCompleted: true,
        destructiveDeletionUsed: true,
      }),
    }));
  });

  it("refuses destructive cleanup in production-like environments", async () => {
    expect(detectIngestCleanupProductionEnvironment({ CRP_ENV: "production" })).toMatchObject({
      productionLike: true,
    });

    await expect(cleanupArtifactOnly(77, {
      destructive: true,
      confirmDestructive: true,
      env: { DATABASE_URL: "postgres://host/creditregulatorpro-prod" },
    })).rejects.toThrow(/production-like environment/i);

    expect(mocks.db.deleteFrom).not.toHaveBeenCalled();
  });

  it("keeps failed ingest handler out of automatic evidence-event deletion", () => {
    const source = readFileSync(resolve("helpers/ingestReportHandler.tsx"), "utf8");

    expect(source).not.toContain('deleteFrom("evidenceEvent")');
    expect(source).toContain("cleanupFailedIngest(artifactId, context.createdTradelineIds)");
  });
});
