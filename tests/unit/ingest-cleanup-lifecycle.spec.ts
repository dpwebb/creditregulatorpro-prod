import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
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

import { cleanupArtifactOnly } from "../../helpers/ingestCleanup";

function deleteBuilder(table: string) {
  const builder: Record<string, any> = {};
  builder.where = vi.fn(() => builder);
  builder.execute = vi.fn(async () => {
    if (table === "passExtraction") {
      throw new Error("SHOULD_NOT_STORE_RAW_REPORT_TEXT raw report text account number 4111111111111111");
    }
    return [];
  });
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
    mocks.db.deleteFrom.mockImplementation((table: string) => deleteBuilder(table));
    mocks.getLatestIngestProcessingJobForArtifact.mockResolvedValue({
      id: 9001,
      status: "running",
      attemptCount: 1,
      actorUserId: 12,
    });
    mocks.recordIngestProcessingJobEvent.mockResolvedValue({});
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records cleanup attempt and failed cleanup events without raw bytes or extracted text", async () => {
    await expect(cleanupArtifactOnly(77)).resolves.toBeUndefined();

    const eventTypes = mocks.recordIngestProcessingJobEvent.mock.calls.map((call) => call[0].eventType);
    expect(eventTypes).toEqual(["cleanup_attempted", "cleanup_failed"]);
    expect(mocks.recordIngestProcessingJobEvent.mock.calls[0][0]).toMatchObject({
      jobId: 9001,
      details: expect.objectContaining({
        artifactId: 77,
        cleanupMode: "artifact_only_cleanup",
        destructiveCleanupPath: true,
        operatorDestructiveDeleteDefault: false,
        auditHistoryDeleted: false,
        rawReportBytesLogged: false,
        extractedReportTextLogged: false,
      }),
    });
    expect(mocks.recordIngestProcessingJobEvent.mock.calls[1][0]).toMatchObject({
      jobId: 9001,
      eventType: "cleanup_failed",
      errorCode: "INGEST_CLEANUP_FAILED",
      errorReason: "Ingest cleanup step failed.",
    });
    assertNoSensitiveLeak(mocks.recordIngestProcessingJobEvent.mock.calls);
    assertNoSensitiveLeak((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls);
  });
});
