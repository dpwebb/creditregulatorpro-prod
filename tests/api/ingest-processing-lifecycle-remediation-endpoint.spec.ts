import "../../loadEnv.js";

import { sql, type Kysely } from "kysely";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { NotAuthenticatedError } from "../../helpers/getSetServerSession";
import type { DB, UserRole } from "../../helpers/schema";
import { ensureIngestProcessingQueueSchema } from "../../helpers/ingestProcessingQueueSchema";
import {
  claimNextIngestProcessingJob,
  enqueueIngestProcessingJob,
  IngestProcessingQueueError,
  listIngestProcessingJobEvents,
  markIngestProcessingJobFailed,
  recordIngestProcessingJobEvent,
} from "../../helpers/ingestProcessingQueueService";
import { assertSafeLocalDatabaseUrl } from "../utils/localDbHarness";

type EndpointHandle = (request: Request) => Promise<Response>;
type AuthUser = { id: number; role: UserRole; email: string; displayName: string; organizationId: number | null };

const auth = vi.hoisted(() => ({
  user: null as AuthUser | null,
  rejectUnauthenticated: false,
}));

vi.mock("../../helpers/getServerUserSession", () => ({
  getServerUserSession: vi.fn(async () => {
    if (auth.rejectUnauthenticated) throw new NotAuthenticatedError();
    if (!auth.user) throw new Error("Test authenticated user is not set.");
    return { user: auth.user };
  }),
}));

const safeDbUrl = (() => {
  try {
    return assertSafeLocalDatabaseUrl(process.env);
  } catch {
    return null;
  }
})();

const describeIfLocalDb = safeDbUrl ? describe : describe.skip;
let db: Kysely<DB>;
let queueGet: EndpointHandle;
let queueRemediationPost: EndpointHandle;
let markerCounter = 0;

const created = {
  userIds: [] as number[],
  artifactIds: [] as number[],
};

function marker(): string {
  markerCounter += 1;
  return `ingest-remediation-${Date.now().toString(36)}-${markerCounter.toString(36)}`;
}

function getRequest(path: string): Request {
  return new Request(`http://localhost${path}`, {
    method: "GET",
    headers: { "user-agent": "synthetic-ingest-remediation-test" },
  });
}

function postRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "user-agent": "synthetic-ingest-remediation-test" },
    body: JSON.stringify(body),
  });
}

async function createUser(name: string, role: UserRole): Promise<AuthUser> {
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
    .returning(["id", "email", "displayName", "organizationId", "role"])
    .executeTakeFirstOrThrow();
  const user = { ...row, id: Number(row.id) } as AuthUser;
  created.userIds.push(user.id);
  return user;
}

async function createArtifact(userId: number, markerValue: string): Promise<number> {
  const row = await db
    .insertInto("reportArtifact")
    .values({
      userId,
      artifactType: "ingest_remediation_test",
      processingStatus: "failed",
      region: "CA",
      sha256: "a".repeat(64),
      data: {
        marker: markerValue,
        source: "ingest_remediation_test",
      },
      createdAt: new Date(),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  const id = Number(row.id);
  created.artifactIds.push(id);
  return id;
}

async function cleanupCreatedRows(): Promise<void> {
  if (created.artifactIds.length > 0) {
    await sql`
      delete from public.ingest_processing_job_event event
      using public.ingest_processing_job job
      where event.job_id = job.id
        and job.report_artifact_id in (${sql.join(Array.from(new Set(created.artifactIds)))})
    `.execute(db);
    await sql`
      delete from public.ingest_processing_job
      where report_artifact_id in (${sql.join(Array.from(new Set(created.artifactIds)))})
    `.execute(db);
    await db.deleteFrom("reportArtifact").where("id", "in", Array.from(new Set(created.artifactIds))).execute();
  }
  if (created.userIds.length > 0) {
    await db.deleteFrom("users").where("id", "in", Array.from(new Set(created.userIds))).execute();
  }
  created.userIds = [];
  created.artifactIds = [];
}

function assertNoSensitiveLeak(value: unknown) {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain("JVBERi0");
  expect(serialized).not.toContain("%PDF");
  expect(serialized).not.toContain("SHOULD_NOT_STORE_RAW_REPORT_TEXT");
  expect(serialized).not.toContain("4111111111111111");
  expect(serialized).not.toMatch(/raw report text|raw pdf text|full credit report|storageUrl|storage_url|bytesBase64|pdfBase64|postgres:\/\/|database_url|private key|api[_-]?key|access[_-]?token|refresh[_-]?token|bearer\s+[a-z0-9._-]+|session=|cookie=/i);
}

async function createDeadLetterJob(source: string, userId: number, artifactId: number) {
  const queued = await enqueueIngestProcessingJob({
    reportArtifactId: artifactId,
    userId,
    source,
    idempotencyKey: `${source}-artifact`,
    maxAttempts: 1,
    payload: { region: "CA", mimeType: "application/pdf", artifactSha256: "b".repeat(64) },
  });
  const workerId = `${source}-worker`;
  const claimed = await claimNextIngestProcessingJob({ workerId, source });
  if (!claimed) throw new Error("Expected dead-letter job claim.");
  const dead = await markIngestProcessingJobFailed({
    job: claimed,
    workerId,
    error: new IngestProcessingQueueError("SYNTHETIC_PERMANENT_FAILURE", "Synthetic permanent ingest failure.", true),
  });
  return { queued, dead };
}

describeIfLocalDb("ingest processing lifecycle remediation endpoint", () => {
  beforeAll(async () => {
    db = (await import("../../helpers/db")).db;
    await ensureIngestProcessingQueueSchema();
    queueGet = (await import("../../endpoints/admin/ingest-queue_GET")).handle;
    queueRemediationPost = (await import("../../endpoints/admin/ingest-queue-remediation_POST")).handle;
  });

  afterEach(async () => {
    auth.user = null;
    auth.rejectUnauthenticated = false;
    await cleanupCreatedRows();
  });

  afterAll(async () => {
    await db?.destroy();
  });

  it("requires admin access and surfaces dead-letter ingest jobs with sanitized lifecycle events", async () => {
    const source = marker();
    const admin = await createUser(`${source}-admin`, "admin");
    const user = await createUser(`${source}-user`, "user");
    const artifactId = await createArtifact(user.id, source);
    const { dead } = await createDeadLetterJob(source, user.id, artifactId);
    await recordIngestProcessingJobEvent({
      jobId: dead.id,
      eventType: "cleanup_failed",
      errorCode: "INGEST_CLEANUP_FAILED",
      errorReason: "SHOULD_NOT_STORE_RAW_REPORT_TEXT raw report text account number 4111111111111111",
      details: {
        artifactId,
        cleanupMode: "artifact_only_cleanup",
        rawReportBytesLogged: false,
        extractedReportTextLogged: false,
      },
    });

    auth.rejectUnauthenticated = true;
    let response = await queueGet(getRequest(`/_api/admin/ingest-queue?jobId=${dead.id}&includeEvents=true`));
    expect(response.status).toBe(401);

    auth.rejectUnauthenticated = false;
    auth.user = user;
    response = await queueGet(getRequest(`/_api/admin/ingest-queue?jobId=${dead.id}&includeEvents=true`));
    expect(response.status).toBe(403);

    auth.user = admin;
    response = await queueGet(getRequest(`/_api/admin/ingest-queue?jobId=${dead.id}&includeEvents=true`));
    const parsed = await response.json();
    expect(response.status).toBe(200);
    expect(parsed.jobs[0]).toMatchObject({
      id: dead.id,
      status: "dead_lettered",
      payloadSummary: {
        reportArtifactId: artifactId,
        region: "CA",
        mimeType: "application/pdf",
        artifactSha256Present: true,
        rawReportBytesStored: false,
        extractedReportTextStored: false,
      },
    });
    expect(parsed.jobs[0].events.map((event: { eventType: string }) => event.eventType)).toEqual(
      expect.arrayContaining(["queued", "claimed", "dead_lettered", "cleanup_failed"]),
    );
    assertNoSensitiveLeak(parsed);
  });

  it("retries dead-letter jobs with idempotent replacement, marks reviewed, and cancels only bounded jobs", async () => {
    const source = marker();
    const admin = await createUser(`${source}-admin`, "admin");
    const user = await createUser(`${source}-user`, "user");
    const artifactId = await createArtifact(user.id, source);
    const { dead } = await createDeadLetterJob(source, user.id, artifactId);

    auth.user = user;
    let response = await queueRemediationPost(postRequest("/_api/admin/ingest-queue-remediation", {
      jobId: dead.id,
      action: "retry_dead_letter",
      confirmRetry: true,
    }));
    expect(response.status).toBe(403);

    auth.user = admin;
    response = await queueRemediationPost(postRequest("/_api/admin/ingest-queue-remediation", {
      jobId: dead.id,
      action: "retry_dead_letter",
    }));
    expect(response.status).toBe(400);
    expect(await response.text()).toMatch(/confirmation/i);

    response = await queueRemediationPost(postRequest("/_api/admin/ingest-queue-remediation", {
      jobId: dead.id,
      action: "retry_dead_letter",
      confirmRetry: true,
    }));
    const retry = await response.json();
    expect(response.status).toBe(200);
    expect(retry.remediation.status).toBe("replacement_queued");
    expect(retry.remediation.replacementJob.id).not.toBe(dead.id);
    expect(retry.remediation.replacementJob.status).toBe("queued");
    expect(retry.remediation.replacementJob.idempotencyKey).toBe(dead.idempotencyKey);

    response = await queueRemediationPost(postRequest("/_api/admin/ingest-queue-remediation", {
      jobId: dead.id,
      action: "retry_dead_letter",
      confirmRetry: true,
    }));
    const duplicateRetry = await response.json();
    expect(response.status).toBe(200);
    expect(duplicateRetry.remediation.replacementJob.id).toBe(retry.remediation.replacementJob.id);

    response = await queueRemediationPost(postRequest("/_api/admin/ingest-queue-remediation", {
      jobId: dead.id,
      action: "mark_reviewed",
      confirmReview: true,
      reviewNote: "reviewed by operator",
    }));
    const reviewed = await response.json();
    expect(response.status).toBe(200);
    expect(reviewed.remediation.status).toBe("reviewed");

    const cancelArtifactId = await createArtifact(user.id, `${source}-cancel`);
    const cancelJob = await enqueueIngestProcessingJob({
      reportArtifactId: cancelArtifactId,
      userId: user.id,
      source,
      idempotencyKey: `${source}-cancel`,
      payload: { region: "CA", mimeType: "application/pdf" },
    });
    response = await queueRemediationPost(postRequest("/_api/admin/ingest-queue-remediation", {
      jobId: cancelJob.job.id,
      action: "cancel_job",
      confirmCancel: true,
    }));
    const canceled = await response.json();
    expect(response.status).toBe(200);
    expect(canceled.remediation.status).toBe("canceled");
    expect(canceled.remediation.job.status).toBe("canceled");

    const events = await listIngestProcessingJobEvents(dead.id);
    expect(events.map((event) => event.eventType)).toEqual(
      expect.arrayContaining([
        "operator_retry_requested",
        "operator_remediation_action",
        "dead_letter_acknowledged",
      ]),
    );
    const cancelEvents = await listIngestProcessingJobEvents(cancelJob.job.id);
    expect(cancelEvents.map((event) => event.eventType)).toEqual(
      expect.arrayContaining(["canceled", "operator_remediation_action"]),
    );
    assertNoSensitiveLeak([retry, duplicateRetry, reviewed, canceled, events, cancelEvents]);
  });
});
