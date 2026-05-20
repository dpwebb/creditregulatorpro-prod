import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const DEFAULT_STAGING_INGEST_WORKER_MAX_JOBS = 5;
export const MAX_STAGING_INGEST_WORKER_MAX_JOBS = 10;
export const DEFAULT_STAGING_INGEST_WORKER_CONCURRENCY = 1;
export const DEFAULT_STAGING_INGEST_WORKER_ID = "staging-ingest-orchestrator";
export const DEFAULT_STAGING_CONTAINER_NAME = "creditregulatorpro-staging";

const SAFE_TOKEN_PATTERN = /^[a-zA-Z0-9_.:-]{1,120}$/;
const SAFE_CONTAINER_PATTERN = /^[a-zA-Z0-9_.-]{1,120}$/;
const PRODUCTION_CONTAINER_PATTERN = /(^creditregulatorpro$|creditregulatorpro-app|production|prod\b)/i;

function fail(message) {
  throw new Error(message);
}

function nextValue(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) fail(`${flag} requires a value.`);
  return value;
}

function parseBoundedInteger(value, flag, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    fail(`${flag} must be an integer between ${min} and ${max}.`);
  }
  return parsed;
}

function safeToken(value, fieldName) {
  const trimmed = String(value ?? "").trim();
  if (
    !SAFE_TOKEN_PATTERN.test(trimmed) ||
    /\d{10,}|postgres:\/\/|database_url|private key|api[_-]?key|bearer\s+/i.test(trimmed)
  ) {
    fail(`${fieldName} must be a safe internal token.`);
  }
  return trimmed;
}

function assertStagingContainerName(containerName) {
  const trimmed = String(containerName ?? "").trim();
  if (!SAFE_CONTAINER_PATTERN.test(trimmed)) {
    fail("--container-name must be a safe Docker container name.");
  }
  if (PRODUCTION_CONTAINER_PATTERN.test(trimmed)) {
    fail("Refusing to run the staging ingest worker against a production-looking container.");
  }
  if (!trimmed.toLowerCase().includes("staging")) {
    fail("--container-name must explicitly reference staging.");
  }
  return trimmed;
}

function assertEnvironmentGate(env) {
  const explicitCrpEnv = String(env.CRP_ENV ?? "").trim().toLowerCase();
  if (explicitCrpEnv && explicitCrpEnv !== "staging") {
    fail("Refusing staging ingest worker orchestration because CRP_ENV is not staging.");
  }
}

function printHelp() {
  console.log([
    "Usage: pnpm run staging:ingest-worker -- [options]",
    "",
    "Runs the existing ingest worker inside the staging container as a bounded one-shot command.",
    "Defaults to dry-run and refuses production-looking targets.",
    "",
    "Options:",
    "  --dry-run                         Preview queued work. This is the default.",
    "  --apply                           Process queued jobs in bounded apply mode.",
    "  --max-jobs <1-10>                 Maximum jobs for this run. Default: 5.",
    "  --concurrency <1>                 Worker concurrency. Only 1 is supported.",
    "  --worker-id <safe-token>          Worker ID passed to the ingest worker.",
    "  --container-name <safe-name>      Staging container name. Default: creditregulatorpro-staging.",
    "",
    "The container command injects CRP_ENV=staging, checks database env presence,",
    "and then calls pnpm run ingest:worker with sanitized bounded arguments.",
  ].join("\n"));
}

export function parseStagingIngestWorkerArgs(args, env = process.env) {
  assertEnvironmentGate(env);

  const options = {
    dryRun: true,
    apply: false,
    maxJobs: env.CRP_STAGING_INGEST_WORKER_MAX_JOBS
      ? parseBoundedInteger(
        env.CRP_STAGING_INGEST_WORKER_MAX_JOBS,
        "CRP_STAGING_INGEST_WORKER_MAX_JOBS",
        1,
        MAX_STAGING_INGEST_WORKER_MAX_JOBS,
      )
      : DEFAULT_STAGING_INGEST_WORKER_MAX_JOBS,
    concurrency: DEFAULT_STAGING_INGEST_WORKER_CONCURRENCY,
    workerId: DEFAULT_STAGING_INGEST_WORKER_ID,
    containerName: assertStagingContainerName(env.CRP_STAGING_CONTAINER_NAME ?? DEFAULT_STAGING_CONTAINER_NAME),
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      options.apply = false;
      continue;
    }
    if (arg === "--apply") {
      options.apply = true;
      options.dryRun = false;
      continue;
    }
    if (arg === "--max-jobs") {
      options.maxJobs = parseBoundedInteger(
        nextValue(args, index, arg),
        arg,
        1,
        MAX_STAGING_INGEST_WORKER_MAX_JOBS,
      );
      index += 1;
      continue;
    }
    if (arg === "--concurrency") {
      const parsed = parseBoundedInteger(nextValue(args, index, arg), arg, 1, 1);
      options.concurrency = parsed;
      index += 1;
      continue;
    }
    if (arg === "--worker-id") {
      options.workerId = safeToken(nextValue(args, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--container-name") {
      options.containerName = assertStagingContainerName(nextValue(args, index, arg));
      index += 1;
      continue;
    }
    fail(`Unknown option: ${arg}`);
  }

  return options;
}

export function buildStagingIngestWorkerShellCommand(options) {
  const modeFlag = options.apply ? "--apply" : "--dry-run";
  const workerId = safeToken(options.workerId, "--worker-id");
  const maxJobs = parseBoundedInteger(String(options.maxJobs), "--max-jobs", 1, MAX_STAGING_INGEST_WORKER_MAX_JOBS);
  const concurrency = parseBoundedInteger(String(options.concurrency), "--concurrency", 1, 1);

  return [
    "set -euo pipefail",
    'if [ "${CRP_ENV:-}" != "staging" ]; then echo "Refusing staging ingest worker: CRP_ENV must be staging."; exit 1; fi',
    'if [ -z "${FLOOT_DATABASE_URL:-${STAGING_DATABASE_URL:-${DATABASE_URL:-}}}" ]; then echo "Refusing staging ingest worker: database environment is missing."; exit 1; fi',
    `pnpm run ingest:worker -- ${modeFlag} --max-jobs ${maxJobs} --concurrency ${concurrency} --worker-id ${workerId}`,
  ].join("\n");
}

export function buildStagingIngestWorkerDockerArgs(options) {
  const containerName = assertStagingContainerName(options.containerName);
  return [
    "exec",
    "-e",
    "CRP_ENV=staging",
    containerName,
    "bash",
    "-lc",
    buildStagingIngestWorkerShellCommand(options),
  ];
}

export function runStagingIngestWorkerOrchestrator(options, runner = spawnSync) {
  const dockerArgs = buildStagingIngestWorkerDockerArgs(options);
  const result = runner("docker", dockerArgs, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (typeof result.status === "number") return result.status;
  return 1;
}

function main() {
  const options = parseStagingIngestWorkerArgs(process.argv.slice(2));
  process.exitCode = runStagingIngestWorkerOrchestrator(options);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
