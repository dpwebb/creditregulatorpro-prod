import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_EVIDENCE_DIR = "docs/production-scale/evidence";

type BoundaryCheck = {
  name: string;
  passed: boolean;
  detail: string;
};

type CliOptions = {
  rootDir: string;
  evidenceDir: string;
  writeEvidence: boolean;
  preflight: boolean;
  json: boolean;
};

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

function repoPath(rootDir: string, relativePath: string): string {
  return path.join(rootDir, ...normalizeRelativePath(relativePath).split("/").filter(Boolean));
}

function readText(rootDir: string, relativePath: string): string {
  return readFileSync(repoPath(rootDir, relativePath), "utf8");
}

function safeGit(args: string[], rootDir: string, fallback = "unknown"): string {
  try {
    const output = execFileSync("git", args, {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    return output || fallback;
  } catch {
    return fallback;
  }
}

function checkContains(source: string, expected: string, name: string): BoundaryCheck {
  return {
    name,
    passed: source.includes(expected),
    detail: expected,
  };
}

export function buildIngestWorkerBoundaryEvidence({
  rootDir = process.cwd(),
  generatedAt = new Date().toISOString(),
}: {
  rootDir?: string;
  generatedAt?: string;
} = {}) {
  const endpoint = readText(rootDir, "endpoints/ingest/process_POST.ts");
  const worker = readText(rootDir, "scripts/ingest-processing-worker.ts");
  const queueService = readText(rootDir, "helpers/ingestProcessingQueueService.ts");
  const queueSchema = readText(rootDir, "helpers/ingestProcessingQueueSchema.ts");
  const statusPresenter = readText(rootDir, "helpers/ingestUploadStatusPresenter.ts");
  const stagingCompose = readText(rootDir, "docker-compose.yml");
  const productionCompose = readText(rootDir, "docker-compose.production.yml");
  const stagingWorkflow = readText(rootDir, ".github/workflows/deploy-staging.yml");
  const productionWorkflow = readText(rootDir, ".github/workflows/deploy-production.yml");

  const checks: BoundaryCheck[] = [
    checkContains(endpoint, "shouldAllowRequestBoundIngestProcessing", "process endpoint gates request-bound processing"),
    checkContains(endpoint, "inlineGate.allowed", "process endpoint only claims inline work behind the gate"),
    checkContains(endpoint, "enqueueIngestProcessingJob", "process endpoint preserves durable enqueue path"),
    checkContains(worker, "claimNextIngestProcessingJob", "worker preserves lease/claim path"),
    checkContains(worker, "recordIngestProcessingWorkerHeartbeat", "worker records heartbeat/liveness"),
    checkContains(worker, "concurrency !== 1", "worker keeps bounded concurrency gate"),
    checkContains(queueService, "getIngestProcessingWorkerLiveness", "queue service exposes worker liveness"),
    checkContains(queueSchema, "ingest_processing_worker_heartbeat", "queue schema persists worker heartbeat"),
    checkContains(statusPresenter, "stalled_no_worker_heartbeat", "upload status exposes no-worker heartbeat state"),
    checkContains(stagingCompose, "creditregulatorpro-staging-ingest-worker", "staging compose has ingest worker service"),
    checkContains(stagingCompose, "--source authenticated_ingest_process", "staging worker service scopes source"),
    {
      name: "production compose keeps ingest worker default-off",
      passed: !/^\s{2}creditregulatorpro-ingest-worker:/m.test(productionCompose),
      detail: "docker-compose.production.yml must not define creditregulatorpro-ingest-worker for normal first go-live deploys",
    },
    checkContains(productionWorkflow, "explicit-bounded-production-ingest-worker-apply", "production manual worker path keeps explicit apply guard"),
    checkContains(productionWorkflow, "--source authenticated_ingest_process", "production manual worker path scopes source"),
    checkContains(productionWorkflow, "--concurrency 1", "production manual worker path keeps bounded concurrency"),
    checkContains(stagingWorkflow, "ingest:worker-boundary-evidence", "staging workflow runs ingest worker boundary preflight"),
    checkContains(productionWorkflow, "ingest:worker-boundary-evidence", "production workflow runs ingest worker boundary preflight"),
    checkContains(stagingWorkflow, "creditregulatorpro-staging creditregulatorpro-staging-ingest-worker", "staging workflow starts app and ingest worker services"),
    {
      name: "production workflow starts app without ingest worker by default",
      passed:
        productionWorkflow.includes("docker compose -f docker-compose.production.yml up -d --build creditregulatorpro") &&
        !productionWorkflow.includes("docker compose -f docker-compose.production.yml up -d --build creditregulatorpro creditregulatorpro-ingest-worker") &&
        productionWorkflow.includes("production ingest worker started during default no-worker deploy"),
      detail: "normal production deploy starts only creditregulatorpro and asserts creditregulatorpro-ingest-worker is absent",
    },
  ];
  const passed = checks.every((check) => check.passed);

  return {
    reportName: "ingest-worker-boundary-evidence",
    generatedAt,
    currentBranch: safeGit(["branch", "--show-current"], rootDir),
    currentHead: safeGit(["rev-parse", "HEAD"], rootDir),
    workingTreeClean: safeGit(["status", "--short"], rootDir, "") === "",
    auditTargets: [
      "P1-3 Request-bound immediate ingest processing reintroduces high-cost work into the HTTP path.",
      "P1-8 Queue state shows critical staleness and no drained-queue proof.",
      "P2-9 Upload UI communicates queue state, but backend liveness is not guaranteed.",
    ],
    status: passed ? "passed" : "failed",
    CERTIFYING: false,
    certificationReason: "This is automated boundary and liveness evidence. It does not claim production queue drain completion without runtime drain evidence.",
    checks,
    deployStaticCheck: {
      stagingWorkerPathPresent: checks.find((check) => check.name === "staging compose has ingest worker service")?.passed === true,
      productionWorkerPathPresent:
        checks.find((check) => check.name === "production workflow starts app without ingest worker by default")?.passed === true,
      productionWorkerDefaultOff:
        checks.find((check) => check.name === "production compose keeps ingest worker default-off")?.passed === true,
      workflowPreflightPresent: checks
        .filter((check) => check.name.includes("workflow runs ingest worker boundary preflight"))
        .every((check) => check.passed),
    },
    commandsToRun: [
      "git diff --check",
      "pnpm exec vitest run tests/api/report-ingest-lifecycle-endpoint.spec.ts tests/unit/ingest-processing-queue-boundary.spec.ts --runInBand",
      "pnpm run test:deterministic-ingestion-report",
      "pnpm run response:soak-check",
      "pnpm run check",
    ],
  };
}

export function renderIngestWorkerBoundaryEvidenceMarkdown(report: ReturnType<typeof buildIngestWorkerBoundaryEvidence>): string {
  const lines = [
    "# Latest Ingest Worker Boundary Evidence",
    "",
    `Generated at: ${report.generatedAt}`,
    `Current branch: \`${report.currentBranch}\``,
    `Current HEAD: \`${report.currentHead}\``,
    `Working tree clean when generated: ${report.workingTreeClean ? "yes" : "no"}`,
    `Status: ${report.status}`,
    `CERTIFYING: ${report.CERTIFYING ? "true" : "false"}`,
    `Certification reason: ${report.certificationReason}`,
    "",
    "## Audit Targets",
    "",
    ...report.auditTargets.map((target) => `- ${target}`),
    "",
    "## Static Checks",
    "",
    ...report.checks.map((check) => `- ${check.passed ? "PASS" : "FAIL"} ${check.name}: \`${check.detail}\``),
    "",
    "## Commands To Run",
    "",
    ...report.commandsToRun.map((command) => `- \`${command}\``),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

export function writeIngestWorkerBoundaryEvidence(
  report: ReturnType<typeof buildIngestWorkerBoundaryEvidence>,
  {
    rootDir = process.cwd(),
    evidenceDir = DEFAULT_EVIDENCE_DIR,
  }: {
    rootDir?: string;
    evidenceDir?: string;
  } = {},
) {
  const absoluteEvidenceDir = repoPath(rootDir, evidenceDir);
  mkdirSync(absoluteEvidenceDir, { recursive: true });
  const markdownPath = normalizeRelativePath(path.join(evidenceDir, "latest-ingest-worker-boundary.md"));
  const jsonPath = normalizeRelativePath(path.join(evidenceDir, "latest-ingest-worker-boundary.json"));
  writeFileSync(repoPath(rootDir, markdownPath), renderIngestWorkerBoundaryEvidenceMarkdown(report), "utf8");
  writeFileSync(repoPath(rootDir, jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { markdownPath, jsonPath };
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    rootDir: process.cwd(),
    evidenceDir: DEFAULT_EVIDENCE_DIR,
    writeEvidence: true,
    preflight: false,
    json: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = () => {
      const next = args[index + 1];
      if (!next || next.startsWith("--")) throw new Error(`${arg} requires a value.`);
      index += 1;
      return next;
    };
    if (arg === "--") continue;
    if (arg === "--root") {
      options.rootDir = path.resolve(value());
    } else if (arg === "--evidence-dir") {
      options.evidenceDir = normalizeRelativePath(value());
    } else if (arg === "--preflight") {
      options.preflight = true;
      options.writeEvidence = false;
    } else if (arg === "--no-write-evidence") {
      options.writeEvidence = false;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log("Usage: pnpm run ingest:worker-boundary-evidence -- [--preflight] [--no-write-evidence] [--json]");
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = buildIngestWorkerBoundaryEvidence({ rootDir: options.rootDir });
  if (options.writeEvidence) {
    const outputs = writeIngestWorkerBoundaryEvidence(report, {
      rootDir: options.rootDir,
      evidenceDir: options.evidenceDir,
    });
    console.log(`Markdown: ${outputs.markdownPath}`);
    console.log(`JSON: ${outputs.jsonPath}`);
  }
  if (options.json) console.log(JSON.stringify(report, null, 2));
  if (report.status !== "passed") process.exitCode = 1;
}

if (process.argv[1] && existsSync(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
