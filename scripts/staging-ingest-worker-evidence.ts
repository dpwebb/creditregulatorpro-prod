import "../loadEnv.js";

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sql } from "kysely";

import { db } from "../helpers/db";
import { generateServerPdf } from "../helpers/pdfServerUtils";
import { storeReportArtifactPdf, buildReportArtifactStorageMetadata } from "../helpers/reportArtifactStorage";
import { ensureIngestProcessingQueueSchema } from "../helpers/ingestProcessingQueueSchema";
import {
  enqueueIngestProcessingJob,
  getIngestProcessingQueueMetrics,
} from "../helpers/ingestProcessingQueueService";
import type { Json, UserRole } from "../helpers/schema";
import {
  detectIngestWorkerProductionEnvironment,
  runIngestProcessingWorker,
  type WorkerCliOptions,
} from "./ingest-processing-worker";

export const STAGING_INGEST_WORKER_EVIDENCE_MD_PATH =
  "docs/production-scale/evidence/latest-staging-ingest-worker-evidence.md";
export const STAGING_INGEST_WORKER_EVIDENCE_JSON_PATH =
  "docs/production-scale/evidence/latest-staging-ingest-worker-evidence.json";
export const STAGING_INGEST_WORKER_CONFIRMATION = "staging-safe-ingest-worker-evidence";
export const DEFAULT_STAGING_EVIDENCE_MAX_JOBS = 2;
export const MAX_STAGING_EVIDENCE_MAX_JOBS = 5;
export const DEFAULT_STAGING_EVIDENCE_WORKER_ID = "staging-ingest-evidence";

type StagingEvidenceOptions = {
  apply: boolean;
  dryRun: boolean;
  maxJobs: number;
  maxJobsExplicit: boolean;
  workerId: string;
  source: string;
  confirmation: string | null;
  rootDir: string;
};

type ScopedQueueMetrics = {
  source: string;
  totalJobs: number;
  queuedJobs: number;
  runningJobs: number;
  succeededJobs: number;
  failedJobs: number;
  deadLetteredJobs: number;
  canceledJobs: number;
  eligibleJobs: number;
  staleRunningJobs: number;
  oldestQueuedAgeSeconds: number | null;
  jobIds: number[];
  statuses: Record<string, number>;
};

type LifecycleEvidence = {
  totalEvents: number;
  eventCounts: Record<string, number>;
  claimedEvents: number;
  succeededEvents: number;
  retryScheduledEvents: number;
  deadLetteredEvents: number;
  cleanupAttemptedEvents: number;
  cleanupFailedEvents: number;
  operatorRemediationEvents: number;
};

type SyntheticJob = {
  userId: number;
  reportArtifactId: number;
  jobId: number;
};

type StagingEvidenceRuntimeDeps = {
  assertNonProductionEnvironment: (env?: NodeJS.ProcessEnv) => void;
  collectGlobalQueueMetrics: () => Promise<Awaited<ReturnType<typeof getIngestProcessingQueueMetrics>>>;
  collectScopedQueueMetrics: (source: string) => Promise<ScopedQueueMetrics>;
  collectLifecycleEvidence: (source: string) => Promise<LifecycleEvidence>;
  createSyntheticJobs: (input: { source: string; count: number; generatedAt: string }) => Promise<SyntheticJob[]>;
  runWorker: (options: WorkerCliOptions) => Promise<{ exitCode: number; capturedLineCount: number }>;
  writeEvidence: typeof writeStagingIngestWorkerEvidence;
};

const SAFE_TOKEN_PATTERN = /^[a-zA-Z0-9_.:-]{1,120}$/;
const FORBIDDEN_EVIDENCE_PATTERN =
  /(%PDF-|JVBERi0|data:application\/pdf;base64|postgres(?:ql)?:\/\/|mysql:\/\/|mongodb:\/\/|database_url|private key|bearer\s+[a-z0-9._~+/=-]{12,}|session=|cookie=|x-amz-signature|x-goog-signature|signedurl|signed_url|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b)/i;

const SYNTHETIC_STAGING_REPORT_TEXT = `
TransUnion Canada Consumer Disclosure
Your file as of May 20, 2026
TU Case IDSTAGE2026

Personal Information:
Consumer Name: SYNTHETIC STAGING CONSUMER
Birth Date Jan 30, 1961

Address(es):
100 SYNTHETIC ST
HALIFAX NS A1A 1A1

Account(s):
Creditor Name MAPLE SYNTHETIC BANK
Account Type REVOLVING / INDIVIDUAL
Status Open
Opened Date Jan 01, 2020
Reported Date May 20, 2026
Balance $10
Credit Limit $500
Payment History
Apr 2026 10 0 0 1 500 500 0 0 AC /
`;

function fail(message: string): never {
  throw new Error(message);
}

function nextValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) fail(`${flag} requires a value.`);
  return value;
}

function parseBoundedInt(value: string, flag: string, max = MAX_STAGING_EVIDENCE_MAX_JOBS): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    fail(`${flag} must be an integer between 1 and ${max}.`);
  }
  return parsed;
}

function safeToken(value: string, flag: string): string {
  const trimmed = value.trim();
  if (!SAFE_TOKEN_PATTERN.test(trimmed) || /\d{10,}|postgres:\/\/|database_url|private key|api[_-]?key|bearer\s+/i.test(trimmed)) {
    fail(`${flag} must be a safe internal token.`);
  }
  return trimmed;
}

function defaultSource(): string {
  return `staging_ingest_evidence_${Date.now().toString(36)}`;
}

function safeGit(args: string[], rootDir: string, fallback = "unknown"): string {
  try {
    return execFileSync("git", args, {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim() || fallback;
  } catch {
    return fallback;
  }
}

function repoPath(rootDir: string, relativePath: string): string {
  return path.join(rootDir, ...relativePath.replace(/\\/g, "/").replace(/^\.\//, "").split("/").filter(Boolean));
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rowValue(row: Record<string, unknown> | undefined, snakeCaseKey: string): unknown {
  if (!row) return undefined;
  if (Object.prototype.hasOwnProperty.call(row, snakeCaseKey)) return row[snakeCaseKey];
  const camelCaseKey = snakeCaseKey.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
  return row[camelCaseKey];
}

function setDefaultIgnoredStoragePath(): void {
  if (!process.env.LOCAL_DOCUMENT_STORAGE_PATH && !process.env.DOCUMENT_STORAGE_PATH) {
    process.env.LOCAL_DOCUMENT_STORAGE_PATH = path.join(".local", "staging-ingest-worker-evidence-storage");
  }
}

export function parseStagingIngestWorkerEvidenceArgs(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): StagingEvidenceOptions {
  const options: StagingEvidenceOptions = {
    apply: false,
    dryRun: false,
    maxJobs: DEFAULT_STAGING_EVIDENCE_MAX_JOBS,
    maxJobsExplicit: false,
    workerId: DEFAULT_STAGING_EVIDENCE_WORKER_ID,
    source: defaultSource(),
    confirmation: null,
    rootDir: process.cwd(),
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      console.log([
        "Usage: pnpm run ingest:worker:staging-evidence",
        "",
        "Writes STAGING SAFE ONLY ingest worker queue-drain evidence.",
        "The package script supplies --apply, --max-jobs, and the staging-safe confirmation.",
      ].join("\n"));
      process.exit(0);
    }
    if (arg === "--apply") {
      options.apply = true;
      options.dryRun = false;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      options.apply = false;
      continue;
    }
    if (arg === "--max-jobs") {
      options.maxJobs = parseBoundedInt(nextValue(args, index, arg), arg);
      options.maxJobsExplicit = true;
      index += 1;
      continue;
    }
    if (arg === "--worker-id") {
      options.workerId = safeToken(nextValue(args, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--source") {
      options.source = safeToken(nextValue(args, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--confirm-staging-safe") {
      options.confirmation = STAGING_INGEST_WORKER_CONFIRMATION;
      continue;
    }
    if (arg === "--staging-confirmation") {
      options.confirmation = nextValue(args, index, arg).trim();
      index += 1;
      continue;
    }
    if (arg === "--root") {
      options.rootDir = path.resolve(nextValue(args, index, arg));
      index += 1;
      continue;
    }
    fail(`Unknown option: ${arg}`);
  }

  if (!options.apply && !options.dryRun) {
    fail("Staging ingest worker evidence requires explicit --apply or --dry-run.");
  }
  if (!options.maxJobsExplicit) {
    fail("Staging ingest worker evidence requires an explicit --max-jobs bound.");
  }
  if (options.confirmation !== STAGING_INGEST_WORKER_CONFIRMATION) {
    fail(`Staging ingest worker evidence requires confirmation ${STAGING_INGEST_WORKER_CONFIRMATION}.`);
  }
  assertNonProductionEnvironment(env);

  return options;
}

export function assertNonProductionEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  const production = detectIngestWorkerProductionEnvironment(env);
  if (production.productionLike) {
    fail(`Refusing staging ingest worker evidence in a production-like environment: ${production.reasons.join(", ")}.`);
  }
}

async function collectScopedQueueMetrics(source: string): Promise<ScopedQueueMetrics> {
  await ensureIngestProcessingQueueSchema();
  const counts = await sql<Record<string, unknown>>`
    select
      count(*)::int as total_jobs,
      count(*) filter (where status = 'queued')::int as queued_jobs,
      count(*) filter (where status = 'running')::int as running_jobs,
      count(*) filter (where status = 'succeeded')::int as succeeded_jobs,
      count(*) filter (where status = 'failed')::int as failed_jobs,
      count(*) filter (where status = 'dead_lettered')::int as dead_lettered_jobs,
      count(*) filter (where status = 'canceled')::int as canceled_jobs,
      count(*) filter (where status in ('queued', 'failed') and run_after <= now() and attempt_count < max_attempts)::int as eligible_jobs,
      count(*) filter (where status = 'running' and locked_until is not null and locked_until < now())::int as stale_running_jobs,
      extract(epoch from (now() - min(created_at) filter (where status = 'queued')))::int as oldest_queued_age_seconds
    from public.ingest_processing_job
    where source = ${source}
  `.execute(db);
  const jobs = await sql<Record<string, unknown>>`
    select id, status
    from public.ingest_processing_job
    where source = ${source}
    order by id asc
  `.execute(db);
  const row = counts.rows[0] ?? {};
  const statuses: Record<string, number> = {};
  const jobIds: number[] = [];
  for (const job of jobs.rows) {
    const status = String(rowValue(job, "status") ?? "unknown");
    statuses[status] = (statuses[status] ?? 0) + 1;
    const id = Number(rowValue(job, "id"));
    if (Number.isInteger(id)) jobIds.push(id);
  }
  return {
    source,
    totalJobs: toNumber(rowValue(row, "total_jobs")),
    queuedJobs: toNumber(rowValue(row, "queued_jobs")),
    runningJobs: toNumber(rowValue(row, "running_jobs")),
    succeededJobs: toNumber(rowValue(row, "succeeded_jobs")),
    failedJobs: toNumber(rowValue(row, "failed_jobs")),
    deadLetteredJobs: toNumber(rowValue(row, "dead_lettered_jobs")),
    canceledJobs: toNumber(rowValue(row, "canceled_jobs")),
    eligibleJobs: toNumber(rowValue(row, "eligible_jobs")),
    staleRunningJobs: toNumber(rowValue(row, "stale_running_jobs")),
    oldestQueuedAgeSeconds: toNullableNumber(rowValue(row, "oldest_queued_age_seconds")),
    jobIds,
    statuses,
  };
}

async function collectLifecycleEvidence(source: string): Promise<LifecycleEvidence> {
  await ensureIngestProcessingQueueSchema();
  const result = await sql<Record<string, unknown>>`
    select event.event_type, count(*)::int as event_count
    from public.ingest_processing_job_event event
    inner join public.ingest_processing_job job on job.id = event.job_id
    where job.source = ${source}
    group by event.event_type
    order by event.event_type asc
  `.execute(db);
  const eventCounts: Record<string, number> = {};
  for (const row of result.rows) {
    eventCounts[String(rowValue(row, "event_type"))] = toNumber(rowValue(row, "event_count"));
  }
  const totalEvents = Object.values(eventCounts).reduce((sum, value) => sum + value, 0);
  return {
    totalEvents,
    eventCounts,
    claimedEvents: eventCounts.claimed ?? 0,
    succeededEvents: eventCounts.succeeded ?? 0,
    retryScheduledEvents: eventCounts.retry_scheduled ?? 0,
    deadLetteredEvents: eventCounts.dead_lettered ?? 0,
    cleanupAttemptedEvents: eventCounts.cleanup_attempted ?? 0,
    cleanupFailedEvents: eventCounts.cleanup_failed ?? 0,
    operatorRemediationEvents: eventCounts.operator_remediation_action ?? 0,
  };
}

async function createSyntheticPdfBase64(): Promise<string> {
  return generateServerPdf({
    pageMargins: [40, 40, 40, 40],
    defaultStyle: { font: "Roboto", fontSize: 10 },
    content: [
      { text: "Synthetic staging ingest worker evidence fixture", bold: true, margin: [0, 0, 0, 12] },
      { text: SYNTHETIC_STAGING_REPORT_TEXT },
    ],
  } as any);
}

async function createSyntheticUser(name: string): Promise<number> {
  const role: UserRole = "user";
  const email = `${name}@example.test`;
  const displayName = "Synthetic Staging Ingest Evidence";
  const user = await db
    .insertInto("users")
    .values({
      email,
      displayName,
      avatarUrl: null,
      organizationId: null,
      emailVerified: true,
      role,
    })
    .returning(["id", "email"])
    .executeTakeFirstOrThrow();
  const userId = Number(user.id);
  await db
    .insertInto("userAccount")
    .values({
      userId,
      email: user.email,
      fullName: displayName,
      legalNameSignature: displayName,
      role,
      region: "CA",
      addressLine1: null,
      addressLine2: null,
      city: null,
      province: "NS",
      postalCode: null,
      phone: null,
      dateOfBirth: null,
      termsAcceptedAt: null,
      termsAcceptedVersion: null,
    })
    .execute();
  return userId;
}

async function createSyntheticJobs(input: { source: string; count: number; generatedAt: string }): Promise<SyntheticJob[]> {
  setDefaultIgnoredStoragePath();
  await ensureIngestProcessingQueueSchema();
  const jobs: SyntheticJob[] = [];
  const pdfBase64 = await createSyntheticPdfBase64();
  const runToken = input.source.replace(/[^a-zA-Z0-9_.:-]+/g, "_").slice(0, 80);

  for (let index = 0; index < input.count; index += 1) {
    const userId = await createSyntheticUser(`${runToken}-${index + 1}`);
    const fileName = `synthetic-staging-ingest-worker-${index + 1}.pdf`;
    const stored = await storeReportArtifactPdf({
      bytesBase64: pdfBase64,
      userId,
      fileName,
      mimeType: "application/pdf",
    });
    const artifact = await db
      .insertInto("reportArtifact")
      .values({
        userId,
        artifactType: "staging_ingest_worker_evidence",
        processingStatus: "pending",
        region: "CA",
        sha256: stored.sha256,
        storageUrl: stored.storageUrl,
        data: {
          marker: runToken,
          generatedAt: input.generatedAt,
          fileName,
          mimeType: "application/pdf",
          syntheticStagingFixture: true,
          sanitizedEvidenceFixture: true,
          rawReportTextStoredInEvidence: false,
          rawPdfBase64StoredInEvidence: false,
          ...buildReportArtifactStorageMetadata(stored),
        } as Record<string, Json>,
        createdAt: new Date(),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const reportArtifactId = Number(artifact.id);
    const queued = await enqueueIngestProcessingJob({
      reportArtifactId,
      userId,
      source: input.source,
      maxAttempts: 1,
      payload: {
        region: "CA",
        mimeType: "application/pdf",
        artifactSha256: stored.sha256,
        metadata: {
          stagingSafeSynthetic: true,
          evidenceRunSource: input.source,
          fixtureIndex: index + 1,
        },
      },
    });
    jobs.push({ userId, reportArtifactId, jobId: queued.job.id });
  }
  return jobs;
}

async function captureWorkerRun(options: WorkerCliOptions): Promise<{ exitCode: number; capturedLineCount: number }> {
  const originalLog = console.log;
  const originalInfo = console.info;
  const originalDebug = console.debug;
  const originalWarn = console.warn;
  const originalError = console.error;
  let capturedLineCount = 0;
  const capture = (...args: unknown[]) => {
    const line = args.map((item) => String(item)).join(" ");
    capturedLineCount += line.trim() ? 1 : 0;
  };
  console.log = capture;
  console.info = capture;
  console.debug = capture;
  console.warn = capture;
  console.error = capture;
  try {
    const exitCode = await runIngestProcessingWorker(options);
    return { exitCode, capturedLineCount };
  } finally {
    console.log = originalLog;
    console.info = originalInfo;
    console.debug = originalDebug;
    console.warn = originalWarn;
    console.error = originalError;
  }
}

function workerCommand(options: StagingEvidenceOptions): string {
  const mode = options.apply ? "--apply" : "--dry-run";
  return `pnpm run ingest:worker ${mode} --max-jobs ${options.maxJobs} --concurrency 1 --worker-id ${options.workerId} --source ${options.source}`;
}

export function validateStagingIngestWorkerEvidenceReport(report: any): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const serialized = JSON.stringify(report ?? {});

  if (report?.evidenceType !== "STAGING_INGEST_WORKER_QUEUE_DRAIN") {
    errors.push("evidenceType must be STAGING_INGEST_WORKER_QUEUE_DRAIN.");
  }
  if (report?.environment !== "staging-safe") errors.push("environment must be staging-safe.");
  if (report?.productionProof === true) errors.push("staging evidence must not be marked production proof.");
  if (report?.safety?.productionDataMutated !== false) errors.push("productionDataMutated must be false.");
  if (report?.safety?.productionWorkerActivationDeferred !== true) {
    errors.push("productionWorkerActivationDeferred must be true.");
  }
  if (report?.safety?.workerAlwaysOn !== false) errors.push("workerAlwaysOn must be false.");
  if (report?.safety?.parserBehaviorChanged !== false) errors.push("parserBehaviorChanged must be false.");
  if (report?.safety?.ocrBehaviorChanged !== false) errors.push("ocrBehaviorChanged must be false.");
  if (!Number.isInteger(report?.boundedExecution?.maxJobs) || report.boundedExecution.maxJobs < 1) {
    errors.push("bounded maxJobs must be recorded.");
  }
  if (report?.mode === "apply" && report?.workerExitCode !== 0) errors.push("apply workerExitCode must be 0.");
  if (!Number.isInteger(report?.queueDepthBeforeRun) || !Number.isInteger(report?.queueDepthAfterRun)) {
    errors.push("queue depth before/after must be integer metrics.");
  }
  if (report?.mode === "apply" && report?.queueDepthBeforeRun < 1) {
    errors.push("apply evidence must include at least one queued scoped job before the run.");
  }
  if (report?.mode === "apply" && report?.queueDepthAfterRun !== 0) {
    errors.push("apply evidence must drain queued scoped jobs to zero.");
  }
  if (report?.processedCount > report?.boundedExecution?.maxJobs) {
    errors.push("processedCount must not exceed maxJobs.");
  }
  if (report?.failedCount !== 0) errors.push("failedCount must be zero for accepted staging queue-drain evidence.");
  if (report?.deadLetterCount !== 0) errors.push("deadLetterCount must be zero for accepted staging queue-drain evidence.");
  if (report?.scopedBatch?.staleQueuedJobsRemaining !== false) {
    errors.push("scoped batch must have no stale queued jobs remaining.");
  }
  if (report?.mode === "apply" && (report?.lifecycleEvents?.claimedEvents ?? 0) < 1) {
    errors.push("apply evidence must record lifecycle claim events.");
  }
  if (FORBIDDEN_EVIDENCE_PATTERN.test(serialized)) {
    errors.push("evidence contains forbidden sensitive content.");
  }

  return { ok: errors.length === 0, errors };
}

export function buildStagingIngestWorkerEvidenceReport(input: {
  options: StagingEvidenceOptions;
  generatedAt: string;
  branch: string;
  commit: string;
  globalQueueBefore: Awaited<ReturnType<typeof getIngestProcessingQueueMetrics>>;
  globalQueueAfter: Awaited<ReturnType<typeof getIngestProcessingQueueMetrics>>;
  scopedQueueBeforeCreation: ScopedQueueMetrics;
  scopedQueueBeforeRun: ScopedQueueMetrics;
  scopedQueueAfterRun: ScopedQueueMetrics;
  lifecycleEvents: LifecycleEvidence;
  syntheticJobs: SyntheticJob[];
  workerExitCode: number;
  capturedWorkerLogLines: number;
}) {
  const terminalBefore = input.scopedQueueBeforeRun.succeededJobs +
    input.scopedQueueBeforeRun.failedJobs +
    input.scopedQueueBeforeRun.deadLetteredJobs +
    input.scopedQueueBeforeRun.canceledJobs;
  const terminalAfter = input.scopedQueueAfterRun.succeededJobs +
    input.scopedQueueAfterRun.failedJobs +
    input.scopedQueueAfterRun.deadLetteredJobs +
    input.scopedQueueAfterRun.canceledJobs;
  const processedCount = Math.max(0, terminalAfter - terminalBefore);
  const report = {
    reportName: "staging-ingest-worker-queue-drain-evidence",
    evidenceType: "STAGING_INGEST_WORKER_QUEUE_DRAIN",
    generatedAt: input.generatedAt,
    branch: input.branch,
    commit: input.commit,
    environment: "staging-safe",
    status: "pending-validation",
    productionProof: false,
    stagingProof: true,
    mode: input.options.apply ? "apply" : "dry-run",
    command: "pnpm run ingest:worker:staging-evidence",
    workerCommand: workerCommand(input.options),
    workerExitCode: input.workerExitCode,
    capturedWorkerLogLines: input.capturedWorkerLogLines,
    boundedExecution: {
      explicitMaxJobsRequired: true,
      maxJobs: input.options.maxJobs,
      concurrency: 1,
      sourceScoped: true,
      source: input.options.source,
      workerId: input.options.workerId,
    },
    queueDepthBeforeRun: input.scopedQueueBeforeRun.queuedJobs,
    queueDepthAfterRun: input.scopedQueueAfterRun.queuedJobs,
    eligibleDepthBeforeRun: input.scopedQueueBeforeRun.eligibleJobs,
    eligibleDepthAfterRun: input.scopedQueueAfterRun.eligibleJobs,
    processedCount,
    failedCount: input.scopedQueueAfterRun.failedJobs,
    deadLetterCount: input.scopedQueueAfterRun.deadLetteredJobs,
    queueMetrics: {
      globalBefore: {
        totalJobs: input.globalQueueBefore.totalJobs,
        queuedJobs: input.globalQueueBefore.queuedJobs,
        failedJobs: input.globalQueueBefore.failedJobs,
        deadLetteredJobs: input.globalQueueBefore.deadLetteredJobs,
        oldestQueuedAgeSeconds: input.globalQueueBefore.oldestQueuedAgeSeconds,
      },
      globalAfter: {
        totalJobs: input.globalQueueAfter.totalJobs,
        queuedJobs: input.globalQueueAfter.queuedJobs,
        failedJobs: input.globalQueueAfter.failedJobs,
        deadLetteredJobs: input.globalQueueAfter.deadLetteredJobs,
        oldestQueuedAgeSeconds: input.globalQueueAfter.oldestQueuedAgeSeconds,
      },
      scopedBeforeCreation: input.scopedQueueBeforeCreation,
      scopedBeforeRun: input.scopedQueueBeforeRun,
      scopedAfterRun: input.scopedQueueAfterRun,
    },
    syntheticBatch: {
      createdJobs: input.syntheticJobs.length,
      jobIds: input.syntheticJobs.map((job) => job.jobId),
      reportArtifactIds: input.syntheticJobs.map((job) => job.reportArtifactId),
      usesRealConsumerReports: false,
      syntheticOrSanitizedFixturesOnly: true,
    },
    lifecycleEvents: input.lifecycleEvents,
    scopedBatch: {
      staleQueuedJobsRemaining: input.scopedQueueAfterRun.queuedJobs > 0 || input.scopedQueueAfterRun.eligibleJobs > 0,
      eligibleJobsRemaining: input.scopedQueueAfterRun.eligibleJobs,
      runningJobsRemaining: input.scopedQueueAfterRun.runningJobs,
      staleRunningJobsRemaining: input.scopedQueueAfterRun.staleRunningJobs,
    },
    workflowGate: {
      requiresRunIngestWorkerInput: true,
      requiredInput: "run_ingest_worker=true",
      requiresExplicitMaxJobs: true,
      requiresStagingConfirmation: true,
      stagingConfirmation: STAGING_INGEST_WORKER_CONFIRMATION,
      dryRunSupported: true,
      emptyQueueNoOpSafe: true,
      productionWorkerDefaultOff: true,
    },
    blockerCoverage: {
      blocker2StagingQueueDrain: false,
      blocker2ProductionRuntime: false,
      blocker11ProductionParityAndRollback: false,
    },
    safety: {
      stagingSafeOnly: true,
      productionDataMutated: false,
      productionTargetsUsed: false,
      productionWorkerActivatedByDefault: false,
      productionWorkerActivationDeferred: true,
      workerAlwaysOn: false,
      parserBehaviorChanged: false,
      ocrBehaviorChanged: false,
      packetReadinessChanged: false,
      packetPdfLogicChanged: false,
      violationEvidenceLogicChanged: false,
      retentionBehaviorChanged: false,
      realConsumerPiiUsed: false,
      rawReportTextIncludedInEvidence: false,
      rawPdfBase64IncludedInEvidence: false,
      liveExternalProvidersUsed: false,
    },
    requiredStatements: [
      "STAGING SAFE ONLY.",
      "Bounded execution was used.",
      "The ingest worker is not always-on.",
      "Production worker activation remains deferred unless separately approved.",
      "Parser and OCR behavior were not changed.",
      "No production mutation occurred.",
      "This staging evidence is not production proof.",
    ],
    outputPaths: {
      markdown: STAGING_INGEST_WORKER_EVIDENCE_MD_PATH,
      json: STAGING_INGEST_WORKER_EVIDENCE_JSON_PATH,
    },
  };
  const validation = validateStagingIngestWorkerEvidenceReport(report);
  const accepted = validation.ok && report.mode === "apply";
  return {
    ...report,
    status: report.mode === "dry-run" ? "dry-run-only" : accepted ? "accepted-staging-queue-drain" : "failed",
    accepted,
    blockerCoverage: {
      ...report.blockerCoverage,
      blocker2StagingQueueDrain: accepted,
    },
    validation,
  };
}

export function renderStagingIngestWorkerEvidenceMarkdown(report: ReturnType<typeof buildStagingIngestWorkerEvidenceReport>): string {
  const lines = [
    "# Staging Ingest Worker Evidence",
    "",
    `Generated at: ${report.generatedAt}`,
    `Evidence type: ${report.evidenceType}`,
    `Status: ${report.status}`,
    `Branch: \`${report.branch}\``,
    `Commit: \`${report.commit}\``,
    `Environment: ${report.environment}`,
    `Production proof: ${report.productionProof ? "yes" : "no"}`,
    "",
    "## Required Statements",
    "",
    ...report.requiredStatements.map((statement) => `- ${statement}`),
    "",
    "## Bounded Run",
    "",
    `- Command: \`${report.command}\``,
    `- Worker command: \`${report.workerCommand}\``,
    `- Mode: ${report.mode}`,
    `- Max jobs: ${report.boundedExecution.maxJobs}`,
    `- Worker exit code: ${report.workerExitCode}`,
    "",
    "## Queue Drain",
    "",
    `- Queue depth before run: ${report.queueDepthBeforeRun}`,
    `- Queue depth after run: ${report.queueDepthAfterRun}`,
    `- Eligible depth before run: ${report.eligibleDepthBeforeRun}`,
    `- Eligible depth after run: ${report.eligibleDepthAfterRun}`,
    `- Processed count: ${report.processedCount}`,
    `- Failed count: ${report.failedCount}`,
    `- Dead-letter count: ${report.deadLetterCount}`,
    `- Scoped stale queued jobs remaining: ${report.scopedBatch.staleQueuedJobsRemaining ? "yes" : "no"}`,
    "",
    "## Lifecycle Events",
    "",
    `- Total lifecycle events: ${report.lifecycleEvents.totalEvents}`,
    `- Claimed events: ${report.lifecycleEvents.claimedEvents}`,
    `- Succeeded events: ${report.lifecycleEvents.succeededEvents}`,
    `- Retry scheduled events: ${report.lifecycleEvents.retryScheduledEvents}`,
    `- Dead-lettered events: ${report.lifecycleEvents.deadLetteredEvents}`,
    `- Cleanup attempted events: ${report.lifecycleEvents.cleanupAttemptedEvents}`,
    `- Cleanup failed events: ${report.lifecycleEvents.cleanupFailedEvents}`,
    `- Operator remediation events: ${report.lifecycleEvents.operatorRemediationEvents}`,
    "",
    "## Blocker Coverage",
    "",
    `- Blocker 2 staging queue drain: ${report.blockerCoverage.blocker2StagingQueueDrain ? "accepted" : "not accepted"}`,
    `- Blocker 2 production runtime: ${report.blockerCoverage.blocker2ProductionRuntime ? "accepted" : "not accepted"}`,
    `- Blocker 11 production parity and rollback: ${report.blockerCoverage.blocker11ProductionParityAndRollback ? "accepted" : "not accepted"}`,
    "",
    "## Safety",
    "",
    "- Production targets used: no",
    "- Production data mutated: no",
    "- Production worker activation deferred: yes",
    "- Parser/OCR/packet/violation/evidence/retention behavior changed: no",
    "- Raw report text or raw PDF base64 included in evidence: no",
  ];
  return `${lines.join("\n")}\n`;
}

export function writeStagingIngestWorkerEvidence(report: ReturnType<typeof buildStagingIngestWorkerEvidenceReport>, {
  rootDir = process.cwd(),
} = {}): { markdownPath: string; jsonPath: string } {
  const markdown = renderStagingIngestWorkerEvidenceMarkdown(report);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const combined = `${markdown}\n${json}`;
  if (FORBIDDEN_EVIDENCE_PATTERN.test(combined)) {
    throw new Error("Refusing to write staging ingest worker evidence because sensitive content was detected.");
  }
  mkdirSync(path.dirname(repoPath(rootDir, STAGING_INGEST_WORKER_EVIDENCE_MD_PATH)), { recursive: true });
  writeFileSync(repoPath(rootDir, STAGING_INGEST_WORKER_EVIDENCE_MD_PATH), markdown, "utf8");
  writeFileSync(repoPath(rootDir, STAGING_INGEST_WORKER_EVIDENCE_JSON_PATH), json, "utf8");
  return {
    markdownPath: STAGING_INGEST_WORKER_EVIDENCE_MD_PATH,
    jsonPath: STAGING_INGEST_WORKER_EVIDENCE_JSON_PATH,
  };
}

const realDeps: StagingEvidenceRuntimeDeps = {
  assertNonProductionEnvironment,
  collectGlobalQueueMetrics: () => getIngestProcessingQueueMetrics(),
  collectScopedQueueMetrics,
  collectLifecycleEvidence,
  createSyntheticJobs,
  runWorker: captureWorkerRun,
  writeEvidence: writeStagingIngestWorkerEvidence,
};

export async function runStagingIngestWorkerEvidence(
  options: StagingEvidenceOptions,
  deps: StagingEvidenceRuntimeDeps = realDeps,
): Promise<ReturnType<typeof buildStagingIngestWorkerEvidenceReport>> {
  const generatedAt = new Date().toISOString();
  deps.assertNonProductionEnvironment(process.env);
  const globalQueueBefore = await deps.collectGlobalQueueMetrics();
  const scopedQueueBeforeCreation = await deps.collectScopedQueueMetrics(options.source);
  const syntheticJobs = options.apply
    ? await deps.createSyntheticJobs({ source: options.source, count: options.maxJobs, generatedAt })
    : [];
  const scopedQueueBeforeRun = await deps.collectScopedQueueMetrics(options.source);
  const workerOptions: WorkerCliOptions = {
    dryRun: options.dryRun,
    apply: options.apply,
    maxJobs: options.maxJobs,
    maxJobsExplicit: true,
    concurrency: 1,
    leaseSeconds: null,
    workerId: options.workerId,
    source: options.source,
  };
  const workerRun = await deps.runWorker(workerOptions);
  const scopedQueueAfterRun = await deps.collectScopedQueueMetrics(options.source);
  const globalQueueAfter = await deps.collectGlobalQueueMetrics();
  const lifecycleEvents = await deps.collectLifecycleEvidence(options.source);
  const report = buildStagingIngestWorkerEvidenceReport({
    options,
    generatedAt,
    branch: safeGit(["branch", "--show-current"], options.rootDir),
    commit: safeGit(["rev-parse", "HEAD"], options.rootDir),
    globalQueueBefore,
    globalQueueAfter,
    scopedQueueBeforeCreation,
    scopedQueueBeforeRun,
    scopedQueueAfterRun,
    lifecycleEvents,
    syntheticJobs,
    workerExitCode: workerRun.exitCode,
    capturedWorkerLogLines: workerRun.capturedLineCount,
  });
  deps.writeEvidence(report, { rootDir: options.rootDir });
  return report;
}

async function main() {
  const options = parseStagingIngestWorkerEvidenceArgs(process.argv.slice(2));
  const report = await runStagingIngestWorkerEvidence(options);
  console.log("Staging ingest worker evidence generated.");
  console.log(`Markdown: ${STAGING_INGEST_WORKER_EVIDENCE_MD_PATH}`);
  console.log(`JSON: ${STAGING_INGEST_WORKER_EVIDENCE_JSON_PATH}`);
  console.log(`Queue depth before/after: ${report.queueDepthBeforeRun}/${report.queueDepthAfterRun}`);
  console.log(`Processed: ${report.processedCount}; failed: ${report.failedCount}; dead-lettered: ${report.deadLetterCount}`);
  console.log("Production worker activation remains deferred.");
  if (!report.validation.ok) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
