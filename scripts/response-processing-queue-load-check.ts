import "../loadEnv.js";

import { fileURLToPath } from "node:url";
import { sql } from "kysely";

import { db } from "../helpers/db";
import { ensureResponseDocumentSchema } from "../helpers/responseDocumentSchema";
import {
  claimNextResponseProcessingJob,
  enqueueResponseProcessingJob,
  getResponseProcessingQueueMetrics,
  processNextResponseProcessingJob,
} from "../helpers/responseProcessingQueueService";

type SyntheticQueueLoadResult = {
  event: "response_queue_load_check";
  source: string;
  enqueued: number;
  duplicateCollapsed: boolean;
  processed: number;
  retryableFailureObserved: boolean;
  deadLetterObserved: boolean;
  staleRunningObserved: boolean;
  cleanupComplete: boolean;
  rawResponseTextLogged: false;
  liveMailboxIntegrationUsed: false;
};

function marker(): string {
  return `response-queue-load-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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
}

export async function runSyntheticResponseQueueLoadCheck(): Promise<SyntheticQueueLoadResult> {
  await ensureResponseDocumentSchema();
  const source = marker();
  let result: Omit<SyntheticQueueLoadResult, "cleanupComplete"> | null = null;
  try {
    const jobs = [];
    for (let index = 0; index < 8; index += 1) {
      jobs.push(await enqueueResponseProcessingJob({
        jobType: "response_replay_dry_run",
        source,
        payload: {
          filters: {
            responseId: 9_990_000 + index,
            limit: 1,
          },
          metadata: {
            fixture: "synthetic_queue_load",
            index,
          },
        },
      }));
    }

    const duplicateKey = `${source}:duplicate`;
    const duplicateFirst = await enqueueResponseProcessingJob({
      jobType: "response_replay_dry_run",
      source,
      idempotencyKey: duplicateKey,
      payload: { filters: { responseId: 9_990_099, limit: 1 } },
    });
    const duplicateSecond = await enqueueResponseProcessingJob({
      jobType: "response_replay_dry_run",
      source,
      idempotencyKey: duplicateKey,
      payload: { filters: { limit: 1, responseId: 9_990_099 } },
    });

    let processed = 0;
    for (let index = 0; index < 5; index += 1) {
      const result = await processNextResponseProcessingJob({ workerId: `${source}-worker`, source });
      if (result.status === "succeeded") processed += 1;
    }

    await enqueueResponseProcessingJob({
      jobType: "response_replay_dry_run",
      source,
      maxAttempts: 2,
      runAfter: "2000-01-01T00:00:00.000Z",
      payload: { filters: { classification: "unsupported_response_state" as any, limit: 1 } },
    });
    const retryable = await processNextResponseProcessingJob({ workerId: `${source}-retry-worker`, source });

    await enqueueResponseProcessingJob({
      jobType: "future_mailbox_intake",
      source,
      maxAttempts: 1,
      runAfter: "2000-01-01T00:00:00.000Z",
      payload: { messageReferenceHash: "a".repeat(64) },
    });
    const deadLetter = await processNextResponseProcessingJob({ workerId: `${source}-dead-worker`, source });

    const staleJob = await enqueueResponseProcessingJob({
      jobType: "response_replay_dry_run",
      source,
      runAfter: "2000-01-01T00:00:00.000Z",
      payload: { filters: { responseId: 9_990_200, limit: 1 } },
    });
    const claimed = await claimNextResponseProcessingJob({ workerId: `${source}-stale-worker`, leaseSeconds: 30, source });
    assert(claimed?.id === staleJob.job.id, "Synthetic stale-running job was not claimed deterministically.");
    await sql`
      update public.response_processing_job
      set locked_until = now() - interval '1 minute'
      where id = ${staleJob.job.id}
    `.execute(db);

    const metrics = await getResponseProcessingQueueMetrics();
    const duplicateCollapsed = duplicateFirst.status === "queued" && duplicateSecond.status === "duplicate";
    const retryableFailureObserved = retryable.status === "failed";
    const deadLetterObserved = deadLetter.status === "dead_lettered";
    const staleRunningObserved = metrics.staleRunningJobs > 0;

    assert(jobs.every((job) => job.status === "queued"), "Synthetic queue load did not enqueue all baseline jobs.");
    assert(duplicateCollapsed, "Synthetic queue load did not collapse duplicate active enqueue.");
    assert(processed > 0, "Synthetic queue load did not process bounded dry-run jobs.");
    assert(retryableFailureObserved, "Synthetic queue load did not observe retryable failure.");
    assert(deadLetterObserved, "Synthetic queue load did not observe dead-letter path.");
    assert(staleRunningObserved, "Synthetic queue load did not observe stale-running metrics.");

    result = {
      event: "response_queue_load_check",
      source,
      enqueued: jobs.length + 3,
      duplicateCollapsed,
      processed,
      retryableFailureObserved,
      deadLetterObserved,
      staleRunningObserved,
      rawResponseTextLogged: false,
      liveMailboxIntegrationUsed: false,
    };
  } finally {
    await cleanup(source);
  }
  if (!result) throw new Error("Synthetic response queue load check did not produce a result.");
  return { ...result, cleanupComplete: true };
}

async function main() {
  const result = await runSyntheticResponseQueueLoadCheck();
  console.log(JSON.stringify(result));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message.replace(/\s+/g, " ").slice(0, 240) : "Synthetic response queue load check failed.";
    console.error(JSON.stringify({
      event: "response_queue_load_check_error",
      error: message,
      rawResponseTextLogged: false,
      liveMailboxIntegrationUsed: false,
    }));
    process.exit(1);
  });
}
