import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  logAudit: vi.fn(async () => ({ success: true })),
}));

vi.mock("../../helpers/auditLogger", () => ({
  logAudit: mocks.logAudit,
}));

import {
  buildProductionObservabilityThresholds,
  recordStorageFailureMetric,
  thresholdStatus,
  type ProductionObservabilityMetrics,
} from "../../helpers/productionObservabilityMetrics";

function metricsFixture(overrides: Partial<Omit<ProductionObservabilityMetrics, "thresholds">> = {}) {
  return {
    generatedAt: "2026-05-20T00:00:00.000Z",
    lookbackHours: 24,
    ingest: {
      available: true,
      queuedJobs: 25,
      runningJobs: 1,
      succeededJobs: 10,
      failedJobs: 0,
      deadLetteredJobs: 0,
      staleRunningJobs: 0,
      retryBacklogJobs: 0,
      oldestQueuedAgeSeconds: 0,
      ocrParsingStartedEvents: 2,
      complianceScanStartedEvents: 2,
      averageOcrParsingDurationMs: 1200,
      totalOcrPageCount: 8,
    },
    ocrParser: {
      artifactsObserved: 10,
      ocrSucceededArtifacts: 2,
      ocrFailureCount: 0,
      parserFailureCount: 0,
      parserUncertaintyCount: 0,
      parserIssueCount: 0,
    },
    packetPdf: {
      renderAttemptEvents: 5,
      renderSucceededEvents: 5,
      renderFailedEvents: 0,
      cacheHitEvents: 3,
    },
    storage: {
      failureEvents: 0,
      readFailures: 0,
      writeFailures: 0,
      deleteFailures: 0,
      latestFailureAt: null,
    },
    auth: {
      loginSuccessEvents: 10,
      loginFailureEvents: 0,
      loginAttemptFailures: 0,
    },
    db: {
      poolMax: 3,
      idleTimeoutSeconds: 10,
      latencyMs: 50,
      activeConnections: 2,
    },
    rateLimit: {
      activeEntries: 0,
      maxObservedCount: 0,
    },
    boundaries: {
      noRawPdfBytes: true,
      noRawExtractedText: true,
      noFullConsumerPii: true,
      noSecretsTokensOrCookies: true,
      aggregateCountsOnly: true,
      storageObjectNamesHashed: true,
      businessLogicMutated: false,
      parserOutputMutated: false,
      violationTruthMutated: false,
      packetReadinessMutated: false,
      responseQueueSemanticsMutated: false,
    },
    ...overrides,
  } satisfies Omit<ProductionObservabilityMetrics, "thresholds">;
}

describe("production observability metrics", () => {
  it("classifies thresholds as OK, Warning, or Critical", () => {
    expect(thresholdStatus(0, 1, 3)).toBe("OK");
    expect(thresholdStatus(1, 1, 3)).toBe("Warning");
    expect(thresholdStatus(3, 1, 3)).toBe("Critical");
    expect(thresholdStatus(1, 1, 1)).toBe("Critical");

    const thresholds = buildProductionObservabilityThresholds(metricsFixture());
    expect(thresholds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "ingest_queued_jobs",
          label: "Ingest queued jobs",
          value: 25,
          status: "Warning",
          warning: 25,
          critical: 100,
        }),
        expect.objectContaining({
          key: "packet_pdf_failures",
          value: 0,
          status: "OK",
        }),
      ]),
    );
  });

  it("records storage failure metrics as sanitized aggregate audit events", async () => {
    const error = new Error("storage write failed for %PDF raw report text Bearer secret-token");
    (error as NodeJS.ErrnoException).code = "EACCES";

    await recordStorageFailureMetric({
      operation: "write",
      provider: "local_document_storage",
      storageArea: "packet_pdf",
      objectName: "packet-pdfs/123/456/consumer-name-credit-report.pdf",
      error,
    });

    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
    const audit = mocks.logAudit.mock.calls[0][0];
    expect(audit).toMatchObject({
      action: "SYSTEM_CHANGE",
      entityType: "SYSTEM",
      status: "FAILURE",
      errorMessage: "storage_write_failed:permission_denied",
    });
    expect(audit.details).toMatchObject({
      metric: "storage_failure",
      operation: "write",
      provider: "local_document_storage",
      storagearea: "packet_pdf",
      failurecategory: "permission_denied",
      errorcode: "eacces",
      rawpdfbyteslogged: false,
      rawextractedtextlogged: false,
      fullconsumerpiilogged: false,
      secretstokensorcookieslogged: false,
    });

    const serialized = JSON.stringify(audit);
    expect(serialized).toContain("objectreferencehash");
    expect(serialized).not.toContain("consumer-name-credit-report.pdf");
    expect(serialized).not.toMatch(/%PDF|raw report text|Bearer|secret-token/i);
  });
});
