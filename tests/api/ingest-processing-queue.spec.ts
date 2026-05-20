import "../../loadEnv.js";

import { sql, type Kysely } from "kysely";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import type { DB, UserRole } from "../../helpers/schema";
import { ensureIngestProcessingQueueSchema } from "../../helpers/ingestProcessingQueueSchema";
import {
  claimNextIngestProcessingJob,
  enqueueIngestProcessingJob,
  extendIngestProcessingJobLease,
  getLatestIngestProcessingJobByIdempotencyKey,
  getIngestProcessingQueueMetrics,
  listIngestProcessingJobEvents,
  markIngestProcessingJobFailed,
  markIngestProcessingJobSucceeded,
  recordIngestProcessingJobEvent,
} from "../../helpers/ingestProcessingQueueService";
import { assertSafeLocalDatabaseUrl } from "../utils/localDbHarness";

const safeDbUrl = (() => {
  try {
    return assertSafeLocalDatabaseUrl(process.env);
  } catch {
    return null;
  }
})();

const describeIfLocalDb = safeDbUrl ? describe : describe.skip;
let db: Kysely<DB>;
let markerCounter = 0;

const created = {
  sources: [] as string[],
  userIds: [] as number[],
  artifactIds: [] as number[],
};

function marker(): string {
  markerCounter += 1;
  return `ingest-queue-test-${Date.now().toString(36)}-${markerCounter.toString(36)}`;
}

function trackSource(source: string): string {
  created.sources.push(source);
  return source;
}

function assertNoSensitiveLeak(value: unknown) {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain("JVBERi0");
  expect(serialized).not.toContain("%PDF");
  expect(serialized).not.toContain("SHOULD_NOT_STORE_RAW_REPORT_TEXT");
  expect(serialized).not.toContain("SHOULD_NOT_STORE_RAW_PDF_BYTES");
  expect(serialized).not.toContain("4111111111111111");
  expect(serialized).not.toMatch(/raw report text|raw pdf text|full credit report|storageUrl|storage_url|bytesBase64|pdfBase64|postgres:\/\/|database_url|private key|api[_-]?key|bearer\s+[a-z0-9._-]+|session=|cookie=/i);
}

async function createUser(name: string, role: UserRole = "admin"): Promise<number> {
  const row = await db
    .insertInto("users")
    .values({
      email: `${name}@example.test`,
      displayName: `Synthetic ${name}`,
      avatarUrl: null,
      organizationId: null,
      emailVerified: true,
      role,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  const id = Number(row.id);
  created.userIds.push(id);
  return id;
}

async function createArtifact(userId: number, markerValue: string): Promise<number> {
  const row = await db
    .insertInto("reportArtifact")
    .values({
      userId,
      artifactType: "ingest_queue_test",
      processingStatus: "pending",
      region: "CA",
      sha256: "a".repeat(64),
      data: {
        marker: markerValue,
        source: "ingest_queue_test",
      },
      createdAt: new Date(),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  const id = Number(row.id);
  created.artifactIds.push(id);
  return id;
}

async function createQueueSubject(source: string): Promise<{ userId: number; artifactId: number }> {
  const userId = await createUser(source);
  const artifactId = await createArtifact(userId, source);
  return { userId, artifactId };
}

async function cleanupCreatedRows(): Promise<void> {
  for (const source of Array.from(new Set(created.sources))) {
    await sql`
      delete from public.ingest_processing_job_event event
      using public.ingest_processing_job job
      where event.job_id = job.id
        and job.source = ${source}
    `.execute(db);
    await sql`
      delete from public.ingest_processing_job
      where source = ${source}
    `.execute(db);
  }
  if (created.artifactIds.length > 0) {
    await db.deleteFrom("reportArtifact").where("id", "in", Array.from(new Set(created.artifactIds))).execute();
  }
  if (created.userIds.length > 0) {
    await db.deleteFrom("users").where("id", "in", Array.from(new Set(created.userIds))).execute();
  }
  created.sources = [];
  created.userIds = [];
  created.artifactIds = [];
}

describeIfLocalDb("ingest processing queue", () => {
  beforeAll(async () => {
    db = (await import("../../helpers/db")).db;
    await ensureIngestProcessingQueueSchema();
  });

  afterEach(async () => {
    await cleanupCreatedRows();
  });

  it("ensures the durable queue schema idempotently", async () => {
    await expect(ensureIngestProcessingQueueSchema()).resolves.toBeUndefined();
    await expect(ensureIngestProcessingQueueSchema()).resolves.toBeUndefined();

    const tables = await sql<any>`
      select
        to_regclass('public.ingest_processing_job')::text as job_table,
        to_regclass('public.ingest_processing_job_event')::text as event_table
    `.execute(db);
    const row = tables.rows[0] ?? {};
    expect(row.job_table ?? row.jobTable).toBe("ingest_processing_job");
    expect(row.event_table ?? row.eventTable).toBe("ingest_processing_job_event");
  });

  it("enqueues sanitized durable jobs and records duplicate idempotency attempts without raw bytes or text", async () => {
    const source = trackSource(marker());
    const { userId, artifactId } = await createQueueSubject(source);
    const idempotencyKey = `${source}-artifact`;

    const first = await enqueueIngestProcessingJob({
      reportArtifactId: artifactId,
      userId,
      source,
      idempotencyKey,
      payload: {
        region: "CA",
        mimeType: "application/pdf",
        artifactSha256: "b".repeat(64),
        metadata: {
          uploadChannel: "authenticated_ingest",
        },
      },
    });
    const duplicate = await enqueueIngestProcessingJob({
      reportArtifactId: artifactId,
      userId,
      source,
      idempotencyKey,
      payload: {
        metadata: {
          uploadChannel: "authenticated_ingest",
        },
        artifactSha256: "b".repeat(64),
        mimeType: "application/pdf",
        region: "CA",
      },
    });

    expect(first.status).toBe("queued");
    expect(duplicate).toMatchObject({
      status: "duplicate",
      duplicateOfJobId: first.job.id,
    });
    const latest = await getLatestIngestProcessingJobByIdempotencyKey(idempotencyKey);
    expect(latest?.id).toBe(first.job.id);
    expect(latest?.status).toBe("queued");

    const rows = await sql<any>`
      select
        jsonb_typeof(job.payload) as payload_type,
        event.event_type,
        jsonb_typeof(event.details) as details_type
      from public.ingest_processing_job job
      left join public.ingest_processing_job_event event on event.job_id = job.id
      where job.source = ${source}
      order by event.id asc
    `.execute(db);
    expect(rows.rows.map((row) => row.event_type ?? row.eventType)).toEqual(["queued", "duplicate_enqueue"]);
    expect(rows.rows.every((row) => (row.payload_type ?? row.payloadType) === "object")).toBe(true);
    expect(rows.rows.every((row) => (row.details_type ?? row.detailsType) === "object")).toBe(true);
    assertNoSensitiveLeak([first, duplicate, rows.rows]);
  });

  it("rejects raw report bytes, extracted text, storage URLs, and unsafe identifiers", async () => {
    const source = trackSource(marker());
    const { userId, artifactId } = await createQueueSubject(source);

    await expect(enqueueIngestProcessingJob({
      reportArtifactId: artifactId,
      userId,
      source,
      payload: {
        metadata: {
          bytesBase64: "JVBERi0SHOULD_NOT_STORE_RAW_PDF_BYTES",
        },
      } as any,
    })).rejects.toThrow(/unsafe key|sensitive content/i);

    await expect(enqueueIngestProcessingJob({
      reportArtifactId: artifactId,
      userId,
      source,
      payload: {
        metadata: {
          operatorNote: "SHOULD_NOT_STORE_RAW_REPORT_TEXT raw report text account number 4111111111111111",
        },
      },
    })).rejects.toThrow(/sensitive content/i);

    await expect(enqueueIngestProcessingJob({
      reportArtifactId: artifactId,
      userId,
      source: "123456789012",
      payload: { region: "CA" },
    })).rejects.toThrow(/safe internal token/i);
  });

  it("claims one queued job with a lease and does not silently reclaim stale running jobs", async () => {
    const source = trackSource(marker());
    const { userId, artifactId } = await createQueueSubject(source);
    const queued = await enqueueIngestProcessingJob({
      reportArtifactId: artifactId,
      userId,
      source,
      payload: { region: "CA", mimeType: "application/pdf" },
    });

    const claimed = await claimNextIngestProcessingJob({ workerId: `${source}-claimer`, leaseSeconds: 60, source });
    expect(claimed).toMatchObject({
      id: queued.job.id,
      status: "running",
      attemptCount: 1,
      lockedBy: `${source}-claimer`,
    });

    const secondClaim = await claimNextIngestProcessingJob({ workerId: `${source}-second`, source });
    expect(secondClaim).toBeNull();

    const extended = await extendIngestProcessingJobLease({
      job: claimed!,
      workerId: `${source}-claimer`,
      leaseSeconds: 120,
    });
    expect(extended.lockedUntil).not.toBeNull();
    expect(new Date(extended.lockedUntil!).getTime()).toBeGreaterThan(new Date(claimed!.lockedUntil!).getTime());

    await sql`
      update public.ingest_processing_job
      set locked_until = now() - interval '1 minute'
      where id = ${queued.job.id}
    `.execute(db);

    const staleClaim = await claimNextIngestProcessingJob({ workerId: `${source}-stale`, source });
    expect(staleClaim).toBeNull();

    const metrics = await getIngestProcessingQueueMetrics();
    expect(metrics.staleRunningJobs).toBeGreaterThanOrEqual(1);
    const events = await listIngestProcessingJobEvents(queued.job.id);
    expect(events.map((event) => event.eventType)).toEqual(["queued", "claimed", "lease_extended"]);
    assertNoSensitiveLeak([claimed, metrics, events]);
  });

  it("marks success with append-only events and preserves deterministic-output boundaries", async () => {
    const source = trackSource(marker());
    const { userId, artifactId } = await createQueueSubject(source);
    const queued = await enqueueIngestProcessingJob({
      reportArtifactId: artifactId,
      userId,
      source,
      payload: { region: "CA", mimeType: "application/pdf" },
    });
    const workerId = `${source}-worker`;
    const claimed = await claimNextIngestProcessingJob({ workerId, source });
    expect(claimed?.id).toBe(queued.job.id);
    if (!claimed) throw new Error("Expected claimed ingest job.");

    const parsingEvent = await recordIngestProcessingJobEvent({
      jobId: claimed.id,
      eventType: "ocr_parsing_started",
      workerId,
      details: {
        rawReportBytesLogged: false,
        extractedReportTextLogged: false,
        parserOutputMutated: false,
      },
    });
    const complianceEvent = await recordIngestProcessingJobEvent({
      jobId: claimed.id,
      eventType: "compliance_scan_started",
      workerId,
      details: {
        tradelineCount: 0,
        rawReportBytesLogged: false,
        extractedReportTextLogged: false,
        violationTruthMutated: false,
      },
    });
    const succeeded = await markIngestProcessingJobSucceeded({
      job: claimed,
      workerId,
      resultSummary: {
        deterministicPipelineCalledByWorker: false,
      },
    });

    expect(parsingEvent.eventType).toBe("ocr_parsing_started");
    expect(complianceEvent.eventType).toBe("compliance_scan_started");
    expect(succeeded.status).toBe("succeeded");
    expect(succeeded.resultSummary).toMatchObject({
      deterministicPipelineCalledByWorker: false,
      parserOutputMutated: false,
      ocrBehaviorMutated: false,
      violationTruthMutated: false,
      evidenceBindingMutated: false,
      packetReadinessMutated: false,
    });

    const events = await listIngestProcessingJobEvents(queued.job.id);
    expect(events.map((event) => event.eventType)).toEqual(["queued", "claimed", "ocr_parsing_started", "compliance_scan_started", "succeeded"]);
    assertNoSensitiveLeak([succeeded, events]);
  });

  it("records failed cleanup lifecycle events and exposes cleanup metrics without sensitive payloads", async () => {
    const source = trackSource(marker());
    const { userId, artifactId } = await createQueueSubject(source);
    await enqueueIngestProcessingJob({
      reportArtifactId: artifactId,
      userId,
      source,
      maxAttempts: 1,
      payload: { region: "CA", mimeType: "application/pdf" },
    });
    const workerId = `${source}-worker`;
    const claimed = await claimNextIngestProcessingJob({ workerId, source });
    if (!claimed) throw new Error("Expected failed cleanup job claim.");
    const dead = await markIngestProcessingJobFailed({
      job: claimed,
      workerId,
      error: new Error("Synthetic permanent cleanup fixture failure."),
    });
    expect(dead.status).toBe("dead_lettered");

    await recordIngestProcessingJobEvent({
      jobId: dead.id,
      eventType: "cleanup_attempted",
      details: {
        artifactId,
        cleanupMode: "artifact_only_cleanup",
        destructiveCleanupPath: true,
        operatorDestructiveDeleteDefault: false,
        rawReportBytesLogged: false,
        extractedReportTextLogged: false,
      },
    });
    await recordIngestProcessingJobEvent({
      jobId: dead.id,
      eventType: "cleanup_failed",
      errorCode: "INGEST_CLEANUP_FAILED",
      errorReason: "SHOULD_NOT_STORE_RAW_REPORT_TEXT raw report text account number 4111111111111111",
      details: {
        artifactId,
        cleanupStep: "artifact_only_cleanup",
        rawReportBytesLogged: false,
        extractedReportTextLogged: false,
      },
    });

    const events = await listIngestProcessingJobEvents(dead.id);
    expect(events.map((event) => event.eventType)).toEqual([
      "queued",
      "claimed",
      "dead_lettered",
      "cleanup_attempted",
      "cleanup_failed",
    ]);
    const metrics = await getIngestProcessingQueueMetrics();
    expect(metrics.cleanupAttemptedEvents).toBeGreaterThanOrEqual(1);
    expect(metrics.cleanupFailedEvents).toBeGreaterThanOrEqual(1);
    expect(metrics.cleanupFailedJobs).toBeGreaterThanOrEqual(1);
    assertNoSensitiveLeak([events, metrics]);
  });

  it("schedules retry and dead-letters deterministically without storing raw operational details", async () => {
    const retrySource = trackSource(marker());
    const retrySubject = await createQueueSubject(retrySource);
    await enqueueIngestProcessingJob({
      reportArtifactId: retrySubject.artifactId,
      userId: retrySubject.userId,
      source: retrySource,
      maxAttempts: 2,
      payload: { region: "CA", mimeType: "application/pdf" },
    });
    const retryWorkerId = `${retrySource}-worker`;
    const retryClaim = await claimNextIngestProcessingJob({ workerId: retryWorkerId, source: retrySource });
    if (!retryClaim) throw new Error("Expected retry job claim.");
    const retryResult = await markIngestProcessingJobFailed({
      job: retryClaim,
      workerId: retryWorkerId,
      error: new Error("Transient OCR service timeout without report text"),
    });
    expect(retryResult.status).toBe("failed");
    expect(retryResult.attemptCount).toBe(1);
    expect(retryResult.lastErrorCode).toBe("INGEST_PROCESSING_FAILED");
    const retryMetrics = await getIngestProcessingQueueMetrics();
    expect(retryMetrics.failedJobs).toBeGreaterThanOrEqual(1);

    await sql`
      update public.ingest_processing_job
      set run_after = now() - interval '1 minute'
      where id = ${retryClaim.id}
    `.execute(db);
    const retryFinalClaim = await claimNextIngestProcessingJob({ workerId: `${retryWorkerId}-second`, source: retrySource });
    if (!retryFinalClaim) throw new Error("Expected retry job second claim.");
    const retryDeadLetter = await markIngestProcessingJobFailed({
      job: retryFinalClaim,
      workerId: `${retryWorkerId}-second`,
      error: new Error("Second transient OCR service timeout without report text"),
    });
    expect(retryDeadLetter.status).toBe("dead_lettered");
    expect(retryDeadLetter.attemptCount).toBe(2);

    const deadSource = trackSource(marker());
    const deadSubject = await createQueueSubject(deadSource);
    await enqueueIngestProcessingJob({
      reportArtifactId: deadSubject.artifactId,
      userId: deadSubject.userId,
      source: deadSource,
      maxAttempts: 1,
      payload: { region: "CA", mimeType: "application/pdf" },
    });
    const deadWorkerId = `${deadSource}-worker`;
    const deadClaim = await claimNextIngestProcessingJob({ workerId: deadWorkerId, source: deadSource });
    if (!deadClaim) throw new Error("Expected dead-letter job claim.");
    const deadResult = await markIngestProcessingJobFailed({
      job: deadClaim,
      workerId: deadWorkerId,
      error: new Error("SHOULD_NOT_STORE_RAW_REPORT_TEXT raw report text account number 4111111111111111"),
    });
    expect(deadResult.status).toBe("dead_lettered");
    expect(deadResult.lastErrorReason).toBe("Ingest processing job failed.");

    const retryEvents = await listIngestProcessingJobEvents(retryClaim.id);
    const deadEvents = await listIngestProcessingJobEvents(deadClaim.id);
    expect(retryEvents.map((event) => event.eventType)).toEqual(["queued", "claimed", "retry_scheduled", "claimed", "dead_lettered"]);
    expect(deadEvents.map((event) => event.eventType)).toEqual(["queued", "claimed", "dead_lettered"]);

    const metrics = await getIngestProcessingQueueMetrics();
    expect(metrics.deadLetteredJobs).toBeGreaterThanOrEqual(1);
    expect(metrics.boundaries).toMatchObject({
      durableDbBacked: true,
      appendOnlyJobEvents: true,
      noRawReportBytes: true,
      noExtractedReportText: true,
      parserOutputMutated: false,
      endpointCutoverEnabled: true,
    });
    assertNoSensitiveLeak([retryResult, retryDeadLetter, deadResult, retryMetrics, retryEvents, deadEvents, metrics]);
  });

  it("deduplicates concurrent active enqueues but allows new work after terminal status", async () => {
    const source = trackSource(marker());
    const { userId, artifactId } = await createQueueSubject(source);
    const idempotencyKey = `${source}-concurrent`;
    const [left, right] = await Promise.all([
      enqueueIngestProcessingJob({
        reportArtifactId: artifactId,
        userId,
        source,
        idempotencyKey,
        payload: { region: "CA", mimeType: "application/pdf", artifactSha256: "c".repeat(64) },
      }),
      enqueueIngestProcessingJob({
        reportArtifactId: artifactId,
        userId,
        source,
        idempotencyKey,
        payload: { artifactSha256: "c".repeat(64), mimeType: "application/pdf", region: "CA" },
      }),
    ]);
    expect([left.status, right.status].sort()).toEqual(["duplicate", "queued"]);

    const queuedJob = left.status === "queued" ? left.job : right.job;
    const workerId = `${source}-worker`;
    const claimed = await claimNextIngestProcessingJob({ workerId, source });
    if (!claimed) throw new Error("Expected claimed concurrent job.");
    await markIngestProcessingJobSucceeded({ job: claimed, workerId });

    const afterSucceeded = await enqueueIngestProcessingJob({
      reportArtifactId: artifactId,
      userId,
      source,
      idempotencyKey,
      payload: { region: "CA", mimeType: "application/pdf", artifactSha256: "c".repeat(64) },
    });
    expect(afterSucceeded.status).toBe("queued");
    expect(afterSucceeded.job.id).not.toBe(queuedJob.id);

    const rows = await sql<any>`
      select status, payload
      from public.ingest_processing_job
      where source = ${source}
        and idempotency_key = ${idempotencyKey}
      order by id asc
    `.execute(db);
    expect(rows.rows.map((row) => row.status)).toEqual(["succeeded", "queued"]);
    assertNoSensitiveLeak([left, right, afterSucceeded, rows.rows]);
  });
});
