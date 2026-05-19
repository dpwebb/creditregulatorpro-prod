import "../loadEnv.js";

import { fileURLToPath } from "node:url";
import { sql } from "kysely";

import { db } from "../helpers/db";
import { ensureResponseDocumentSchema } from "../helpers/responseDocumentSchema";
import {
  claimNextResponseProcessingJob,
  enqueueResponseProcessingJob,
  getResponseProcessingQueueMetrics,
} from "../helpers/responseProcessingQueueService";
import {
  getResponseWorkerOrchestrationMetrics,
  runResponseWorkerOrchestration,
  sanitizeWorkerOrchestrationError,
} from "../helpers/responseWorkerOrchestrationService";

type SyntheticOrchestrationCheckResult = {
  event: "response_worker_orchestration_check";
  source: string;
  boundedRunProcessed: number;
  overlapSkipped: boolean;
  staleLockSkipped: boolean;
  repeatedWorkerFailuresObserved: boolean;
  deadLetterBacklogObserved: boolean;
  retryBacklogObserved: boolean;
  staleRunningObserved: boolean;
  cleanupComplete: boolean;
  rawResponseTextLogged: false;
  externalAlertDeliveryUsed: false;
  liveMailboxIntegrationUsed: false;
};

let markerCounter = 0;

function marker(): string {
  markerCounter += 1;
  return `response-worker-orchestration-${Date.now().toString(36)}-${process.pid.toString(36)}-${markerCounter.toString(36)}`;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function cleanup(source: string): Promise<void> {
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

  const remainingJobs = await sql<{ count: string }>`
    select count(*)::text as count
    from public.response_processing_job
    where source = ${source}
  `.execute(db);
  const remainingRuns = await sql<{ count: string }>`
    select count(*)::text as count
    from public.response_worker_orchestration_run
    where source = ${source}
      or lock_scope like ${`${source}%`}
  `.execute(db);
  if (Number(remainingJobs.rows[0]?.count ?? 0) !== 0 || Number(remainingRuns.rows[0]?.count ?? 0) !== 0) {
    throw new Error("Synthetic response worker orchestration cleanup left isolated rows behind.");
  }
}

async function insertSyntheticRunningLock(source: string, lockScope: string, stale: boolean): Promise<void> {
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
      ${JSON.stringify({
        fixture: "synthetic_orchestration_lock",
        rawResponseTextLogged: false,
        externalAlertDeliveryUsed: false,
      })}::text::jsonb
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
      ${JSON.stringify({
        fixture: "synthetic_orchestration_lock",
        rawResponseTextLogged: false,
        externalAlertDeliveryUsed: false,
      })}::text::jsonb
    )
  `.execute(db);
}

export async function runSyntheticResponseWorkerOrchestrationCheck(): Promise<SyntheticOrchestrationCheckResult> {
  await ensureResponseDocumentSchema();
  const source = marker();
  let result: Omit<SyntheticOrchestrationCheckResult, "cleanupComplete"> | null = null;
  try {
    await enqueueResponseProcessingJob({
      jobType: "response_replay_dry_run",
      source,
      payload: { filters: { responseId: 9_991_000, limit: 1 } },
    });
    await enqueueResponseProcessingJob({
      jobType: "response_replay_dry_run",
      source,
      payload: { filters: { responseId: 9_991_001, limit: 1 } },
    });
    await enqueueResponseProcessingJob({
      jobType: "response_replay_dry_run",
      source,
      payload: { filters: { responseId: 9_991_002, limit: 1 } },
    });
    const bounded = await runResponseWorkerOrchestration({
      dryRun: false,
      maxJobs: 2,
      source,
      lockScope: `${source}-bounded`,
      workerId: `${source}-bounded-worker`,
    });
    assert(bounded.status === "succeeded", "Synthetic orchestration bounded run did not succeed.");
    assert(bounded.processed === 2, "Synthetic orchestration did not enforce max-job bound.");

    await insertSyntheticRunningLock(source, `${source}-overlap`, false);
    const overlap = await runResponseWorkerOrchestration({
      dryRun: false,
      maxJobs: 1,
      source,
      lockScope: `${source}-overlap`,
      workerId: `${source}-overlap-worker`,
    });
    assert(overlap.status === "skipped" && overlap.skippedReason === "overlap_active", "Synthetic overlap run was not skipped.");

    await insertSyntheticRunningLock(source, `${source}-stale-lock`, true);
    const staleLock = await runResponseWorkerOrchestration({
      dryRun: false,
      maxJobs: 1,
      source,
      lockScope: `${source}-stale-lock`,
      workerId: `${source}-stale-lock-worker`,
    });
    assert(staleLock.status === "skipped" && staleLock.skippedReason === "stale_lock_present", "Synthetic stale orchestration lock was not surfaced safely.");

    for (let index = 0; index < 2; index += 1) {
      await enqueueResponseProcessingJob({
        jobType: "future_mailbox_intake",
        source,
        maxAttempts: 1,
        runAfter: "2000-01-01T00:00:00.000Z",
        payload: { messageReferenceHash: "c".repeat(64 - String(index).length) + String(index) },
      });
      const failed = await runResponseWorkerOrchestration({
        dryRun: false,
        maxJobs: 1,
        source,
        lockScope: `${source}-failure-${index}`,
        workerId: `${source}-failure-worker-${index}`,
      });
      assert(failed.status === "failed", "Synthetic orchestration did not surface worker failure.");
    }

    await enqueueResponseProcessingJob({
      jobType: "response_replay_dry_run",
      source,
      maxAttempts: 2,
      runAfter: "2000-01-01T00:00:00.000Z",
      payload: { filters: { classification: "unsupported_response_state" as any, limit: 1 } },
    });
    const retryFailure = await runResponseWorkerOrchestration({
      dryRun: false,
      maxJobs: 1,
      source,
      lockScope: `${source}-retry-backlog`,
      workerId: `${source}-retry-worker`,
    });
    assert(retryFailure.status === "failed", "Synthetic orchestration did not create a retryable failure.");
    await sql`
      update public.response_processing_job
      set run_after = now() - interval '1 minute'
      where source = ${source}
        and status = 'failed'
    `.execute(db);

    const staleJob = await enqueueResponseProcessingJob({
      jobType: "response_replay_dry_run",
      source,
      runAfter: "2000-01-01T00:00:00.000Z",
      payload: { filters: { responseId: 9_991_100, limit: 1 } },
    });
    const claimed = await claimNextResponseProcessingJob({ workerId: `${source}-stale-worker`, leaseSeconds: 30, source });
    assert(claimed?.id === staleJob.job.id, "Synthetic stale queue job was not claimed deterministically.");
    await sql`
      update public.response_processing_job
      set locked_until = now() - interval '1 minute'
      where id = ${staleJob.job.id}
    `.execute(db);

    const [queueMetrics, orchestrationMetrics] = await Promise.all([
      getResponseProcessingQueueMetrics(),
      getResponseWorkerOrchestrationMetrics(),
    ]);
    const deadLetterBacklogObserved = queueMetrics.deadLetteredJobs > 0;
    const retryBacklogObserved = queueMetrics.retryBacklogJobs > 0;
    const staleRunningObserved = queueMetrics.staleRunningJobs > 0;
    const repeatedWorkerFailuresObserved = orchestrationMetrics.recentFailedRuns >= 2;

    assert(deadLetterBacklogObserved, "Synthetic orchestration did not surface dead-letter backlog.");
    assert(retryBacklogObserved, "Synthetic orchestration did not surface retry backlog.");
    assert(staleRunningObserved, "Synthetic orchestration did not surface stale-running queue visibility.");
    assert(repeatedWorkerFailuresObserved, "Synthetic orchestration did not surface repeated worker failures.");
    assert(orchestrationMetrics.skippedOverlapRuns >= 2, "Synthetic orchestration did not record skipped overlap runs.");

    result = {
      event: "response_worker_orchestration_check",
      source,
      boundedRunProcessed: bounded.processed,
      overlapSkipped: overlap.status === "skipped",
      staleLockSkipped: staleLock.status === "skipped",
      repeatedWorkerFailuresObserved,
      deadLetterBacklogObserved,
      retryBacklogObserved,
      staleRunningObserved,
      rawResponseTextLogged: false,
      externalAlertDeliveryUsed: false,
      liveMailboxIntegrationUsed: false,
    };
  } finally {
    await cleanup(source);
  }
  if (!result) throw new Error("Synthetic response worker orchestration check did not produce a result.");
  return { ...result, cleanupComplete: true };
}

async function main() {
  const result = await runSyntheticResponseWorkerOrchestrationCheck();
  console.log(JSON.stringify(result));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    const sanitized = sanitizeWorkerOrchestrationError(error);
    console.error(JSON.stringify({
      event: "response_worker_orchestration_check_error",
      errorCode: sanitized.code,
      error: sanitized.reason,
      rawResponseTextLogged: false,
      externalAlertDeliveryUsed: false,
      liveMailboxIntegrationUsed: false,
    }));
    process.exit(1);
  });
}
