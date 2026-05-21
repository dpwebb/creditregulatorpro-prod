import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const markdownPath = "docs/production-scale/evidence/latest-production-worker-activation-plan.md";
const jsonPath = "docs/production-scale/evidence/latest-production-worker-activation-plan.json";
const prerequisitePath = "docs/production-scale/evidence/latest-ingest-worker-simulated.json";

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function readPrerequisiteEvidence() {
  if (!existsSync(prerequisitePath)) {
    return {
      exists: false,
      status: "missing",
      productionWorkerActivationChanged: null,
      productionDeploymentChanged: null,
    };
  }

  const parsed = JSON.parse(readFileSync(prerequisitePath, "utf8"));
  return {
    exists: true,
    status: parsed.status ?? "unknown",
    generatedAt: parsed.generatedAt ?? null,
    commit: parsed.commit ?? null,
    productionWorkerActivationChanged: parsed.productionWorkerActivationChanged ?? null,
    productionDeploymentChanged: parsed.productionDeploymentChanged ?? null,
    humanOrStagingProductionProofStillRequired: parsed.humanOrStagingProductionProofStillRequired ?? null,
  };
}

function buildReport() {
  const prerequisite = readPrerequisiteEvidence();
  return {
    reportName: "production-worker-activation-plan",
    evidenceType: "DESIGN_AND_GUARD_EVIDENCE",
    generatedAt: new Date().toISOString(),
    branch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
    commit: git(["rev-parse", "HEAD"]),
    prerequisite: {
      path: prerequisitePath,
      ...prerequisite,
      satisfiedForPlanning: prerequisite.exists && prerequisite.status === "passed",
    },
    productionWorkerDefault: {
      alwaysOnWorkerEnabled: false,
      defaultDeployStartsWorker: false,
      dockerComposeWorkerServiceAdded: false,
      ingestEndpointBehaviorChanged: false,
    },
    dryRunProcedure: {
      mutatesQueue: false,
      command:
        "pnpm run ingest:worker --dry-run --max-jobs 1 --concurrency 1 --worker-id production-ingest-worker-dry-run --source authenticated_ingest_process",
      workflowInput: "run_ingest_worker_dry_run=true",
    },
    applyProcedure: {
      defaultEnabled: false,
      boundedOneShot: true,
      maxJobs: "1-5",
      source: "authenticated_ingest_process",
      requiredGuards: [
        "workflow_dispatch input run_ingest_worker_apply=true",
        "ingest_worker_apply_ack=explicit-bounded-production-ingest-worker-apply",
        "ingest_worker_operator=<safe-token>",
        "CRP_ENV=production",
        "CRP_PRODUCTION_INGEST_WORKER_APPLY=explicit-bounded-production-ingest-worker-apply",
        "CRP_PRODUCTION_INGEST_WORKER_ONE_SHOT=true",
        "CRP_PRODUCTION_INGEST_WORKER_MAX_JOBS=<matching max jobs>",
        "CRP_PRODUCTION_INGEST_WORKER_OPERATOR=<safe-token>",
      ],
      command:
        "pnpm run ingest:worker --apply --max-jobs <1-5> --concurrency 1 --worker-id production-bounded-ingest-worker --source authenticated_ingest_process",
    },
    rollbackStopProcedure: [
      "Do not rerun workflow_dispatch with worker inputs.",
      "Use rollback_sha production deployment for application rollback.",
      "If a one-shot worker is running, stop the application container or wait for the bounded command to exit; no daemon service is added.",
      "Inspect queue depth and dead-letter rows before any further apply run.",
    ],
    safety: {
      productionDataMutatedByThisPlan: false,
      productionJobsProcessedByThisPlan: false,
      liveExternalProvidersCalled: false,
      realPiiUsed: false,
      productionAtScaleClaimed: false,
    },
    blockers: {
      blocker2: "partial; production worker activation is prepared but not activated or evidenced as production-fixed",
      blocker11: "partial; production parity still requires rollback and human-observed production evidence",
    },
    outputPaths: {
      markdown: markdownPath,
      json: jsonPath,
    },
  };
}

function renderMarkdown(report) {
  return [
    "# Production Worker Activation Plan",
    "",
    `Generated: ${report.generatedAt}`,
    `Evidence type: ${report.evidenceType}`,
    `Branch: ${report.branch}`,
    `Commit: ${report.commit}`,
    "",
    "This is a guarded design/evidence artifact. It does not activate a production worker, process production jobs, mutate production data, or claim production-at-scale readiness.",
    "",
    "## Prerequisite",
    "",
    `- Staging/simulated evidence path: ${report.prerequisite.path}`,
    `- Evidence exists: ${report.prerequisite.exists ? "yes" : "no"}`,
    `- Evidence status: ${report.prerequisite.status}`,
    `- Satisfied for planning: ${report.prerequisite.satisfiedForPlanning ? "yes" : "no"}`,
    "",
    "## Default Behavior",
    "",
    `- Always-on worker enabled: ${report.productionWorkerDefault.alwaysOnWorkerEnabled ? "yes" : "no"}`,
    `- Default deploy starts worker: ${report.productionWorkerDefault.defaultDeployStartsWorker ? "yes" : "no"}`,
    `- Docker Compose worker service added: ${report.productionWorkerDefault.dockerComposeWorkerServiceAdded ? "yes" : "no"}`,
    `- Ingest endpoint behavior changed: ${report.productionWorkerDefault.ingestEndpointBehaviorChanged ? "yes" : "no"}`,
    "",
    "## Dry Run",
    "",
    `- Workflow input: \`${report.dryRunProcedure.workflowInput}\``,
    `- Mutates queue: ${report.dryRunProcedure.mutatesQueue ? "yes" : "no"}`,
    `- Command: \`${report.dryRunProcedure.command}\``,
    "",
    "## Apply Guards",
    "",
    ...report.applyProcedure.requiredGuards.map((guard) => `- ${guard}`),
    "",
    `Apply command: \`${report.applyProcedure.command}\``,
    "",
    "## Rollback/Stop",
    "",
    ...report.rollbackStopProcedure.map((step) => `- ${step}`),
    "",
    "## Residual Risk",
    "",
    "- Blocker 2 remains not fully production-fixed until a reviewed production run is actually activated and evidenced.",
    "- Blocker 11 remains partial until production parity and rollback evidence are complete.",
    "",
  ].join("\n");
}

const report = buildReport();
mkdirSync(dirname(markdownPath), { recursive: true });
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(markdownPath, renderMarkdown(report));
console.log(`Wrote ${markdownPath}`);
console.log(`Wrote ${jsonPath}`);
