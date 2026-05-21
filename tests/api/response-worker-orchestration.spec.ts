import "../../loadEnv.js";

import { sql, type Kysely } from "kysely";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { ensureResponseDocumentSchema } from "../../helpers/responseDocumentSchema";
import { getResponseProcessingMetrics } from "../../helpers/responseProcessingMetrics";
import {
  enqueueResponseProcessingJob,
  processNextResponseProcessingJob,
} from "../../helpers/responseProcessingQueueService";
import {
  getResponseWorkerOrchestrationMetrics,
  runResponseWorkerOrchestration,
} from "../../helpers/responseWorkerOrchestrationService";
import type { DB } from "../../helpers/schema";
import { runSyntheticResponseWorkerOrchestrationCheck } from "../../scripts/response-processing-orchestration-check";
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
};

function marker(): string {
  markerCounter += 1;
  return `rworchtest${Date.now().toString(36)}${markerCounter.toString(36)}`;
}

function trackSource(source: string): string {
  created.sources.push(source);
  return source;
}

function assertNoSensitiveLeak(value: unknown) {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain("123-456-789");
  expect(serialized).not.toContain("1234567890123456");
  expect(serialized).not.toMatch(/raw response text|full email body|email body dump|postgres:\/\/|database_url|private key|api[_-]?key|bearer\s+[a-z0-9._-]+|session=|cookie=|oauth refresh token|mailbox password/i);
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
    await sql`
      delete from public.response_worker_orchestration_event event
      using public.response_worker_orchestration_run run
      where event.run_id = run.id
        and (run.source = ${source} or run.lock_scope like ${`${source}%`})
    `.execute(db);
    await sql`
      delete from public.response_worker_orchestration_run
      where source = ${source}
        or lock_scope like ${`${source}%`}
    `.execute(db);
  }
  created.sources = [];
}

async function insertSyntheticRunningLock(source: string, lockScope: string, stale: boolean) {
  const inserted = await sql<{ id: string }>`
    insert into public.response_worker_orchestration_run (
      lock_scope,
      status,
      mode,
      worker_id,
      source,
      max_jobs,
      dry_run,
      locked_until,
      result_summary
    ) values (
      ${lockScope},
      'running',
      'scheduled_bounded',
      ${`${source}-synthetic-lock`},
      ${source},
      1,
      false,
      ${stale ? sql`now() - interval '1 minute'` : sql`now() + interval '10 minutes'`},
      ${JSON.stringify({ fixture: "orchestration_lock", rawResponseTextLogged: false })}::text::jsonb
    )
    returning id::text as id
  `.execute(db);
  await sql`
    insert into public.response_worker_orchestration_event (
      run_id,
      event_type,
      next_status,
      worker_id,
      details
    ) values (
      ${Number(inserted.rows[0]?.id)},
      'started',
      'running',
      ${`${source}-synthetic-lock`},
      ${JSON.stringify({ fixture: "orchestration_lock", rawResponseTextLogged: false })}::text::jsonb
    )
  `.execute(db);
}

describeIfLocalDb("response worker orchestration", () => {
  beforeAll(async () => {
    db = (await import("../../helpers/db")).db;
    await ensureResponseDocumentSchema();
  });

  afterEach(async () => {
    await cleanupCreatedRows();
  });

  it("keeps orchestration event history protected from cascade deletes", async () => {
    const constraint = await sql<{ confdeltype: string }>`
      select confdeltype
      from pg_constraint
      where conname = 'response_worker_orchestration_event_run_id_fkey'
        and conrelid = 'public.response_worker_orchestration_event'::regclass
      limit 1
    `.execute(db);

    expect(constraint.rows[0]?.confdeltype).toBe("r");
  });

  it("does not keep old overlap skips active forever", async () => {
    const source = trackSource(marker());
    const inserted = await sql<{ id: string }>`
      insert into public.response_worker_orchestration_run (
        lock_scope,
        status,
        mode,
        worker_id,
        source,
        max_jobs,
        dry_run,
        locked_until,
        finished_at,
        skipped_reason,
        result_summary,
        created_at,
        updated_at
      ) values (
        ${`${source}-old-overlap`},
        'skipped',
        'scheduled_bounded',
        ${`${source}-old-worker`},
        ${source},
        1,
        false,
        now() - interval '2 days',
        now() - interval '2 days',
        'overlap_active',
        ${JSON.stringify({ fixture: "old_overlap_skip", rawResponseTextLogged: false })}::text::jsonb,
        now() - interval '2 days',
        now() - interval '2 days'
      )
      returning id::text as id
    `.execute(db);
    const insertedEvent = await sql<{ id: string }>`
      insert into public.response_worker_orchestration_event (
        run_id,
        event_type,
        next_status,
        worker_id,
        details,
        created_at
      ) values (
        ${Number(inserted.rows[0]?.id)},
        'skipped_overlap',
        'skipped',
        ${`${source}-old-worker`},
        ${JSON.stringify({ fixture: "old_overlap_skip", rawResponseTextLogged: false })}::text::jsonb,
        now() - interval '2 days'
      )
      returning id::text as id
    `.execute(db);

    const activeContribution = await sql<{ count: number }>`
      select count(*)::int as count
      from public.response_worker_orchestration_event
      where id = ${Number(insertedEvent.rows[0]?.id)}
        and event_type in ('skipped_overlap', 'skipped_stale_lock')
        and created_at >= now() - interval '24 hours'
    `.execute(db);

    expect(Number(activeContribution.rows[0]?.count ?? 0)).toBe(0);
    expect((await getResponseWorkerOrchestrationMetrics()).boundaries.overlapPreventionEnabled).toBe(true);
  });

  it("dry-run previews without writing orchestration or queue claim state", async () => {
    const source = trackSource(marker());
    const queued = await enqueueResponseProcessingJob({
      jobType: "response_replay_dry_run",
      source,
      payload: { filters: { responseId: 9_992_001, limit: 1 } },
    });

    const result = await runResponseWorkerOrchestration({
      dryRun: true,
      source,
      lockScope: `${source}-dry-run`,
      workerId: `${source}-dry-run-worker`,
    });

    expect(result).toMatchObject({
      status: "dry_run_preview",
      dryRun: true,
      run: null,
      processed: 0,
      failureCount: 0,
      boundaries: {
        bounded: true,
        noDaemon: true,
        noRawResponseText: true,
        externalAlertDeliveryUsed: false,
        liveMailboxIntegrationUsed: false,
      },
    });
    expect(result.iterations[0]).toMatchObject({
      status: "dry_run_preview",
      jobId: queued.job.id,
    });

    const runs = await sql<{ count: string }>`
      select count(*)::text as count
      from public.response_worker_orchestration_run
      where source = ${source}
        or lock_scope = ${`${source}-dry-run`}
    `.execute(db);
    const job = await sql<any>`
      select status, locked_by
      from public.response_processing_job
      where id = ${queued.job.id}
    `.execute(db);
    expect(Number(runs.rows[0]?.count ?? 0)).toBe(0);
    expect(job.rows[0]?.status).toBe("queued");
    expect(job.rows[0]?.locked_by ?? job.rows[0]?.lockedBy ?? null).toBeNull();
    assertNoSensitiveLeak(result);
  });

  it("executes a bounded non-daemon run and records append-only orchestration events", async () => {
    const source = trackSource(marker());
    await enqueueResponseProcessingJob({
      jobType: "response_replay_dry_run",
      source,
      payload: { filters: { responseId: 9_992_010, limit: 1 } },
    });
    await enqueueResponseProcessingJob({
      jobType: "response_replay_dry_run",
      source,
      payload: { filters: { responseId: 9_992_011, limit: 1 } },
    });

    const result = await runResponseWorkerOrchestration({
      dryRun: false,
      maxJobs: 1,
      source,
      lockScope: `${source}-bounded`,
      workerId: `${source}-bounded-worker`,
    });

    expect(result.status).toBe("succeeded");
    expect(result.processed).toBe(1);
    expect(result.run?.status).toBe("succeeded");

    const events = await sql<any>`
      select event_type, next_status, details
      from public.response_worker_orchestration_event
      where run_id = ${result.run!.id}
      order by id asc
    `.execute(db);
    expect(events.rows.map((row) => row.event_type ?? row.eventType)).toEqual(["started", "succeeded"]);
    const jobs = await sql<any>`
      select status, count(*)::int as count
      from public.response_processing_job
      where source = ${source}
      group by status
    `.execute(db);
    expect(jobs.rows.some((row) => row.status === "succeeded" && Number(row.count) === 1)).toBe(true);
    expect(jobs.rows.some((row) => row.status === "queued" && Number(row.count) === 1)).toBe(true);
    assertNoSensitiveLeak([result, events.rows]);
  });

  it("skips overlapping and stale-lock orchestration runs without claiming queue jobs", async () => {
    const source = trackSource(marker());
    await insertSyntheticRunningLock(source, `${source}-overlap`, false);
    await insertSyntheticRunningLock(source, `${source}-stale-lock`, true);

    const overlap = await runResponseWorkerOrchestration({
      dryRun: false,
      source,
      lockScope: `${source}-overlap`,
      workerId: `${source}-overlap-worker`,
    });
    const staleLock = await runResponseWorkerOrchestration({
      dryRun: false,
      source,
      lockScope: `${source}-stale-lock`,
      workerId: `${source}-stale-lock-worker`,
    });

    expect(overlap).toMatchObject({ status: "skipped", skippedReason: "overlap_active", processed: 0 });
    expect(staleLock).toMatchObject({ status: "skipped", skippedReason: "stale_lock_present", processed: 0 });
    const metrics = await getResponseWorkerOrchestrationMetrics();
    expect(metrics.skippedOverlapRuns).toBeGreaterThanOrEqual(2);
    expect(metrics.staleRunningRuns).toBeGreaterThanOrEqual(1);
    assertNoSensitiveLeak([overlap, staleLock, metrics]);
  });

  it("surfaces worker failure, dead-letter, retry backlog, and internal alerts without external delivery", async () => {
    const source = trackSource(marker());
    for (let index = 0; index < 2; index += 1) {
      await enqueueResponseProcessingJob({
        jobType: "future_mailbox_intake",
        source,
        maxAttempts: 1,
        runAfter: "2000-01-01T00:00:00.000Z",
        payload: { messageReferenceHash: "e".repeat(64 - String(index).length) + String(index) },
      });
      const failed = await runResponseWorkerOrchestration({
        dryRun: false,
        maxJobs: 1,
        source,
        lockScope: `${source}-failure-${index}`,
        workerId: `${source}-failure-worker-${index}`,
      });
      expect(failed.status).toBe("failed");
    }

    await enqueueResponseProcessingJob({
      jobType: "response_replay_dry_run",
      source,
      maxAttempts: 2,
      runAfter: "2000-01-01T00:00:00.000Z",
      payload: { filters: { classification: "unsupported_response_state" as any, limit: 1 } },
    });
    await processNextResponseProcessingJob({ workerId: `${source}-retry-worker`, source });
    await sql`
      update public.response_processing_job
      set run_after = now() - interval '1 minute'
      where source = ${source}
        and status = 'failed'
    `.execute(db);

    const metrics = await getResponseProcessingMetrics({ lookbackHours: 24 }, { id: 1, role: "admin" });
    const activeAlertKeys = metrics.alerts.filter((alert) => alert.active).map((alert) => alert.key);
    expect(activeAlertKeys).toEqual(expect.arrayContaining([
      "queue_dead_letter_backlog",
      "repeated_worker_failures",
    ]));
    expect(metrics.queueHealth.deadLetteredJobs).toBeGreaterThanOrEqual(2);
    expect(metrics.queueHealth.retryBacklogJobs).toBeGreaterThanOrEqual(1);
    expect(metrics.workerOrchestration.recentFailedRuns).toBeGreaterThanOrEqual(2);
    expect(metrics.workerOrchestration.boundaries).toMatchObject({
      bounded: true,
      noDaemon: true,
      externalAlertDeliveryUsed: false,
      liveMailboxIntegrationUsed: false,
    });
    assertNoSensitiveLeak(metrics);
  });

  it("runs synthetic orchestration coverage and cleans isolated rows", async () => {
    const result = await runSyntheticResponseWorkerOrchestrationCheck();
    expect(result).toMatchObject({
      event: "response_worker_orchestration_check",
      boundedRunProcessed: 2,
      overlapSkipped: true,
      staleLockSkipped: true,
      repeatedWorkerFailuresObserved: true,
      deadLetterBacklogObserved: true,
      retryBacklogObserved: true,
      staleRunningObserved: true,
      cleanupComplete: true,
      rawResponseTextLogged: false,
      externalAlertDeliveryUsed: false,
      liveMailboxIntegrationUsed: false,
    });
    const remainingRuns = await sql<{ count: string }>`
      select count(*)::text as count
      from public.response_worker_orchestration_run
      where source = ${result.source}
        or lock_scope like ${`${result.source}%`}
    `.execute(db);
    const remainingJobs = await sql<{ count: string }>`
      select count(*)::text as count
      from public.response_processing_job
      where source = ${result.source}
    `.execute(db);
    expect(Number(remainingRuns.rows[0]?.count ?? 0)).toBe(0);
    expect(Number(remainingJobs.rows[0]?.count ?? 0)).toBe(0);
    assertNoSensitiveLeak(result);
  });
});
