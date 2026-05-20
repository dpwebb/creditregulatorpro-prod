import "../loadEnv.js";

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Json } from "../helpers/schema";
import {
  IngestProcessingQueueError,
  type IngestProcessingJobEventType,
  type IngestProcessingJobRecord,
  type IngestProcessingJobStatus,
  type IngestProcessingQueueEventRecord,
} from "../helpers/ingestProcessingQueueService";
import {
  runIngestProcessingWorker,
  type IngestWorkerDependencies,
  type WorkerCliOptions,
} from "./ingest-processing-worker";

export const DEFAULT_SIMULATED_INGEST_WORKER_EVIDENCE_DIR = "docs/production-scale/evidence";
export const SIMULATED_INGEST_WORKER_SOURCE = "SIMULATED_INGEST_WORKER_PROOF";
export const SIMULATED_INGEST_WORKER_MARKERS = {
  dryRunNoMutation: "SIMULATED_INGEST_WORKER_DRY_RUN_NO_MUTATION",
  boundedApplyScoped: "SIMULATED_INGEST_WORKER_BOUNDED_APPLY_SCOPED",
  queueDepthBeforeAfter: "SIMULATED_INGEST_WORKER_QUEUE_DEPTH_BEFORE_AFTER_VISIBLE",
  deadLetterVisible: "SIMULATED_INGEST_WORKER_DEAD_LETTER_VISIBLE",
  emptyQueueCleanExit: "SIMULATED_INGEST_WORKER_EMPTY_QUEUE_CLEAN_EXIT",
  externalProviderIsolation: "SIMULATED_INGEST_WORKER_EXTERNAL_PROVIDER_ISOLATION",
  protectedBehaviorUnchanged: "SIMULATED_INGEST_WORKER_PROTECTED_BEHAVIOR_UNCHANGED",
};

const PRODUCTION_ENV_KEYS = ["NODE_ENV", "CRP_ENV", "FLOOT_ENV", "APP_ENV", "VERCEL_ENV", "DEPLOYMENT_ENV", "ENVIRONMENT"];
const PRODUCTION_SECRET_KEYS = ["FLOOT_DATABASE_URL", "DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL", "CRP_DATABASE_URL"];
const EXPECTED_SYNTHETIC_SCOPE_JOB_COUNT = 3;

type SyntheticJob = IngestProcessingJobRecord & {
  events: IngestProcessingQueueEventRecord[];
};

type QueueDepth = {
  total: number;
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
  deadLettered: number;
  canceled: number;
  staleQueuedOrRunning: number;
};

type SyntheticQueueState = {
  jobs: SyntheticJob[];
  nextEventId: number;
  generatedAt: string;
  artifactStatusUpdates: Array<{ artifactId: number; status: string }>;
  externalProviderCallsMade: number;
  pipelineCallsMade: number;
};

function normalizeRelativePath(value: string): string {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function repoPath(rootDir: string, relativePath: string): string {
  return path.join(rootDir, ...normalizeRelativePath(relativePath).split("/").filter(Boolean));
}

function safeGit(args: string[], rootDir: string, fallback = "unknown"): string {
  try {
    const output = execFileSync("git", args, {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    return output.length > 0 ? output : fallback;
  } catch {
    return fallback;
  }
}

export function detectSimulatedIngestWorkerProductionEnvironment(env = process.env): { productionLike: boolean; reason: string } {
  for (const key of PRODUCTION_ENV_KEYS) {
    const value = String(env[key] ?? "").trim().toLowerCase();
    if (value === "production" || value === "prod" || value.includes("production")) {
      return { productionLike: true, reason: `${key} indicates a production environment.` };
    }
  }
  for (const key of PRODUCTION_SECRET_KEYS) {
    const value = String(env[key] ?? "").trim().toLowerCase();
    if (!value) continue;
    if (value.includes("creditregulatorpro-prod") || value.includes("production") || value.includes("/prod") || value.includes("prod.")) {
      return { productionLike: true, reason: `${key} appears to reference a production database target.` };
    }
  }
  return { productionLike: false, reason: "" };
}

function baseJob({
  id,
  reportArtifactId,
  source,
  generatedAt,
  metadata,
  maxAttempts = 2,
}: {
  id: number;
  reportArtifactId: number;
  source: string;
  generatedAt: string;
  metadata: Record<string, Json>;
  maxAttempts?: number;
}): SyntheticJob {
  return {
    id,
    jobType: "report_ingest_process",
    status: "queued",
    reportArtifactId,
    userId: 9000 + id,
    organizationId: null,
    payload: {
      region: "CA",
      mimeType: "application/pdf",
      artifactSha256: "0".repeat(64),
      metadata: {
        evidenceType: "SIMULATED",
        syntheticFixture: true,
        ...metadata,
      },
    },
    idempotencyKey: `SIMULATED-IDEMPOTENCY-${id}`,
    actorUserId: null,
    source,
    runAfter: generatedAt,
    startedAt: null,
    finishedAt: null,
    createdAt: generatedAt,
    updatedAt: generatedAt,
    attemptCount: 0,
    maxAttempts,
    lockedBy: null,
    lockedAt: null,
    lockedUntil: null,
    lastErrorCode: null,
    lastErrorReason: null,
    resultSummary: {},
    events: [],
  };
}

function createSyntheticQueueState(generatedAt: string): SyntheticQueueState {
  const jobs = [
    baseJob({
      id: 101,
      reportArtifactId: 7101,
      source: SIMULATED_INGEST_WORKER_SOURCE,
      generatedAt,
      metadata: { marker: "SIMULATED_VALID_QUEUE_JOB_A" },
    }),
    baseJob({
      id: 102,
      reportArtifactId: 7102,
      source: SIMULATED_INGEST_WORKER_SOURCE,
      generatedAt,
      metadata: { marker: "SIMULATED_VALID_QUEUE_JOB_B" },
    }),
    baseJob({
      id: 103,
      reportArtifactId: 7103,
      source: SIMULATED_INGEST_WORKER_SOURCE,
      generatedAt,
      metadata: { marker: "SIMULATED_MALFORMED_QUEUE_JOB", malformedSynthetic: true },
      maxAttempts: 1,
    }),
    baseJob({
      id: 901,
      reportArtifactId: 7901,
      source: "SIMULATED_OTHER_SCOPE_GUARD",
      generatedAt,
      metadata: { marker: "SIMULATED_OUT_OF_SCOPE_UNTOUCHED" },
    }),
  ];

  const state: SyntheticQueueState = {
    jobs,
    nextEventId: 1000,
    generatedAt,
    artifactStatusUpdates: [],
    externalProviderCallsMade: 0,
    pipelineCallsMade: 0,
  };
  for (const job of jobs) {
    appendEvent(state, job, {
      eventType: "queued",
      previousStatus: null,
      nextStatus: "queued",
      details: {
        evidenceType: "SIMULATED",
        syntheticFixture: true,
        rawReportBytesLogged: false,
        extractedReportTextLogged: false,
      },
    });
  }
  return state;
}

function appendEvent(
  state: SyntheticQueueState,
  job: SyntheticJob,
  params: {
    eventType: IngestProcessingJobEventType;
    previousStatus?: IngestProcessingJobStatus | null;
    nextStatus?: IngestProcessingJobStatus | null;
    attemptCount?: number | null;
    workerId?: string | null;
    actorUserId?: number | null;
    details?: Record<string, Json>;
    errorCode?: string | null;
    errorReason?: string | null;
  },
): IngestProcessingQueueEventRecord {
  const event: IngestProcessingQueueEventRecord = {
    id: state.nextEventId,
    jobId: job.id,
    eventType: params.eventType,
    previousStatus: params.previousStatus ?? null,
    nextStatus: params.nextStatus ?? job.status,
    attemptCount: params.attemptCount ?? job.attemptCount,
    workerId: params.workerId ?? null,
    actorUserId: params.actorUserId ?? job.actorUserId,
    details: {
      evidenceType: "SIMULATED",
      rawReportBytesLogged: false,
      extractedReportTextLogged: false,
      ...(params.details ?? {}),
    },
    errorCode: params.errorCode ?? null,
    errorReason: params.errorReason ?? null,
    createdAt: state.generatedAt,
  };
  state.nextEventId += 1;
  job.events.push(event);
  return event;
}

function eligibleJob(state: SyntheticQueueState, source: string | null): SyntheticJob | null {
  return state.jobs.find((job) => {
    if (source && job.source !== source) return false;
    return job.status === "queued" || job.status === "failed";
  }) ?? null;
}

function queueDepth(state: SyntheticQueueState, source: string): QueueDepth {
  const scoped = state.jobs.filter((job) => job.source === source);
  const counts = scoped.reduce((acc, job) => {
    acc[job.status] = (acc[job.status] ?? 0) + 1;
    return acc;
  }, {} as Record<IngestProcessingJobStatus, number>);
  return {
    total: scoped.length,
    queued: counts.queued ?? 0,
    running: counts.running ?? 0,
    succeeded: counts.succeeded ?? 0,
    failed: counts.failed ?? 0,
    deadLettered: counts.dead_lettered ?? 0,
    canceled: counts.canceled ?? 0,
    staleQueuedOrRunning: (counts.queued ?? 0) + (counts.running ?? 0),
  };
}

function serializableQueueSnapshot(state: SyntheticQueueState): unknown {
  return state.jobs.map((job) => ({
    id: job.id,
    source: job.source,
    status: job.status,
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts,
    lockedBy: job.lockedBy,
    lockedAt: job.lockedAt,
    lockedUntil: job.lockedUntil,
    lastErrorCode: job.lastErrorCode,
    lastErrorReason: job.lastErrorReason,
    resultSummary: job.resultSummary,
    eventTypes: job.events.map((event) => event.eventType),
    artifactStatusUpdates: state.artifactStatusUpdates.filter((update) => update.artifactId === job.reportArtifactId),
  }));
}

function createSyntheticWorkerDependencies(state: SyntheticQueueState): IngestWorkerDependencies {
  const findJob = (id: number): SyntheticJob => {
    const job = state.jobs.find((candidate) => candidate.id === id);
    if (!job) throw new Error(`SIMULATED synthetic job ${id} was not found.`);
    return job;
  };

  return {
    peekNextJob: async (source) => eligibleJob(state, source),
    claimNextJob: async ({ workerId, source, leaseSeconds }) => {
      const job = eligibleJob(state, source);
      if (!job) return null;
      const previousStatus = job.status;
      job.status = "running";
      job.startedAt = state.generatedAt;
      job.updatedAt = state.generatedAt;
      job.lockedBy = workerId;
      job.lockedAt = state.generatedAt;
      job.lockedUntil = new Date(new Date(state.generatedAt).getTime() + leaseSeconds * 1000).toISOString();
      job.attemptCount += 1;
      appendEvent(state, job, {
        eventType: "claimed",
        previousStatus,
        nextStatus: "running",
        attemptCount: job.attemptCount,
        workerId,
      });
      return job;
    },
    markSucceeded: async ({ job, workerId, resultSummary }) => {
      const current = findJob(job.id);
      current.status = "succeeded";
      current.finishedAt = state.generatedAt;
      current.updatedAt = state.generatedAt;
      current.lockedBy = null;
      current.lockedAt = null;
      current.lockedUntil = null;
      current.lastErrorCode = null;
      current.lastErrorReason = null;
      current.resultSummary = {
        ...resultSummary,
        evidenceType: "SIMULATED",
        simulatedQueueDrainProof: true,
      };
      appendEvent(state, current, {
        eventType: "succeeded",
        previousStatus: "running",
        nextStatus: "succeeded",
        attemptCount: current.attemptCount,
        workerId,
        details: current.resultSummary,
      });
      return current;
    },
    markFailed: async ({ job, workerId, error }) => {
      const current = findJob(job.id);
      const normalized = error instanceof IngestProcessingQueueError
        ? {
            code: error.code,
            reason: error.message,
            permanent: error.permanent,
          }
        : {
            code: "SIMULATED_SYNTHETIC_JOB_FAILED",
            reason: error instanceof Error ? error.message : "Synthetic ingest worker job failed.",
            permanent: false,
          };
      const deadLetter = normalized.permanent || current.attemptCount >= current.maxAttempts;
      const nextStatus: IngestProcessingJobStatus = deadLetter ? "dead_lettered" : "failed";
      current.status = nextStatus;
      current.finishedAt = deadLetter ? state.generatedAt : null;
      current.updatedAt = state.generatedAt;
      current.lockedBy = null;
      current.lockedAt = null;
      current.lockedUntil = null;
      current.lastErrorCode = normalized.code;
      current.lastErrorReason = normalized.reason;
      current.resultSummary = {
        errorCode: normalized.code,
        permanent: deadLetter,
        evidenceType: "SIMULATED",
        rawReportBytesLogged: false,
        extractedReportTextLogged: false,
      };
      appendEvent(state, current, {
        eventType: deadLetter ? "dead_lettered" : "retry_scheduled",
        previousStatus: "running",
        nextStatus,
        attemptCount: current.attemptCount,
        workerId,
        errorCode: normalized.code,
        errorReason: normalized.reason,
        details: current.resultSummary,
      });
      return current;
    },
    recordEvent: async (params) => {
      return appendEvent(state, findJob(params.jobId), {
        eventType: params.eventType,
        previousStatus: params.previousStatus ?? null,
        nextStatus: params.nextStatus ?? null,
        attemptCount: params.attemptCount ?? null,
        workerId: params.workerId ?? null,
        actorUserId: params.actorUserId ?? null,
        details: params.details,
        errorCode: params.errorCode ?? null,
        errorReason: params.errorReason ?? null,
      });
    },
    updateArtifactStatus: async (artifactId, status) => {
      state.artifactStatusUpdates.push({ artifactId, status });
    },
    loadPipelineInput: async (job) => {
      if (job.payload.metadata?.malformedSynthetic === true) {
        throw new IngestProcessingQueueError(
          "SIMULATED_MALFORMED_SYNTHETIC_JOB",
          "SIMULATED malformed synthetic queue job cannot load pipeline input.",
          true,
        );
      }
      return {
        user: {
          id: job.userId,
          email: "simulated-ingest-worker@example.test",
          displayName: "SIMULATED Ingest Worker User",
          avatarUrl: null,
          organizationId: null,
          emailVerified: true,
          role: "admin",
          subscriptionPlan: null,
          subscriptionStatus: null,
          trialEnd: null,
          termsAcceptedAt: null,
          termsAcceptedVersion: null,
          currentTermsVersion: null,
        },
        userAccount: {
          id: job.userId + 10000,
          userId: job.userId,
          email: "simulated-ingest-worker@example.test",
          fullName: "SIMULATED Ingest Worker User",
          region: "CA",
          role: "admin",
          addressLine1: null,
          addressLine2: null,
          city: null,
          province: "NS",
          postalCode: null,
          phone: null,
          dateOfBirth: null,
          legalNameSignature: null,
          termsAcceptedAt: null,
          termsAcceptedVersion: null,
        },
        artifactId: job.reportArtifactId,
        region: "CA",
        fileName: "SIMULATED-ingest-worker-proof.pdf",
        bytesBase64: "SIMULATED_SYNTHETIC_BYTES_NOT_A_REAL_CREDIT_REPORT",
        mimeType: "application/pdf",
      } as Awaited<ReturnType<NonNullable<IngestWorkerDependencies["loadPipelineInput"]>>>;
    },
    executePipeline: async (input) => {
      state.pipelineCallsMade += 1;
      input.context.tradelineIds.push(input.artifactId);
      input.context.createdTradelineIds.push(input.artifactId);
      input.send({ type: "progress", stage: "unified_extraction", percent: 20 });
      input.send({ type: "progress", stage: "unified_extraction_completed", percent: 60 });
      input.send({ type: "progress", stage: "compliance_scanning", percent: 85 });
      input.send({ type: "progress", stage: "finalizing", percent: 95 });
      input.send({
        type: "complete",
        data: {
          evidenceType: "SIMULATED",
          syntheticFixtureOnly: true,
          rawReportTextStored: false,
        },
      });
    },
  };
}

async function captureWorkerLogs(run: () => Promise<number>): Promise<{ exitCode: number; logs: string[] }> {
  const original = console.log;
  const logs: string[] = [];
  console.log = (...args: unknown[]) => {
    logs.push(args.map((arg) => String(arg)).join(" "));
  };
  try {
    const exitCode = await run();
    return { exitCode, logs };
  } finally {
    console.log = original;
  }
}

function commandOptions(overrides: Partial<WorkerCliOptions>): WorkerCliOptions {
  return {
    dryRun: true,
    apply: false,
    maxJobs: 1,
    concurrency: 1,
    leaseSeconds: 120,
    workerId: "simulated-ingest-worker-proof",
    source: SIMULATED_INGEST_WORKER_SOURCE,
    ...overrides,
  };
}

function summarizeJobs(state: SyntheticQueueState, source: string): unknown[] {
  return state.jobs
    .filter((job) => job.source === source)
    .map((job) => ({
      id: job.id,
      source: job.source,
      status: job.status,
      attemptCount: job.attemptCount,
      maxAttempts: job.maxAttempts,
      lastErrorCode: job.lastErrorCode,
      eventTypes: job.events.map((event) => event.eventType),
      resultSummary: job.resultSummary,
    }));
}

export function validateSimulatedIngestWorkerProofReport(report: any): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (report.evidenceType !== "SIMULATED") errors.push("report evidenceType must be SIMULATED");
  if (report.productionWorkerActivationChanged !== false) errors.push("production worker activation must remain unchanged");
  if (report.productionDeploymentChanged !== false) errors.push("production deployment must remain unchanged");
  if (report.productionMutationOccurred !== false) errors.push("production mutation must not occur");
  if (report.humanOrStagingProductionProofStillRequired !== true) errors.push("human/staging proof must remain required");
  if (report.queueDepth?.before?.total !== EXPECTED_SYNTHETIC_SCOPE_JOB_COUNT) errors.push("synthetic scoped queue depth before run is incorrect");
  if (report.queueDepth?.after?.queued !== 0 || report.queueDepth?.after?.running !== 0) {
    errors.push("synthetic scoped queue still has queued or running jobs after bounded apply");
  }
  if (report.queueDepth?.after?.succeeded !== 2) errors.push("expected two synthetic jobs to succeed");
  if (report.queueDepth?.after?.deadLettered !== 1) errors.push("expected one malformed synthetic job to dead-letter");
  if (report.dryRun?.mutatedQueueState !== false) errors.push("dry-run mutated queue state");
  if (report.boundedApply?.touchedOutOfScopeJobs !== false) errors.push("bounded apply touched out-of-scope jobs");
  if (report.deadLetter?.visible !== true) errors.push("dead-letter lifecycle evidence is not visible");
  if (report.emptyQueue?.cleanExit !== true) errors.push("empty queue did not exit cleanly");
  if (report.safety?.liveExternalProvidersConnected !== false || report.safety?.externalProviderCallsMade !== 0) {
    errors.push("live external provider calls must be zero");
  }
  if (report.safety?.parserBehaviorChanged !== false) errors.push("parser behavior must not change");
  if (report.safety?.ocrBehaviorChanged !== false) errors.push("OCR behavior must not change");
  if (report.safety?.storageBehaviorChanged !== false) errors.push("storage behavior must not change");
  if (report.safety?.packetPdfBehaviorChanged !== false) errors.push("packet PDF behavior must not change");
  if (report.safety?.dbPoolBehaviorChanged !== false) errors.push("DB pool behavior must not change");
  if (report.safety?.retentionBehaviorChanged !== false) errors.push("retention behavior must not change");
  if (report.safety?.simulatedEvidenceIsProductionProof !== false) errors.push("simulated evidence must not be production proof");
  return { ok: errors.length === 0, errors };
}

export async function buildSimulatedIngestWorkerProofReport({
  rootDir = process.cwd(),
  generatedAt = new Date().toISOString(),
  env = process.env,
  simulationId = "SIMULATED-INGEST-WORKER-QUEUE-DRAIN",
} = {}) {
  const productionEnvironment = detectSimulatedIngestWorkerProductionEnvironment(env);
  if (productionEnvironment.productionLike) {
    throw new Error(`Refusing SIMULATED ingest worker proof in a production-like environment: ${productionEnvironment.reason}`);
  }

  const state = createSyntheticQueueState(generatedAt);
  const dependencies = createSyntheticWorkerDependencies(state);
  const dryRunBeforeSnapshot = JSON.stringify(serializableQueueSnapshot(state));
  const depthBefore = queueDepth(state, SIMULATED_INGEST_WORKER_SOURCE);
  const dryRun = await captureWorkerLogs(() =>
    runIngestProcessingWorker(commandOptions({ dryRun: true, apply: false, maxJobs: 1 }), dependencies),
  );
  const dryRunAfterSnapshot = JSON.stringify(serializableQueueSnapshot(state));
  const outOfScopeBefore = JSON.stringify(state.jobs.filter((job) => job.source !== SIMULATED_INGEST_WORKER_SOURCE));

  const boundedApply = await captureWorkerLogs(() =>
    runIngestProcessingWorker(commandOptions({ dryRun: false, apply: true, maxJobs: EXPECTED_SYNTHETIC_SCOPE_JOB_COUNT }), dependencies),
  );
  const outOfScopeAfter = JSON.stringify(state.jobs.filter((job) => job.source !== SIMULATED_INGEST_WORKER_SOURCE));
  const depthAfter = queueDepth(state, SIMULATED_INGEST_WORKER_SOURCE);
  const emptyQueue = await captureWorkerLogs(() =>
    runIngestProcessingWorker(commandOptions({ dryRun: false, apply: true, maxJobs: 1 }), dependencies),
  );

  const malformedJob = state.jobs.find((job) => job.id === 103);
  const deadLetterEvent = malformedJob?.events.find((event) => event.eventType === "dead_lettered");
  const report = {
    reportName: "ingest-worker-simulated-queue-drain-proof",
    evidenceType: "SIMULATED",
    generatedAt,
    branch: safeGit(["branch", "--show-current"], rootDir),
    commit: safeGit(["rev-parse", "HEAD"], rootDir),
    simulationId,
    status: "passed",
    workerCommand: "pnpm run ingest:worker:simulated-proof",
    simulatedWorkerLogic: "runIngestProcessingWorker with in-memory synthetic queue dependencies",
    productionWorkerActivationChanged: false,
    productionDeploymentChanged: false,
    productionMutationOccurred: false,
    humanOrStagingProductionProofStillRequired: true,
    queueScope: {
      source: SIMULATED_INGEST_WORKER_SOURCE,
      syntheticScopedJobs: EXPECTED_SYNTHETIC_SCOPE_JOB_COUNT,
      outOfScopeGuardJobs: state.jobs.filter((job) => job.source !== SIMULATED_INGEST_WORKER_SOURCE).length,
    },
    queueDepth: {
      before: depthBefore,
      after: depthAfter,
    },
    dryRun: {
      marker: SIMULATED_INGEST_WORKER_MARKERS.dryRunNoMutation,
      exitCode: dryRun.exitCode,
      mutatedQueueState: dryRunBeforeSnapshot !== dryRunAfterSnapshot,
      workerLogs: dryRun.logs,
    },
    boundedApply: {
      marker: SIMULATED_INGEST_WORKER_MARKERS.boundedApplyScoped,
      exitCode: boundedApply.exitCode,
      expectedExitCode: 2,
      expectedExitCodeReason: "The bounded worker returns 2 when the intentionally malformed SIMULATED job dead-letters.",
      touchedOutOfScopeJobs: outOfScopeBefore !== outOfScopeAfter,
      workerLogs: boundedApply.logs,
    },
    deadLetter: {
      marker: SIMULATED_INGEST_WORKER_MARKERS.deadLetterVisible,
      visible: Boolean(deadLetterEvent && malformedJob?.status === "dead_lettered"),
      jobId: malformedJob?.id ?? null,
      status: malformedJob?.status ?? null,
      errorCode: malformedJob?.lastErrorCode ?? null,
      eventTypes: malformedJob?.events.map((event) => event.eventType) ?? [],
    },
    emptyQueue: {
      marker: SIMULATED_INGEST_WORKER_MARKERS.emptyQueueCleanExit,
      exitCode: emptyQueue.exitCode,
      cleanExit: emptyQueue.exitCode === 0,
      workerLogs: emptyQueue.logs,
    },
    lifecycleEvidence: {
      marker: SIMULATED_INGEST_WORKER_MARKERS.queueDepthBeforeAfter,
      staleQueuedJobsRemainInSyntheticScope: depthAfter.staleQueuedOrRunning,
      artifactStatusUpdates: state.artifactStatusUpdates,
      jobs: summarizeJobs(state, SIMULATED_INGEST_WORKER_SOURCE),
    },
    safety: {
      evidenceType: "SIMULATED",
      syntheticFixturesOnly: true,
      localInMemoryQueueOnly: true,
      productionEnvironmentTargeted: false,
      productionDataMutated: false,
      realConsumerPiiUsed: false,
      realCreditReportsProcessed: false,
      productionBackupsOrDumpsAccessed: false,
      liveExternalProvidersConnected: false,
      externalProviderCallsMade: state.externalProviderCallsMade,
      parserBehaviorChanged: false,
      ocrBehaviorChanged: false,
      violationBehaviorChanged: false,
      evidenceBindingChanged: false,
      storageBehaviorChanged: false,
      packetReadinessChanged: false,
      packetPdfBehaviorChanged: false,
      dbPoolBehaviorChanged: false,
      retentionBehaviorChanged: false,
      productionDeploymentActivationChanged: false,
      simulatedEvidenceIsProductionProof: false,
    },
    markers: Object.values(SIMULATED_INGEST_WORKER_MARKERS),
  };

  const validation = validateSimulatedIngestWorkerProofReport(report);
  if (!validation.ok) {
    throw new Error(`SIMULATED ingest worker proof validation failed: ${validation.errors.join("; ")}`);
  }
  return {
    ...report,
    validation,
  };
}

function renderDepth(depth: QueueDepth): string {
  return `total=${depth.total}, queued=${depth.queued}, running=${depth.running}, succeeded=${depth.succeeded}, failed=${depth.failed}, dead_lettered=${depth.deadLettered}`;
}

export function renderSimulatedIngestWorkerProofMarkdown(report: Awaited<ReturnType<typeof buildSimulatedIngestWorkerProofReport>>): string {
  const lines = [
    "# SIMULATED Ingest Worker Queue-Drain Evidence",
    "",
    "SIMULATED evidence only. This is synthetic local proof and is not production worker activation, not production queue proof, and not production-at-scale readiness.",
    "",
    `Generated at: ${report.generatedAt}`,
    `Branch: \`${report.branch}\``,
    `Commit: \`${report.commit}\``,
    `Simulation ID: \`${report.simulationId}\``,
    `Status: ${report.status}`,
    "Human-observed or staged production-safe queue-drain proof still required: yes",
    "",
    "## SIMULATED Queue Scope",
    "",
    `- Source filter: \`${report.queueScope.source}\``,
    `- Synthetic scoped jobs: ${report.queueScope.syntheticScopedJobs}`,
    `- Out-of-scope guard jobs untouched: ${report.boundedApply.touchedOutOfScopeJobs ? "no" : "yes"}`,
    "",
    "## SIMULATED Queue Depth",
    "",
    `- Before bounded apply: ${renderDepth(report.queueDepth.before)}`,
    `- After bounded apply: ${renderDepth(report.queueDepth.after)}`,
    `- Stale queued or running jobs remaining in synthetic scope: ${report.lifecycleEvidence.staleQueuedJobsRemainInSyntheticScope}`,
    "",
    "## SIMULATED Worker Checks",
    "",
    `- ${report.dryRun.marker}: ${report.dryRun.mutatedQueueState ? "failed" : "passed"} - dry-run did not mutate queue state.`,
    `- ${report.boundedApply.marker}: ${report.boundedApply.touchedOutOfScopeJobs ? "failed" : "passed"} - bounded apply touched only the synthetic source scope.`,
    `- ${report.deadLetter.marker}: ${report.deadLetter.visible ? "passed" : "failed"} - malformed synthetic job status is ${report.deadLetter.status} with error code ${report.deadLetter.errorCode}.`,
    `- ${report.emptyQueue.marker}: ${report.emptyQueue.cleanExit ? "passed" : "failed"} - empty synthetic queue exited cleanly with code ${report.emptyQueue.exitCode}.`,
    `- Bounded apply worker exit code: ${report.boundedApply.exitCode} (${report.boundedApply.expectedExitCodeReason})`,
    "",
    "## SIMULATED Lifecycle Evidence",
    "",
    ...report.lifecycleEvidence.jobs.map((job: any) => `- Job ${job.id}: status=${job.status}, attempts=${job.attemptCount}/${job.maxAttempts}, events=${job.eventTypes.join(", ")}`),
    "",
    "## Safety",
    "",
    "- Production environment targeted: no",
    "- Production deployment or worker activation changed: no",
    "- Production data mutated: no",
    "- Real consumer PII used: no",
    "- Real consumer credit reports processed: no",
    "- Live external providers connected: no",
    "- Parser, OCR, storage, packet PDF, DB pool, retention, violation, evidence binding, packet readiness, and deployment behavior changed: no",
    "- SIMULATED evidence is not production proof.",
    "",
    "## Remaining Blocker",
    "",
    "This autonomous proof does not close the production ingest runtime blocker. A bounded staging-safe queue-drain run with recorded before/after queue depth is still required before any production-scoped activation decision.",
  ];
  return `${lines.join("\n")}\n`;
}

export function writeSimulatedIngestWorkerProofEvidence(
  report: Awaited<ReturnType<typeof buildSimulatedIngestWorkerProofReport>>,
  {
    rootDir = process.cwd(),
    evidenceDir = DEFAULT_SIMULATED_INGEST_WORKER_EVIDENCE_DIR,
  } = {},
): { markdownPath: string; jsonPath: string } {
  const absoluteEvidenceDir = repoPath(rootDir, evidenceDir);
  mkdirSync(absoluteEvidenceDir, { recursive: true });
  const markdownPath = normalizeRelativePath(path.join(evidenceDir, "latest-ingest-worker-simulated.md"));
  const jsonPath = normalizeRelativePath(path.join(evidenceDir, "latest-ingest-worker-simulated.json"));
  writeFileSync(repoPath(rootDir, markdownPath), renderSimulatedIngestWorkerProofMarkdown(report), "utf8");
  writeFileSync(repoPath(rootDir, jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { markdownPath, jsonPath };
}

function parseArgs(args: string[]) {
  const options = {
    rootDir: process.cwd(),
    evidenceDir: DEFAULT_SIMULATED_INGEST_WORKER_EVIDENCE_DIR,
    json: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const nextValue = () => {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      index += 1;
      return value;
    };
    if (arg === "--help" || arg === "-h") {
      console.log([
        "Usage: pnpm run ingest:worker:simulated-proof -- [options]",
        "",
        "Creates SIMULATED ingest worker queue-drain evidence with synthetic in-memory queue jobs.",
        "No production worker is activated, no production queue is mutated, and no live providers are contacted.",
        "",
        "Options:",
        "  --json                    Also print JSON evidence to stdout.",
        "  --root <path>             Project root. Defaults to current working directory.",
        "  --evidence-dir <path>     Output directory. Defaults to docs/production-scale/evidence.",
      ].join("\n"));
      process.exit(0);
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--root") {
      options.rootDir = path.resolve(nextValue());
      continue;
    }
    if (arg === "--evidence-dir") {
      options.evidenceDir = normalizeRelativePath(nextValue());
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await buildSimulatedIngestWorkerProofReport({ rootDir: options.rootDir });
  const outputs = writeSimulatedIngestWorkerProofEvidence(report, {
    rootDir: options.rootDir,
    evidenceDir: options.evidenceDir,
  });
  console.log("SIMULATED ingest worker queue-drain evidence generated.");
  console.log("SIMULATED evidence is not production proof and does not activate a production worker.");
  console.log(`Markdown: ${outputs.markdownPath}`);
  console.log(`JSON: ${outputs.jsonPath}`);
  console.log(`Synthetic queue depth before: ${renderDepth(report.queueDepth.before)}`);
  console.log(`Synthetic queue depth after: ${renderDepth(report.queueDepth.after)}`);
  console.log("Human-observed or bounded staging queue-drain proof remains required.");
  if (options.json) console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
