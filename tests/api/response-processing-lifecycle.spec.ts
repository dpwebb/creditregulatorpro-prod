import "../../loadEnv.js";

import { sql, type Kysely } from "kysely";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { ensureResponseDocumentSchema } from "../../helpers/responseDocumentSchema";
import {
  applyResponseProcessingRetentionCleanup,
  getResponseProcessingDriftReport,
  getResponseProcessingLifecycleMetrics,
  getResponseProcessingRetentionPreview,
} from "../../helpers/responseProcessingLifecycleService";
import type { DB, UserRole } from "../../helpers/schema";
import { runSyntheticResponseProcessingSoakCheck } from "../../scripts/response-processing-soak-check";
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
};

function marker(): string {
  markerCounter += 1;
  return `response-lifecycle-test-${Date.now().toString(36)}-${markerCounter.toString(36)}`;
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
    await sql`
      delete from public.response_processing_lifecycle_event
      where source = ${source}
    `.execute(db);
  }
  await sql`
    delete from public.response_processing_lifecycle_event
    where source = 'response_soak_check'
      and details ->> 'status' = 'succeeded'
  `.execute(db);
  if (created.userIds.length > 0) {
    await db.deleteFrom("users").where("id", "in", Array.from(new Set(created.userIds))).execute();
  }
  created.sources = [];
  created.userIds = [];
}

async function insertJob(source: string, status: "queued" | "running" | "succeeded" | "failed" | "dead_lettered", suffix: string) {
  const result = await sql<{ id: string }>`
    insert into public.response_processing_job (
      job_type,
      status,
      payload,
      idempotency_key,
      source,
      run_after,
      started_at,
      finished_at,
      created_at,
      updated_at,
      attempt_count,
      max_attempts,
      locked_until,
      result_summary
    ) values (
      'response_replay_dry_run',
      ${status},
      ${JSON.stringify({ filters: { responseId: 9_996_000, limit: 1 }, metadata: { fixture: "lifecycle" } })}::text::jsonb,
      ${`${source}-${suffix}`},
      ${source},
      now() - interval '1 minute',
      ${status === "running" ? sql`now() - interval '2 hours'` : null},
      ${status === "succeeded" || status === "dead_lettered" || status === "failed" ? sql`now() - interval '120 days'` : null},
      now() - interval '120 days',
      now() - interval '120 days',
      ${status === "failed" || status === "dead_lettered" ? 1 : 0},
      ${status === "failed" ? 2 : 1},
      ${status === "running" ? sql`now() - interval '1 hour'` : null},
      ${JSON.stringify({ fixture: "lifecycle", rawResponseTextLogged: false })}::text::jsonb
    )
    returning id::text as id
  `.execute(db);
  return Number(result.rows[0]?.id);
}

async function insertOrchestrationRun(source: string, status: "running" | "succeeded" | "failed" | "skipped", suffix: string) {
  const result = await sql<{ id: string }>`
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
      ${`${source}-${suffix}`},
      ${status},
      'scheduled_bounded',
      ${`${source}-worker`},
      ${source},
      1,
      false,
      ${status === "running" ? sql`now() - interval '1 hour'` : sql`now() - interval '120 days'`},
      ${status === "running" ? null : sql`now() - interval '120 days'`},
      ${status === "skipped" ? "overlap_active" : null},
      ${JSON.stringify({ fixture: "lifecycle", rawResponseTextLogged: false })}::text::jsonb,
      now() - interval '120 days',
      now() - interval '120 days'
    )
    returning id::text as id
  `.execute(db);
  return Number(result.rows[0]?.id);
}

describeIfLocalDb("response processing lifecycle retention and drift", () => {
  beforeAll(async () => {
    db = (await import("../../helpers/db")).db;
    await ensureResponseDocumentSchema();
  });

  afterEach(async () => {
    await cleanupCreatedRows();
  });

  it("previews retention without writing lifecycle events and protects active, stale, failed, and dead-letter jobs", async () => {
    const source = trackSource(marker());
    await insertJob(source, "succeeded", "old-succeeded");
    await insertJob(source, "running", "stale-running");
    await insertJob(source, "failed", "failed");
    await insertJob(source, "dead_lettered", "dead-lettered");
    await insertOrchestrationRun(source, "succeeded", "old-run");
    await insertOrchestrationRun(source, "running", "stale-run");
    const before = await sql<{ count: string }>`
      select count(*)::text as count
      from public.response_processing_lifecycle_event
      where source = ${source}
    `.execute(db);

    const preview = await getResponseProcessingRetentionPreview({ source, olderThanDays: 30, limit: 10 });

    expect(preview).toMatchObject({
      dryRun: true,
      source,
      queueJobs: {
        eligibleRecords: 1,
        blockedActiveRecords: 1,
        blockedStaleRecords: 1,
        blockedFailedRecords: 1,
        blockedDeadLetterRecords: 1,
        destructiveDeleteUsed: false,
      },
      orchestrationRuns: {
        eligibleRecords: 1,
        blockedActiveRecords: 1,
        blockedStaleRecords: 1,
      },
      replayAuditHistory: {
        eligibleRecords: 0,
        reason: "append_only_replay_audit_retained",
      },
      boundaries: {
        activeJobsProtected: true,
        deadLetterJobsProtected: true,
        appendOnlyLifecycleEvents: true,
        rawResponseTextStored: false,
      },
    });
    const after = await sql<{ count: string }>`
      select count(*)::text as count
      from public.response_processing_lifecycle_event
      where source = ${source}
    `.execute(db);
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
    assertNoSensitiveLeak(preview);
  });

  it("requires explicit actor-confirmed cleanup apply and marks eligible records append-only without deleting jobs or events", async () => {
    const source = trackSource(marker());
    const actorUserId = await createUser(`${source}-actor`);
    const succeededJobId = await insertJob(source, "succeeded", "old-succeeded");
    const deadJobId = await insertJob(source, "dead_lettered", "dead-lettered");
    await sql`
      insert into public.response_processing_job_event (
        job_id,
        event_type,
        next_status,
        details
      ) values (
        ${succeededJobId},
        'succeeded',
        'succeeded',
        ${JSON.stringify({ fixture: "retention_event", rawResponseTextLogged: false })}::text::jsonb
      )
    `.execute(db);
    await insertOrchestrationRun(source, "succeeded", "old-run");

    await expect(applyResponseProcessingRetentionCleanup({
      source,
      olderThanDays: 30,
      dryRun: false,
      actorUserId,
    })).rejects.toThrow(/confirmCleanup/i);
    await expect(applyResponseProcessingRetentionCleanup({
      source,
      olderThanDays: 30,
      dryRun: false,
      confirmCleanup: true,
    })).rejects.toThrow(/actorUserId/i);

    const applied = await applyResponseProcessingRetentionCleanup({
      source,
      olderThanDays: 30,
      limit: 10,
      dryRun: false,
      confirmCleanup: true,
      actorUserId,
    });
    expect(applied).toMatchObject({
      dryRun: false,
      markedQueueJobs: 1,
      markedOrchestrationRuns: 1,
      boundaries: {
        destructiveDeleteUsed: false,
        payloadsMutated: false,
        jobEventsDeleted: false,
        orchestrationEventsDeleted: false,
      },
    });

    const repeated = await applyResponseProcessingRetentionCleanup({
      source,
      olderThanDays: 30,
      limit: 10,
      dryRun: false,
      confirmCleanup: true,
      actorUserId,
    });
    expect(repeated.markedQueueJobs).toBe(0);
    expect(repeated.markedOrchestrationRuns).toBe(0);

    const jobs = await sql<any>`
      select id, status
      from public.response_processing_job
      where source = ${source}
      order by id asc
    `.execute(db);
    expect(jobs.rows.map((row) => row.status)).toEqual(expect.arrayContaining(["succeeded", "dead_lettered"]));
    expect(jobs.rows.some((row) => Number(row.id) === deadJobId && row.status === "dead_lettered")).toBe(true);
    const jobEvents = await sql<{ count: string }>`
      select count(*)::text as count
      from public.response_processing_job_event
      where job_id = ${succeededJobId}
    `.execute(db);
    expect(Number(jobEvents.rows[0]?.count ?? 0)).toBe(1);
    const lifecycleEvents = await sql<any>`
      select event_type, target_type, target_id, details
      from public.response_processing_lifecycle_event
      where source = ${source}
      order by id asc
    `.execute(db);
    expect(lifecycleEvents.rows.filter((row) => (row.target_type ?? row.targetType) === "response_processing_job")).toHaveLength(1);
    expect(lifecycleEvents.rows.some((row) => Number(row.target_id ?? row.targetId) === succeededJobId)).toBe(true);
    expect(JSON.stringify(lifecycleEvents.rows)).toContain("retention_mark_only");
    assertNoSensitiveLeak([applied, repeated, jobs.rows, lifecycleEvents.rows]);
  });

  it("detects deterministic operational drift without auto-remediation or unsafe output", async () => {
    const source = trackSource(marker());
    const deadJobId = await insertJob(source, "dead_lettered", "dead-lettered");
    await insertJob(source, "failed", "retryable-failed");
    await insertJob(source, "running", "stale-running");
    await insertJob(source, "queued", "old-queued");
    const failedRunId = await insertOrchestrationRun(source, "failed", "failed-run");
    await sql`
      update public.response_processing_job
      set updated_at = now()
      where id = ${deadJobId}
    `.execute(db);
    await sql`
      update public.response_worker_orchestration_run
      set created_at = now(),
          updated_at = now()
      where id = ${failedRunId}
    `.execute(db);
    await sql`
      insert into public.response_worker_orchestration_event (
        run_id,
        event_type,
        next_status,
        worker_id,
        details
      ) values (
        ${failedRunId},
        'skipped_overlap',
        'skipped',
        ${`${source}-worker`},
        ${JSON.stringify({ fixture: "drift_overlap", rawResponseTextLogged: false })}::text::jsonb
      )
    `.execute(db);
    await sql`
      insert into public.response_processing_job_event (
        job_id,
        event_type,
        previous_status,
        next_status,
        details
      ) values (
        ${deadJobId},
        'replacement_enqueued',
        'dead_lettered',
        'dead_lettered',
        ${JSON.stringify({ replacementJobId: 9_999_999_001, rawResponseTextLogged: false })}::text::jsonb
      )
    `.execute(db);

    const drift = await getResponseProcessingDriftReport({
      source,
      thresholds: {
        deadLetterGrowthDelta: 1,
        retryBacklogJobs: 1,
        staleRunningJobs: 1,
        orchestrationOverlapSkips: 1,
        repeatedWorkerFailures: 1,
        orphanedReplacementChains: 1,
        oldestQueuedAgeSeconds: 1,
        oldestDeadLetterAgeSeconds: 1,
        replayNonReplayableRecords: 1_000_000,
      },
    });
    const active = drift.checks.filter((check) => check.active).map((check) => check.key);
    expect(active).toEqual(expect.arrayContaining([
      "dead_letter_growth_trend",
      "retry_backlog_growth",
      "stale_running_accumulation",
      "orchestration_overlap_frequency",
      "repeated_worker_failures",
      "orphaned_replacement_chains",
      "old_queued_jobs",
      "old_dead_letter_jobs",
    ]));
    expect(drift.boundaries).toMatchObject({
      operatorVisibleOnly: true,
      noExternalAlerts: true,
      noAutoRemediation: true,
      noRawResponseText: true,
      liveMailboxIntegrationUsed: false,
    });
    assertNoSensitiveLeak(drift);
  });

  it("surfaces lifecycle metrics and runs bounded soak coverage with isolated cleanup", async () => {
    const result = await runSyntheticResponseProcessingSoakCheck(2);
    expect(result).toMatchObject({
      event: "response_processing_soak_check",
      cycles: 2,
      duplicateCollapsed: true,
      retryBacklogObserved: true,
      deadLetterObserved: true,
      staleRunningObserved: true,
      repeatedOverlapObserved: true,
      replayDryRunExecuted: true,
      retentionPreviewVerified: true,
      driftDetected: true,
      cleanupComplete: true,
      rawResponseTextLogged: false,
      externalAlertDeliveryUsed: false,
      liveMailboxIntegrationUsed: false,
    });
    const remaining = await sql<{ jobs: string; runs: string; lifecycle: string }>`
      select
        (select count(*)::text from public.response_processing_job where source = ${result.source}) as jobs,
        (select count(*)::text from public.response_worker_orchestration_run where source = ${result.source} or lock_scope like ${`${result.source}%`}) as runs,
        (select count(*)::text from public.response_processing_lifecycle_event where source = ${result.source}) as lifecycle
    `.execute(db);
    expect(Number(remaining.rows[0]?.jobs ?? 0)).toBe(0);
    expect(Number(remaining.rows[0]?.runs ?? 0)).toBe(0);
    expect(Number(remaining.rows[0]?.lifecycle ?? 0)).toBe(0);

    const metrics = await getResponseProcessingLifecycleMetrics();
    expect(metrics.lastSoakCheckStatus).toBe("succeeded");
    expect(metrics.boundaries).toMatchObject({
      appendOnlyLifecycleEvents: true,
      destructiveDeleteUsed: false,
      noRawResponseText: true,
      externalAlertDeliveryUsed: false,
      liveMailboxIntegrationUsed: false,
    });
    assertNoSensitiveLeak([result, metrics]);
  });
});
