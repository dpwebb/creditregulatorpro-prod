import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PR_GUARDRAILS_EVIDENCE_MD_PATH = "docs/production-scale/evidence/latest-pr-guardrails.md";
export const PR_GUARDRAILS_EVIDENCE_JSON_PATH = "docs/production-scale/evidence/latest-pr-guardrails.json";
export const PR_WORKFLOW_PATH = ".github/workflows/pr-regression-guardrails.yml";
export const PRODUCTION_WORKFLOW_PATH = ".github/workflows/deploy-production.yml";

export const CRITICAL_PR_GUARDRAIL_COMMANDS = [
  "pnpm run validate:changed",
];

export const HEAVY_PRE_PROMOTION_COMMANDS = [
  "pnpm run validate:release",
];

const MANUAL_UI_COMMAND_PATTERNS = [
  /manual/i,
  /playwright\s+test/i,
  /test:e2e/i,
  /smoke:[^\s]*ui/i,
  /\bbrowser\b/i,
];

function repoPath(rootDir, relativePath) {
  return path.join(rootDir, relativePath);
}

function readText(rootDir, relativePath) {
  return readFileSync(repoPath(rootDir, relativePath), "utf8");
}

function safeGit(args, cwd) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function unique(values) {
  return Array.from(new Set(values));
}

function extractWorkflowName(workflowText) {
  return workflowText.match(/^name:\s*(.+?)\s*$/m)?.[1]?.trim() ?? null;
}

function extractJobKeys(workflowText) {
  const jobsStart = workflowText.search(/^jobs:\s*$/m);
  if (jobsStart < 0) return [];
  return unique(
    workflowText
      .slice(jobsStart)
      .split(/\r?\n/)
      .map((line) => line.match(/^  ([A-Za-z0-9_-]+):\s*$/)?.[1])
      .filter(Boolean),
  );
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

function extractWorkflowCommands(workflowText) {
  return unique(
    String(workflowText ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .map((line) => {
        const inlineRun = line.match(/^run:\s*(pnpm\s+run\s+.+)$/)?.[1];
        if (inlineRun) return inlineRun.trim();
        if (/^pnpm\s+run\s+/.test(line)) return line.trim();
        return null;
      })
      .filter(Boolean),
  );
}

export function parseWorkflowSummary({ workflowText, workflowPath }) {
  return {
    path: workflowPath,
    name: extractWorkflowName(workflowText),
    triggers: {
      pullRequest: /^\s*pull_request:\s*$/m.test(workflowText),
      workflowDispatch: /^\s*workflow_dispatch:\s*$/m.test(workflowText),
      schedule: /^\s*schedule:\s*$/m.test(workflowText),
      push: /^\s*push:\s*$/m.test(workflowText),
    },
    jobs: extractJobKeys(workflowText),
    commands: extractWorkflowCommands(workflowText),
    bashSyntax: bashSyntaxCheckWorkflowRunBlocks(workflowText),
  };
}

function containsAll(values, required) {
  return required.every((command) =>
    values.some((value) => value === command || value.startsWith(`${command} `)),
  );
}

function commandRequiresManualUi(command) {
  return MANUAL_UI_COMMAND_PATTERNS.some((pattern) => pattern.test(command));
}

function check(name, passed, details = {}) {
  return {
    name,
    passed,
    status: passed ? "passed" : "failed",
    ...details,
  };
}

export function validatePrGuardrails({ prWorkflowText, productionWorkflowText }) {
  const prWorkflow = parseWorkflowSummary({
    workflowText: prWorkflowText,
    workflowPath: PR_WORKFLOW_PATH,
  });
  const productionWorkflow = parseWorkflowSummary({
    workflowText: productionWorkflowText,
    workflowPath: PRODUCTION_WORKFLOW_PATH,
  });
  const guardrailCommands = [
    ...CRITICAL_PR_GUARDRAIL_COMMANDS,
    ...HEAVY_PRE_PROMOTION_COMMANDS,
  ];
  const checks = [
    check("pr workflow parsed", Boolean(prWorkflow.name) && prWorkflow.jobs.length > 0, {
      workflowName: prWorkflow.name,
      jobs: prWorkflow.jobs,
    }),
    check("production workflow parsed", Boolean(productionWorkflow.name) && productionWorkflow.jobs.length > 0, {
      workflowName: productionWorkflow.name,
      jobs: productionWorkflow.jobs,
    }),
    check("changed-area validation tier preserved", prWorkflow.jobs.includes("changed-validation") && containsAll(prWorkflow.commands, ["pnpm run validate:changed"])),
    check(
      "compliance-critical PR guardrail commands present",
      prWorkflow.jobs.includes("changed-validation") && containsAll(prWorkflow.commands, CRITICAL_PR_GUARDRAIL_COMMANDS),
      {
        requiredCommands: CRITICAL_PR_GUARDRAIL_COMMANDS,
        presentCommands: prWorkflow.commands,
      },
    ),
    check(
      "heavy checks are scheduled or manually dispatchable",
      prWorkflow.triggers.workflowDispatch === true &&
        prWorkflow.triggers.schedule === true &&
        prWorkflow.jobs.includes("pre-promotion-automated") &&
        containsAll(prWorkflow.commands, HEAVY_PRE_PROMOTION_COMMANDS),
      {
        requiredCommands: HEAVY_PRE_PROMOTION_COMMANDS,
        triggers: prWorkflow.triggers,
      },
    ),
    check(
      "production promotion workflow includes heavier checks",
      containsAll(productionWorkflow.commands, HEAVY_PRE_PROMOTION_COMMANDS),
      {
        requiredCommands: HEAVY_PRE_PROMOTION_COMMANDS,
        presentCommands: productionWorkflow.commands,
      },
    ),
    check(
      "guardrail commands require no manual UI interaction",
      guardrailCommands.every((command) => !commandRequiresManualUi(command)),
      {
        checkedCommands: guardrailCommands,
      },
    ),
    check("PR workflow run blocks pass bash syntax", prWorkflow.bashSyntax.status === "passed", {
      blockCount: prWorkflow.bashSyntax.blockCount,
      failed: prWorkflow.bashSyntax.failed,
    }),
    check("production workflow run blocks pass bash syntax", productionWorkflow.bashSyntax.status === "passed", {
      blockCount: productionWorkflow.bashSyntax.blockCount,
      failed: productionWorkflow.bashSyntax.failed,
    }),
  ];
  const failedChecks = checks.filter((item) => !item.passed);
  return {
    status: failedChecks.length === 0 ? "passed" : "failed",
    checks,
    failedChecks,
    prWorkflow,
    productionWorkflow,
  };
}

export function buildPrGuardrailsEvidence({
  rootDir = process.cwd(),
  generatedAt = new Date().toISOString(),
} = {}) {
  const prWorkflowText = readText(rootDir, PR_WORKFLOW_PATH);
  const productionWorkflowText = readText(rootDir, PRODUCTION_WORKFLOW_PATH);
  const validation = validatePrGuardrails({ prWorkflowText, productionWorkflowText });
  const currentHead = safeGit(["rev-parse", "HEAD"], rootDir);
  const certifying = validation.status === "passed";

  return {
    reportName: "pr-regression-guardrails-evidence",
    generatedAt,
    currentHead,
    targetEnvironment: "pull-request",
    status: validation.status,
    certifying,
    CERTIFYING: certifying,
    workflows: [
      validation.prWorkflow,
      validation.productionWorkflow,
    ],
    fastGoldenPathCommand: "pnpm run validate:changed",
    criticalPrGuardrailCommands: CRITICAL_PR_GUARDRAIL_COMMANDS,
    heavyPrePromotionCommands: HEAVY_PRE_PROMOTION_COMMANDS,
    noManualUiInteractionRequired: validation.checks.find((item) => item.name === "guardrail commands require no manual UI interaction")?.passed === true,
    validation,
  };
}

export function renderPrGuardrailsMarkdown(report) {
  const lines = [
    "# PR Regression Guardrails Evidence",
    "",
    `Generated at: ${report.generatedAt}`,
    `Current HEAD: \`${report.currentHead ?? "unknown"}\``,
    `Target environment: \`${report.targetEnvironment}\``,
    `Status: ${report.status}`,
    `CERTIFYING:${report.CERTIFYING ? "true" : "false"}`,
    "",
    "## Workflow Names",
    "",
    ...report.workflows.map((workflow) => `- ${workflow.path}: ${workflow.name}`),
    "",
    "## Fast Guardrail",
    "",
    `- \`${report.fastGoldenPathCommand}\``,
    "",
    "## Compliance-Critical PR Guardrail",
    "",
    ...report.criticalPrGuardrailCommands.map((command) => `- \`${command}\``),
    "",
    "## Heavier Automated Pre-Promotion Checks",
    "",
    ...report.heavyPrePromotionCommands.map((command) => `- \`${command}\``),
    "",
    "## Validation",
    "",
    ...report.validation.checks.map((item) => `- ${item.name}: ${item.status}`),
  ];
  return `${lines.join("\n")}\n`;
}

function writeOutputs(report, rootDir) {
  mkdirSync(path.dirname(repoPath(rootDir, PR_GUARDRAILS_EVIDENCE_MD_PATH)), { recursive: true });
  writeFileSync(repoPath(rootDir, PR_GUARDRAILS_EVIDENCE_JSON_PATH), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(repoPath(rootDir, PR_GUARDRAILS_EVIDENCE_MD_PATH), renderPrGuardrailsMarkdown(report), "utf8");
}

function main() {
  const rootDir = process.cwd();
  const report = buildPrGuardrailsEvidence({ rootDir });
  writeOutputs(report, rootDir);
  console.log("PR guardrails evidence generated.");
  console.log(`Markdown: ${PR_GUARDRAILS_EVIDENCE_MD_PATH}`);
  console.log(`JSON: ${PR_GUARDRAILS_EVIDENCE_JSON_PATH}`);
  console.log(`CERTIFYING:${report.CERTIFYING ? "true" : "false"}`);
  if (report.status !== "passed") {
    console.error(report.validation.failedChecks.map((item) => `- ${item.name}`).join("\n"));
    process.exitCode = 1;
  }
}

if (process.argv[1] && existsSync(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
