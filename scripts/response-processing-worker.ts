import "../loadEnv.js";

import { fileURLToPath } from "node:url";

import {
  processNextResponseProcessingJob,
  requeueDeadLetteredResponseProcessingJob,
} from "../helpers/responseProcessingQueueService";

type WorkerCliOptions = {
  dryRun: boolean;
  maxJobs: number;
  workerId: string | null;
  retryDeadLetterJobId: number | null;
  actorUserId: number | null;
};

function fail(message: string): never {
  throw new Error(message);
}

function parsePositiveInt(value: string | undefined, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) fail(`${flag} requires a positive integer.`);
  return parsed;
}

function nextValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) fail(`${flag} requires a value.`);
  return value;
}

function printHelp(): void {
  console.log([
    "Usage: pnpm run response:worker -- [options]",
    "",
    "Defaults to one bounded job. No daemon mode is started by default.",
    "",
    "Options:",
    "  --once                         Process at most one eligible job. This is the default.",
    "  --max-jobs <1-100>             Process up to N eligible jobs, sequentially.",
    "  --dry-run                      Preview the next eligible job without claiming or writing.",
    "  --worker-id <safe-token>       Optional safe worker identifier for logs and job leases.",
    "  --retry-dead-letter <job-id>   Create a sanitized replacement job for a dead-lettered job.",
    "  --actor-user-id <id>           Required with --retry-dead-letter.",
    "",
    "Boundaries:",
    "  - Queue payloads are sanitized and do not store raw response text or secrets.",
    "  - Stale running jobs are reported in metrics and are not silently reclaimed by this worker.",
    "  - future_mailbox_intake is inert and fails closed until live mailbox integration is explicitly implemented.",
    "  - Worker processing does not mutate canonical report facts, tradeline facts, violation truth, packet eligibility, or readiness rules.",
  ].join("\n"));
}

export function parseWorkerArgs(args: string[]): WorkerCliOptions {
  const options: WorkerCliOptions = {
    dryRun: false,
    maxJobs: 1,
    workerId: null,
    retryDeadLetterJobId: null,
    actorUserId: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--once") {
      options.maxJobs = 1;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--max-jobs") {
      const parsed = parsePositiveInt(nextValue(args, index, arg), arg);
      if (parsed > 100) fail("--max-jobs must be 100 or less.");
      options.maxJobs = parsed;
      index += 1;
      continue;
    }
    if (arg === "--worker-id") {
      options.workerId = nextValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--retry-dead-letter") {
      options.retryDeadLetterJobId = parsePositiveInt(nextValue(args, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--actor-user-id") {
      options.actorUserId = parsePositiveInt(nextValue(args, index, arg), arg);
      index += 1;
      continue;
    }
    fail(`Unknown option: ${arg}`);
  }

  if (options.retryDeadLetterJobId !== null) {
    if (options.dryRun) fail("--retry-dead-letter cannot be combined with --dry-run.");
    if (!options.actorUserId) fail("--retry-dead-letter requires --actor-user-id.");
  }

  return options;
}

function logStructured(event: string, details: Record<string, unknown>): void {
  console.log(JSON.stringify({
    event,
    component: "response_processing_worker",
    rawResponseTextLogged: false,
    liveMailboxIntegrationUsed: false,
    ...details,
  }));
}

export function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /raw response text|raw report text|raw pdf text|full email body|email body dump|postgres:\/\/|mysql:\/\/|mongodb:\/\/|database_url|private key|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|bearer\s+[a-z0-9._-]+|sk-[a-z0-9_-]{10,}|session=|cookie=|oauth refresh token|mailbox password|imap password|smtp password|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(message)
  ) {
    return "Response processing worker failed with a sanitized operational error.";
  }
  return message.replace(/\s+/g, " ").trim().slice(0, 240) || "Response processing worker failed.";
}

async function runWorker(options: WorkerCliOptions): Promise<number> {
  if (options.retryDeadLetterJobId !== null) {
    const job = await requeueDeadLetteredResponseProcessingJob({
      jobId: options.retryDeadLetterJobId,
      actorUserId: Number(options.actorUserId),
    });
    logStructured("dead_letter_replacement_queued", {
      jobId: job.id,
      jobType: job.jobType,
      status: job.status,
      attemptCount: job.attemptCount,
      terminalJobMutated: false,
    });
    return 0;
  }

  let processed = 0;
  let failureCount = 0;
  for (let index = 0; index < options.maxJobs; index += 1) {
    const result = await processNextResponseProcessingJob({
      workerId: options.workerId ?? undefined,
      dryRun: options.dryRun,
    });

    logStructured("worker_iteration", {
      status: result.status,
      dryRun: result.dryRun,
      workerId: result.workerId,
      jobId: result.job?.id ?? null,
      jobType: result.job?.jobType ?? null,
      jobStatus: result.job?.status ?? null,
      attemptCount: result.job?.attemptCount ?? null,
      maxAttempts: result.job?.maxAttempts ?? null,
    });

    if (result.status === "idle" || result.status === "dry_run_preview") break;
    processed += 1;
    if (result.status === "failed" || result.status === "dead_lettered") failureCount += 1;
  }

  logStructured("worker_summary", {
    dryRun: options.dryRun,
    maxJobs: options.maxJobs,
    processed,
    failureCount,
  });
  return failureCount > 0 ? 2 : 0;
}

async function main() {
  const options = parseWorkerArgs(process.argv.slice(2));
  const exitCode = await runWorker(options);
  process.exitCode = exitCode;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(JSON.stringify({
      event: "worker_error",
      component: "response_processing_worker",
      error: safeErrorMessage(error),
      rawResponseTextLogged: false,
      liveMailboxIntegrationUsed: false,
    }));
    process.exit(1);
  });
}
