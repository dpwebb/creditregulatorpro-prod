import "../../loadEnv.js";

import { sql, type Kysely } from "kysely";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { NotAuthenticatedError } from "../../helpers/getSetServerSession";
import type { DB, UserRole } from "../../helpers/schema";
import {
  claimNextResponseProcessingJob,
  enqueueResponseProcessingJob,
  processNextResponseProcessingJob,
} from "../../helpers/responseProcessingQueueService";
import { ensureResponseDocumentSchema } from "../../helpers/responseDocumentSchema";
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
  sources: [] as string[],
  userIds: [] as number[],
};

function marker(): string {
  markerCounter += 1;
  return `response-queue-remediation-endpoint-${Date.now().toString(36)}-${markerCounter.toString(36)}`;
}

function trackSource(source: string): string {
  created.sources.push(source);
  return source;
}

function getRequest(path: string): Request {
  return new Request(`http://localhost${path}`, {
    method: "GET",
    headers: { "user-agent": "synthetic-response-queue-remediation-test" },
  });
}

function postRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "user-agent": "synthetic-response-queue-remediation-test" },
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

async function cleanupCreatedRows(): Promise<void> {
  for (const source of Array.from(new Set(created.sources))) {
    await sql`
      with replacement_ids as (
        select (normalized_details.details ->> 'replacementJobId')::bigint as id
        from public.response_processing_job_event old_event
        join public.response_processing_job old_job on old_job.id = old_event.job_id
        cross join lateral (
          select case
            when jsonb_typeof(old_event.details) = 'string' then (old_event.details #>> '{}')::jsonb
            else old_event.details
          end as details
        ) normalized_details
        where old_job.source = ${source}
          and normalized_details.details ->> 'replacementJobId' ~ '^[0-9]+$'
      )
      delete from public.response_processing_job_event event
      using public.response_processing_job replacement
      where event.job_id = replacement.id
        and replacement.source = 'operator_remediation'
        and replacement.id in (select id from replacement_ids)
    `.execute(db);
    await sql`
      with replacement_ids as (
        select (normalized_details.details ->> 'replacementJobId')::bigint as id
        from public.response_processing_job_event event
        join public.response_processing_job job on job.id = event.job_id
        cross join lateral (
          select case
            when jsonb_typeof(event.details) = 'string' then (event.details #>> '{}')::jsonb
            else event.details
          end as details
        ) normalized_details
        where job.source = ${source}
          and normalized_details.details ->> 'replacementJobId' ~ '^[0-9]+$'
      )
      delete from public.response_processing_job
      where source = 'operator_remediation'
        and id in (select id from replacement_ids)
    `.execute(db);
    await sql`
      delete from public.response_processing_job_event event
      using public.response_processing_job job
      where event.job_id = job.id
        and job.source = ${source}
    `.execute(db);
    await sql`
      delete from public.response_processing_job
      where source = ${source}
    `.execute(db);
  }
  if (created.userIds.length > 0) {
    await db.deleteFrom("users").where("id", "in", Array.from(new Set(created.userIds))).execute();
  }
  created.sources = [];
  created.userIds = [];
}

function assertNoSensitiveLeak(value: unknown) {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain("123-456-789");
  expect(serialized).not.toContain("SHOULD_NOT_STORE_RAW_RESPONSE_TEXT");
  expect(serialized).not.toMatch(/raw response text|full email body|postgres:\/\/|database_url|private key|api[_-]?key|access[_-]?token|refresh[_-]?token|bearer\s+[a-z0-9._-]+|session=|cookie=|mailbox password/i);
}

describeIfLocalDb("response processing queue remediation endpoints", () => {
  beforeAll(async () => {
    db = (await import("../../helpers/db")).db;
    await ensureResponseDocumentSchema();
    queueGet = (await import("../../endpoints/responses/queue_GET")).handle;
    queueRemediationPost = (await import("../../endpoints/responses/queue-remediation_POST")).handle;
  });

  afterEach(async () => {
    auth.user = null;
    auth.rejectUnauthenticated = false;
    await cleanupCreatedRows();
  });

  afterAll(async () => {
    await db?.destroy();
  });

  it("enforces admin-only queue inspection and returns sanitized job summaries", async () => {
    const source = trackSource(marker());
    const admin = await createUser(`${source}-admin`, "admin");
    const user = await createUser(`${source}-user`, "user");
    const queued = await enqueueResponseProcessingJob({
      jobType: "response_replay_dry_run",
      source,
      payload: {
        filters: { responseId: 999_998_101, limit: 1 },
        metadata: { fixture: "endpoint_queue_summary", attachmentHash: "d".repeat(64) },
      },
    });

    auth.rejectUnauthenticated = true;
    let result = await queueGet(getRequest("/_api/responses/queue?limit=10"));
    expect(result.status).toBe(401);

    auth.rejectUnauthenticated = false;
    auth.user = user;
    result = await queueGet(getRequest("/_api/responses/queue?limit=10"));
    expect(result.status).toBe(403);

    auth.user = admin;
    result = await queueGet(getRequest(`/_api/responses/queue?jobId=${queued.job.id}&includeEvents=true`));
    const parsed = await result.json();
    expect(result.status).toBe(200);
    expect(parsed.jobs[0]).toMatchObject({
      id: queued.job.id,
      status: "queued",
      payloadSummary: {
        responseId: 999_998_101,
        metadataKeys: ["attachmentHash", "fixture"],
        rawResponseTextStored: false,
      },
    });
    expect(JSON.stringify(parsed)).not.toContain("endpoint_queue_summary");
    assertNoSensitiveLeak(parsed);
  });

  it("requires confirmations and records append-only retry, acknowledgement, and stale review events", async () => {
    const source = trackSource(marker());
    const admin = await createUser(`${source}-admin`, "admin");
    const user = await createUser(`${source}-user`, "user");
    auth.user = admin;

    await enqueueResponseProcessingJob({
      jobType: "response_replay_dry_run",
      source,
      maxAttempts: 2,
      payload: { filters: { classification: "unsupported_response_state" as any, limit: 1 } },
    });
    const failed = await processNextResponseProcessingJob({ workerId: `${source}-failed-worker`, source });
    expect(failed.status).toBe("failed");

    auth.user = user;
    let response = await queueRemediationPost(postRequest("/_api/responses/queue-remediation", {
      jobId: failed.job!.id,
      action: "retry_job",
      confirmRetry: true,
    }));
    expect(response.status).toBe(403);

    auth.user = admin;
    response = await queueRemediationPost(postRequest("/_api/responses/queue-remediation", {
      jobId: failed.job!.id,
      action: "retry_job",
    }));
    expect(response.status).toBe(400);
    expect(await response.text()).toMatch(/confirmation/i);

    response = await queueRemediationPost(postRequest("/_api/responses/queue-remediation", {
      jobId: failed.job!.id,
      action: "retry_job",
      confirmRetry: true,
    }));
    const retried = await response.json();
    expect(response.status).toBe(200);
    expect(retried.remediation).toMatchObject({
      status: "retry_queued",
      job: {
        id: failed.job!.id,
        status: "queued",
      },
      replacementJob: null,
    });

    const dead = await enqueueResponseProcessingJob({
      jobType: "future_mailbox_intake",
      source,
      maxAttempts: 1,
      runAfter: "2000-01-01T00:00:00.000Z",
      payload: { messageReferenceHash: "b".repeat(64) },
    });
    const deadResult = await processNextResponseProcessingJob({ workerId: `${source}-dead-worker`, source });
    expect(deadResult.status).toBe("dead_lettered");

    response = await queueRemediationPost(postRequest("/_api/responses/queue-remediation", {
      jobId: dead.job.id,
      action: "acknowledge_dead_letter",
      confirmReview: true,
    }));
    expect(response.status).toBe(200);
    expect((await response.json()).remediation.status).toBe("dead_letter_acknowledged");

    response = await queueRemediationPost(postRequest("/_api/responses/queue-remediation", {
      jobId: dead.job.id,
      action: "retry_job",
      confirmRetry: true,
    }));
    const replacement = await response.json();
    expect(response.status).toBe(200);
    expect(replacement.remediation.status).toBe("replacement_queued");
    expect(replacement.remediation.replacementJob.id).not.toBe(dead.job.id);
    expect(replacement.remediation.job.status).toBe("dead_lettered");

    response = await queueRemediationPost(postRequest("/_api/responses/queue-remediation", {
      jobId: dead.job.id,
      action: "retry_job",
      confirmRetry: true,
    }));
    const duplicateReplacement = await response.json();
    expect(response.status).toBe(200);
    expect(duplicateReplacement.remediation.status).toBe("replacement_queued");
    expect(duplicateReplacement.remediation.replacementJob.id).toBe(replacement.remediation.replacementJob.id);

    const stale = await enqueueResponseProcessingJob({
      jobType: "response_replay_dry_run",
      source,
      runAfter: "2000-01-01T00:00:00.000Z",
      payload: { filters: { responseId: 999_998_102, limit: 1 } },
    });
    await claimNextResponseProcessingJob({ workerId: `${source}-stale-worker`, leaseSeconds: 30, source });
    await sql`
      update public.response_processing_job
      set locked_until = now() - interval '1 minute'
      where id = ${stale.job.id}
    `.execute(db);
    response = await queueRemediationPost(postRequest("/_api/responses/queue-remediation", {
      jobId: stale.job.id,
      action: "mark_stale_reviewed",
      confirmReview: true,
    }));
    expect(response.status).toBe(200);
    expect((await response.json()).remediation.status).toBe("stale_running_reviewed");

    const events = await sql<any>`
      select event_type, details
      from public.response_processing_job_event
      where job_id in (${sql.join([failed.job!.id, dead.job.id, stale.job.id])})
      order by id asc
    `.execute(db);
    expect(events.rows.map((row) => row.event_type ?? row.eventType)).toEqual(
      expect.arrayContaining(["operator_retry_requested", "dead_letter_acknowledged", "replacement_enqueued", "stale_running_reviewed"]),
    );
    assertNoSensitiveLeak([retried, replacement, events.rows]);
  });

  it("rejects unsupported remediation action and unsafe review notes without leaking input", async () => {
    const source = trackSource(marker());
    const admin = await createUser(`${source}-admin`, "admin");
    auth.user = admin;
    const dead = await enqueueResponseProcessingJob({
      jobType: "future_mailbox_intake",
      source,
      maxAttempts: 1,
      runAfter: "2000-01-01T00:00:00.000Z",
      payload: { messageReferenceHash: "c".repeat(64) },
    });
    await processNextResponseProcessingJob({ workerId: `${source}-dead-worker`, source });

    let response = await queueRemediationPost(postRequest("/_api/responses/queue-remediation", {
      jobId: dead.job.id,
      action: "delete_job",
      confirmReview: true,
    }));
    expect(response.status).toBe(400);

    response = await queueRemediationPost(postRequest("/_api/responses/queue-remediation", {
      jobId: dead.job.id,
      action: "acknowledge_dead_letter",
      confirmReview: true,
      reviewNote: "SHOULD_NOT_STORE_RAW_RESPONSE_TEXT 123-456-789",
    }));
    const parsed = await response.json();
    expect(response.status).toBe(400);
    assertNoSensitiveLeak(parsed);
  });
});
