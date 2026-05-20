import "../loadEnv.js";

import { fileURLToPath } from "node:url";

import { db } from "../helpers/db";
import { executeIngestPipeline, type PipelineParams } from "../helpers/ingestCorePipeline";
import { updateArtifactProcessingStatus } from "../helpers/ingestProcessingStatus";
import {
  claimNextIngestProcessingJob,
  IngestProcessingQueueError,
  type IngestProcessingJobRecord,
  markIngestProcessingJobFailed,
  markIngestProcessingJobSucceeded,
  peekNextIngestProcessingJob,
  recordIngestProcessingJobEvent,
} from "../helpers/ingestProcessingQueueService";
import { resolveReportArtifactPdfBase64 } from "../helpers/reportArtifactStorage";
import type { Json } from "../helpers/schema";
import type { SSEEvent } from "../helpers/sseStreamBuilder";

export type WorkerCliOptions = {
  dryRun: boolean;
  apply: boolean;
  maxJobs: number;
  concurrency: number;
  leaseSeconds: number | null;
  workerId: string | null;
  source: string | null;
};

type PipelineSignalSummary = {
  progressStages: string[];
  completeEvents: number;
  errorEvents: number;
};

type QueuedIngestPipelineInput = Pick<
  PipelineParams,
  "user" | "userAccount" | "artifactId" | "region" | "fileName" | "bytesBase64" | "mimeType"
>;

type IngestWorkerResolvedDependencies = {
  peekNextJob: typeof peekNextIngestProcessingJob;
  claimNextJob: typeof claimNextIngestProcessingJob;
  markSucceeded: typeof markIngestProcessingJobSucceeded;
  markFailed: typeof markIngestProcessingJobFailed;
  recordEvent: typeof recordIngestProcessingJobEvent;
  updateArtifactStatus: typeof updateArtifactProcessingStatus;
  loadPipelineInput: typeof loadQueuedIngestPipelineInput;
  executePipeline: typeof executeIngestPipeline;
};

export type IngestWorkerDependencies = Partial<IngestWorkerResolvedDependencies>;

export type ProcessIngestProcessingJobResult =
  | {
      status: "idle";
      workerId: string;
      dryRun: boolean;
      job: null;
    }
  | {
      status: "dry_run_preview";
      workerId: string;
      dryRun: true;
      job: Pick<IngestProcessingJobRecord, "id" | "jobType" | "status" | "attemptCount" | "maxAttempts" | "runAfter">;
    }
  | {
      status: "succeeded" | "failed" | "dead_lettered";
      workerId: string;
      dryRun: false;
      job: IngestProcessingJobRecord;
      signals: PipelineSignalSummary;
    };

const SAFE_TOKEN_PATTERN = /^[a-zA-Z0-9_.:-]{1,120}$/;
const DEFAULT_WORKER_ID = "ingest-worker";
const DEFAULT_MAX_JOBS = 1;
const DEFAULT_CONCURRENCY = 1;
const DEFAULT_LEASE_SECONDS = 300;

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

function safeToken(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (!SAFE_TOKEN_PATTERN.test(trimmed) || /\d{10,}|postgres:\/\/|database_url|private key|api[_-]?key|bearer\s+/i.test(trimmed)) {
    fail(`${fieldName} must be a safe internal token.`);
  }
  return trimmed;
}

function printHelp(): void {
  console.log([
    "Usage: pnpm run ingest:worker -- [options]",
    "",
    "Defaults to a bounded dry-run preview. No daemon mode is started by default.",
    "",
    "Options:",
    "  --dry-run                      Preview the next eligible job without claiming or writing. This is the default.",
    "  --apply                        Claim and process queued jobs.",
    "  --max-jobs <1-100>             Process or preview up to N eligible jobs sequentially.",
    "  --worker-id <safe-token>       Optional safe worker identifier for leases and structured logs.",
    "  --source <safe-token>          Optional queue source filter.",
    "  --lease-seconds <30-3600>      Lease duration for claimed jobs.",
    "  --concurrency <1>              Worker concurrency. Only 1 is supported in this bounded task.",
    "",
    "Boundaries:",
    "  - Ingest endpoint cutover enqueues jobs; this worker owns deterministic processing execution.",
    "  - The worker calls executeIngestPipeline with the same artifact/user/account/context shape used by request-bound ingest.",
    "  - Raw report bytes and extracted text are not logged or stored in worker events.",
  ].join("\n"));
}

export function parseIngestWorkerArgs(args: string[]): WorkerCliOptions {
  const options: WorkerCliOptions = {
    dryRun: true,
    apply: false,
    maxJobs: DEFAULT_MAX_JOBS,
    concurrency: DEFAULT_CONCURRENCY,
    leaseSeconds: null,
    workerId: null,
    source: null,
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
      options.workerId = safeToken(nextValue(args, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--source") {
      options.source = safeToken(nextValue(args, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--lease-seconds") {
      const parsed = parsePositiveInt(nextValue(args, index, arg), arg);
      if (parsed < 30 || parsed > 3600) fail("--lease-seconds must be between 30 and 3600.");
      options.leaseSeconds = parsed;
      index += 1;
      continue;
    }
    if (arg === "--concurrency") {
      const parsed = parsePositiveInt(nextValue(args, index, arg), arg);
      if (parsed !== 1) fail("--concurrency greater than 1 is not supported until a separate safe concurrency task.");
      options.concurrency = parsed;
      index += 1;
      continue;
    }
    fail(`Unknown option: ${arg}`);
  }

  return options;
}

export function safeIngestWorkerErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /%PDF|JVBERi0|data:application\/pdf;base64|raw report text|raw pdf text|full credit report|full report text|storageUrl|storage_url|bytesBase64|pdfBase64|postgres:\/\/|mysql:\/\/|mongodb:\/\/|database_url|private key|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|bearer\s+[a-z0-9._-]+|sk-[a-z0-9_-]{10,}|session=|cookie=|account number\s*[:#-]?\s*[A-Z0-9 -]{8,}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(message)
  ) {
    return "Ingest processing worker failed with a sanitized operational error.";
  }
  return message.replace(/\s+/g, " ").trim().slice(0, 240) || "Ingest processing worker failed.";
}

function resolveDependencies(dependencies: IngestWorkerDependencies = {}): IngestWorkerResolvedDependencies {
  return {
    peekNextJob: dependencies.peekNextJob ?? peekNextIngestProcessingJob,
    claimNextJob: dependencies.claimNextJob ?? claimNextIngestProcessingJob,
    markSucceeded: dependencies.markSucceeded ?? markIngestProcessingJobSucceeded,
    markFailed: dependencies.markFailed ?? markIngestProcessingJobFailed,
    recordEvent: dependencies.recordEvent ?? recordIngestProcessingJobEvent,
    updateArtifactStatus: dependencies.updateArtifactStatus ?? updateArtifactProcessingStatus,
    loadPipelineInput: dependencies.loadPipelineInput ?? loadQueuedIngestPipelineInput,
    executePipeline: dependencies.executePipeline ?? executeIngestPipeline,
  };
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function loadQueuedIngestPipelineInput(job: IngestProcessingJobRecord): Promise<QueuedIngestPipelineInput> {
  const artifact = await db
    .selectFrom("reportArtifact")
    .select(["id", "data", "region", "storageUrl", "userId"])
    .where("id", "=", job.reportArtifactId)
    .executeTakeFirst();

  if (!artifact) {
    throw new IngestProcessingQueueError("INGEST_ARTIFACT_NOT_FOUND", "Queued report artifact was not found.", true);
  }
  if (artifact.userId !== job.userId) {
    throw new IngestProcessingQueueError("INGEST_ARTIFACT_OWNERSHIP_MISMATCH", "Queued report artifact ownership does not match the job.", true);
  }

  const artifactData = jsonRecord(artifact.data);
  if (artifactData.extractionStatus === "failed") {
    throw new IngestProcessingQueueError("INGEST_ARTIFACT_EXTRACTION_FAILED", "Queued report artifact extraction had previously failed.", true);
  }
  const bytesBase64 = await resolveReportArtifactPdfBase64(artifact.storageUrl);
  if (!bytesBase64) {
    throw new IngestProcessingQueueError("INGEST_ARTIFACT_BYTES_MISSING", "Queued report artifact has no stored PDF bytes.", true);
  }

  const user = await db
    .selectFrom("users")
    .selectAll()
    .where("id", "=", job.userId)
    .executeTakeFirst();
  if (!user) {
    throw new IngestProcessingQueueError("INGEST_USER_NOT_FOUND", "Queued ingest user was not found.", true);
  }

  const userAccount = await db
    .selectFrom("userAccount")
    .selectAll()
    .where("userId", "=", job.userId)
    .executeTakeFirst();
  if (!userAccount) {
    throw new IngestProcessingQueueError("INGEST_USER_ACCOUNT_NOT_FOUND", "Queued ingest user account was not found.", true);
  }
  const userForPipeline: QueuedIngestPipelineInput["user"] = {
    ...user,
    subscriptionPlan: null,
    subscriptionStatus: null,
    trialEnd: null,
    termsAcceptedAt: userAccount.termsAcceptedAt ? new Date(userAccount.termsAcceptedAt).toISOString() : null,
    termsAcceptedVersion: userAccount.termsAcceptedVersion ?? null,
    currentTermsVersion: null,
  };

  return {
    user: userForPipeline,
    userAccount,
    artifactId: job.reportArtifactId,
    region: String(artifact.region ?? job.payload.region ?? "CA"),
    fileName: typeof artifactData.fileName === "string" && artifactData.fileName.trim()
      ? artifactData.fileName.trim()
      : "credit-report.pdf",
    bytesBase64,
    mimeType: typeof artifactData.mimeType === "string" && artifactData.mimeType.trim()
      ? artifactData.mimeType.trim()
      : "application/pdf",
  };
}

function summarizePipelineEvent(event: SSEEvent, signals: PipelineSignalSummary): void {
  const record = event as unknown as Record<string, unknown>;
  if (record.type === "progress" && typeof record.stage === "string") {
    if (!signals.progressStages.includes(record.stage)) signals.progressStages.push(record.stage);
  } else if (record.type === "complete") {
    signals.completeEvents += 1;
  } else if (record.type === "error") {
    signals.errorEvents += 1;
  }
}

function logStructured(event: string, details: Record<string, unknown>): void {
  console.log(JSON.stringify({
    event,
    component: "ingest_processing_worker",
    rawReportBytesLogged: false,
    extractedReportTextLogged: false,
    ...details,
  }));
}

function resultSummary(job: IngestProcessingJobRecord, signals: PipelineSignalSummary, extra: Record<string, Json> = {}): Record<string, Json> {
  return {
    artifactId: job.reportArtifactId,
    deterministicPipelineCalledByWorker: true,
    endpointCutoverEnabled: true,
    progressStages: signals.progressStages.slice(0, 30),
    completeEvents: signals.completeEvents,
    errorEvents: signals.errorEvents,
    parserOutputMutated: false,
    ocrBehaviorMutated: false,
    violationTruthMutated: false,
    evidenceBindingMutated: false,
    packetReadinessMutated: false,
    rawReportBytesLogged: false,
    extractedReportTextLogged: false,
    ...extra,
  };
}

export async function processNextIngestProcessingJob(
  input: {
    workerId?: string | null;
    dryRun?: boolean;
    source?: string | null;
    leaseSeconds?: number | null;
  } = {},
  dependencies?: IngestWorkerDependencies,
): Promise<ProcessIngestProcessingJobResult> {
  const deps = resolveDependencies(dependencies);
  const dryRun = input.dryRun ?? true;
  const workerId = input.workerId ? safeToken(input.workerId, "workerId") : `${DEFAULT_WORKER_ID}-${process.pid}`;
  const source = input.source ? safeToken(input.source, "source") : null;
  const leaseSeconds = input.leaseSeconds ?? DEFAULT_LEASE_SECONDS;

  if (dryRun) {
    const preview = await deps.peekNextJob(source);
    if (!preview) {
      return { status: "idle", workerId, dryRun: true, job: null };
    }
    return {
      status: "dry_run_preview",
      workerId,
      dryRun: true,
      job: {
        id: preview.id,
        jobType: preview.jobType,
        status: preview.status,
        attemptCount: preview.attemptCount,
        maxAttempts: preview.maxAttempts,
        runAfter: preview.runAfter,
      },
    };
  }

  const job = await deps.claimNextJob({ workerId, source, leaseSeconds });
  if (!job) {
    return { status: "idle", workerId, dryRun: false, job: null };
  }

  const signals: PipelineSignalSummary = {
    progressStages: [],
    completeEvents: 0,
    errorEvents: 0,
  };

  try {
    const pipelineInput = await deps.loadPipelineInput(job);
    await deps.updateArtifactStatus(job.reportArtifactId, "processing");
    await deps.recordEvent({
      jobId: job.id,
      eventType: "ocr_parsing_started",
      workerId,
      details: {
        artifactId: job.reportArtifactId,
        deterministicPipelineCalledByWorker: true,
        rawReportBytesLogged: false,
        extractedReportTextLogged: false,
      },
    });

    const context = {
      tradelineIds: [] as number[],
      createdTradelineIds: [] as number[],
      updatedTradelineIds: [] as number[],
    };
    await deps.executePipeline({
      ...pipelineInput,
      send: (event) => summarizePipelineEvent(event, signals),
      context,
    });

    if (signals.progressStages.includes("compliance_scanning")) {
      await deps.recordEvent({
        jobId: job.id,
        eventType: "compliance_scan_started",
        workerId,
        details: {
          artifactId: job.reportArtifactId,
          tradelineCount: context.tradelineIds.length,
          rawReportBytesLogged: false,
          extractedReportTextLogged: false,
        },
      });
    }

    const succeeded = await deps.markSucceeded({
      job,
      workerId,
      resultSummary: resultSummary(job, signals, {
        tradelineCount: context.tradelineIds.length,
        createdTradelineCount: context.createdTradelineIds.length,
        updatedTradelineCount: context.updatedTradelineIds.length,
      }),
    });
    return { status: "succeeded", workerId, dryRun: false, job: succeeded, signals };
  } catch (error) {
    await deps.updateArtifactStatus(job.reportArtifactId, "failed").catch(() => undefined);
    const safeError = error instanceof IngestProcessingQueueError
      ? new IngestProcessingQueueError(error.code, safeIngestWorkerErrorMessage(error), error.permanent)
      : new Error(safeIngestWorkerErrorMessage(error));
    const failed = await deps.markFailed({ job, workerId, error: safeError });
    return {
      status: failed.status === "dead_lettered" ? "dead_lettered" : "failed",
      workerId,
      dryRun: false,
      job: failed,
      signals,
    };
  }
}

export async function runIngestProcessingWorker(
  options: WorkerCliOptions,
  dependencies?: IngestWorkerDependencies,
): Promise<number> {
  if (options.concurrency !== 1) {
    throw new Error("Ingest worker concurrency greater than 1 is not supported in this bounded task.");
  }

  let processed = 0;
  let failureCount = 0;
  for (let index = 0; index < options.maxJobs; index += 1) {
    const result = await processNextIngestProcessingJob({
      workerId: options.workerId,
      dryRun: options.dryRun,
      source: options.source,
      leaseSeconds: options.leaseSeconds,
    }, dependencies);

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
    apply: options.apply,
    maxJobs: options.maxJobs,
    concurrency: options.concurrency,
    processed,
    failureCount,
  });
  return failureCount > 0 ? 2 : 0;
}

async function main() {
  const options = parseIngestWorkerArgs(process.argv.slice(2));
  const exitCode = await runIngestProcessingWorker(options);
  process.exitCode = exitCode;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(JSON.stringify({
      event: "worker_error",
      component: "ingest_processing_worker",
      error: safeIngestWorkerErrorMessage(error),
      rawReportBytesLogged: false,
      extractedReportTextLogged: false,
    }));
    process.exit(1);
  });
}
