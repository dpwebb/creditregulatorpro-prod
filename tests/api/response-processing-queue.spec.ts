import "../../loadEnv.js";

import { sql, type Kysely } from "kysely";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import type { DB, UserRole } from "../../helpers/schema";
import {
  claimNextResponseProcessingJob,
  enqueueResponseProcessingJob,
  getResponseProcessingQueueMetrics,
  processNextResponseProcessingJob,
  requeueDeadLetteredResponseProcessingJob,
} from "../../helpers/responseProcessingQueueService";
import { ensureResponseDocumentSchema } from "../../helpers/responseDocumentSchema";
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

const created = {
  sources: [] as string[],
  userIds: [] as number[],
};

function marker(): string {
  return `response-queue-test-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function trackSource(source: string): string {
  created.sources.push(source);
  return source;
}

function assertNoSensitiveLeak(value: unknown) {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain("123-456-789");
  expect(serialized).not.toContain("1234567890123456");
  expect(serialized).not.toContain("SHOULD_NOT_STORE_RAW_RESPONSE_TEXT");
  expect(serialized).not.toMatch(/raw response text|full email body|email body dump|postgres:\/\/|database_url|private key|api[_-]?key|bearer\s+[a-z0-9._-]+|session=|cookie=|oauth refresh token|mailbox password/i);
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

async function cleanupCreatedRows(): Promise<void> {
  for (const source of Array.from(new Set(created.sources))) {
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

describeIfLocalDb("response processing queue", () => {
  beforeAll(async () => {
    db = (await import("../../helpers/db")).db;
    await ensureResponseDocumentSchema();
  });

  afterEach(async () => {
    await cleanupCreatedRows();
  });

  it("enqueues sanitized durable jobs and records duplicate idempotency attempts without raw text", async () => {
    const source = trackSource(marker());
    const idempotencyKey = `${source}-dry-run`;
    const first = await enqueueResponseProcessingJob({
      jobType: "response_replay_dry_run",
      source,
      idempotencyKey,
      payload: {
        filters: {
          responseId: 999_999_901,
          limit: 1,
        },
      },
    });
    const duplicate = await enqueueResponseProcessingJob({
      jobType: "response_replay_dry_run",
      source,
      idempotencyKey,
      payload: {
        filters: {
          limit: 1,
          responseId: 999_999_901,
        },
      },
    });

    expect(first.status).toBe("queued");
    expect(duplicate).toMatchObject({
      status: "duplicate",
      duplicateOfJobId: first.job.id,
    });

    const rows = await sql<any>`
      select job.payload, event.event_type, event.details
      from public.response_processing_job job
      left join public.response_processing_job_event event on event.job_id = job.id
      where job.source = ${source}
      order by event.id asc
    `.execute(db);
    expect(rows.rows.map((row) => row.event_type ?? row.eventType)).toEqual(["queued", "duplicate_enqueue"]);
    assertNoSensitiveLeak(rows.rows);
  });

  it("rejects malformed payloads, raw response text, unsupported job types, and unsafe replay apply requests", async () => {
    const source = trackSource(marker());
    await expect(enqueueResponseProcessingJob({
      jobType: "response_intake_process",
      source,
      payload: {
        responseText: "SHOULD_NOT_STORE_RAW_RESPONSE_TEXT",
      } as any,
    })).rejects.toThrow(/unsafe key|responseId/i);

    await expect(enqueueResponseProcessingJob({
      jobType: "not_supported" as any,
      source,
      payload: {},
    })).rejects.toThrow(/Unsupported response processing job type/i);

    await expect(enqueueResponseProcessingJob({
      jobType: "response_replay_apply",
      source,
      payload: { filters: { responseId: 999_999_902 } },
    })).rejects.toThrow(/confirmApply/i);

    await expect(enqueueResponseProcessingJob({
      jobType: "response_replay_apply",
      source,
      payload: { confirmApply: true, filters: { responseId: 999_999_902 } },
    })).rejects.toThrow(/actorUserId/i);
  });

  it("rejects mailbox-shaped credentials, raw body fields, email addresses, and unsafe identifiers", async () => {
    const source = trackSource(marker());
    await expect(enqueueResponseProcessingJob({
      jobType: "response_replay_dry_run",
      source,
      payload: {
        metadata: {
          body: "verified as accurate",
        },
      },
    })).rejects.toThrow(/unsafe key/i);

    await expect(enqueueResponseProcessingJob({
      jobType: "response_replay_dry_run",
      source,
      payload: {
        metadata: {
          accessToken: "synthetic-token-value",
        },
      },
    })).rejects.toThrow(/unsafe key|sensitive content/i);

    await expect(enqueueResponseProcessingJob({
      jobType: "response_replay_dry_run",
      source,
      payload: {
        metadata: {
          senderDomain: "operator@example.test",
        },
      },
    })).rejects.toThrow(/sensitive content/i);

    await expect(enqueueResponseProcessingJob({
      jobType: "response_replay_dry_run",
      source: "1234567890",
      payload: { filters: { responseId: 999_999_912, limit: 1 } },
    })).rejects.toThrow(/safe internal token/i);
  });

  it("processes one synthetic dry-run job and leaves only append-only queue events", async () => {
    const source = trackSource(marker());
    const queued = await enqueueResponseProcessingJob({
      jobType: "response_replay_dry_run",
      source,
      payload: { filters: { responseId: 999_999_903, limit: 1 } },
    });

    const result = await processNextResponseProcessingJob({ workerId: `${source}-worker` });
    expect(result.status).toBe("succeeded");
    expect(result.job?.id).toBe(queued.job.id);
    expect(result.job?.resultSummary).toMatchObject({
      mode: "dry_run",
      appendedProcessingEvents: 0,
      canonicalFactsMutated: false,
      violationTruthMutated: false,
      packetReadinessMutated: false,
    });

    const events = await sql<any>`
      select event_type, previous_status, next_status, details
      from public.response_processing_job_event
      where job_id = ${queued.job.id}
      order by id asc
    `.execute(db);
    expect(events.rows.map((row) => row.event_type ?? row.eventType)).toEqual(["queued", "claimed", "succeeded"]);
    expect(events.rows.map((row) => row.next_status ?? row.nextStatus)).toEqual(["queued", "running", "succeeded"]);
    assertNoSensitiveLeak([result, events.rows]);
  });

  it("previews an eligible job in worker dry-run without claiming or writing queue events", async () => {
    const source = trackSource(marker());
    const queued = await enqueueResponseProcessingJob({
      jobType: "response_replay_dry_run",
      source,
      payload: { filters: { responseId: 999_999_907, limit: 1 } },
    });
    const before = await sql<{ count: string }>`
      select count(*)::text as count
      from public.response_processing_job_event
      where job_id = ${queued.job.id}
    `.execute(db);

    const preview = await processNextResponseProcessingJob({ workerId: `${source}-worker`, dryRun: true });
    expect(preview).toMatchObject({
      status: "dry_run_preview",
      dryRun: true,
      job: {
        id: queued.job.id,
        status: "queued",
      },
    });

    const after = await sql<{ count: string }>`
      select count(*)::text as count
      from public.response_processing_job_event
      where job_id = ${queued.job.id}
    `.execute(db);
    const stored = await sql<any>`
      select status, locked_by
      from public.response_processing_job
      where id = ${queued.job.id}
    `.execute(db);
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
    expect(stored.rows[0]?.status).toBe("queued");
    expect(stored.rows[0]?.locked_by ?? stored.rows[0]?.lockedBy ?? null).toBeNull();
    assertNoSensitiveLeak(preview);
  });

  it("does not process the same queued job concurrently", async () => {
    const source = trackSource(marker());
    const queued = await enqueueResponseProcessingJob({
      jobType: "response_replay_dry_run",
      source,
      payload: { filters: { responseId: 999_999_904, limit: 1 } },
    });

    const [left, right] = await Promise.all([
      processNextResponseProcessingJob({ workerId: `${source}-worker-left` }),
      processNextResponseProcessingJob({ workerId: `${source}-worker-right` }),
    ]);
    const statuses = [left.status, right.status].sort();
    expect(statuses).toEqual(["idle", "succeeded"]);

    const claims = await sql<{ count: string }>`
      select count(*)::text as count
      from public.response_processing_job_event
      where job_id = ${queued.job.id}
        and event_type = 'claimed'
    `.execute(db);
    expect(Number(claims.rows[0]?.count ?? 0)).toBe(1);
  });

  it("deduplicates concurrent active enqueues but allows new work after terminal status", async () => {
    const source = trackSource(marker());
    const idempotencyKey = `${source}-concurrent`;
    const [left, right] = await Promise.all([
      enqueueResponseProcessingJob({
        jobType: "response_replay_dry_run",
        source,
        idempotencyKey,
        payload: { filters: { responseId: 999_999_913, limit: 1 } },
      }),
      enqueueResponseProcessingJob({
        jobType: "response_replay_dry_run",
        source,
        idempotencyKey,
        payload: { filters: { responseId: 999_999_913, limit: 1 } },
      }),
    ]);
    expect([left.status, right.status].sort()).toEqual(["duplicate", "queued"]);
    const activeRows = await sql<{ count: string }>`
      select count(*)::text as count
      from public.response_processing_job
      where source = ${source}
        and idempotency_key = ${idempotencyKey}
    `.execute(db);
    expect(Number(activeRows.rows[0]?.count ?? 0)).toBe(1);

    await processNextResponseProcessingJob({ workerId: `${source}-worker` });
    const afterSucceeded = await enqueueResponseProcessingJob({
      jobType: "response_replay_dry_run",
      source,
      idempotencyKey,
      payload: { filters: { responseId: 999_999_913, limit: 1 } },
    });
    expect(afterSucceeded.status).toBe("queued");

    const allRows = await sql<any>`
      select status, payload
      from public.response_processing_job
      where source = ${source}
        and idempotency_key = ${idempotencyKey}
      order by id asc
    `.execute(db);
    expect(allRows.rows.map((row) => row.status)).toEqual(["succeeded", "queued"]);
    assertNoSensitiveLeak(allRows.rows);
  });

  it("builds stable idempotency keys for equivalent sanitized metadata without over-collapsing differences", async () => {
    const source = trackSource(marker());
    const first = await enqueueResponseProcessingJob({
      jobType: "response_replay_dry_run",
      source,
      payload: {
        filters: { responseId: 999_999_914, limit: 1 },
        metadata: {
          attachmentHash: "a".repeat(64),
          channel: "manual_admin",
        },
      },
    });
    const reordered = await enqueueResponseProcessingJob({
      jobType: "response_replay_dry_run",
      source,
      payload: {
        metadata: {
          channel: "manual_admin",
          attachmentHash: "a".repeat(64),
        },
        filters: { limit: 1, responseId: 999_999_914 },
      },
    });
    const changed = await enqueueResponseProcessingJob({
      jobType: "response_replay_dry_run",
      source,
      payload: {
        filters: { responseId: 999_999_914, limit: 1 },
        metadata: {
          attachmentHash: "b".repeat(64),
          channel: "manual_admin",
        },
      },
    });

    expect(first.status).toBe("queued");
    expect(reordered.status).toBe("duplicate");
    expect(reordered.duplicateOfJobId).toBe(first.job.id);
    expect(changed.status).toBe("queued");
    expect(changed.job.id).not.toBe(first.job.id);
    assertNoSensitiveLeak([first, reordered, changed]);
  });

  it("increments retries deterministically and dead-letters at max attempts", async () => {
    const retrySource = trackSource(marker());
    await enqueueResponseProcessingJob({
      jobType: "response_replay_dry_run",
      source: retrySource,
      maxAttempts: 2,
      payload: {
        filters: {
          classification: "unsupported_response_state" as any,
          limit: 1,
        },
      },
    });
    const retryResult = await processNextResponseProcessingJob({ workerId: `${retrySource}-worker` });
    expect(retryResult.status).toBe("failed");
    expect(retryResult.job?.attemptCount).toBe(1);
    expect(retryResult.job?.lastErrorCode).toBe("QUEUE_PROCESSING_FAILED");

    const deadSource = trackSource(marker());
    await enqueueResponseProcessingJob({
      jobType: "response_replay_dry_run",
      source: deadSource,
      maxAttempts: 1,
      payload: {
        filters: {
          classification: "unsupported_response_state" as any,
          limit: 1,
        },
      },
    });
    const deadResult = await processNextResponseProcessingJob({ workerId: `${deadSource}-worker` });
    expect(deadResult.status).toBe("dead_lettered");
    expect(deadResult.job?.status).toBe("dead_lettered");
    expect(deadResult.job?.attemptCount).toBe(1);

    const metrics = await getResponseProcessingQueueMetrics();
    expect(metrics.failedJobs).toBeGreaterThanOrEqual(1);
    expect(metrics.deadLetteredJobs).toBeGreaterThanOrEqual(1);
    expect(metrics.boundaries).toMatchObject({
      durableDbBacked: true,
      appendOnlyJobEvents: true,
      noRawResponseText: true,
      liveMailboxIntegrationUsed: false,
      packetReadinessMutated: false,
    });
    assertNoSensitiveLeak([retryResult, deadResult, metrics]);
  });

  it("detects stale running jobs without silently reclaiming them and can requeue dead-lettered jobs explicitly", async () => {
    const source = trackSource(marker());
    const actorUserId = await createUser(`${source}-actor`);
    const queued = await enqueueResponseProcessingJob({
      jobType: "response_replay_dry_run",
      source,
      payload: { filters: { responseId: 999_999_905, limit: 1 } },
    });
    const claimed = await claimNextResponseProcessingJob({ workerId: `${source}-claimer`, leaseSeconds: 30 });
    expect(claimed?.id).toBe(queued.job.id);

    await sql`
      update public.response_processing_job
      set locked_until = now() - interval '1 minute'
      where id = ${queued.job.id}
    `.execute(db);
    const staleMetrics = await getResponseProcessingQueueMetrics();
    expect(staleMetrics.staleRunningJobs).toBeGreaterThanOrEqual(1);
    const staleReplay = await processNextResponseProcessingJob({ workerId: `${source}-stale-worker` });
    expect(staleReplay.status).toBe("idle");
    const staleClaims = await sql<{ count: string }>`
      select count(*)::text as count
      from public.response_processing_job_event
      where job_id = ${queued.job.id}
        and event_type = 'claimed'
    `.execute(db);
    expect(Number(staleClaims.rows[0]?.count ?? 0)).toBe(1);

    const dead = await enqueueResponseProcessingJob({
      jobType: "future_mailbox_intake",
      source,
      maxAttempts: 1,
      payload: { messageReferenceHash: "a".repeat(64) },
    });
    const deadResult = await processNextResponseProcessingJob({ workerId: `${source}-dead-worker` });
    expect(deadResult.job?.id).toBe(dead.job.id);
    expect(deadResult.status).toBe("dead_lettered");
    expect(deadResult.job?.lastErrorCode).toBe("LIVE_MAILBOX_INTEGRATION_DEFERRED");

    const requeued = await requeueDeadLetteredResponseProcessingJob({
      jobId: dead.job.id,
      actorUserId,
    });
    expect(requeued).toMatchObject({
      id: dead.job.id,
      status: "queued",
      attemptCount: 0,
    });
    assertNoSensitiveLeak([staleMetrics, deadResult, requeued]);
  });

  it("allows replay apply jobs only with explicit confirmation and actor attribution", async () => {
    const source = trackSource(marker());
    const actorUserId = await createUser(`${source}-actor`);
    const queued = await enqueueResponseProcessingJob({
      jobType: "response_replay_apply",
      source,
      actorUserId,
      maxAttempts: 1,
      payload: {
        confirmApply: true,
        filters: {
          responseId: 999_999_906,
          limit: 1,
        },
      },
    });

    const result = await processNextResponseProcessingJob({ workerId: `${source}-worker` });
    expect(result.status).toBe("succeeded");
    expect(result.job?.id).toBe(queued.job.id);
    expect(result.job?.actorUserId).toBe(actorUserId);
    expect(result.job?.resultSummary).toMatchObject({
      mode: "apply",
      scanned: 0,
      appendedProcessingEvents: 0,
      canonicalFactsMutated: false,
      violationTruthMutated: false,
      packetReadinessMutated: false,
    });
    assertNoSensitiveLeak(result);
  });
});
