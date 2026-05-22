import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildProductionProofPreflightReport,
  PRODUCTION_PROOF_PREFLIGHT_JSON_PATH,
  PRODUCTION_PROOF_PREFLIGHT_MD_PATH,
  writeProductionProofPreflightReport,
} from "./production-proof-preflight.mjs";

export const PRODUCTION_PROOF_REAL_EVIDENCE_JSON_PATH =
  "docs/production-scale/evidence/latest-production-proof-real-evidence.json";
export const PRODUCTION_PROOF_REAL_EVIDENCE_MD_PATH =
  "docs/production-scale/evidence/latest-production-proof-real-evidence.md";

export const REAL_EVIDENCE_COMMANDS = [
  "pnpm run check",
  "pnpm exec vitest run --config vitest.config.ts",
  "pnpm run storage:raw-report-machine-proof",
  "pnpm run storage:raw-report-machine-proof:validate",
  "pnpm run restore:machine-proof",
  "pnpm run restore:machine-proof:validate",
  "pnpm run production-worker:machine-proof",
  "pnpm run production-worker:machine-proof:validate",
  "pnpm run alerts:machine-proof",
  "pnpm run alerts:machine-proof:validate",
  "pnpm run retention:archive-restore-machine-proof",
  "pnpm run retention:archive-restore-machine-proof:validate",
  "pnpm run production:machine-proofs",
  "pnpm run production-scale:certify",
  "pnpm run production-scale:promotion-pack",
];

const PROOF_REPORT_PATHS = [
  "docs/production-scale/evidence/latest-storage-raw-report-machine-proof.json",
  "docs/production-scale/evidence/latest-restore-machine-proof.json",
  "docs/production-scale/evidence/latest-production-worker-machine-proof.json",
  "docs/production-scale/evidence/latest-alerting-machine-proof.json",
  "docs/production-scale/evidence/latest-retention-archive-restore-machine-proof.json",
  "docs/production-scale/evidence/latest-machine-proof-summary.json",
  "docs/production-scale/evidence/latest-production-scale-certification.json",
  "docs/production-scale/evidence/latest-production-promotion-pack.json",
];

const SENSITIVE_OUTPUT_PATTERNS = [
  { code: "database-url", pattern: /postgres(?:ql)?:\/\/[^\s"']+/i },
  { code: "password-assignment", pattern: /(?:password|passwd|pwd)\s*[:=]\s*[^\s"']+/i },
  { code: "secret-assignment", pattern: /(?:secret|token|api[_-]?key)\s*[:=]\s*[^\s"']+/i },
  { code: "webhook-url", pattern: /https:\/\/hooks\.[^\s"']+/i },
  { code: "private-key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/i },
];

function repoRootFromScript() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function readJsonIfPresent(rootDir, relativePath) {
  const absolutePath = path.resolve(rootDir, relativePath);
  if (!existsSync(absolutePath)) return { exists: false, parsed: null };
  try {
    return { exists: true, parsed: JSON.parse(readFileSync(absolutePath, "utf8")) };
  } catch {
    return { exists: true, parsed: null };
  }
}

function detectSensitiveOutput(text) {
  return SENSITIVE_OUTPUT_PATTERNS
    .filter((pattern) => pattern.pattern.test(text))
    .map((pattern) => pattern.code);
}

function commandOutcome(command, exitCode, startedAt, completedAt, stdout, stderr) {
  const sensitiveOutputFindingCodes = [...new Set([
    ...detectSensitiveOutput(stdout),
    ...detectSensitiveOutput(stderr),
  ])];
  return {
    command,
    exitCode,
    result: exitCode === 0 ? "pass" : "fail",
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    stdoutCaptured: stdout.length > 0,
    stderrCaptured: stderr.length > 0,
    rawOutputPrinted: false,
    sensitiveOutputFindingCount: sensitiveOutputFindingCodes.length,
    sensitiveOutputFindingCodes,
  };
}

export function runCommandWithoutPrintingRawOutput(command, {
  rootDir = process.cwd(),
  env = process.env,
} = {}) {
  const startedAt = new Date();
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(command, {
      cwd: rootDir,
      shell: true,
      env: {
        ...process.env,
        CI: process.env.CI ?? "1",
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      stderr += error instanceof Error ? error.message : String(error);
    });
    child.on("close", (code) => {
      resolve(commandOutcome(command, code ?? 1, startedAt, new Date(), stdout, stderr));
    });
  });
}

function nextSafeActionForFailure(command) {
  if (command === "production-proof:preflight") {
    return "Fix the missing or unsafe preflight items, then rerun pnpm run production-proof:preflight.";
  }
  if (command.includes("pnpm run check") || command.includes("vitest")) {
    return "Fix the local build or test failure before attempting real production proof again.";
  }
  if (command.includes("machine-proof")) {
    return "Open the generated proof report for that proof family, replace missing or unsafe real inputs, and rerun preflight.";
  }
  if (command.includes("production:machine-proofs")) {
    return "Open docs/production-scale/evidence/latest-machine-proof-summary.md and resolve the listed proof blocker.";
  }
  if (command.includes("production-scale:certify")) {
    return "Open docs/production-scale/evidence/latest-production-scale-certification.md and resolve failed or stale certification gates.";
  }
  if (command.includes("production-scale:promotion-pack")) {
    return "Open docs/production-scale/evidence/latest-production-promotion-pack.md. Do not run production promotion while the pack is non-certifying.";
  }
  return "Review the failed command report, fix the input or evidence issue, and rerun preflight before retrying.";
}

function collectProofReportStatus(rootDir) {
  return PROOF_REPORT_PATHS.map((reportPath) => {
    const { exists, parsed } = readJsonIfPresent(rootDir, reportPath);
    return {
      path: reportPath,
      exists,
      certifying: parsed?.CERTIFYING === true || parsed?.certifying === true || parsed?.allMachineProofsCertifying === true,
      simulatedOnly: parsed?.simulatedOnly === true ||
        (Array.isArray(parsed?.proofResults) && parsed.proofResults.some((result) => result.simulatedOnly === true)),
      missingRuntimeInputs: [
        ...(Array.isArray(parsed?.missingRuntimeInputs) ? parsed.missingRuntimeInputs : []),
        ...(Array.isArray(parsed?.missingMachineRuntimeInputs) ? parsed.missingMachineRuntimeInputs : []),
      ],
      productionMutation: parsed?.productionMutation ?? null,
      productionMutationOccurred: parsed?.productionMutationOccurred === true ||
        parsed?.productionMutationSummary?.anyProductionMutation === true,
      productionPromotionSafe: parsed?.canPromoteProductionAtScale === true ||
        parsed?.readinessClassification?.canPromoteProductionAtScale === true,
    };
  });
}

function buildRealEvidenceReport({
  generatedAt,
  preflight,
  commandOutcomes,
  stoppedAfterFailure,
  rootDir,
}) {
  const proofReports = collectProofReportStatus(rootDir);
  const failedCommand = commandOutcomes.find((outcome) => outcome.result !== "pass");
  const finalPromotionPack = readJsonIfPresent(rootDir, "docs/production-scale/evidence/latest-production-promotion-pack.json").parsed;
  const finalCertification = readJsonIfPresent(rootDir, "docs/production-scale/evidence/latest-production-scale-certification.json").parsed;
  const simulatedOnlyBlockers = finalPromotionPack?.simulatedProofOnlyChecks ?? [];
  const missingRealInputs = [
    ...new Set([
      ...(preflight?.missingRealInputs ?? []),
      ...proofReports.flatMap((report) => report.missingRuntimeInputs ?? []),
    ]),
  ];
  const productionMutationReports = proofReports.filter((report) => report.productionMutationOccurred);
  const productionPromotionSafe =
    finalCertification?.CERTIFYING === true &&
    finalPromotionPack?.CERTIFYING === true &&
    finalPromotionPack?.canPromoteProductionAtScale === true;

  return {
    reportName: "production-proof-real-evidence",
    generatedAt,
    command: "pnpm run production-proof:real-evidence",
    reportPaths: {
      markdown: PRODUCTION_PROOF_REAL_EVIDENCE_MD_PATH,
      json: PRODUCTION_PROOF_REAL_EVIDENCE_JSON_PATH,
      preflightMarkdown: PRODUCTION_PROOF_PREFLIGHT_MD_PATH,
      preflightJson: PRODUCTION_PROOF_PREFLIGHT_JSON_PATH,
    },
    preflightPassed: preflight?.readyToRunRealEvidence === true,
    realEvidenceComplete:
      preflight?.readyToRunRealEvidence === true &&
      commandOutcomes.length === REAL_EVIDENCE_COMMANDS.length &&
      commandOutcomes.every((outcome) => outcome.result === "pass") &&
      productionPromotionSafe,
    realEvidenceStatus: productionPromotionSafe && !failedCommand ? "complete" : "incomplete",
    stoppedAfterFailure,
    failedCommand: failedCommand?.command ?? null,
    nextSafeHumanAction: failedCommand
      ? nextSafeActionForFailure(failedCommand.command)
      : productionPromotionSafe
        ? "Real evidence is complete. Production promotion is safe only through the approved promotion workflow."
        : "Production promotion remains blocked. Read the certification and promotion pack reports before taking any production action.",
    commandOutcomes,
    exactReportFilePaths: [
      PRODUCTION_PROOF_PREFLIGHT_MD_PATH,
      PRODUCTION_PROOF_PREFLIGHT_JSON_PATH,
      PRODUCTION_PROOF_REAL_EVIDENCE_MD_PATH,
      PRODUCTION_PROOF_REAL_EVIDENCE_JSON_PATH,
      ...PROOF_REPORT_PATHS,
    ],
    proofReports,
    simulatedOnlyBlockersRemaining: simulatedOnlyBlockers,
    missingRealInputs,
    productionMutationStatus: productionMutationReports.length
      ? "production proof reports include bounded synthetic/canary mutation evidence"
      : "none detected by this runner",
    productionMutationOccurred: productionMutationReports.length > 0,
    productionPromotionSafe,
    productionPromotionBlocked: !productionPromotionSafe,
    rawOutputPrinted: false,
    sensitiveOutputFindingCount: commandOutcomes.reduce(
      (total, outcome) => total + Number(outcome.sensitiveOutputFindingCount ?? 0),
      0,
    ),
  };
}

function yesNo(value) {
  return value ? "yes" : "no";
}

function renderCommandOutcomes(outcomes) {
  if (!outcomes.length) return "- None";
  return outcomes
    .map((outcome) => `- \`${outcome.command}\`: ${outcome.result} (exit ${outcome.exitCode})`)
    .join("\n");
}

function renderList(values) {
  return values.length ? values.map((value) => `- ${typeof value === "string" ? value : JSON.stringify(value)}`).join("\n") : "- None";
}

export function renderProductionProofRealEvidenceMarkdown(report) {
  return `${[
    "# Production Proof Real Evidence Run",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Plain English Result",
    "",
    `- Real evidence complete: ${yesNo(report.realEvidenceComplete)}`,
    `- Real evidence status: ${report.realEvidenceStatus}`,
    `- Production mutation occurred: ${yesNo(report.productionMutationOccurred)}`,
    `- Production mutation status: ${report.productionMutationStatus}`,
    `- Production promotion safe: ${yesNo(report.productionPromotionSafe)}`,
    `- Production promotion blocked: ${yesNo(report.productionPromotionBlocked)}`,
    `- Raw command output printed: ${yesNo(report.rawOutputPrinted)}`,
    "",
    "## Report Files",
    "",
    ...report.exactReportFilePaths.map((reportPath) => `- \`${reportPath}\``),
    "",
    "## Command Outcomes",
    "",
    renderCommandOutcomes(report.commandOutcomes),
    "",
    "## Missing Real Inputs",
    "",
    renderList(report.missingRealInputs),
    "",
    "## Simulated-Only Blockers Remaining",
    "",
    renderList(report.simulatedOnlyBlockersRemaining),
    "",
    "## Next Safe Human Action",
    "",
    report.nextSafeHumanAction,
    "",
  ].join("\n")}\n`;
}

export function writeProductionProofRealEvidenceReport(report, rootDir = process.cwd()) {
  const jsonPath = path.resolve(rootDir, PRODUCTION_PROOF_REAL_EVIDENCE_JSON_PATH);
  const markdownPath = path.resolve(rootDir, PRODUCTION_PROOF_REAL_EVIDENCE_MD_PATH);
  mkdirSync(path.dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(markdownPath, renderProductionProofRealEvidenceMarkdown(report), "utf8");
  return {
    jsonPath: PRODUCTION_PROOF_REAL_EVIDENCE_JSON_PATH,
    markdownPath: PRODUCTION_PROOF_REAL_EVIDENCE_MD_PATH,
  };
}

export async function runProductionProofRealEvidence({
  rootDir = process.cwd(),
  env = process.env,
  runCommand = runCommandWithoutPrintingRawOutput,
  generatedAt = new Date().toISOString(),
} = {}) {
  const preflight = buildProductionProofPreflightReport({ rootDir, env, generatedAt });
  writeProductionProofPreflightReport(preflight, rootDir);
  const commandOutcomes = [];
  let stoppedAfterFailure = false;

  if (!preflight.readyToRunRealEvidence) {
    commandOutcomes.push({
      command: "production-proof:preflight",
      exitCode: 1,
      result: "fail",
      startedAt: generatedAt,
      completedAt: generatedAt,
      durationMs: 0,
      stdoutCaptured: false,
      stderrCaptured: false,
      rawOutputPrinted: false,
      sensitiveOutputFindingCount: 0,
      sensitiveOutputFindingCodes: [],
    });
    stoppedAfterFailure = true;
    return buildRealEvidenceReport({ generatedAt, preflight, commandOutcomes, stoppedAfterFailure, rootDir });
  }

  for (const command of REAL_EVIDENCE_COMMANDS) {
    process.stdout.write(`Running ${command}...\n`);
    const outcome = await runCommand(command, { rootDir, env });
    commandOutcomes.push(outcome);
    process.stdout.write(`${outcome.result === "pass" ? "PASS" : "FAIL"} ${command}\n`);
    if (outcome.result !== "pass") {
      stoppedAfterFailure = true;
      break;
    }
  }

  return buildRealEvidenceReport({ generatedAt, preflight, commandOutcomes, stoppedAfterFailure, rootDir });
}

function parseArgs(args) {
  const options = {
    rootDir: repoRootFromScript(),
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
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
  const report = await runProductionProofRealEvidence({
    rootDir: options.rootDir,
    env: process.env,
  });
  const outputs = writeProductionProofRealEvidenceReport(report, options.rootDir);
  console.log(renderProductionProofRealEvidenceMarkdown(report));
  console.log(`Real evidence report written: ${outputs.markdownPath}`);
  console.log(`Real evidence JSON written: ${outputs.jsonPath}`);
  if (!report.realEvidenceComplete) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && existsSync(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[production-proof:real-evidence] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
