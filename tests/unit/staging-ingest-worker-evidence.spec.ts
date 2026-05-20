import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildStagingIngestWorkerEvidenceReport,
  parseStagingIngestWorkerEvidenceArgs,
  runStagingIngestWorkerEvidence,
  STAGING_INGEST_WORKER_EVIDENCE_JSON_PATH,
  STAGING_INGEST_WORKER_EVIDENCE_MD_PATH,
  validateStagingIngestWorkerEvidenceReport,
  writeStagingIngestWorkerEvidence,
} from "../../scripts/staging-ingest-worker-evidence";

const tempRoots: string[] = [];

function makeTempRoot() {
  const root = mkdtempSync(path.join(tmpdir(), "crp-staging-ingest-evidence-"));
  tempRoots.push(root);
  return root;
}

function globalMetrics(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt: "2026-05-20T12:00:00.000Z",
    queueVersion: "ingest-processing-queue-2026-05-20",
    totalJobs: 0,
    queuedJobs: 0,
    runningJobs: 0,
    succeededJobs: 0,
    failedJobs: 0,
    deadLetteredJobs: 0,
    canceledJobs: 0,
    staleRunningJobs: 0,
    retryBacklogJobs: 0,
    oldestQueuedAgeSeconds: null,
    duplicateEnqueueAttempts: 0,
    cleanupAttemptedEvents: 0,
    cleanupFailedEvents: 0,
    cleanupFailedJobs: 0,
    operatorRemediationEvents: 0,
    deadLetterReviewedJobs: 0,
    staleRunningReviewedJobs: 0,
    lastRemediationStatus: null,
    lastRemediationAt: null,
    boundaries: {
      durableDbBacked: true,
      appendOnlyJobEvents: true,
      noRawReportBytes: true,
      noExtractedReportText: true,
      parserOutputMutated: false,
      ocrBehaviorMutated: false,
      violationTruthMutated: false,
      evidenceBindingMutated: false,
      packetReadinessMutated: false,
      endpointCutoverEnabled: true,
    },
    ...overrides,
  } as any;
}

function scopedMetrics(overrides: Record<string, unknown> = {}) {
  return {
    source: "staging_ingest_evidence_test",
    totalJobs: 0,
    queuedJobs: 0,
    runningJobs: 0,
    succeededJobs: 0,
    failedJobs: 0,
    deadLetteredJobs: 0,
    canceledJobs: 0,
    eligibleJobs: 0,
    staleRunningJobs: 0,
    oldestQueuedAgeSeconds: null,
    jobIds: [],
    statuses: {},
    ...overrides,
  };
}

function lifecycle(overrides: Record<string, unknown> = {}) {
  return {
    totalEvents: 0,
    eventCounts: {},
    claimedEvents: 0,
    succeededEvents: 0,
    retryScheduledEvents: 0,
    deadLetteredEvents: 0,
    cleanupAttemptedEvents: 0,
    cleanupFailedEvents: 0,
    operatorRemediationEvents: 0,
    ...overrides,
  };
}

function validReport() {
  const options = parseStagingIngestWorkerEvidenceArgs([
    "--apply",
    "--max-jobs",
    "2",
    "--confirm-staging-safe",
    "--source",
    "staging_ingest_evidence_test",
  ], {});
  return buildStagingIngestWorkerEvidenceReport({
    options,
    generatedAt: "2026-05-20T12:00:00.000Z",
    branch: "staging",
    commit: "a".repeat(40),
    globalQueueBefore: globalMetrics({ queuedJobs: 2 }),
    globalQueueAfter: globalMetrics({ queuedJobs: 0, succeededJobs: 2 }),
    scopedQueueBeforeCreation: scopedMetrics(),
    scopedQueueBeforeRun: scopedMetrics({
      totalJobs: 2,
      queuedJobs: 2,
      eligibleJobs: 2,
      jobIds: [101, 102],
      statuses: { queued: 2 },
    }),
    scopedQueueAfterRun: scopedMetrics({
      totalJobs: 2,
      succeededJobs: 2,
      jobIds: [101, 102],
      statuses: { succeeded: 2 },
    }),
    lifecycleEvents: lifecycle({
      totalEvents: 8,
      eventCounts: { queued: 2, claimed: 2, ocr_parsing_started: 2, succeeded: 2 },
      claimedEvents: 2,
      succeededEvents: 2,
    }),
    syntheticJobs: [
      { userId: 1, reportArtifactId: 201, jobId: 101 },
      { userId: 2, reportArtifactId: 202, jobId: 102 },
    ],
    workerExitCode: 0,
    capturedWorkerLogLines: 10,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("staging ingest worker evidence", () => {
  it("requires explicit staging confirmation, max job bound, and mode", () => {
    expect(() => parseStagingIngestWorkerEvidenceArgs([], {})).toThrow(/explicit --apply or --dry-run/i);
    expect(() => parseStagingIngestWorkerEvidenceArgs(["--apply", "--confirm-staging-safe"], {}))
      .toThrow(/explicit --max-jobs/i);
    expect(() => parseStagingIngestWorkerEvidenceArgs(["--apply", "--max-jobs", "2"], {}))
      .toThrow(/requires confirmation/i);
  });

  it("refuses production-like environments", () => {
    expect(() =>
      parseStagingIngestWorkerEvidenceArgs(["--apply", "--max-jobs", "1", "--confirm-staging-safe"], {
        CRP_ENV: "production",
      }),
    ).toThrow(/production-like/i);
  });

  it("accepts valid sanitized staging queue-drain evidence with queue metrics", () => {
    const report = validReport();

    expect(report).toMatchObject({
      status: "accepted-staging-queue-drain",
      accepted: true,
      productionProof: false,
      queueDepthBeforeRun: 2,
      queueDepthAfterRun: 0,
      processedCount: 2,
      failedCount: 0,
      deadLetterCount: 0,
      blockerCoverage: {
        blocker2StagingQueueDrain: true,
        blocker2ProductionRuntime: false,
      },
    });
    expect(validateStagingIngestWorkerEvidenceReport(report)).toEqual({ ok: true, errors: [] });
    expect(JSON.stringify(report)).not.toMatch(/%PDF|JVBERi0|postgres:\/\/|Bearer|session=|cookie=/i);
  });

  it("does not accept dry-run evidence as queue-drain closure and does not create synthetic jobs", async () => {
    const options = parseStagingIngestWorkerEvidenceArgs([
      "--dry-run",
      "--max-jobs",
      "1",
      "--confirm-staging-safe",
      "--source",
      "staging_ingest_evidence_empty",
    ], {});
    const createSyntheticJobs = vi.fn();
    const runWorker = vi.fn(async () => 0);
    let scopedCalls = 0;

    const report = await runStagingIngestWorkerEvidence(options, {
      assertNonProductionEnvironment: vi.fn(),
      collectGlobalQueueMetrics: vi.fn(async () => globalMetrics()),
      collectScopedQueueMetrics: vi.fn(async () => {
        scopedCalls += 1;
        return scopedMetrics({ source: "staging_ingest_evidence_empty" });
      }),
      collectLifecycleEvidence: vi.fn(async () => lifecycle()),
      createSyntheticJobs,
      runWorker,
      writeEvidence: vi.fn(),
    } as any);

    expect(scopedCalls).toBe(3);
    expect(createSyntheticJobs).not.toHaveBeenCalled();
    expect(runWorker).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true, apply: false }));
    expect(report.status).toBe("dry-run-only");
    expect(report.accepted).toBe(false);
    expect(report.blockerCoverage.blocker2StagingQueueDrain).toBe(false);
  });

  it("enforces bounded max jobs and rejects unbounded pressure", () => {
    expect(() =>
      parseStagingIngestWorkerEvidenceArgs(["--apply", "--max-jobs", "6", "--confirm-staging-safe"], {}),
    ).toThrow(/between 1 and 5/i);

    const report = {
      ...validReport(),
      processedCount: 3,
      boundedExecution: {
        ...validReport().boundedExecution,
        maxJobs: 2,
      },
    };
    expect(validateStagingIngestWorkerEvidenceReport(report).errors.join("\n")).toMatch(/processedCount/i);
  });

  it("keeps empty queue no-op safe without accepting closure", () => {
    const options = parseStagingIngestWorkerEvidenceArgs([
      "--dry-run",
      "--max-jobs",
      "1",
      "--confirm-staging-safe",
      "--source",
      "staging_ingest_evidence_empty",
    ], {});
    const report = buildStagingIngestWorkerEvidenceReport({
      options,
      generatedAt: "2026-05-20T12:00:00.000Z",
      branch: "staging",
      commit: "a".repeat(40),
      globalQueueBefore: globalMetrics(),
      globalQueueAfter: globalMetrics(),
      scopedQueueBeforeCreation: scopedMetrics(),
      scopedQueueBeforeRun: scopedMetrics(),
      scopedQueueAfterRun: scopedMetrics(),
      lifecycleEvents: lifecycle(),
      syntheticJobs: [],
      workerExitCode: 0,
      capturedWorkerLogLines: 1,
    });

    expect(report.workflowGate.emptyQueueNoOpSafe).toBe(true);
    expect(report.status).toBe("dry-run-only");
    expect(report.accepted).toBe(false);
  });

  it("requires lifecycle events and writes sanitized evidence files", () => {
    const missingEvents = {
      ...validReport(),
      lifecycleEvents: lifecycle({ totalEvents: 2, eventCounts: { queued: 2 } }),
    };
    expect(validateStagingIngestWorkerEvidenceReport(missingEvents).errors.join("\n"))
      .toMatch(/lifecycle claim events/i);

    const rootDir = makeTempRoot();
    const outputs = writeStagingIngestWorkerEvidence(validReport(), { rootDir });
    expect(outputs).toEqual({
      markdownPath: STAGING_INGEST_WORKER_EVIDENCE_MD_PATH,
      jsonPath: STAGING_INGEST_WORKER_EVIDENCE_JSON_PATH,
    });
  });
});
