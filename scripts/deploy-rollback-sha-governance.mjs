import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROLLBACK_SHA_GOVERNANCE_MD_PATH =
  "docs/production-scale/evidence/latest-rollback-sha-governance.md";
export const ROLLBACK_SHA_GOVERNANCE_JSON_PATH =
  "docs/production-scale/evidence/latest-rollback-sha-governance.json";

const WORKFLOWS = [
  {
    key: "staging",
    path: ".github/workflows/deploy-staging.yml",
    repository: "dpwebb/creditregulatorpro-staging",
    approvedBranch: "staging",
    remoteMismatchText: "Staging checkout SHA mismatch",
    validationMismatchText: "Staging validation checkout SHA mismatch",
    deployEvidenceText: "Staging deploy evidence: target_sha=${TARGET_SHA}",
    composeFile: "docker-compose.yml",
  },
  {
    key: "production",
    path: ".github/workflows/deploy-production.yml",
    repository: "dpwebb/creditregulatorpro-prod",
    approvedBranch: "main",
    remoteMismatchText: "Production checkout SHA mismatch",
    validationMismatchText: "Production validation checkout SHA mismatch",
    deployEvidenceText: "Production deploy evidence: target_sha=${TARGET_SHA}",
    composeFile: "docker-compose.production.yml",
  },
];

function normalizeRelativePath(value) {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function repoPath(rootDir, relativePath) {
  return path.join(rootDir, ...normalizeRelativePath(relativePath).split("/").filter(Boolean));
}

function readText(rootDir, relativePath) {
  return readFileSync(repoPath(rootDir, relativePath), "utf8");
}

function safeGit(args, rootDir, fallback = "unknown") {
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

function check(name, passed, details = {}) {
  return {
    name,
    status: passed ? "passed" : "failed",
    passed,
    ...details,
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
    let cursor = index + 1;
    for (; cursor < lines.length; cursor += 1) {
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
  const blocks = extractWorkflowRunBlocks(workflowText);
  const results = blocks.map((block) => {
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
    blockCount: blocks.length,
    results,
    failed: results.filter((result) => !result.passed),
  };
}

function validateWorkflow(text, workflow) {
  const resolveIndex = text.indexOf("resolve-target:");
  const checkIndex = text.indexOf("\n  check:");
  const deployIndex = text.indexOf("\n  deploy:");
  const runBlocks = extractWorkflowRunBlocks(text);
  const runText = runBlocks.map((block) => block.script).join("\n");
  const bashSyntax = bashSyntaxCheckWorkflowRunBlocks(text);

  const checks = [
    check(
      "TARGET_SHA is resolved before validation jobs",
      resolveIndex >= 0 &&
        checkIndex > resolveIndex &&
        text.includes("outputs:") &&
        text.includes("target_sha: ${{ steps.target.outputs.sha }}") &&
        text.includes("needs: resolve-target") &&
        text.includes("ref: ${{ needs.resolve-target.outputs.target_sha }}"),
      { resolveIndex, checkIndex },
    ),
    check(
      "rollback_sha is strict 40-hex and passed through env",
      text.includes("ROLLBACK_SHA_INPUT: ${{ github.event_name == 'workflow_dispatch' && inputs.rollback_sha || '' }}") &&
        text.includes("grep -Eq '^[0-9a-fA-F]{40}$'") &&
        text.includes("grep -Eq '^[0-9a-f]{40}$'") &&
        !runText.includes("${{ inputs.rollback_sha") &&
        !runText.includes("github.event.inputs.rollback_sha"),
    ),
    check(
      "TARGET_SHA must be reachable from the approved branch",
      text.includes(`APPROVED_BRANCH: ${workflow.approvedBranch}`) &&
        text.includes("git fetch --force --prune origin \"+refs/heads/${APPROVED_BRANCH}:refs/remotes/origin/${APPROVED_BRANCH}\"") &&
        text.includes('git merge-base --is-ancestor "$target_sha" "origin/${APPROVED_BRANCH}"') &&
        text.includes('git merge-base --is-ancestor "$TARGET_SHA" "origin/${APPROVED_BRANCH}"'),
    ),
    check(
      "validation checkout must equal TARGET_SHA",
      text.includes("Check out target repository") &&
        text.includes("Verify validation checkout target SHA") &&
        text.includes('validation_sha="$(git rev-parse HEAD)"') &&
        text.includes('if [ "$validation_sha" != "$TARGET_SHA" ]; then') &&
        text.includes(workflow.validationMismatchText),
    ),
    check(
      "deploy evidence target SHA must equal deploy target SHA",
      text.includes('evidence_target_sha="$(git rev-parse HEAD)"') &&
        text.includes('if [ "$evidence_target_sha" != "$TARGET_SHA" ]; then') &&
        text.includes("deploy target evidence SHA mismatch") &&
        text.includes(workflow.deployEvidenceText),
    ),
    check(
      "remote checkout verifies HEAD equals TARGET_SHA",
      deployIndex > checkIndex &&
        text.includes('TARGET_SHA="${1:?missing target sha}"') &&
        text.includes('git checkout --force "$TARGET_SHA"') &&
        text.includes('deployed_sha="$(git rev-parse HEAD)"') &&
        text.includes('target_sha="$(git rev-parse "$TARGET_SHA")"') &&
        text.includes('if [ "$deployed_sha" != "$target_sha" ]; then') &&
        text.includes(workflow.remoteMismatchText),
    ),
    check(
      "run shell blocks pass bash -n",
      bashSyntax.status === "passed" && bashSyntax.blockCount > 0,
      {
        blockCount: bashSyntax.blockCount,
        failedLines: bashSyntax.failed.map((result) => result.line),
      },
    ),
  ];

  if (workflow.key === "production") {
    checks.push(
      check(
        "production compose file is passed explicitly",
        !text.includes("cp docker-compose.production.yml docker-compose.yml") &&
          text.includes("docker compose -f docker-compose.production.yml up -d --build creditregulatorpro creditregulatorpro-ingest-worker") &&
          text.includes("compose_file=docker-compose.production.yml"),
      ),
    );
  }

  const failed = checks.filter((item) => !item.passed);
  return {
    workflow: workflow.key,
    path: workflow.path,
    approvedBranch: workflow.approvedBranch,
    status: failed.length === 0 ? "passed" : "failed",
    checks,
    failedChecks: failed,
    bashSyntax,
  };
}

export function buildRollbackShaGovernanceReport({
  rootDir = process.cwd(),
  generatedAt = new Date().toISOString(),
  workflowTexts = null,
} = {}) {
  const workflows = WORKFLOWS.map((workflow) => {
    const text = workflowTexts?.[workflow.key] ?? readText(rootDir, workflow.path);
    return validateWorkflow(text, workflow);
  });
  const failed = workflows.flatMap((workflow) => workflow.failedChecks.map((item) => `${workflow.workflow}: ${item.name}`));
  const status = failed.length === 0 ? "passed" : "failed";

  return {
    reportName: "rollback-sha-governance",
    generatedAt,
    currentHead: safeGit(["rev-parse", "HEAD"], rootDir),
    branch: safeGit(["branch", "--show-current"], rootDir),
    auditTargets: [
      "P1-1 Rollback SHA validation tests the workflow ref, not the rollback target.",
      "P2-2 Remote deployment mutates working tree and staging lacks post-checkout SHA verification.",
    ],
    evidenceType: "AUTOMATED_STATIC_WORKFLOW_CHECK",
    certifying: false,
    CERTIFYING: false,
    status,
    liveDeploymentRequired: false,
    liveExternalProviderCallsMade: 0,
    workflows,
    summary: {
      resolveTargetBeforeValidation: workflows.every((workflow) =>
        workflow.checks.some((item) => item.name === "TARGET_SHA is resolved before validation jobs" && item.passed),
      ),
      strictRollbackShaValidation: workflows.every((workflow) =>
        workflow.checks.some((item) => item.name === "rollback_sha is strict 40-hex and passed through env" && item.passed),
      ),
      approvedBranchReachability: workflows.every((workflow) =>
        workflow.checks.some((item) => item.name === "TARGET_SHA must be reachable from the approved branch" && item.passed),
      ),
      validationCheckoutEqualsTarget: workflows.every((workflow) =>
        workflow.checks.some((item) => item.name === "validation checkout must equal TARGET_SHA" && item.passed),
      ),
      remoteCheckoutEqualsTarget: workflows.every((workflow) =>
        workflow.checks.some((item) => item.name === "remote checkout verifies HEAD equals TARGET_SHA" && item.passed),
      ),
      explicitProductionComposeFile: workflows
        .find((workflow) => workflow.workflow === "production")
        ?.checks.some((item) => item.name === "production compose file is passed explicitly" && item.passed) === true,
      shellBlocksBashSyntaxPassed: workflows.every((workflow) => workflow.bashSyntax.status === "passed"),
    },
    validation: {
      ok: status === "passed",
      errors: failed,
    },
    outputPaths: {
      markdown: ROLLBACK_SHA_GOVERNANCE_MD_PATH,
      json: ROLLBACK_SHA_GOVERNANCE_JSON_PATH,
    },
  };
}

export function renderRollbackShaGovernanceMarkdown(report) {
  const lines = [
    "# Rollback SHA Governance Evidence",
    "",
    `Generated: ${report.generatedAt}`,
    `Current HEAD: ${report.currentHead}`,
    `Status: ${report.status}`,
    "CERTIFYING:false",
    "",
    "## Summary",
    "",
    `- Resolve target before validation: ${report.summary.resolveTargetBeforeValidation ? "passed" : "failed"}`,
    `- Strict rollback SHA validation: ${report.summary.strictRollbackShaValidation ? "passed" : "failed"}`,
    `- Approved branch reachability: ${report.summary.approvedBranchReachability ? "passed" : "failed"}`,
    `- Validation checkout equals target: ${report.summary.validationCheckoutEqualsTarget ? "passed" : "failed"}`,
    `- Remote checkout equals target: ${report.summary.remoteCheckoutEqualsTarget ? "passed" : "failed"}`,
    `- Explicit production compose file: ${report.summary.explicitProductionComposeFile ? "passed" : "failed"}`,
    `- Bash syntax for extracted run blocks: ${report.summary.shellBlocksBashSyntaxPassed ? "passed" : "failed"}`,
    "",
    "## Workflow Checks",
    "",
  ];

  for (const workflow of report.workflows) {
    lines.push(`### ${workflow.workflow}`);
    lines.push(`- Path: \`${workflow.path}\``);
    lines.push(`- Approved branch: \`${workflow.approvedBranch}\``);
    lines.push(`- Status: ${workflow.status}`);
    for (const item of workflow.checks) {
      lines.push(`- ${item.status}: ${item.name}`);
    }
    lines.push("");
  }

  lines.push("## Boundaries");
  lines.push("");
  lines.push("- Static workflow validation only; no live deployment was required.");
  lines.push("- No secrets, remote hosts, or external providers were called.");
  lines.push("- This evidence certifies only the rollback SHA governance controls in the workflows.");
  lines.push("");
  return `${lines.join("\n")}`;
}

export function writeRollbackShaGovernanceEvidence(report, { rootDir = process.cwd() } = {}) {
  mkdirSync(path.dirname(repoPath(rootDir, ROLLBACK_SHA_GOVERNANCE_JSON_PATH)), { recursive: true });
  writeFileSync(repoPath(rootDir, ROLLBACK_SHA_GOVERNANCE_JSON_PATH), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(repoPath(rootDir, ROLLBACK_SHA_GOVERNANCE_MD_PATH), renderRollbackShaGovernanceMarkdown(report), "utf8");
  return report.outputPaths;
}

function parseArgs(args) {
  const options = {
    rootDir: process.cwd(),
    json: false,
    writeEvidence: false,
  };
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
  const report = buildRollbackShaGovernanceReport({ rootDir: options.rootDir });
  if (options.writeEvidence) writeRollbackShaGovernanceEvidence(report, { rootDir: options.rootDir });
  if (options.json) console.log(JSON.stringify(report, null, 2));
  if (!options.json) {
    console.log(`Rollback SHA governance: ${report.status}`);
    console.log(`Shell blocks checked: ${report.workflows.reduce((total, workflow) => total + workflow.bashSyntax.blockCount, 0)}`);
  }
  if (report.validation.ok !== true) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
