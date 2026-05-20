import "../../loadEnv.js";

import { sql, type Kysely } from "kysely";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { PipelineParams } from "../../helpers/ingestCorePipeline";
import { ensureIngestProcessingQueueSchema } from "../../helpers/ingestProcessingQueueSchema";
import {
  enqueueIngestProcessingJob,
  listIngestProcessingJobEvents,
} from "../../helpers/ingestProcessingQueueService";
import type { DB, UserRole } from "../../helpers/schema";
import {
  processNextIngestProcessingJob,
  runIngestProcessingWorker,
  type WorkerCliOptions,
} from "../../scripts/ingest-processing-worker";
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
  userAccountIds: [] as number[],
  artifactIds: [] as number[],
};

function marker(): string {
  markerCounter += 1;
  return `ingest-worker-test-${Date.now().toString(36)}-${markerCounter.toString(36)}`;
}

function trackSource(source: string): string {
  created.sources.push(source);
  return source;
}

function assertNoSensitiveLeak(value: unknown) {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain("JVBERi0SHOULD_NOT_STORE_RAW_PDF_BYTES");
  expect(serialized).not.toContain("%PDF");
  expect(serialized).not.toContain("SHOULD_NOT_STORE_RAW_REPORT_TEXT");
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
    .returning(["id", "email"])
    .executeTakeFirstOrThrow();
  const userId = Number(row.id);
  created.userIds.push(userId);

  const account = await db
    .insertInto("userAccount")
    .values({
      userId,
      email: row.email,
      fullName: `Synthetic ${name}`,
      region: "CA",
      role,
      addressLine1: null,
      addressLine2: null,
      city: null,
      province: "NS",
      postalCode: null,
      phone: null,
      dateOfBirth: null,
      legalNameSignature: null,
      termsAcceptedAt: null,
      termsAcceptedVersion: null,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  created.userAccountIds.push(Number(account.id));
  return userId;
}

async function createArtifact(userId: number, markerValue: string): Promise<number> {
  const row = await db
    .insertInto("reportArtifact")
    .values({
      userId,
      artifactType: "ingest_worker_test",
      processingStatus: "pending",
      region: "CA",
      sha256: "d".repeat(64),
      storageUrl: "JVBERi0SHOULD_NOT_STORE_RAW_PDF_BYTES",
      data: {
        marker: markerValue,
        fileName: "synthetic-credit-report.pdf",
        mimeType: "application/pdf",
        extractionStatus: "ready",
      },
      createdAt: new Date(),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  const artifactId = Number(row.id);
  created.artifactIds.push(artifactId);
  return artifactId;
}

async function createQueueSubject(source: string, maxAttempts = 3): Promise<{ userId: number; artifactId: number; jobId: number }> {
  const userId = await createUser(`${source}-${created.userIds.length + 1}`);
  const artifactId = await createArtifact(userId, source);
  const queued = await enqueueIngestProcessingJob({
    reportArtifactId: artifactId,
    userId,
    source,
    maxAttempts,
    payload: { region: "CA", mimeType: "application/pdf", artifactSha256: "d".repeat(64) },
  });
  return { userId, artifactId, jobId: queued.job.id };
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
  if (created.userAccountIds.length > 0) {
    await db.deleteFrom("userAccount").where("id", "in", Array.from(new Set(created.userAccountIds))).execute();
  }
  if (created.userIds.length > 0) {
    await db.deleteFrom("users").where("id", "in", Array.from(new Set(created.userIds))).execute();
  }
  created.sources = [];
  created.userIds = [];
  created.userAccountIds = [];
  created.artifactIds = [];
}

function successfulPipeline(): (input: PipelineParams) => Promise<void> {
  return async (input) => {
    expect(input.bytesBase64).toBe("JVBERi0SHOULD_NOT_STORE_RAW_PDF_BYTES");
    input.context.tradelineIds.push(101, 102);
    input.context.createdTradelineIds.push(101);
    input.send({ type: "progress", stage: "unified_extraction", percent: 35 });
    input.send({ type: "progress", stage: "compliance_scanning", percent: 93 });
    input.send({
      type: "complete",
      data: {
        rawText: "SHOULD_NOT_STORE_RAW_REPORT_TEXT full credit report text",
      },
    } as any);
  };
}

describeIfLocalDb("ingest processing worker", () => {
  beforeAll(async () => {
    db = (await import("../../helpers/db")).db;
    await ensureIngestProcessingQueueSchema();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupCreatedRows();
  });

  it("previews an eligible queued job in dry-run without mutating queue state", async () => {
    const source = trackSource(marker());
    const { jobId } = await createQueueSubject(source);
    const beforeEvents = await listIngestProcessingJobEvents(jobId);

    const preview = await processNextIngestProcessingJob({ workerId: `${source}-worker`, dryRun: true, source }, {
      executePipeline: vi.fn(),
    });

    expect(preview).toMatchObject({
      status: "dry_run_preview",
      dryRun: true,
      job: {
        id: jobId,
        status: "queued",
      },
    });

    const afterEvents = await listIngestProcessingJobEvents(jobId);
    const stored = await sql<any>`
      select status, locked_by
      from public.ingest_processing_job
      where id = ${jobId}
    `.execute(db);
    expect(afterEvents.map((event) => event.eventType)).toEqual(beforeEvents.map((event) => event.eventType));
    expect(stored.rows[0]?.status).toBe("queued");
    expect(stored.rows[0]?.locked_by ?? stored.rows[0]?.lockedBy ?? null).toBeNull();
    assertNoSensitiveLeak([preview, afterEvents, stored.rows]);
  });

  it("claims and processes a queued job through the existing deterministic pipeline call shape", async () => {
    const source = trackSource(marker());
    const { jobId, artifactId } = await createQueueSubject(source);

    const result = await processNextIngestProcessingJob({ workerId: `${source}-worker`, dryRun: false, source }, {
      executePipeline: successfulPipeline(),
    });

    expect(result.status).toBe("succeeded");
    expect(result.job?.id).toBe(jobId);
    expect(result.job?.resultSummary).toMatchObject({
      artifactId,
      deterministicPipelineCalledByWorker: true,
      endpointCutoverEnabled: true,
      tradelineCount: 2,
      createdTradelineCount: 1,
      rawReportBytesLogged: false,
      extractedReportTextLogged: false,
      parserOutputMutated: false,
      violationTruthMutated: false,
    });

    const events = await listIngestProcessingJobEvents(jobId);
    expect(events.map((event) => event.eventType)).toEqual([
      "queued",
      "claimed",
      "ocr_parsing_started",
      "compliance_scan_started",
      "succeeded",
    ]);
    assertNoSensitiveLeak([result, events]);
  });

  it("records retry and dead-letter events when pipeline processing fails", async () => {
    const source = trackSource(marker());
    const { jobId } = await createQueueSubject(source, 2);
    const failingPipeline = vi.fn(async () => {
      throw new Error("SHOULD_NOT_STORE_RAW_REPORT_TEXT raw report text account number 4111111111111111");
    });

    const first = await processNextIngestProcessingJob({ workerId: `${source}-worker-1`, dryRun: false, source }, {
      executePipeline: failingPipeline,
    });
    expect(first.status).toBe("failed");
    expect(first.job?.attemptCount).toBe(1);
    expect(first.job?.lastErrorReason).toBe("Ingest processing worker failed with a sanitized operational error.");

    await sql`
      update public.ingest_processing_job
      set run_after = now() - interval '1 minute'
      where id = ${jobId}
    `.execute(db);

    const second = await processNextIngestProcessingJob({ workerId: `${source}-worker-2`, dryRun: false, source }, {
      executePipeline: failingPipeline,
    });
    expect(second.status).toBe("dead_lettered");
    expect(second.job?.attemptCount).toBe(2);

    const events = await listIngestProcessingJobEvents(jobId);
    expect(events.map((event) => event.eventType)).toEqual([
      "queued",
      "claimed",
      "ocr_parsing_started",
      "retry_scheduled",
      "claimed",
      "ocr_parsing_started",
      "dead_lettered",
    ]);
    expect(failingPipeline).toHaveBeenCalledTimes(2);
    assertNoSensitiveLeak([first, second, events]);
  });

  it("respects max-jobs and keeps worker logs metadata-only", async () => {
    const source = trackSource(marker());
    const first = await createQueueSubject(source);
    const second = await createQueueSubject(source);
    const third = await createQueueSubject(source);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const options: WorkerCliOptions = {
      dryRun: false,
      apply: true,
      maxJobs: 2,
      concurrency: 1,
      leaseSeconds: 120,
      workerId: `${source}-worker`,
      source,
    };

    const exitCode = await runIngestProcessingWorker(options, {
      executePipeline: successfulPipeline(),
    });

    expect(exitCode).toBe(0);
    const rows = await sql<any>`
      select id, status
      from public.ingest_processing_job
      where id in (${first.jobId}, ${second.jobId}, ${third.jobId})
      order by id asc
    `.execute(db);
    expect(rows.rows.map((row) => row.status)).toEqual(["succeeded", "succeeded", "queued"]);
    expect(logSpy).toHaveBeenCalled();
    assertNoSensitiveLeak([rows.rows, logSpy.mock.calls]);
  });
});
