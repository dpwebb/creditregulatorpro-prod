import "../loadEnv.js";

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ProductionObservabilityMetrics, ThresholdStatus } from "../helpers/productionObservabilityMetrics";

export type DashboardStatus = "PASS" | "FAIL" | "SKIP" | "SIMULATED" | "MACHINE_REQUIRED" | "MANUAL" | "OPEN" | "INFO";

export type DashboardCheck = {
  name: string;
  status: DashboardStatus;
  command?: string;
  notes: string;
  kind: "repository" | "local-test" | "endpoint-test" | "smoke" | "manual" | "gap" | "info";
  runByDefault?: boolean;
  requiresCredentials?: boolean;
};

export type DashboardCategory = {
  name: string;
  checks: DashboardCheck[];
};

type GitRunner = (args: string[]) => string;
type FileExists = (path: string) => boolean;
type CommandRunner = (command: string) => number;

type BuildDashboardOptions = {
  cwd?: string;
  runGit?: GitRunner;
  fileExists?: FileExists;
  ingestQueueMetrics?: IngestQueueDashboardMetrics | null;
  packetPdfMetrics?: PacketPdfDashboardMetrics | null;
  productionObservabilityMetrics?: ProductionObservabilityMetrics | null;
};

export type IngestQueueDashboardMetrics = {
  generatedAt: string;
  totalJobs: number;
  queuedJobs: number;
  runningJobs: number;
  failedJobs: number;
  deadLetteredJobs: number;
  canceledJobs: number;
  staleRunningJobs: number;
  retryBacklogJobs: number;
  oldestQueuedAgeSeconds: number | null;
  cleanupAttemptedEvents: number;
  cleanupFailedEvents: number;
  cleanupFailedJobs: number;
  operatorRemediationEvents: number;
  deadLetterReviewedJobs: number;
  staleRunningReviewedJobs: number;
  lastRemediationStatus: string | null;
  lastRemediationAt: string | null;
};

export type PacketPdfDashboardMetrics = {
  generatedAt: string;
  renderAttemptEvents: number;
  renderSucceededEvents: number;
  renderFailedEvents: number;
  cacheHitEvents: number;
  latestFailureAt: string | null;
};

export const DASHBOARD_SAFETY_BOUNDARIES = {
  modifiesFiles: false,
  callsProductionWithCredentials: false,
  touchesProductionDb: false,
  createsData: false,
  promotesProduction: false,
  activatesRuntimeBridgeMappings: false,
  generatesPackets: false,
  usesRealConsumerData: false,
  runsAuthenticatedSmokeByDefault: false,
};

export const DASHBOARD_RELEASE_EVIDENCE_STATUS_MEANINGS: Record<DashboardStatus, string> = {
  PASS: "check passed",
  FAIL: "check failed or required release state is unsafe",
  SKIP: "available local check was not run in this dashboard invocation",
  SIMULATED: "synthetic or dry-run proof exists, but it is not production proof",
  MACHINE_REQUIRED: "non-interactive machine-attested proof is required outside this dashboard",
  MANUAL: "gated smoke or operator step requiring explicit context",
  OPEN: "known scale-readiness gap",
  INFO: "release context or non-runtime safety note",
};

export const SAFE_RUN_CHECK_COMMANDS = [
  "pnpm exec vitest run tests/unit/public-static-dev-assets.spec.ts",
  "pnpm exec vitest run tests/api/auth-session-lifecycle-endpoint.spec.ts",
  "pnpm exec vitest run tests/api/admin-audit-log-endpoint.spec.ts",
  "pnpm exec vitest run tests/api/packet-lifecycle-endpoint.spec.ts",
  "pnpm exec vitest run tests/api/packet-delivery-status-endpoint.spec.ts",
  "pnpm exec vitest run tests/unit/packet-pdf-cache.spec.ts",
  "pnpm exec vitest run tests/unit/outcome-comparison.spec.ts",
  "pnpm exec vitest run tests/api/outcome-tracking-endpoint.spec.ts",
  "pnpm exec vitest run tests/api/outcome-admin-review-endpoint.spec.ts",
  "pnpm exec vitest run tests/unit/outcome-admin-review-ui.spec.tsx",
  "pnpm exec vitest run tests/api/response-document-endpoint.spec.ts",
  "pnpm exec vitest run tests/api/response-document-admin-review-endpoint.spec.ts",
  "pnpm exec vitest run tests/api/response-processing-queue.spec.ts",
  "pnpm exec vitest run tests/api/response-processing-queue-remediation-endpoint.spec.ts",
  "pnpm exec vitest run tests/api/ingest-processing-lifecycle-remediation-endpoint.spec.ts",
  "pnpm exec vitest run tests/api/response-worker-orchestration.spec.ts",
  "pnpm exec vitest run tests/api/response-processing-lifecycle.spec.ts",
  "pnpm exec vitest run tests/unit/response-classification-engine.spec.ts",
  "pnpm exec vitest run tests/unit/response-processing-lifecycle-script.spec.ts",
  "pnpm exec vitest run tests/unit/response-processing-worker-orchestrator-script.spec.ts",
  "pnpm exec vitest run tests/unit/response-document-ui.spec.tsx",
  "pnpm exec vitest run tests/api/violation-search-status-endpoint.spec.ts",
  "pnpm exec vitest run tests/api/report-ingest-lifecycle-endpoint.spec.ts",
  "pnpm exec vitest run tests/unit/ingest-cleanup-lifecycle.spec.ts",
  "pnpm exec vitest run tests/api/evidence-privacy-endpoint.spec.ts",
  "pnpm exec vitest run tests/unit/evidence-location-index.spec.ts",
  "pnpm exec vitest run tests/unit/legal-reference-language.spec.ts",
  "pnpm run test:golden-path",
  "pnpm run test:contracts",
  "pnpm run test:api",
  "pnpm run typecheck",
  "pnpm run production-worker:readiness-evidence",
];

export const GATED_SMOKE_CHECKS = [
  {
    name: "Reconciliation Candidates UI smoke",
    command: "pnpm run smoke:reconciliation-candidates-ui",
    notes: "Manual/gated staging smoke. Requires CRP_RECONCILIATION_CANDIDATE_UI_SMOKE=true and safe admin context.",
  },
  {
    name: "Runtime Bridge Mapping smoke",
    command: "pnpm run smoke:runtime-bridge-mapping",
    notes: "Manual/gated staging smoke. Requires CRP_RUNTIME_BRIDGE_MAPPING_SMOKE=true and safe admin context.",
  },
  {
    name: "Runtime Bridge Mapping UI smoke",
    command: "pnpm run smoke:runtime-bridge-mapping-ui",
    notes: "Manual/gated staging smoke. Requires CRP_RUNTIME_BRIDGE_MAPPING_UI_SMOKE=true and safe admin context.",
  },
  {
    name: "Advisory Bridge Report smoke",
    command: "pnpm run smoke:advisory-bridge-report",
    notes: "Manual/gated staging smoke. Requires CRP_ADVISORY_BRIDGE_REPORT_SMOKE=true and safe admin context.",
  },
  {
    name: "Authenticated Workflow smoke",
    command: "pnpm run smoke:auth-workflow",
    notes: "Manual/gated synthetic-user staging smoke. Requires CRP_AUTH_WORKFLOW_SMOKE=true and cleanup enabled.",
  },
  {
    name: "Outcome Tracking smoke",
    command: "pnpm run smoke:outcome-tracking",
    notes:
      "Manual/gated persisted outcome smoke. Requires CRP_OUTCOME_TRACKING_SMOKE=true, safe auth context, and synthetic fixture IDs from smoke:outcome-fixture-setup. Authenticated staging response-only smoke has passed; non-owner check remains skipped unless a safe non-owner context is configured.",
  },
  {
    name: "Outcome Admin Review smoke",
    command: "pnpm run smoke:outcome-admin-review",
    notes:
      "Manual/gated admin-review smoke. Requires CRP_OUTCOME_ADMIN_REVIEW_SMOKE=true, safe staging admin context, and a verified synthetic outcome run or fixture IDs. Authenticated staging smoke has passed for a synthetic existing run; response-document capture backend, append-only deterministic response processing, append-only response admin-review event logging, admin response UI, manual/admin response capture UI, inbox-ready intake abstraction, response-document admin-review backend, and authenticated response admin-review UI smoke now exist, while live mailbox integration remains future work.",
  },
  {
    name: "Outcome Admin Review UI smoke",
    command: "pnpm run smoke:outcome-admin-review-ui",
    notes:
      "Manual/gated admin-only Outcome Reviews UI smoke. Requires CRP_OUTCOME_ADMIN_REVIEW_UI_SMOKE=true, safe staging admin context, and a verified synthetic outcome run. Authenticated staging smoke has passed for route/list/detail, safety notices, metadata-only review action, deterministic preservation, unsupported override-control absence, and privacy/no-overexposure.",
  },
  {
    name: "Response Document smoke",
    command: "pnpm run smoke:response-document",
    notes:
      "Manual/gated response-document capture smoke. Requires CRP_RESPONSE_DOCUMENT_SMOKE=true, safe staging user/admin context, and verified synthetic outcome or packet data. Authenticated staging smoke has passed in both admin and user-owned contexts for capture/list/get, append-only deterministic response processing metadata, outcome linkage, later-report-comparison requirement, and privacy/no-overexposure.",
  },
  {
    name: "Response Document UI smoke",
    command: "pnpm run smoke:response-document-ui",
    notes:
      "Manual/gated admin-only Response Documents UI smoke. Requires CRP_RESPONSE_DOCUMENT_UI_SMOKE=true, safe staging admin context, and verified synthetic response data. Authenticated staging smoke has passed for route/list/detail visibility, deterministic processing source visibility, manual-review states, metrics, evidence/provenance notices, and the non-mutating manual intake surface; the smoke does not submit capture data.",
  },
  {
    name: "Response Document Admin Review smoke",
    command: "pnpm run smoke:response-document-admin-review",
    notes:
      "Manual/gated response-document admin-review smoke. Requires CRP_RESPONSE_DOCUMENT_ADMIN_REVIEW_SMOKE=true, safe staging admin context, and verified synthetic response data. Authenticated staging smoke has passed for admin-only metadata review, required-note validation, unsupported corrected/removed/unchanged and legal/override rejection, source preservation, runtime-safety, and privacy/no-overexposure.",
  },
  {
    name: "Response Document Admin Review UI smoke",
    command: "pnpm run smoke:response-document-admin-review-ui",
    notes:
      "Manual/gated response-document admin-review UI smoke. Requires CRP_RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_SMOKE=true, safe staging admin context via session cookie, credentials, or storage state, and verified synthetic response data. Authenticated staging smoke has passed through the autonomous post-deploy response auth suite; it exercises one neutral Add Review Note action through the admin UI and keeps response documents evidence/metadata only.",
  },
];

export const KNOWN_SCALE_GAPS = [
  "Persisted outcome tracking backend has passed authenticated staging smoke for a synthetic response-only path, authenticated outcome admin-review smoke has passed for a synthetic metadata-only review path, authenticated admin-only Outcome Reviews UI smoke has passed for a metadata-only UI review path, response-document capture backend coverage plus authenticated admin/user-owned staging smoke now exist for immutable response records with append-only deterministic processing and append-only response admin-review event logging, response replay/backfill dry-run/apply tooling now exists with append-only apply events and no raw response text storage, durable response-processing queue/backpressure/dead-letter tooling now exists with bounded operator worker dry-run support, explicit operator remediation events, dead-letter replacement retry, stale-running review without auto-reclaim, deterministic synthetic queue/load coverage, bounded scheduled worker orchestration with overlap skipping, internal operator alert surfacing, append-only lifecycle retention marking, deterministic operational drift detection, and bounded synthetic soak coverage, authenticated admin-only Response Documents UI smoke covers response list/detail processing visibility plus the non-mutating manual intake surface, response-document admin-review backend coverage plus authenticated admin-review smoke now exist for metadata-only review actions, authenticated response admin-review UI smoke has passed for one metadata-only review action, and the staging deploy workflow now runs scope-gated autonomous seeded response auth smokes after deploy and health checks: runtime/app/workflow/Docker/backend/UI/script changes run the full suite, docs/readiness/operator-dashboard-only changes skip it by design, and unknown changed-file scope runs it fail-closed; live mailbox integration, live scheduled daemon operation, physical purge/archival, historical production backfill strategy for records without stored response summaries, non-owner smoke, repeated production-scale smoke/load coverage, and external alert delivery remain future work.",
  "Broader production-scale workflow coverage remains ongoing.",
  "Admin correction candidate classification remains future work.",
  "Formal rule/version approval workflow remains future work.",
  "Backup/restore verification remains future work.",
  "External alert delivery remains future work; internal dashboard alert surfacing and deterministic drift visibility now exist.",
  "Broader anonymized real-world fixtures are still needed.",
  "No admin override exists and it should remain absent.",
  "DB registry remains non-runtime governance metadata.",
  "Static runtime mappings remain active runtime truth.",
];

function defaultRunGit(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function readGitValue(runGit: GitRunner, args: string[], fallback = "unknown"): string {
  try {
    const value = runGit(args).trim();
    return value.length > 0 ? value : fallback;
  } catch {
    return fallback;
  }
}

function repoFileExists(cwd: string, fileExists: FileExists, path: string): boolean {
  return fileExists(`${cwd}/${path}`) || fileExists(path);
}

function normalizeCategoryName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function check(
  name: string,
  status: DashboardStatus,
  notes: string,
  details: Partial<DashboardCheck> = {},
): DashboardCheck {
  return {
    name,
    status,
    notes,
    kind: details.kind ?? "local-test",
    command: details.command,
    runByDefault: details.runByDefault ?? false,
    requiresCredentials: details.requiresCredentials ?? false,
  };
}

function ingestQueueHealthCheck(metrics: IngestQueueDashboardMetrics | null | undefined): DashboardCheck {
  if (!metrics) {
    return check(
      "Ingest queue health",
      "INFO",
      "Runtime ingest queue metrics were not available in this invocation. Run in an environment with FLOOT_DATABASE_URL to surface dead-letter, stale-running, retry backlog, cleanup-failure, and remediation counts.",
      { kind: "info" },
    );
  }

  const openCount = metrics.deadLetteredJobs + metrics.staleRunningJobs + metrics.cleanupFailedEvents;
  const oldestQueued = metrics.oldestQueuedAgeSeconds === null ? "n/a" : `${metrics.oldestQueuedAgeSeconds}s`;
  return check(
    "Ingest queue health",
    openCount > 0 ? "OPEN" : "PASS",
    [
      `Total jobs: ${metrics.totalJobs}`,
      `queued: ${metrics.queuedJobs}`,
      `running: ${metrics.runningJobs}`,
      `failed: ${metrics.failedJobs}`,
      `dead-letter jobs: ${metrics.deadLetteredJobs}`,
      `canceled: ${metrics.canceledJobs}`,
      `stale running jobs: ${metrics.staleRunningJobs}`,
      `retry backlog: ${metrics.retryBacklogJobs}`,
      `oldest queued age: ${oldestQueued}`,
      `cleanup attempts: ${metrics.cleanupAttemptedEvents}`,
      `failed cleanup events: ${metrics.cleanupFailedEvents}`,
      `cleanup-failed jobs: ${metrics.cleanupFailedJobs}`,
      `operator remediation events: ${metrics.operatorRemediationEvents}`,
      `dead-letter reviewed jobs: ${metrics.deadLetterReviewedJobs}`,
      `stale-running reviewed jobs: ${metrics.staleRunningReviewedJobs}`,
      `last remediation: ${metrics.lastRemediationStatus ?? "none"}${metrics.lastRemediationAt ? ` at ${metrics.lastRemediationAt}` : ""}`,
    ].join("; "),
    { kind: "smoke" },
  );
}

function packetPdfHealthCheck(metrics: PacketPdfDashboardMetrics | null | undefined): DashboardCheck {
  if (!metrics) {
    return check(
      "Packet PDF render health",
      "INFO",
      "Runtime packet PDF render metrics were not available in this invocation. Run in an environment with FLOOT_DATABASE_URL to surface render attempts, successes, failures, and cache hits.",
      { kind: "info" },
    );
  }

  return check(
    "Packet PDF render health",
    metrics.renderFailedEvents > 0 ? "OPEN" : "PASS",
    [
      `render attempts: ${metrics.renderAttemptEvents}`,
      `render successes: ${metrics.renderSucceededEvents}`,
      `render failures: ${metrics.renderFailedEvents}`,
      `cache hits: ${metrics.cacheHitEvents}`,
      `latest failure: ${metrics.latestFailureAt ?? "none"}`,
    ].join("; "),
    { kind: "smoke" },
  );
}

function dashboardStatusForThreshold(status: ThresholdStatus): DashboardStatus {
  if (status === "Critical") return "FAIL";
  if (status === "Warning") return "OPEN";
  return "PASS";
}

function thresholdSummary(metrics: ProductionObservabilityMetrics, keys: string[]): { status: ThresholdStatus; notes: string } {
  const selected = metrics.thresholds.filter((item) => keys.includes(item.key));
  const status: ThresholdStatus = selected.some((item) => item.status === "Critical")
    ? "Critical"
    : selected.some((item) => item.status === "Warning")
      ? "Warning"
      : "OK";
  return {
    status,
    notes: selected
      .map((item) => `${item.label}: ${item.value} (threshold status: ${item.status}; warning ${item.warning}; critical ${item.critical})`)
      .join("; "),
  };
}

function productionObservabilityChecks(
  metrics: ProductionObservabilityMetrics | null | undefined,
): DashboardCheck[] {
  if (!metrics) {
    return [
      check(
        "Production observability metrics",
        "INFO",
        "Runtime production observability metrics were not available in this invocation. Run in an environment with FLOOT_DATABASE_URL to surface ingest, OCR/parser, packet PDF, storage, auth/rate-limit, and DB threshold status.",
        { kind: "info" },
      ),
    ];
  }

  const ingest = thresholdSummary(metrics, [
    "ingest_queued_jobs",
    "ingest_failed_jobs",
    "ingest_dead_letters",
    "ingest_stale_running",
    "ingest_oldest_queued_age",
  ]);
  const ocrParser = thresholdSummary(metrics, ["ocr_failures", "parser_failures", "parser_uncertainty"]);
  const packetPdf = thresholdSummary(metrics, ["packet_pdf_failures"]);
  const storage = thresholdSummary(metrics, ["storage_failures"]);
  const authRateLimit = thresholdSummary(metrics, ["auth_failures", "rate_limit_active_entries", "rate_limit_max_count"]);
  const dbSignal = thresholdSummary(metrics, ["db_latency_ms", "db_active_connections"]);

  return [
    check(
      "Ingest health threshold",
      dashboardStatusForThreshold(ingest.status),
      [
        ingest.notes,
        `running: ${metrics.ingest.runningJobs}`,
        `succeeded: ${metrics.ingest.succeededJobs}`,
        `retry backlog: ${metrics.ingest.retryBacklogJobs}`,
        `OCR/parsing started events: ${metrics.ingest.ocrParsingStartedEvents}`,
        `compliance scan started events: ${metrics.ingest.complianceScanStartedEvents}`,
        `average OCR/parsing duration ms: ${metrics.ingest.averageOcrParsingDurationMs ?? "n/a"}`,
        `total OCR page count: ${metrics.ingest.totalOcrPageCount}`,
      ].join("; "),
      { kind: "smoke" },
    ),
    check(
      "OCR/parser health threshold",
      dashboardStatusForThreshold(ocrParser.status),
      [
        ocrParser.notes,
        `artifacts observed: ${metrics.ocrParser.artifactsObserved}`,
        `OCR succeeded artifacts: ${metrics.ocrParser.ocrSucceededArtifacts}`,
        `parser issue count: ${metrics.ocrParser.parserIssueCount}`,
        "raw extracted text stored in metrics: false",
      ].join("; "),
      { kind: "smoke" },
    ),
    check(
      "Packet PDF health threshold",
      dashboardStatusForThreshold(packetPdf.status),
      [
        packetPdf.notes,
        `render attempts: ${metrics.packetPdf.renderAttemptEvents}`,
        `render successes: ${metrics.packetPdf.renderSucceededEvents}`,
        `render failures: ${metrics.packetPdf.renderFailedEvents}`,
        `cache hits: ${metrics.packetPdf.cacheHitEvents}`,
      ].join("; "),
      { kind: "smoke" },
    ),
    check(
      "Storage health threshold",
      dashboardStatusForThreshold(storage.status),
      [
        storage.notes,
        `read failures: ${metrics.storage.readFailures}`,
        `write failures: ${metrics.storage.writeFailures}`,
        `delete failures: ${metrics.storage.deleteFailures}`,
        `latest failure: ${metrics.storage.latestFailureAt ?? "none"}`,
        "object names stored as hashes only",
      ].join("; "),
      { kind: "smoke" },
    ),
    check(
      "Auth/rate-limit threshold",
      dashboardStatusForThreshold(authRateLimit.status),
      [
        authRateLimit.notes,
        `login successes: ${metrics.auth.loginSuccessEvents}`,
        "emails, IP addresses, cookies, and session IDs are not emitted in dashboard metrics",
      ].join("; "),
      { kind: "smoke" },
    ),
    check(
      "DB config/pool threshold",
      dashboardStatusForThreshold(dbSignal.status),
      [
        dbSignal.notes,
        `configured pool max: ${metrics.db.poolMax}`,
        `idle timeout seconds: ${metrics.db.idleTimeoutSeconds}`,
        `latency proxy ms: ${metrics.db.latencyMs ?? "n/a"}`,
        `active connections: ${metrics.db.activeConnections ?? "n/a"}`,
      ].join("; "),
      { kind: "smoke" },
    ),
  ];
}

export function parseArgs(argv: string[]) {
  const flags = new Set(argv);
  const categoryIndex = argv.indexOf("--category");
  return {
    json: flags.has("--json"),
    runChecks: flags.has("--run-checks"),
    listChecks: flags.has("--list-checks"),
    category: categoryIndex >= 0 ? argv[categoryIndex + 1] ?? "" : "",
  };
}

export function buildOperatorDashboard(options: BuildDashboardOptions = {}) {
  const cwd = options.cwd ?? process.cwd();
  const runGit = options.runGit ?? defaultRunGit;
  const fileExists = options.fileExists ?? existsSync;
  const statusShort = readGitValue(runGit, ["status", "--short"], "");
  const branch = readGitValue(runGit, ["branch", "--show-current"]);
  const commit = readGitValue(runGit, ["rev-parse", "HEAD"]);
  const subject = readGitValue(runGit, ["log", "-1", "--pretty=%s"]);
  const clean = statusShort.length === 0;
  const limitedBetaPolicyExists = repoFileExists(cwd, fileExists, "docs/limited-beta-operator-launch-policy.md");
  const checklistExists = repoFileExists(cwd, fileExists, "docs/production-readiness-checklist.md");
  const readinessReportExists = repoFileExists(cwd, fileExists, "scripts/production-readiness-report.ts");

  const categories: DashboardCategory[] = [
    {
      name: "Repository / Release State",
      checks: [
        check("Working tree clean", clean ? "PASS" : "FAIL", clean ? "No uncommitted changes." : statusShort, {
          kind: "repository",
        }),
        check("Branch", "INFO", branch, { kind: "repository" }),
        check("Commit", "INFO", `${commit} ${subject}`, { kind: "repository" }),
        check(
          "Limited beta operator policy exists",
          limitedBetaPolicyExists ? "PASS" : "FAIL",
          "docs/limited-beta-operator-launch-policy.md",
          { kind: "repository" },
        ),
        check(
          "Production-readiness checklist exists",
          checklistExists ? "PASS" : "FAIL",
          "docs/production-readiness-checklist.md",
          { kind: "repository" },
        ),
        check(
          "Production-readiness report exists",
          readinessReportExists ? "PASS" : "FAIL",
          "scripts/production-readiness-report.ts",
          { kind: "repository" },
        ),
        check(
          "Autonomous response auth smokes",
          "INFO",
          "Staging deploy workflow runs scope-gated seeded/authenticated response auth smokes after deploy and health checks: response capture/list/get, response UI, response admin-review backend, and response admin-review UI. Runtime/app/workflow/Docker/backend/UI/script changes run the full suite, docs/readiness/operator-dashboard-only changes skip it by design, and unknown changed-file scope runs it fail-closed. This is a deploy-time safety gate, not full production monitoring.",
          { kind: "info" },
        ),
        check(
          "App image apt-utils cleanup",
          "INFO",
          "The app Docker image includes apt-utils before OCR/PDF runtime package installation; poppler-utils, tesseract-ocr, and tesseract-ocr-eng remain installed, and filtered deploy logs no longer show the apt-utils package-install warning.",
          { kind: "info" },
        ),
      ],
    },
    {
      name: "Core Logical Regression",
      checks: [
        check("Golden Path", "SKIP", "Logical chain: upload, parse, canonical map, issue detection, evidence bind, packet, PDF.", {
          command: "pnpm run test:golden-path",
          runByDefault: true,
        }),
        check("Deterministic ingestion report", "SKIP", "Available local parser/replay/evidence coverage report; not part of default dashboard run.", {
          command: "pnpm run test:deterministic-ingestion-report",
        }),
        check("Typecheck", "SKIP", "TypeScript compile safety.", {
          command: "pnpm run typecheck",
          runByDefault: true,
        }),
        check("Contracts", "SKIP", "Contract suite.", {
          command: "pnpm run test:contracts",
          runByDefault: true,
        }),
        check("API suite", "SKIP", "Endpoint/API regression suite.", {
          kind: "endpoint-test",
          command: "pnpm run test:api",
          runByDefault: true,
        }),
      ],
    },
    {
      name: "Auth / Session Lifecycle",
      checks: [
        check(
          "Auth session lifecycle endpoint",
          "SKIP",
          "Endpoint-backed login/session/logout behavior, malformed and invalid session handling, role boundaries, admin guard samples, no client-side role escalation, and secret/no-overexposure expectations.",
          {
            kind: "endpoint-test",
            command: "pnpm exec vitest run tests/api/auth-session-lifecycle-endpoint.spec.ts",
            runByDefault: true,
          },
        ),
      ],
    },
    {
      name: "Admin Audit / Activity Logs",
      checks: [
        check(
          "Admin audit log endpoint",
          "SKIP",
          "Endpoint-backed admin-only access, support/non-admin denial, supported filters and pagination, safe audit summaries, no secret/full SIN/full account/raw-text leakage, regulation/packet/evidence/correction row safety, and runtime-safety boundaries.",
          {
            kind: "endpoint-test",
            command: "pnpm exec vitest run tests/api/admin-audit-log-endpoint.spec.ts",
            runByDefault: true,
          },
        ),
      ],
    },
    {
      name: "Production Observability",
      checks: productionObservabilityChecks(options.productionObservabilityMetrics),
    },
    {
      name: "Packet Reliability",
      checks: [
        packetPdfHealthCheck(options.packetPdfMetrics),
        check("Packet lifecycle endpoint", "SKIP", "Endpoint-backed readiness/build/create/PDF/non-owner/stale-ID coverage.", {
          kind: "endpoint-test",
          command: "pnpm exec vitest run tests/api/packet-lifecycle-endpoint.spec.ts",
          runByDefault: true,
        }),
        check(
          "Packet delivery/status endpoint",
          "SKIP",
          "Endpoint-backed ownership, status updates, send/delivery behavior, provider-call mocking, audit/evidence expectations, duplicate/retry blocking, stale attachment safety, no-overexposure, and runtime-safety boundaries.",
          {
            kind: "endpoint-test",
            command: "pnpm exec vitest run tests/api/packet-delivery-status-endpoint.spec.ts",
            runByDefault: true,
          },
        ),
        check("Packet readiness", "SKIP", "Helper and endpoint readiness fail-closed coverage.", {
          command: "pnpm exec vitest run tests/unit/packet-readiness.spec.ts",
        }),
        check("Packet PDF", "SKIP", "Packet PDF rendering tests are available but not in the default bounded run.", {
          command: "pnpm exec vitest run tests/unit/dispute-packet-pdf.spec.ts",
        }),
        check(
          "Packet PDF cache",
          "SKIP",
          "Content-addressed packet PDF cache coverage for first render storage, cache hits, invalidation, render failure events, and sensitive payload exclusion.",
          {
            command: "pnpm exec vitest run tests/unit/packet-pdf-cache.spec.ts",
            runByDefault: true,
          },
        ),
      ],
    },
    {
      name: "Outcome Tracking",
      checks: [
        check(
          "Outcome comparison helper",
          "SKIP",
          "No-schema deterministic helper coverage for unchanged, removed, corrected, partially_corrected, reinserted, new_issue, unresolved, needs_review, not_comparable, and response_received classifications.",
          {
            command: "pnpm exec vitest run tests/unit/outcome-comparison.spec.ts",
            runByDefault: true,
          },
        ),
        check(
          "Persisted outcome tracking endpoint",
          "SKIP",
          "Endpoint-backed persisted backend coverage for outcome_comparison_run and finding_outcome compare/list/get flows. Backend-only: no UI, and response documents remain evidence only rather than canonical credit-report facts.",
          {
            kind: "endpoint-test",
            command: "pnpm exec vitest run tests/api/outcome-tracking-endpoint.spec.ts",
            runByDefault: true,
          },
        ),
        check(
          "Outcome admin-review endpoint",
          "SKIP",
          "Endpoint-backed admin-only metadata review coverage for finding/run review statuses, required notes/confirmations, sanitized audit, deterministic outcome preservation, source-record immutability, and no runtime truth, packet, parser, violation, override, or furnisher path activation.",
          {
            kind: "endpoint-test",
            command: "pnpm exec vitest run tests/api/outcome-admin-review-endpoint.spec.ts",
            runByDefault: true,
          },
        ),
        check(
          "Outcome admin-review UI",
          "SKIP",
          "Admin-only review UI coverage for outcome run list/detail, safe snapshots, metadata-only review actions, unsupported override-control absence, and source guards limiting calls to existing outcome list/get/admin-review endpoints.",
          {
            command: "pnpm exec vitest run tests/unit/outcome-admin-review-ui.spec.tsx",
            runByDefault: true,
          },
        ),
        check(
          "Response document capture endpoint",
          "SKIP",
          "Endpoint-backed response capture coverage for bureau_response_event plus append-only response_processing_event and response_admin_review_event schema creation, owner/admin/support boundaries, packet/outcome/finding/evidence/tradeline/violation linkage, deterministic processing metadata, inbox-ready manual_admin/simulated_inbox intake, response-text hashing, duplicate/idempotent intake handling, sanitized audit, privacy/no-overexposure, metrics, and source guards that prevent credit-report parser, OCR pipeline, packet, violation, runtime truth, admin override, direct furnisher paths, or live mailbox integration. Authenticated staging smoke has passed in admin and user-owned contexts for capture/list/get and outcome-linked email response metadata.",
          {
            kind: "endpoint-test",
            command: "pnpm exec vitest run tests/api/response-document-endpoint.spec.ts",
            runByDefault: true,
          },
        ),
        check(
          "Response classification engine",
          "SKIP",
          "Unit coverage for deterministic response classification, confidence gating, negation and contradiction handling, metadata-only/OCR-damaged fail-closed states, manual-review fail-closed states, evidence-linked provenance, regulation-reference review links, and no readiness/violation truth mutation.",
          {
            command: "pnpm exec vitest run tests/unit/response-classification-engine.spec.ts",
            runByDefault: true,
          },
        ),
        check(
          "Response replay/backfill dry-run",
          "SKIP",
          "Operator-only replay report for response records. Dry-run is default and reports total, replayable, non-replayable reason counts, stale/missing classifier metadata, manual-review/uncertainty counts, duplicate-attempt audit count, and replay timestamps where available; apply mode is explicit and append-only. This is tooling, not live mailbox integration or production-load proof.",
          {
            command: "pnpm run response:replay -- --dry-run",
          },
        ),
        check(
          "Response processing worker dry-run",
          "SKIP",
          "Operator-only bounded worker preview for the durable response-processing queue. Dry-run previews the next eligible queued/retry job without claiming or writing; stale running jobs are reported for operator review rather than silently reclaimed, real worker runs remain explicit and bounded, and live mailbox integration remains deferred.",
          {
            command: "pnpm run response:worker -- --dry-run",
          },
        ),
        check(
          "Response worker orchestration dry-run",
          "SKIP",
          "Cron-safe orchestration preview for bounded response worker execution. Dry-run writes no orchestration or queue state; --run remains bounded, lock-protected, non-daemon, and internal-only with no external alert delivery.",
          {
            command: "pnpm run response:worker-orchestrate -- --dry-run",
          },
        ),
        check(
          "Response scheduler activation conditions",
          "MACHINE_REQUIRED",
          "Runbook-backed scheduler proof: live daemon activation is not automatic; automated proof must first pass dry-run orchestration, response soak, dashboard, and response tests, then use only an explicit bounded --run invocation with max-job and lock-scope evidence. Machine-attested scheduler evidence is still required for a live-operations claim.",
          {
            command: "pnpm run response:worker-orchestrate -- --dry-run",
          },
        ),
        check(
          "Response external alert dry-run boundary",
          "SIMULATED",
          "SIMULATED DRY RUN alert payload proof exists with zero live external delivery. Real email, Slack, webhook, SMS, push, or pager delivery remains intentionally absent; future external providers require mocked dry-run tests before live delivery.",
          {
            command: "pnpm run alerts:dry-run",
          },
        ),
        check(
          "Response queue service",
          "SKIP",
          "DB-backed queue coverage for sanitized payload validation, duplicate active-job collapse, row-lock claiming, retry/dead-letter behavior, stale-running visibility, replay apply guard preservation, append-only remediation events, and terminal dead-letter replacement retry.",
          {
            kind: "endpoint-test",
            command: "pnpm exec vitest run tests/api/response-processing-queue.spec.ts",
            runByDefault: true,
          },
        ),
        check(
          "Response queue remediation endpoint",
          "SKIP",
          "Admin-only queue inspection and remediation coverage for structured sanitized job summaries, retry confirmation, dead-letter acknowledgement, replacement-job retry, stale-running review without auto-reclaim, and no raw response text or credential leakage.",
          {
            kind: "endpoint-test",
            command: "pnpm exec vitest run tests/api/response-processing-queue-remediation-endpoint.spec.ts",
            runByDefault: true,
          },
        ),
        check(
          "Response worker orchestration service",
          "SKIP",
          "DB-backed orchestration coverage for dry-run no-write behavior, bounded max-job execution, overlap/stale-lock skipping, repeated worker failure alert surfacing, synthetic cleanup, and no external delivery or live mailbox behavior.",
          {
            kind: "endpoint-test",
            command: "pnpm exec vitest run tests/api/response-worker-orchestration.spec.ts",
            runByDefault: true,
          },
        ),
        check(
          "Response lifecycle retention and drift",
          "SKIP",
          "Lifecycle coverage for retention preview dry-run, explicit append-only retention marking, active/stale/dead-letter cleanup refusal, deterministic operational drift thresholds, bounded soak cleanup, and no raw response text or external alert delivery.",
          {
            kind: "endpoint-test",
            command: "pnpm exec vitest run tests/api/response-processing-lifecycle.spec.ts",
            runByDefault: true,
          },
        ),
        check(
          "Response worker orchestration CLI",
          "SKIP",
          "CLI parser coverage for dry-run default, explicit --run, max-job bounds, scheduling flags, lock TTL bounds, and sanitized error output.",
          {
            command: "pnpm exec vitest run tests/unit/response-processing-worker-orchestrator-script.spec.ts",
            runByDefault: true,
          },
        ),
        check(
          "Response lifecycle CLI",
          "SKIP",
          "CLI parser coverage for dry-run default, explicit bounded apply options, confirmation/actor handling, invalid combinations, and limit bounds.",
          {
            command: "pnpm exec vitest run tests/unit/response-processing-lifecycle-script.spec.ts",
            runByDefault: true,
          },
        ),
        check(
          "Response queue synthetic load",
          "SKIP",
          "Bounded deterministic synthetic load check for multiple sanitized jobs, duplicate collapse, worker processing, retryable failure, dead-letter path, stale-running metrics, and cleanup of isolated synthetic rows. This is not live mailbox ingestion or a scheduled worker.",
          {
            command: "pnpm run response:queue-load-check",
          },
        ),
        check(
          "Response worker orchestration synthetic check",
          "SKIP",
          "Bounded deterministic orchestration check for max-job enforcement, overlap skips, stale orchestration-lock visibility, repeated worker failures, queue alert conditions, and cleanup of isolated synthetic rows. This is not a live scheduler, daemon, external alert sender, or mailbox integration.",
          {
            command: "pnpm run response:orchestration-check",
          },
        ),
        check(
          "Response lifecycle retention dry-run",
          "SKIP",
          "Operator-only retention and drift report. Dry-run is default and writes nothing; apply mode only appends lifecycle retention markers and never deletes queue/orchestration/replay history.",
          {
            command: "pnpm run response:lifecycle -- --dry-run",
          },
        ),
        check(
          "Response purge/archive readiness",
          "MACHINE_REQUIRED",
          "Runbook-backed lifecycle proof: retention dry-run identifies eligible terminal records and protected stale/dead-letter records, while apply remains explicit, actor-attributed, append-only, and does not physically purge or archive response-processing history. Physical purge/archive remains unproven until machine-attested.",
          {
            command: "pnpm run response:lifecycle -- --dry-run",
          },
        ),
        check(
          "Response historical backfill plan",
          "MACHINE_REQUIRED",
          "Runbook-backed replay proof: dry-run reports replayable and non-replayable records with reason counts; apply requires explicit confirmation and actor attribution, and records without sanitized stored summaries remain non-replayable without rehydrating raw response text. Historical backfill execution remains machine-proof required.",
          {
            command: "pnpm run response:replay -- --dry-run",
          },
        ),
        check(
          "Response remediation operator controls",
          "SKIP",
          "Runbook-backed remediation proof: admin-only retry, dead-letter acknowledgement, replacement-job retry, and stale-running review require explicit confirmations and append-only events without deleting queue history or exposing raw response text.",
          {
            command: "pnpm exec vitest run tests/api/response-processing-queue-remediation-endpoint.spec.ts",
          },
        ),
        check(
          "Response processing soak check",
          "SKIP",
          "Bounded deterministic soak check for repeated orchestration cycles, duplicate collapse, retry/dead-letter/stale/overlap drift, replay dry-run, retention preview verification, lifecycle result visibility, and isolated synthetic cleanup.",
          {
            command: "pnpm run response:soak-check",
          },
        ),
        check(
          "Response document admin-review endpoint",
          "SKIP",
          "Endpoint-backed admin-only metadata review coverage for bureau_response_event review status plus append-only response_admin_review_event rows, related/unrelated/archive/note/link actions, same-user packet/outcome/finding validation, required evidence-only/no-canonical-change/no-outcome-classification confirmations, sanitized audit, privacy/no-overexposure, unsupported corrected/removed/legal override-action rejection, source preservation, and source guards preventing parser, OCR, packet, violation, runtime truth, admin override, direct furnisher, or mailbox paths. Authenticated staging smoke has passed for synthetic response 1 with required-note validation, unsupported action rejection, link_to_outcome, add_review_note, metadata-only review updates, deterministic source preservation, runtime-safety, and privacy/no-overexposure.",
          {
            kind: "endpoint-test",
            command: "pnpm exec vitest run tests/api/response-document-admin-review-endpoint.spec.ts",
            runByDefault: true,
          },
        ),
        check(
          "Response document admin UI",
          "SKIP",
          "Admin-only Response Documents UI coverage for list/detail, supported filters, response processing metrics, deterministic extraction source visibility, manual-review states, safe metadata rendering, evidence/provenance notices, manual/admin response capture controls, idempotent duplicate result visibility, metadata-only admin-review controls, required notes, confirmation guardrails, unsupported legal/override/live-inbox/source-truth controls, and source guards limiting mutations to response capture/admin-review endpoints only. Authenticated staging UI smoke has passed for route/list/detail and the metadata-only admin-review UI action path.",
          {
            command: "pnpm exec vitest run tests/unit/response-document-ui.spec.tsx",
            runByDefault: true,
          },
        ),
      ],
    },
    {
      name: "Report Ingest / Retrieval",
      checks: [
        ingestQueueHealthCheck(options.ingestQueueMetrics),
        check(
          "Production worker readiness evidence",
          "SKIP",
          "Non-mutating production worker readiness evidence records default-off production workflow status, dry-run command, apply guards, bounded max-jobs requirement, rollback/stop instructions, future queue-depth fields, and explicit no-production-jobs-processed-by-Codex safety. This exact command is release evidence; dashboard PASS alone is not sufficient.",
          {
            command: "pnpm run production-worker:readiness-evidence",
            runByDefault: true,
          },
        ),
        check(
          "Ingest lifecycle remediation endpoint",
          "SKIP",
          "Admin-only queue inspection and remediation coverage for dead-letter retry, reviewed markers, bounded cancellation, failed-cleanup visibility, append-only events, and no raw report bytes or extracted text exposure.",
          {
            kind: "endpoint-test",
            command: "pnpm exec vitest run tests/api/ingest-processing-lifecycle-remediation-endpoint.spec.ts",
            runByDefault: true,
          },
        ),
        check(
          "Ingest cleanup lifecycle events",
          "SKIP",
          "Unit coverage that failed ingest cleanup records cleanup_attempted and cleanup_failed queue events without storing raw report bytes or extracted text.",
          {
            command: "pnpm exec vitest run tests/unit/ingest-cleanup-lifecycle.spec.ts",
            runByDefault: true,
          },
        ),
        check(
          "Report ingest lifecycle endpoint",
          "SKIP",
          "Endpoint-backed auth, ownership, upload contract, process/failure behavior, report list/detail, Stage Lab separation, and privacy expectations.",
          {
            kind: "endpoint-test",
            command: "pnpm exec vitest run tests/api/report-ingest-lifecycle-endpoint.spec.ts",
            runByDefault: true,
          },
        ),
        check("Parser Lab run endpoint", "SKIP", "Stage Lab controlled scanned-PDF 400 behavior and sideEffects:none coverage.", {
          kind: "endpoint-test",
          command: "pnpm exec vitest run tests/unit/parser-lab-run-endpoint.spec.ts",
        }),
        check("Credit-report PDF eligibility", "SKIP", "Upload PDF eligibility and scanned/image-only fail-closed coverage.", {
          command: "pnpm exec vitest run tests/unit/credit-report-pdf-eligibility.spec.ts",
        }),
        check("Deterministic OCR readiness", "SKIP", "OCR readiness and provenance fail-closed coverage.", {
          command: "pnpm exec vitest run tests/unit/deterministic-ocr-readiness.spec.ts",
        }),
      ],
    },
    {
      name: "Violation Search / Status",
      checks: [
        check(
          "Violation search/status endpoint",
          "SKIP",
          "Endpoint-backed ownership, supported filters/status, dismiss/delete contract, packet-readiness consistency, privacy/audit expectations, and non-owner denial.",
          {
            kind: "endpoint-test",
            command: "pnpm exec vitest run tests/api/violation-search-status-endpoint.spec.ts",
            runByDefault: true,
          },
        ),
        check("Violation search preservation", "SKIP", "Helper-level compatibility coverage for issue search fields and stable violation indexing.", {
          command: "pnpm exec vitest run tests/unit/violation-search-preservation.spec.ts",
        }),
        check("Creditor-validation auth", "SKIP", "Additional endpoint auth boundary coverage for creditor-validation paths.", {
          kind: "endpoint-test",
          command: "pnpm exec vitest run tests/api/creditor-validation-auth.spec.ts",
        }),
      ],
    },
    {
      name: "Evidence / Coordinate Coverage",
      checks: [
        check(
          "Evidence privacy endpoint",
          "SKIP",
          "Endpoint-backed auth/ownership, attachment behavior, compact evidence metadata, no raw text/full SIN/full account/storage-secret leakage, audit expectations, and runtime-safety boundaries.",
          {
            kind: "endpoint-test",
            command: "pnpm exec vitest run tests/api/evidence-privacy-endpoint.spec.ts",
            runByDefault: true,
          },
        ),
        check("Evidence location index", "SKIP", "Evidence sidecar, page, OCR/native coordinates, and safe omission behavior.", {
          command: "pnpm exec vitest run tests/unit/evidence-location-index.spec.ts",
          runByDefault: true,
        }),
        check("OCR coordinates", "SKIP", "Tesseract TSV coordinate matching and fail-closed omissions.", {
          command: "pnpm exec vitest run tests/unit/ocr-evidence-coordinates.spec.ts",
        }),
        check("Native PDF coordinates", "SKIP", "pdfjs coordinate sidecar matching and fail-closed omissions.", {
          command: "pnpm exec vitest run tests/unit/pdfjs-evidence-coordinates.spec.ts",
        }),
        check("Complex real-world coordinate fixtures", "OPEN", "More anonymized real-world layouts remain future coverage.", {
          kind: "gap",
        }),
      ],
    },
    {
      name: "Regulation / Governance",
      checks: [
        check("Legal-reference language", "SKIP", "Consumer wording stays neutral and reference-based.", {
          command: "pnpm exec vitest run tests/unit/legal-reference-language.spec.ts",
          runByDefault: true,
        }),
        check("Regulation reconciliation", "SKIP", "Static-vs-DB reconciliation helper coverage.", {
          command: "pnpm exec vitest run tests/unit/regulation-reference-reconciliation.spec.ts",
        }),
        check("Reconciliation candidate API", "SKIP", "Endpoint-backed inert candidate lifecycle coverage.", {
          kind: "endpoint-test",
          command: "pnpm exec vitest run tests/api/regulation-reconciliation-candidates-endpoint.spec.ts",
        }),
        check("Runtime bridge mapping API", "SKIP", "Endpoint-backed governance-only bridge mapping coverage.", {
          kind: "endpoint-test",
          command: "pnpm exec vitest run tests/api/regulation-runtime-bridge-mappings-endpoint.spec.ts",
        }),
        check("Shadow bridge diagnostics", "SKIP", "Endpoint-backed shadow report remains read-only and non-runtime.", {
          kind: "endpoint-test",
          command: "pnpm exec vitest run tests/api/regulation-shadow-bridge-report-endpoint.spec.ts",
        }),
        check("Advisory bridge diagnostics", "SKIP", "Endpoint-backed advisory report remains admin/internal and non-runtime.", {
          kind: "endpoint-test",
          command: "pnpm exec vitest run tests/api/regulation-advisory-bridge-report-endpoint.spec.ts",
        }),
        check("DB registry runtime status", "INFO", "DB registry remains non-runtime governance metadata.", {
          kind: "info",
        }),
        check("Runtime selector status", "INFO", "No runtime selector exists; static runtime mappings remain active truth.", {
          kind: "info",
        }),
      ],
    },
    {
      name: "Public / Internal Exposure",
      checks: [
        check("Public static guard", "SKIP", "Guards internal docs and confidential PDFs out of public/static/output paths.", {
          kind: "local-test",
          command: "pnpm exec vitest run tests/unit/public-static-dev-assets.spec.ts",
          runByDefault: true,
        }),
        check("Internal docs under static/output", "INFO", "Covered by the public-static guard.", {
          kind: "info",
        }),
        check("Confidential PDF under output/pdf", "INFO", "Covered by the public-static guard.", {
          kind: "info",
        }),
      ],
    },
    {
      name: "Manual / Gated Smoke",
      checks: GATED_SMOKE_CHECKS.map((smoke) =>
        check(smoke.name, "MANUAL", smoke.notes, {
          kind: "smoke",
          command: smoke.command,
          requiresCredentials: true,
        }),
      ),
    },
    {
      name: "Known Coverage Gaps",
      checks: KNOWN_SCALE_GAPS.map((gap) => check(gap, "OPEN", gap, { kind: "gap" })),
    },
  ];

  return finalizeDashboard({
    generatedAt: new Date().toISOString(),
    branch,
    commit,
    workingTreeClean: clean,
    safety: DASHBOARD_SAFETY_BOUNDARIES,
    categories,
    knownGaps: KNOWN_SCALE_GAPS,
  });
}

function flattenChecks(categories: DashboardCategory[]): DashboardCheck[] {
  return categories.flatMap((category) => category.checks);
}

function buildSummary(categories: DashboardCategory[]) {
  const summary = { pass: 0, fail: 0, skip: 0, simulated: 0, machineRequired: 0, manual: 0, open: 0, info: 0 };
  for (const item of flattenChecks(categories)) {
    const key = item.status === "MACHINE_REQUIRED"
      ? "machineRequired"
      : item.status.toLowerCase() as keyof typeof summary;
    summary[key] += 1;
  }
  return summary;
}

export function buildDashboardReleaseEvidenceSemantics(categories: DashboardCategory[]) {
  const summary = buildSummary(categories);
  const exactCommands = Array.from(new Set(
    flattenChecks(categories)
      .map((item) => item.command)
      .filter((command): command is string => Boolean(command)),
  )).sort();
  return {
    statusValues: Object.keys(DASHBOARD_RELEASE_EVIDENCE_STATUS_MEANINGS) as DashboardStatus[],
    statusMeanings: DASHBOARD_RELEASE_EVIDENCE_STATUS_MEANINGS,
    dashboardPassAloneIsReleaseEvidence: false,
    passImpliesSkippedChecksPassed: false,
    exactCommandsRequired: true,
    exactCommands,
    skipCount: summary.skip,
    simulatedCount: summary.simulated,
    machineRequiredCount: summary.machineRequired,
    skippedChecksVisible: summary.skip > 0,
    simulatedProofVisible: summary.simulated > 0,
    machineRequiredProofVisible: summary.machineRequired > 0,
  };
}

function finalizeDashboard(report: {
  generatedAt: string;
  branch: string;
  commit: string;
  workingTreeClean: boolean;
  safety: typeof DASHBOARD_SAFETY_BOUNDARIES;
  categories: DashboardCategory[];
  knownGaps: string[];
}) {
  return {
    ...report,
    summary: buildSummary(report.categories),
    releaseEvidenceSemantics: buildDashboardReleaseEvidenceSemantics(report.categories),
  };
}

export function filterDashboard(report: ReturnType<typeof buildOperatorDashboard>, category: string) {
  const normalized = normalizeCategoryName(category);
  if (!normalized) return report;
  const categories = report.categories.filter((item) => normalizeCategoryName(item.name).includes(normalized));
  return finalizeDashboard({ ...report, categories });
}

export function listChecks(report: ReturnType<typeof buildOperatorDashboard>) {
  return report.categories.flatMap((category) =>
    category.checks.map((item) => ({
      category: category.name,
      name: item.name,
      status: item.status,
      command: item.command ?? "",
      runByDefault: item.runByDefault === true,
      requiresCredentials: item.requiresCredentials === true,
    })),
  );
}

export function applyRunResults(
  report: ReturnType<typeof buildOperatorDashboard>,
  commandRunner: CommandRunner = defaultCommandRunner,
) {
  const runResults = new Map<string, DashboardStatus>();
  const reportCommands = new Set(
    flattenChecks(report.categories)
      .map((item) => item.command)
      .filter((command): command is string => Boolean(command)),
  );
  for (const command of SAFE_RUN_CHECK_COMMANDS.filter((item) => reportCommands.has(item))) {
    const status = commandRunner(command) === 0 ? "PASS" : "FAIL";
    runResults.set(command, status);
  }

  const categories = report.categories.map((category) => ({
    ...category,
    checks: category.checks.map((item) => {
      if (!item.command || !runResults.has(item.command)) return item;
      return {
        ...item,
        status: runResults.get(item.command) ?? item.status,
        notes: `${item.notes} Checked by --run-checks.`,
      };
    }),
  }));

  return finalizeDashboard({ ...report, categories });
}

function defaultCommandRunner(command: string): number {
  const [program, ...args] = command.split(" ");
  const result = process.platform === "win32" && program === "pnpm"
    ? spawnSync("cmd.exe", ["/d", "/s", "/c", command], { stdio: "inherit" })
    : spawnSync(program, args, { stdio: "inherit" });
  return result.status ?? 1;
}

function renderStatus(status: DashboardStatus): string {
  return `[${status}]`;
}

export function renderDashboard(report: ReturnType<typeof buildOperatorDashboard>): string {
  const lines = [
    "CREDIT REGULATOR PRO - OPERATOR REGRESSION DASHBOARD",
    "",
    `Generated: ${report.generatedAt}`,
    `Branch: ${report.branch}`,
    `Commit: ${report.commit}`,
    `Working tree clean: ${report.workingTreeClean ? "yes" : "no"}`,
    "",
  ];

  for (const category of report.categories) {
    lines.push(`${category.name}:`);
    for (const item of category.checks) {
      const commandText = item.command ? ` (${item.command})` : "";
      lines.push(`${renderStatus(item.status)} ${item.name}${commandText}`);
      if (item.notes) lines.push(`  ${item.notes}`);
    }
    lines.push("");
  }

  lines.push(
    "Status values:",
    ...Object.entries(DASHBOARD_RELEASE_EVIDENCE_STATUS_MEANINGS).map(([status, meaning]) => `- ${status}: ${meaning}`),
    "",
    "Release evidence semantics:",
    "- Dashboard PASS alone is not sufficient release evidence.",
    "- SKIP rows remain visible and are not treated as PASS.",
    "- SIMULATED rows are not production proof.",
    "- MACHINE_REQUIRED rows require non-interactive machine-attested proof outside this dashboard.",
    "- Exact commands must be recorded for release evidence.",
  );

  return lines.join("\n");
}

function renderCheckList(report: ReturnType<typeof buildOperatorDashboard>): string {
  const lines = ["Operator dashboard checks", ""];
  for (const item of listChecks(report)) {
    const mode = item.runByDefault ? "run-checks" : item.requiresCredentials ? "manual" : "listed";
    const command = item.command ? ` - ${item.command}` : "";
    lines.push(`[${mode}] ${item.category}: ${item.name}${command}`);
  }
  return lines.join("\n");
}

async function loadIngestQueueMetricsForDashboard(): Promise<IngestQueueDashboardMetrics | null> {
  if (!process.env.FLOOT_DATABASE_URL) return null;
  try {
    const service = await import("../helpers/ingestProcessingQueueService");
    return await service.getIngestProcessingQueueMetrics({ ensureSchema: false });
  } catch {
    return null;
  }
}

async function loadPacketPdfMetricsForDashboard(): Promise<PacketPdfDashboardMetrics | null> {
  if (!process.env.FLOOT_DATABASE_URL) return null;
  try {
    const [{ db }, cache] = await Promise.all([
      import("../helpers/db"),
      import("../helpers/packetPdfCache"),
    ]);
    const countEvent = async (eventType: string): Promise<number> => {
      const row = await db
        .selectFrom("evidenceEvent")
        .select(({ fn }) => fn.count<string>("id").as("count"))
        .where("eventType", "=", eventType)
        .executeTakeFirst();
      return Number(row?.count ?? 0);
    };
    const latestFailure = await db
      .selectFrom("evidenceEvent")
      .select("at")
      .where("eventType", "=", cache.PACKET_PDF_RENDER_FAILED_EVENT)
      .orderBy("at", "desc")
      .limit(1)
      .executeTakeFirst();

    return {
      generatedAt: new Date().toISOString(),
      renderAttemptEvents: await countEvent(cache.PACKET_PDF_RENDER_ATTEMPT_EVENT),
      renderSucceededEvents: await countEvent(cache.PACKET_PDF_RENDER_SUCCEEDED_EVENT),
      renderFailedEvents: await countEvent(cache.PACKET_PDF_RENDER_FAILED_EVENT),
      cacheHitEvents: await countEvent(cache.PACKET_PDF_CACHE_HIT_EVENT),
      latestFailureAt: latestFailure?.at ? new Date(latestFailure.at).toISOString() : null,
    };
  } catch {
    return null;
  }
}

async function loadProductionObservabilityMetricsForDashboard(): Promise<ProductionObservabilityMetrics | null> {
  if (!process.env.FLOOT_DATABASE_URL) return null;
  try {
    const service = await import("../helpers/productionObservabilityMetrics");
    return await service.getProductionObservabilityMetrics({ lookbackHours: 24 });
  } catch {
    return null;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const [ingestQueueMetrics, packetPdfMetrics, productionObservabilityMetrics] = await Promise.all([
    loadIngestQueueMetricsForDashboard(),
    loadPacketPdfMetricsForDashboard(),
    loadProductionObservabilityMetricsForDashboard(),
  ]);
  let report = filterDashboard(buildOperatorDashboard({
    ingestQueueMetrics,
    packetPdfMetrics,
    productionObservabilityMetrics,
  }), options.category);

  if (options.runChecks) {
    report = applyRunResults(report);
    if (report.summary.fail > 0) process.exitCode = 1;
  }

  if (options.listChecks) {
    console.log(options.json ? JSON.stringify(listChecks(report), null, 2) : renderCheckList(report));
    return;
  }

  console.log(options.json ? JSON.stringify(report, null, 2) : renderDashboard(report));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
