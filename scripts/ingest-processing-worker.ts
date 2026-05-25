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
  recordIngestProcessingWorkerHeartbeat,
} from "../helpers/ingestProcessingQueueService";
import { resolveReportArtifactPdfBase64 } from "../helpers/reportArtifactStorage";
import type { Json } from "../helpers/schema";
import type { SSEEvent } from "../helpers/sseStreamBuilder";

export type WorkerCliOptions = {
  dryRun: boolean;
  apply: boolean;
  maxJobs: number;
  maxJobsExplicit?: boolean;
  concurrency: number;
  leaseSeconds: number | null;
  workerId: string | null;
  source: string | null;
};

export const PRODUCTION_INGEST_WORKER_MAX_JOBS = 5;
export const PRODUCTION_INGEST_WORKER_SOURCE = "authenticated_ingest_process";
export const PRODUCTION_INGEST_WORKER_APPLY_GUARD = "explicit-bounded-production-ingest-worker-apply";
export const PRODUCTION_INGEST_WORKER_ONE_SHOT_GUARD = "true";

type PipelineSignalSummary = {
  progressStages: string[];
  completeEvents: number;
  errorEvents: number;
  startedAtMs: number;
  ocrParsingStartedAtMs: number | null;
  unifiedExtractionCompletedAtMs: number | null;
  complianceScanStartedAtMs: number | null;
  finalizingStartedAtMs: number | null;
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
  recordHeartbeat: typeof recordIngestProcessingWorkerHeartbeat;
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

export function detectIngestWorkerProductionEnvironment(env: NodeJS.ProcessEnv = process.env): {
  productionLike: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const environmentFields = [
    ["CRP_ENV", env.CRP_ENV],
    ["APP_ENV", env.APP_ENV],
    ["NODE_ENV", env.NODE_ENV],
    ["VERCEL_ENV", env.VERCEL_ENV],
  ];

  for (const [name, value] of environmentFields) {
    if (typeof value === "string" && /\bprod(?:uction)?\b/i.test(value)) {
      reasons.push(`${name}=production-like`);
    }
  }

  const databaseUrl = env.FLOOT_DATABASE_URL ?? env.DATABASE_URL ?? "";
  if (databaseUrl && /prod|creditregulatorpro-prod|creditregulatorpro\.com/i.test(databaseUrl) && !/staging|localhost|127\.0\.0\.1|\.test/i.test(databaseUrl)) {
    reasons.push("database_url=production-like");
  }

  return {
    productionLike: reasons.length > 0,
    reasons,
  };
}

export function validateIngestWorkerRuntimeSafety(
  options: WorkerCliOptions,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!options.dryRun && !options.apply) {
    fail("Ingest worker must run as --dry-run or explicit --apply.");
  }

  const productionEnvironment = detectIngestWorkerProductionEnvironment(env);
  if (!productionEnvironment.productionLike) return;

  if (options.dryRun && !options.apply) return;

  if (!options.apply) {
    fail("Production-like ingest worker execution refused because the command is not an explicit dry-run or guarded apply.");
  }

  const missingGuards: string[] = [];
  if (env.CRP_ENV !== "production") missingGuards.push("CRP_ENV=production");
  if (env.CRP_PRODUCTION_INGEST_WORKER_APPLY !== PRODUCTION_INGEST_WORKER_APPLY_GUARD) {
    missingGuards.push("CRP_PRODUCTION_INGEST_WORKER_APPLY");
  }
  if (env.CRP_PRODUCTION_INGEST_WORKER_ONE_SHOT !== PRODUCTION_INGEST_WORKER_ONE_SHOT_GUARD) {
    missingGuards.push("CRP_PRODUCTION_INGEST_WORKER_ONE_SHOT");
  }
  if (env.CRP_PRODUCTION_INGEST_WORKER_MAX_JOBS !== String(options.maxJobs)) {
    missingGuards.push("CRP_PRODUCTION_INGEST_WORKER_MAX_JOBS");
  }
  if (options.maxJobsExplicit !== true) {
    missingGuards.push("--max-jobs");
  }
  if (!env.CRP_PRODUCTION_INGEST_WORKER_OPERATOR || !SAFE_TOKEN_PATTERN.test(env.CRP_PRODUCTION_INGEST_WORKER_OPERATOR)) {
    missingGuards.push("CRP_PRODUCTION_INGEST_WORKER_OPERATOR");
  }
  if (options.maxJobs > PRODUCTION_INGEST_WORKER_MAX_JOBS) {
    missingGuards.push(`--max-jobs<=${PRODUCTION_INGEST_WORKER_MAX_JOBS}`);
  }
  if (options.concurrency !== 1) missingGuards.push("--concurrency=1");
  if (options.source !== PRODUCTION_INGEST_WORKER_SOURCE) {
    missingGuards.push(`--source=${PRODUCTION_INGEST_WORKER_SOURCE}`);
  }
  if (!options.workerId) missingGuards.push("--worker-id");

  if (missingGuards.length > 0) {
    fail(
      `Production ingest worker apply refused. Missing or invalid explicit guards: ${missingGuards.join(", ")}. ` +
        `Detected production-like environment: ${productionEnvironment.reasons.join(", ")}.`,
    );
  }
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
    "  - Production-like --apply refuses unless CRP production one-shot guard environment variables are explicitly present.",
  ].join("\n"));
}

export function parseIngestWorkerArgs(args: string[]): WorkerCliOptions {
  const options: WorkerCliOptions = {
    dryRun: true,
    apply: false,
    maxJobs: DEFAULT_MAX_JOBS,
    maxJobsExplicit: false,
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
      options.maxJobsExplicit = true;
      continue;
    }
    if (arg === "--max-jobs") {
      const parsed = parsePositiveInt(nextValue(args, index, arg), arg);
      if (parsed > 100) fail("--max-jobs must be 100 or less.");
      options.maxJobs = parsed;
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
    recordHeartbeat: dependencies.recordHeartbeat ?? recordIngestProcessingWorkerHeartbeat,
    updateArtifactStatus: dependencies.updateArtifactStatus ?? updateArtifactProcessingStatus,
    loadPipelineInput: dependencies.loadPipelineInput ?? loadQueuedIngestPipelineInput,
    executePipeline: dependencies.executePipeline ?? executeIngestPipeline,
  };
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function jsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function optionalNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
    const now = Date.now();
    if (record.stage === "unified_extraction" && signals.ocrParsingStartedAtMs === null) {
      signals.ocrParsingStartedAtMs = now;
    } else if (record.stage === "unified_extraction_completed" && signals.unifiedExtractionCompletedAtMs === null) {
      signals.unifiedExtractionCompletedAtMs = now;
    } else if (record.stage === "compliance_scanning" && signals.complianceScanStartedAtMs === null) {
      signals.complianceScanStartedAtMs = now;
    } else if (record.stage === "finalizing" && signals.finalizingStartedAtMs === null) {
      signals.finalizingStartedAtMs = now;
    }
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
    pipelineDurationMs: Math.max(0, Date.now() - signals.startedAtMs),
    ocrParsingDurationMs:
      signals.ocrParsingStartedAtMs !== null && signals.unifiedExtractionCompletedAtMs !== null
        ? Math.max(0, signals.unifiedExtractionCompletedAtMs - signals.ocrParsingStartedAtMs)
        : null,
    complianceScanDurationMs:
      signals.complianceScanStartedAtMs !== null && signals.finalizingStartedAtMs !== null
        ? Math.max(0, signals.finalizingStartedAtMs - signals.complianceScanStartedAtMs)
        : null,
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

async function loadArtifactObservabilitySummary(artifactId: number): Promise<Record<string, Json>> {
  const artifact = await db
    .selectFrom("reportArtifact")
    .select(["data", "processingStatus"])
    .where("id", "=", artifactId)
    .executeTakeFirst();
  const data = jsonRecord(artifact?.data);
  const parserQuality = jsonRecord(data.parserQuality);
  const deterministicPipeline = jsonRecord(data.deterministicPipeline);
  const ocrProvenance = jsonRecord(deterministicPipeline.ocrProvenance ?? data.ocrProvenance);
  const ocrDiagnostics = jsonRecord(deterministicPipeline.ocrDiagnostics ?? data.ocrDiagnostics);
  const parserIssues = jsonArray(parserQuality.issues);
  const ocrPageCount = optionalNumber(ocrProvenance.pageCount);
  const ocrFailureCategory = typeof ocrDiagnostics.reason === "string" && ocrDiagnostics.reason.trim()
    ? "ocr_not_usable"
    : null;

  return {
    processingStatus: typeof artifact?.processingStatus === "string" ? artifact.processingStatus : "unknown",
    extractionSource: typeof data.extractionSource === "string" ? data.extractionSource : "unknown",
    ocrPageCount,
    ocrFailureCategory,
    parserRequiresManualReview: parserQuality.requiresManualReview === true,
    parserIssueCount: parserIssues.length,
    parserConfidenceScore: optionalNumber(parserQuality.confidenceScore),
    parserFailureCategory:
      artifact?.processingStatus === "failed" || data.extractionStatus === "failed"
        ? "extraction_failed"
        : null,
    rawReportBytesLogged: false,
    extractedReportTextLogged: false,
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
      await deps.recordHeartbeat({
        workerId,
        source,
        status: "idle",
        details: {
          dryRun: true,
          queuePreviewAvailable: false,
          rawReportBytesLogged: false,
          extractedReportTextLogged: false,
        },
      });
      return { status: "idle", workerId, dryRun: true, job: null };
    }
    await deps.recordHeartbeat({
      workerId,
      source,
      status: "dry_run_preview",
      details: {
        dryRun: true,
        jobId: preview.id,
        queuePreviewAvailable: true,
        rawReportBytesLogged: false,
        extractedReportTextLogged: false,
      },
    });
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
    await deps.recordHeartbeat({
      workerId,
      source,
      status: "idle",
      details: {
        dryRun: false,
        queuePreviewAvailable: false,
        rawReportBytesLogged: false,
        extractedReportTextLogged: false,
      },
    });
    return { status: "idle", workerId, dryRun: false, job: null };
  }
  await deps.recordHeartbeat({
    workerId,
    source,
    status: "processing",
    details: {
      dryRun: false,
      jobId: job.id,
      reportArtifactId: job.reportArtifactId,
      attemptCount: job.attemptCount,
      rawReportBytesLogged: false,
      extractedReportTextLogged: false,
    },
  });

  const signals: PipelineSignalSummary = {
    progressStages: [],
    completeEvents: 0,
    errorEvents: 0,
    startedAtMs: Date.now(),
    ocrParsingStartedAtMs: null,
    unifiedExtractionCompletedAtMs: null,
    complianceScanStartedAtMs: null,
    finalizingStartedAtMs: null,
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

    const observabilitySummary = await loadArtifactObservabilitySummary(job.reportArtifactId).catch(() => ({
      observabilitySummaryUnavailable: true,
      rawReportBytesLogged: false,
      extractedReportTextLogged: false,
    }) as Record<string, Json>);

    const succeeded = await deps.markSucceeded({
      job,
      workerId,
      resultSummary: resultSummary(job, signals, {
        tradelineCount: context.tradelineIds.length,
        createdTradelineCount: context.createdTradelineIds.length,
        updatedTradelineCount: context.updatedTradelineIds.length,
        ...observabilitySummary,
      }),
    });
    await deps.recordHeartbeat({
      workerId,
      source,
      status: "succeeded",
      details: {
        dryRun: false,
        jobId: succeeded.id,
        reportArtifactId: succeeded.reportArtifactId,
        rawReportBytesLogged: false,
        extractedReportTextLogged: false,
      },
    });
    return { status: "succeeded", workerId, dryRun: false, job: succeeded, signals };
  } catch (error) {
    await deps.updateArtifactStatus(job.reportArtifactId, "failed").catch(() => undefined);
    const safeError = error instanceof IngestProcessingQueueError
      ? new IngestProcessingQueueError(error.code, safeIngestWorkerErrorMessage(error), error.permanent)
      : new Error(safeIngestWorkerErrorMessage(error));
    const failed = await deps.markFailed({ job, workerId, error: safeError });
    await deps.recordHeartbeat({
      workerId,
      source,
      status: failed.status === "dead_lettered" ? "dead_lettered" : "failed",
      details: {
        dryRun: false,
        jobId: failed.id,
        reportArtifactId: failed.reportArtifactId,
        rawReportBytesLogged: false,
        extractedReportTextLogged: false,
      },
    });
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
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  validateIngestWorkerRuntimeSafety(options, env);

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
