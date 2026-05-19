import "../loadEnv.js";

import { fileURLToPath } from "node:url";

import {
  applyResponseProcessingRetentionCleanup,
  getResponseProcessingDriftReport,
  getResponseProcessingRetentionPreview,
  recordResponseProcessingDriftReport,
  sanitizeResponseProcessingLifecycleError,
} from "../helpers/responseProcessingLifecycleService";

type LifecycleCliOptions = {
  dryRun: boolean;
  apply: boolean;
  confirmCleanup: boolean;
  actorUserId: number | null;
  olderThanDays: number | null;
  limit: number | null;
  source: string | null;
  retentionOnly: boolean;
  driftOnly: boolean;
  recordDrift: boolean;
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
    "Usage: pnpm run response:lifecycle -- [options]",
    "",
    "Defaults to a dry-run retention preview plus deterministic drift report.",
    "",
    "Options:",
    "  --dry-run                    Preview only. This is the default and writes nothing.",
    "  --apply                      Mark cleanup-eligible terminal records with append-only lifecycle events.",
    "  --confirm-cleanup            Required with --apply.",
    "  --actor-user-id <id>         Required with --apply.",
    "  --older-than-days <1-3650>   Retention eligibility age. Default: 90.",
    "  --limit <1-500>              Bounded cleanup preview/apply record limit. Default: 100.",
    "  --source <safe-token>        Optional source filter for isolated operator checks.",
    "  --retention-only             Only run retention preview/apply.",
    "  --drift-only                 Only run deterministic drift checks.",
    "  --record-drift               Append a sanitized drift_reported lifecycle event.",
    "",
    "Boundaries:",
    "  - No jobs, job events, orchestration runs, replay events, or evidence are deleted.",
    "  - Running, stale-running, failed, and dead-lettered jobs are not cleanup-eligible.",
    "  - No raw response text, PII, secrets, DB URLs, tokens, or mailbox credentials are printed.",
    "  - No external alert delivery, live mailbox integration, or auto-remediation is used.",
  ].join("\n"));
}

export function parseResponseProcessingLifecycleArgs(args: string[]): LifecycleCliOptions {
  const options: LifecycleCliOptions = {
    dryRun: true,
    apply: false,
    confirmCleanup: false,
    actorUserId: null,
    olderThanDays: null,
    limit: null,
    source: null,
    retentionOnly: false,
    driftOnly: false,
    recordDrift: false,
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
    if (arg === "--apply") {
      options.apply = true;
      options.dryRun = false;
      continue;
    }
    if (arg === "--confirm-cleanup") {
      options.confirmCleanup = true;
      continue;
    }
    if (arg === "--actor-user-id") {
      options.actorUserId = parsePositiveInt(nextValue(args, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--older-than-days") {
      options.olderThanDays = parsePositiveInt(nextValue(args, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--limit") {
      const parsed = parsePositiveInt(nextValue(args, index, arg), arg);
      if (parsed > 500) fail("--limit must be 500 or less.");
      options.limit = parsed;
      index += 1;
      continue;
    }
    if (arg === "--source") {
      options.source = nextValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--retention-only") {
      options.retentionOnly = true;
      continue;
    }
    if (arg === "--drift-only") {
      options.driftOnly = true;
      continue;
    }
    if (arg === "--record-drift") {
      options.recordDrift = true;
      continue;
    }
    fail(`Unknown option: ${arg}`);
  }

  if (options.retentionOnly && options.driftOnly) fail("--retention-only and --drift-only cannot be combined.");
  if (options.apply && options.driftOnly) fail("--apply cannot be used with --drift-only.");
  if (options.recordDrift && options.retentionOnly) fail("--record-drift cannot be used with --retention-only.");
  return options;
}

async function runCli(options: LifecycleCliOptions): Promise<number> {
  const retentionInput = {
    olderThanDays: options.olderThanDays,
    limit: options.limit,
    source: options.source,
  };
  const retention = options.driftOnly
    ? null
    : options.apply
      ? await applyResponseProcessingRetentionCleanup({
          ...retentionInput,
          dryRun: false,
          confirmCleanup: options.confirmCleanup,
          actorUserId: options.actorUserId,
        })
      : await getResponseProcessingRetentionPreview(retentionInput);
  const drift = options.retentionOnly
    ? null
    : await getResponseProcessingDriftReport({ source: options.source });
  if (drift && options.recordDrift) {
    await recordResponseProcessingDriftReport(drift, options.actorUserId);
  }

  console.log(JSON.stringify({
    event: "response_processing_lifecycle_report",
    dryRun: !options.apply,
    retention,
    drift,
    rawResponseTextLogged: false,
    destructiveDeleteUsed: false,
    externalAlertDeliveryUsed: false,
    liveMailboxIntegrationUsed: false,
  }));
  return 0;
}

async function main() {
  const options = parseResponseProcessingLifecycleArgs(process.argv.slice(2));
  const exitCode = await runCli(options);
  process.exitCode = exitCode;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    const sanitized = sanitizeResponseProcessingLifecycleError(error);
    console.error(JSON.stringify({
      event: "response_processing_lifecycle_error",
      errorCode: sanitized.code,
      error: sanitized.reason,
      rawResponseTextLogged: false,
      destructiveDeleteUsed: false,
      externalAlertDeliveryUsed: false,
      liveMailboxIntegrationUsed: false,
    }));
    process.exit(1);
  });
}
