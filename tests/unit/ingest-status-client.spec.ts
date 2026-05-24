import { afterEach, describe, expect, it, vi } from "vitest";
import { getIngestProcessingStatus, type OutputType } from "../../endpoints/ingest/status_GET.schema";

function statusOutput(overrides: Partial<OutputType> = {}): OutputType {
  return {
    ok: true,
    artifactId: 701,
    jobId: 9101,
    status: "queued_waiting_for_worker",
    queueStatus: "queued",
    processingStatus: "queued",
    nextAction: "wait_for_worker",
    userMessage: "Your report is uploaded and waiting for analysis to begin.",
    diagnosticCode: "INGEST_QUEUED_WAITING_FOR_WORKER",
    workerRequired: true,
    canLeavePage: true,
    canCheckStatus: true,
    retryAt: null,
    checkedAt: "2026-05-21T16:31:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ingest status client", () => {
  it("requests upload processing status without browser caching", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(statusOutput()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getIngestProcessingStatus({ artifactId: 701 })).resolves.toEqual(statusOutput());
    expect(fetchMock).toHaveBeenCalledWith(
      "/_api/ingest/status?artifactId=701",
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
      }),
    );
  });
});
