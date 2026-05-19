import "../loadEnv.js";

import { fileURLToPath } from "node:url";
import { sql } from "kysely";

import { db } from "../helpers/db";
import { ensureResponseDocumentSchema } from "../helpers/responseDocumentSchema";
import {
  getResponseProcessingDriftReport,
  getResponseProcessingRetentionPreview,
  recordResponseProcessingSoakCheckResult,
  sanitizeResponseProcessingLifecycleError,
} from "../helpers/responseProcessingLifecycleService";
import {
  claimNextResponseProcessingJob,
  enqueueResponseProcessingJob,
  getResponseProcessingQueueMetrics,
} from "../helpers/responseProcessingQueueService";
import { runResponseProcessingReplay } from "../helpers/responseReplayService";
import {
  getResponseWorkerOrchestrationMetrics,
  runResponseWorkerOrchestration,
} from "../helpers/responseWorkerOrchestrationService";

type SyntheticSoakResult = {
  event: "response_processing_soak_check";
  source: string;
  cycles: number;
  processedByOrchestration: number;
  duplicateCollapsed: boolean;
  retryBacklogObserved: boolean;
  deadLetterObserved: boolean;
  staleRunningObserved: boolean;
  repeatedOverlapObserved: boolean;
  replayDryRunExecuted: boolean;
  retentionPreviewVerified: boolean;
  driftDetected: boolean;
  cleanupComplete: boolean;
  rawResponseTextLogged: false;
  externalAlertDeliveryUsed: false;
  liveMailboxIntegrationUsed: false;
};

let markerCounter = 0;

function marker(): string {
  markerCounter += 1;
  return `response-soak-${Date.now().toString(36)}-${process.pid.toString(36)}-${markerCounter.toString(36)}`;
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
  await sql`
    delete from public.response_processing_lifecycle_event
    where source = ${source}
  `.execute(db);

  const remaining = await sql<{ jobs: string; runs: string; lifecycle: string }>`
    select
      (select count(*)::text from public.response_processing_job where source = ${source}) as jobs,
      (select count(*)::text from public.response_worker_orchestration_run where source = ${source} or lock_scope like ${`${source}%`}) as runs,
      (select count(*)::text from public.response_processing_lifecycle_event where source = ${source}) as lifecycle
  `.execute(db);
  const row = remaining.rows[0];
  if (Number(row?.jobs ?? 0) !== 0 || Number(row?.runs ?? 0) !== 0 || Number(row?.lifecycle ?? 0) !== 0) {
    throw new Error("Synthetic response-processing soak cleanup left isolated rows behind.");
  }
}

async function insertSyntheticRunningLock(source: string, lockScope: string): Promise<void> {
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
      now() + interval '10 minutes',
      ${JSON.stringify({
        fixture: "synthetic_soak_overlap_lock",
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
        fixture: "synthetic_soak_overlap_lock",
        rawResponseTextLogged: false,
        externalAlertDeliveryUsed: false,
      })}::text::jsonb
    )
  `.execute(db);
}

export async function runSyntheticResponseProcessingSoakCheck(cycles = 3): Promise<SyntheticSoakResult> {
  await ensureResponseDocumentSchema();
  const source = marker();
  let result: Omit<SyntheticSoakResult, "cleanupComplete"> | null = null;
  try {
    let processedByOrchestration = 0;
    let duplicateCollapsed = false;
    for (let cycle = 0; cycle < cycles; cycle += 1) {
      const idempotencyKey = `${source}-cycle-${cycle}`;
      const first = await enqueueResponseProcessingJob({
        jobType: "response_replay_dry_run",
        source,
        idempotencyKey,
        payload: { filters: { responseId: 9_995_000 + cycle, limit: 1 } },
      });
      const duplicate = await enqueueResponseProcessingJob({
        jobType: "response_replay_dry_run",
        source,
        idempotencyKey,
        payload: { filters: { limit: 1, responseId: 9_995_000 + cycle } },
      });
      duplicateCollapsed = duplicateCollapsed || (first.status === "queued" && duplicate.status === "duplicate");
      const run = await runResponseWorkerOrchestration({
        dryRun: false,
        maxJobs: 1,
        source,
        lockScope: `${source}-bounded-${cycle}`,
        workerId: `${source}-worker-${cycle}`,
      });
      assert(run.status === "succeeded", "Synthetic soak bounded orchestration run did not succeed.");
      processedByOrchestration += run.processed;
    }

    await enqueueResponseProcessingJob({
      jobType: "future_mailbox_intake",
      source,
      maxAttempts: 1,
      runAfter: "2000-01-01T00:00:00.000Z",
      payload: { messageReferenceHash: "f".repeat(64) },
    });
    const deadLetterRun = await runResponseWorkerOrchestration({
      dryRun: false,
      maxJobs: 1,
      source,
      lockScope: `${source}-dead-letter`,
      workerId: `${source}-dead-letter-worker`,
    });
    assert(deadLetterRun.status === "failed", "Synthetic soak did not surface dead-letter worker failure.");

    await enqueueResponseProcessingJob({
      jobType: "response_replay_dry_run",
      source,
      maxAttempts: 2,
      runAfter: "2000-01-01T00:00:00.000Z",
      payload: { filters: { classification: "unsupported_response_state" as any, limit: 1 } },
    });
    const retryRun = await runResponseWorkerOrchestration({
      dryRun: false,
      maxJobs: 1,
      source,
      lockScope: `${source}-retry`,
      workerId: `${source}-retry-worker`,
    });
    assert(retryRun.status === "failed", "Synthetic soak did not create retryable failure.");
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
      payload: { filters: { responseId: 9_995_200, limit: 1 } },
    });
    const claimed = await claimNextResponseProcessingJob({ workerId: `${source}-stale-worker`, leaseSeconds: 30, source });
    assert(claimed?.id === staleJob.job.id, "Synthetic soak stale job was not claimed deterministically.");
    await sql`
      update public.response_processing_job
      set locked_until = now() - interval '1 minute'
      where id = ${staleJob.job.id}
    `.execute(db);

    await insertSyntheticRunningLock(source, `${source}-overlap`);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const overlap = await runResponseWorkerOrchestration({
        dryRun: false,
        maxJobs: 1,
        source,
        lockScope: `${source}-overlap`,
        workerId: `${source}-overlap-worker-${attempt}`,
      });
      assert(overlap.status === "skipped" && overlap.skippedReason === "overlap_active", "Synthetic soak overlap run was not skipped.");
    }

    const replayDryRun = await runResponseProcessingReplay({
      mode: "dry_run",
      filters: { responseId: 9_995_300, limit: 1 },
    });
    assert(replayDryRun.totals.appendedProcessingEvents === 0, "Synthetic soak replay dry-run wrote processing events.");

    const succeeded = await sql<{ id: string }>`
      select id::text as id
      from public.response_processing_job
      where source = ${source}
        and status = 'succeeded'
      order by id asc
      limit 1
    `.execute(db);
    assert(Boolean(succeeded.rows[0]?.id), "Synthetic soak did not create a succeeded job for retention preview.");
    await sql`
      update public.response_processing_job
      set finished_at = now() - interval '120 days',
          updated_at = now() - interval '120 days',
          created_at = now() - interval '120 days'
      where id = ${Number(succeeded.rows[0]?.id)}
    `.execute(db);

    const retention = await getResponseProcessingRetentionPreview({ source, olderThanDays: 30, limit: 10 });
    assert(retention.queueJobs.eligibleRecords >= 1, "Synthetic soak retention preview did not detect cleanup-eligible terminal jobs.");

    const drift = await getResponseProcessingDriftReport({
      source,
      thresholds: {
        deadLetterGrowthDelta: 1,
        retryBacklogJobs: 1,
        staleRunningJobs: 1,
        orchestrationOverlapSkips: 1,
        repeatedWorkerFailures: 1,
      },
    });
    const queueMetrics = await getResponseProcessingQueueMetrics();
    const orchestrationMetrics = await getResponseWorkerOrchestrationMetrics();
    const activeDriftKeys = drift.checks.filter((check) => check.active).map((check) => check.key);
    assert(activeDriftKeys.includes("dead_letter_growth_trend"), "Synthetic soak did not surface dead-letter drift.");
    assert(activeDriftKeys.includes("retry_backlog_growth"), "Synthetic soak did not surface retry backlog drift.");
    assert(activeDriftKeys.includes("stale_running_accumulation"), "Synthetic soak did not surface stale-running drift.");
    assert(activeDriftKeys.includes("orchestration_overlap_frequency"), "Synthetic soak did not surface overlap drift.");

    result = {
      event: "response_processing_soak_check",
      source,
      cycles,
      processedByOrchestration,
      duplicateCollapsed,
      retryBacklogObserved: queueMetrics.retryBacklogJobs > 0,
      deadLetterObserved: queueMetrics.deadLetteredJobs > 0,
      staleRunningObserved: queueMetrics.staleRunningJobs > 0,
      repeatedOverlapObserved: orchestrationMetrics.skippedOverlapRuns > 0,
      replayDryRunExecuted: true,
      retentionPreviewVerified: retention.queueJobs.eligibleRecords >= 1,
      driftDetected: drift.activeChecks >= 3,
      rawResponseTextLogged: false,
      externalAlertDeliveryUsed: false,
      liveMailboxIntegrationUsed: false,
    };
  } finally {
    await cleanup(source);
  }
  if (!result) throw new Error("Synthetic response-processing soak check did not produce a result.");
  const finalResult = { ...result, cleanupComplete: true };
  await recordResponseProcessingSoakCheckResult({
    status: "succeeded",
    cycles: finalResult.cycles,
    processedByOrchestration: finalResult.processedByOrchestration,
    cleanupComplete: finalResult.cleanupComplete,
    retentionPreviewVerified: finalResult.retentionPreviewVerified,
    driftDetected: finalResult.driftDetected,
  });
  return finalResult;
}

async function main() {
  const result = await runSyntheticResponseProcessingSoakCheck();
  console.log(JSON.stringify(result));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    const sanitized = sanitizeResponseProcessingLifecycleError(error);
    console.error(JSON.stringify({
      event: "response_processing_soak_check_error",
      errorCode: sanitized.code,
      error: sanitized.reason,
      rawResponseTextLogged: false,
      externalAlertDeliveryUsed: false,
      liveMailboxIntegrationUsed: false,
    }));
    process.exit(1);
  });
}
