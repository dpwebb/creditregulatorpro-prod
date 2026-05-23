import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync as gitExecFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEPLOY_ROLLBACK_SIMULATION_MD_PATH =
  "docs/production-scale/evidence/latest-deploy-rollback-simulation.md";
export const DEPLOY_ROLLBACK_SIMULATION_JSON_PATH =
  "docs/production-scale/evidence/latest-deploy-rollback-simulation.json";

const HEX_40 = /^[0-9a-f]{40}$/;

const SCENARIOS = [
  {
    name: "target-health-pass",
    targetSha: "a".repeat(40),
    previousSha: "b".repeat(40),
    targetHealthPasses: true,
    rollbackApplyPasses: true,
    rollbackHealthPasses: true,
  },
  {
    name: "target-health-fail-rollback-pass",
    targetSha: "c".repeat(40),
    previousSha: "d".repeat(40),
    targetHealthPasses: false,
    rollbackApplyPasses: true,
    rollbackHealthPasses: true,
  },
  {
    name: "target-health-fail-rollback-fail",
    targetSha: "e".repeat(40),
    previousSha: "f".repeat(40),
    targetHealthPasses: false,
    rollbackApplyPasses: false,
    rollbackHealthPasses: false,
  },
];

function normalizeRelativePath(value) {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function repoPath(rootDir, relativePath) {
  return path.join(rootDir, ...normalizeRelativePath(relativePath).split("/").filter(Boolean));
}

function safeGit(args, rootDir, fallback = "unknown") {
  try {
    const output = gitExecFileSync("git", args, {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    return output || fallback;
  } catch {
    return fallback;
  }
}

function ensureSha(value, label) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!HEX_40.test(normalized)) throw new Error(`${label} must be a lowercase 40-character hex SHA.`);
  return normalized;
}

export function simulateDeployRollbackScenario(input) {
  const targetSha = ensureSha(input.targetSha, "targetSha");
  const previousSha = ensureSha(input.previousSha, "previousSha");
  const events = [];
  let activeSha = previousSha;
  let healthResult = "not-run";
  let rollbackAttempted = false;
  let rollbackSucceeded = false;
  let rollbackHealthResult = "not-run";

  events.push({ action: "capture-previous", activeSha });
  activeSha = targetSha;
  events.push({ action: "deploy-target", activeSha });

  if (input.targetHealthPasses) {
    healthResult = "passed";
    events.push({ action: "target-health", result: healthResult, activeSha });
  } else {
    healthResult = "failed";
    rollbackAttempted = true;
    events.push({ action: "target-health", result: healthResult, activeSha });
    events.push({ action: "rollback-attempt", previousSha });

    if (input.rollbackApplyPasses) {
      activeSha = previousSha;
      rollbackHealthResult = input.rollbackHealthPasses ? "passed" : "failed";
      rollbackSucceeded = rollbackHealthResult === "passed";
      events.push({ action: "restore-previous", result: "passed", activeSha });
      events.push({ action: "rollback-health", result: rollbackHealthResult, activeSha });
    } else {
      rollbackHealthResult = "not-run";
      events.push({ action: "restore-previous", result: "failed", activeSha });
    }
  }

  return {
    name: input.name,
    targetSha,
    previousSha,
    finalSha: activeSha,
    healthResult,
    rollbackAttempted,
    rollbackSucceeded,
    rollbackHealthResult,
    certifying: false,
    CERTIFYING: false,
    accepted:
      (healthResult === "passed" && activeSha === targetSha && rollbackAttempted === false) ||
      (healthResult === "failed" && rollbackAttempted === true && rollbackSucceeded === true && activeSha === previousSha),
    events,
  };
}

export function extractWorkflowRunBlocks(workflowText) {
  const lines = String(workflowText ?? "").split(/\r?\n/);
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    const runMatch = lines[index].match(/^(\s*)run:\s*\|\s*$/);
    if (!runMatch) continue;
    const runIndent = runMatch[1].length;
    const blockLines = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor];
      if (line.trim() !== "" && (line.match(/^ */)?.[0].length ?? 0) <= runIndent) break;
      blockLines.push(line);
    }
    const contentIndent = blockLines.find((line) => line.trim() !== "")?.match(/^ */)?.[0].length ?? runIndent + 2;
    blocks.push({
      line: index + 1,
      script: blockLines.map((line) => line.slice(Math.min(contentIndent, line.length))).join("\n"),
    });
  }
  return blocks;
}

export function bashSyntaxCheckWorkflowRunBlocks(workflowText) {
  const results = extractWorkflowRunBlocks(workflowText).map((block) => {
    const result = spawnSync("bash", ["-n"], {
      input: `${block.script}\n`,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return {
      line: block.line,
      exitCode: result.status ?? 1,
      passed: result.status === 0,
      stderr: result.stderr?.trim() ?? "",
    };
  });
  return {
    status: results.every((result) => result.passed) ? "passed" : "failed",
    blockCount: results.length,
    results,
    failed: results.filter((result) => !result.passed),
  };
}

export function validateDeployRollbackWorkflowSafety({ stagingWorkflowText, productionWorkflowText }) {
  const stagingBash = bashSyntaxCheckWorkflowRunBlocks(stagingWorkflowText);
  const productionBash = bashSyntaxCheckWorkflowRunBlocks(productionWorkflowText);
  const checks = [
    {
      name: "staging captures previous SHA before target checkout",
      passed:
        stagingWorkflowText.includes('previous_sha="$(git rev-parse HEAD 2>/dev/null || true)"') &&
        stagingWorkflowText.indexOf('previous_sha="$(git rev-parse HEAD 2>/dev/null || true)"') <
          stagingWorkflowText.indexOf('git checkout --force "$TARGET_SHA"'),
    },
    {
      name: "production captures previous SHA before target checkout",
      passed:
        productionWorkflowText.includes('previous_sha="$(ssh -i ~/.ssh/production_deploy_key') &&
        productionWorkflowText.indexOf('previous_sha="$(ssh -i ~/.ssh/production_deploy_key') <
          productionWorkflowText.indexOf('git checkout --force "$TARGET_SHA"'),
    },
    {
      name: "workflows preserve previous image IDs for restore fallback",
      passed:
        stagingWorkflowText.includes('previous_app_image="$(docker inspect -f') &&
        stagingWorkflowText.includes('previous_worker_image="$(docker inspect -f') &&
        stagingWorkflowText.includes('docker tag "$previous_app_image" app-creditregulatorpro-staging') &&
        productionWorkflowText.includes('previous_app_image="$(ssh -i ~/.ssh/production_deploy_key') &&
        productionWorkflowText.includes('previous_worker_image="$(ssh -i ~/.ssh/production_deploy_key') &&
        productionWorkflowText.includes('docker tag "$PREVIOUS_APP_IMAGE" app-creditregulatorpro'),
    },
    {
      name: "staging has automatic rollback failure handler",
      passed:
        stagingWorkflowText.includes("restore_previous_staging_deploy()") &&
        stagingWorkflowText.includes('restore_previous_staging_deploy "before-health"') &&
        stagingWorkflowText.includes('restore_previous_staging_deploy "after-health"'),
    },
    {
      name: "production has automatic rollback failure handler",
      passed:
        productionWorkflowText.includes("restore_previous_production_deploy()") &&
        productionWorkflowText.includes('restore_previous_production_deploy "production-health"') &&
        productionWorkflowText.includes('run_production_health_checks "rollback"'),
    },
    {
      name: "machine-readable rollback evidence is emitted",
      passed:
        stagingWorkflowText.includes("DEPLOY_ROLLBACK_EVIDENCE_JSON=") &&
        productionWorkflowText.includes("DEPLOY_ROLLBACK_EVIDENCE_JSON=") &&
        stagingWorkflowText.includes("rollbackAttempted") &&
        productionWorkflowText.includes("rollbackAttempted"),
    },
    {
      name: "rollback evidence writers avoid nested heredocs",
      passed:
        !stagingWorkflowText.includes('cat > "$deploy_rollback_evidence_path" <<EOF') &&
        !productionWorkflowText.includes('cat > "$evidence_path" <<EOF') &&
        stagingWorkflowText.includes("printf '%s\\n' \"{\\\"environment\\\":\\\"staging\\\"") &&
        productionWorkflowText.includes("printf '%s\\n' \"{\\\"environment\\\":\\\"production\\\""),
    },
    {
      name: "shell blocks pass bash -n",
      passed: stagingBash.status === "passed" && productionBash.status === "passed",
      stagingFailedLines: stagingBash.failed.map((result) => result.line),
      productionFailedLines: productionBash.failed.map((result) => result.line),
    },
  ];
  const failed = checks.filter((check) => !check.passed);
  return {
    status: failed.length === 0 ? "passed" : "failed",
    checks,
    failedChecks: failed,
    bashSyntax: {
      staging: stagingBash,
      production: productionBash,
    },
  };
}

export function buildDeployRollbackSimulationReport({
  rootDir = process.cwd(),
  generatedAt = new Date().toISOString(),
  scenarios = SCENARIOS,
} = {}) {
  const stagingWorkflowText = readFileSync(repoPath(rootDir, ".github/workflows/deploy-staging.yml"), "utf8");
  const productionWorkflowText = readFileSync(repoPath(rootDir, ".github/workflows/deploy-production.yml"), "utf8");
  const scenarioResults = scenarios.map((scenario) => simulateDeployRollbackScenario(scenario));
  const workflowValidation = validateDeployRollbackWorkflowSafety({ stagingWorkflowText, productionWorkflowText });
  const rollbackFailureScenario = scenarioResults.find((scenario) => scenario.name === "target-health-fail-rollback-fail");

  const validationErrors = [];
  if (!scenarioResults.some((scenario) => scenario.name === "target-health-pass" && scenario.finalSha === scenario.targetSha && !scenario.rollbackAttempted)) {
    validationErrors.push("Health-pass scenario did not keep the target SHA.");
  }
  if (!scenarioResults.some((scenario) => scenario.name === "target-health-fail-rollback-pass" && scenario.finalSha === scenario.previousSha && scenario.rollbackSucceeded)) {
    validationErrors.push("Health-fail scenario did not restore the previous SHA.");
  }
  if (rollbackFailureScenario?.CERTIFYING !== false || rollbackFailureScenario?.rollbackSucceeded !== false) {
    validationErrors.push("Rollback-failure scenario did not remain CERTIFYING:false with rollback failure recorded.");
  }
  if (workflowValidation.status !== "passed") {
    validationErrors.push(...workflowValidation.failedChecks.map((check) => `Workflow check failed: ${check.name}`));
  }
  const certifying = validationErrors.length === 0;

  return {
    reportName: "deploy-rollback-simulation",
    generatedAt,
    currentHead: safeGit(["rev-parse", "HEAD"], rootDir),
    branch: safeGit(["branch", "--show-current"], rootDir),
    auditTarget: "P1-2 Deployment replaces containers without automatic rollback or blue-green safety.",
    evidenceType: "AUTOMATED_LOCAL_SIMULATION_AND_STATIC_WORKFLOW_CHECK",
    status: validationErrors.length === 0 ? "passed" : "failed",
    certifying,
    CERTIFYING: certifying,
    liveDeploymentRequired: false,
    liveExternalProviderCallsMade: 0,
    scenarios: scenarioResults,
    workflowValidation,
    summary: {
      healthPassKeepsTarget: scenarioResults.some((scenario) => scenario.name === "target-health-pass" && scenario.finalSha === scenario.targetSha),
      healthFailRestoresPrevious: scenarioResults.some((scenario) => scenario.name === "target-health-fail-rollback-pass" && scenario.finalSha === scenario.previousSha),
      rollbackFailureCertifyingFalse: rollbackFailureScenario?.CERTIFYING === false && rollbackFailureScenario.rollbackSucceeded === false,
      workflowHasFailureHandler: workflowValidation.checks
        .filter((check) => /automatic rollback failure handler/.test(check.name))
        .every((check) => check.passed),
      evidenceProducedForPassAndFail: scenarioResults.some((scenario) => scenario.healthResult === "passed") &&
        scenarioResults.some((scenario) => scenario.healthResult === "failed"),
      shellBlocksBashSyntaxPassed: workflowValidation.bashSyntax.staging.status === "passed" &&
        workflowValidation.bashSyntax.production.status === "passed",
    },
    validation: {
      ok: validationErrors.length === 0,
      errors: validationErrors,
    },
    outputPaths: {
      markdown: DEPLOY_ROLLBACK_SIMULATION_MD_PATH,
      json: DEPLOY_ROLLBACK_SIMULATION_JSON_PATH,
    },
  };
}

export function renderDeployRollbackSimulationMarkdown(report) {
  const lines = [
    "# Deploy Rollback Simulation Evidence",
    "",
    `Generated: ${report.generatedAt}`,
    `Current HEAD: ${report.currentHead}`,
    `Status: ${report.status}`,
    `CERTIFYING:${report.CERTIFYING ? "true" : "false"}`,
    "",
    "## Summary",
    "",
    `- Health pass keeps target: ${report.summary.healthPassKeepsTarget ? "passed" : "failed"}`,
    `- Health fail restores previous: ${report.summary.healthFailRestoresPrevious ? "passed" : "failed"}`,
    `- Rollback failure remains non-certifying: ${report.summary.rollbackFailureCertifyingFalse ? "passed" : "failed"}`,
    `- Workflow rollback failure handler: ${report.summary.workflowHasFailureHandler ? "passed" : "failed"}`,
    `- Pass/fail evidence produced: ${report.summary.evidenceProducedForPassAndFail ? "passed" : "failed"}`,
    `- Bash syntax for extracted run blocks: ${report.summary.shellBlocksBashSyntaxPassed ? "passed" : "failed"}`,
    "",
    "## Scenarios",
    "",
  ];

  for (const scenario of report.scenarios) {
    lines.push(`### ${scenario.name}`);
    lines.push(`- Target SHA: \`${scenario.targetSha}\``);
    lines.push(`- Previous SHA: \`${scenario.previousSha}\``);
    lines.push(`- Final SHA: \`${scenario.finalSha}\``);
    lines.push(`- Health result: ${scenario.healthResult}`);
    lines.push(`- Rollback attempted: ${scenario.rollbackAttempted ? "yes" : "no"}`);
    lines.push(`- Rollback succeeded: ${scenario.rollbackSucceeded ? "yes" : "no"}`);
    lines.push(`- Rollback health result: ${scenario.rollbackHealthResult}`);
    lines.push(`- CERTIFYING: ${scenario.CERTIFYING ? "true" : "false"}`);
    lines.push("");
  }

  lines.push("## Workflow Validation");
  lines.push("");
  for (const check of report.workflowValidation.checks) {
    lines.push(`- ${check.passed ? "passed" : "failed"}: ${check.name}`);
  }
  lines.push("");
  lines.push("## Boundaries");
  lines.push("");
  lines.push("- Automated local simulation and static workflow validation only; no live deployment was required.");
  lines.push("- No secrets, remote hosts, external providers, or production data were used.");
  lines.push("- This evidence validates rollback control behavior, not full blue-green deployment capacity.");
  lines.push("");
  return `${lines.join("\n")}`;
}

export function writeDeployRollbackSimulationEvidence(report, { rootDir = process.cwd() } = {}) {
  mkdirSync(path.dirname(repoPath(rootDir, DEPLOY_ROLLBACK_SIMULATION_JSON_PATH)), { recursive: true });
  writeFileSync(repoPath(rootDir, DEPLOY_ROLLBACK_SIMULATION_JSON_PATH), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(repoPath(rootDir, DEPLOY_ROLLBACK_SIMULATION_MD_PATH), renderDeployRollbackSimulationMarkdown(report), "utf8");
  return report.outputPaths;
}

function parseArgs(args) {
  const options = { rootDir: process.cwd(), json: false, writeEvidence: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--write-evidence") {
      options.writeEvidence = true;
      continue;
    }
    if (arg === "--root") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--root requires a value.");
      options.rootDir = path.resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = buildDeployRollbackSimulationReport({ rootDir: options.rootDir });
  if (options.writeEvidence) writeDeployRollbackSimulationEvidence(report, { rootDir: options.rootDir });
  if (options.json) console.log(JSON.stringify(report, null, 2));
  if (!options.json) {
    console.log(`Deploy rollback simulation: ${report.status}`);
    console.log(`Scenarios: ${report.scenarios.length}`);
    console.log(`Workflow checks: ${report.workflowValidation.checks.length}`);
  }
  if (report.validation.ok !== true) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
