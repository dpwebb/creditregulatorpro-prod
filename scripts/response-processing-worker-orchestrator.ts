import "../loadEnv.js";

import { fileURLToPath } from "node:url";

import {
  runResponseWorkerOrchestration,
  sanitizeWorkerOrchestrationError,
} from "../helpers/responseWorkerOrchestrationService";

type WorkerOrchestrationCliOptions = {
  dryRun: boolean;
  maxJobs: number;
  workerId: string | null;
  source: string | null;
  lockScope: string | null;
  lockTtlSeconds: number | null;
  scheduled: boolean;
};

function fail(message: string): never {
  throw new Error(message);
}

function nextValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) fail(`${flag} requires a value.`);
  return value;
}

function parsePositiveInt(value: string | undefined, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) fail(`${flag} requires a positive integer.`);
  return parsed;
}

function printHelp(): void {
  console.log([
    "Usage: pnpm run response:worker-orchestrate -- [options]",
    "",
    "Defaults to a dry-run preview. Use --run to execute one bounded, lock-protected worker run.",
    "",
    "Options:",
    "  --dry-run                    Preview without writing orchestration or queue state. This is the default.",
    "  --run                        Execute a bounded worker run with orchestration lock protection.",
    "  --once                       Process at most one eligible job.",
    "  --max-jobs <1-100>           Process up to N eligible jobs, sequentially.",
    "  --worker-id <safe-token>     Optional safe worker identifier for logs and orchestration state.",
    "  --source <safe-token>        Optional queue source filter for isolated operator runs.",
    "  --lock-scope <safe-token>    Optional orchestration lock scope. Defaults to response_processing_worker.",
    "  --lock-ttl-seconds <1-3600>  Lock visibility window for stuck-run detection.",
    "  --scheduled                  Mark a --run invocation as scheduled_bounded for operator metrics.",
    "",
    "Boundaries:",
    "  - No daemon or infinite loop is started.",
    "  - Overlapping runs are skipped and recorded rather than sharing a worker lock.",
    "  - Stale queue jobs are not reclaimed automatically.",
    "  - No external alert delivery or live mailbox integration is used.",
    "  - Logs are structured and sanitized.",
  ].join("\n"));
}

export function parseWorkerOrchestrationArgs(args: string[]): WorkerOrchestrationCliOptions {
  const options: WorkerOrchestrationCliOptions = {
    dryRun: true,
    maxJobs: 1,
    workerId: null,
    source: null,
    lockScope: null,
    lockTtlSeconds: null,
    scheduled: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--run") {
      options.dryRun = false;
      continue;
    }
    if (arg === "--once") {
      options.maxJobs = 1;
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
    if (arg === "--source") {
      options.source = nextValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--lock-scope") {
      options.lockScope = nextValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--lock-ttl-seconds") {
      const parsed = parsePositiveInt(nextValue(args, index, arg), arg);
      if (parsed > 3600) fail("--lock-ttl-seconds must be 3600 or less.");
      options.lockTtlSeconds = parsed;
      index += 1;
      continue;
    }
    if (arg === "--scheduled") {
      options.scheduled = true;
      continue;
    }
    fail(`Unknown option: ${arg}`);
  }

  if (options.scheduled && options.dryRun) fail("--scheduled requires --run.");
  return options;
}

function logStructured(event: string, details: Record<string, unknown>): void {
  console.log(JSON.stringify({
    event,
    component: "response_worker_orchestrator",
    rawResponseTextLogged: false,
    externalAlertDeliveryUsed: false,
    liveMailboxIntegrationUsed: false,
    ...details,
  }));
}

async function runCli(options: WorkerOrchestrationCliOptions): Promise<number> {
  const result = await runResponseWorkerOrchestration({
    dryRun: options.dryRun,
    maxJobs: options.maxJobs,
    workerId: options.workerId,
    source: options.source,
    lockScope: options.lockScope,
    lockTtlSeconds: options.lockTtlSeconds,
    scheduled: options.scheduled,
  });
  logStructured("worker_orchestration_result", {
    status: result.status,
    dryRun: result.dryRun,
    workerId: result.workerId,
    runId: result.run?.id ?? null,
    maxJobs: options.maxJobs,
    processed: result.processed,
    failureCount: result.failureCount,
    skippedReason: result.skippedReason,
    iterations: result.iterations.map((iteration) => ({
      status: iteration.status,
      jobId: iteration.jobId,
      jobType: iteration.jobType,
      jobStatus: iteration.jobStatus,
    })),
  });
  if (result.status === "failed") return 2;
  return 0;
}

async function main() {
  const options = parseWorkerOrchestrationArgs(process.argv.slice(2));
  const exitCode = await runCli(options);
  process.exitCode = exitCode;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    const sanitized = sanitizeWorkerOrchestrationError(error);
    console.error(JSON.stringify({
      event: "worker_orchestration_error",
      component: "response_worker_orchestrator",
      errorCode: sanitized.code,
      error: sanitized.reason,
      rawResponseTextLogged: false,
      externalAlertDeliveryUsed: false,
      liveMailboxIntegrationUsed: false,
    }));
    process.exit(1);
  });
}
