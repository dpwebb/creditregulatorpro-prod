import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { detectProductionEnvironment } from "./production-scale-evidence.mjs";

export const BETA_LIVE_CERTIFICATION_JSON_PATH =
  "docs/production-scale/evidence/latest-beta-live-certification.json";
export const BETA_LIVE_CERTIFICATION_MD_PATH =
  "docs/production-scale/evidence/latest-beta-live-certification.md";

export const BETA_LIVE_COMMANDS = [
  {
    id: "applicationBuild",
    label: "Application build",
    command: "pnpm run build",
  },
  {
    id: "goldenPath",
    label: "Golden path upload/parse/scan/packet/PDF regression",
    command: "pnpm run test:golden-path",
  },
  {
    id: "packetReadiness",
    label: "Packet readiness, parser certainty, and evidence linkage tests",
    command:
      "pnpm exec vitest run --config vitest.config.ts tests/unit/packet-readiness.spec.ts tests/unit/violation-packet-confidence-gate.spec.ts tests/unit/dispute-packet-evidence-location.spec.ts",
  },
  {
    id: "packetLifecycleApi",
    label: "Packet lifecycle endpoint ownership/readiness/PDF tests",
    command: "pnpm exec vitest run --config vitest.config.ts tests/api/packet-lifecycle-endpoint.spec.ts",
  },
  {
    id: "evidencePrivacyApi",
    label: "Evidence ownership and privacy endpoint tests",
    command: "pnpm exec vitest run --config vitest.config.ts tests/api/evidence-privacy-endpoint.spec.ts",
  },
];

const CORE_USER_PATH = {
  upload: ["applicationBuild", "goldenPath"],
  parse: ["applicationBuild", "goldenPath"],
  scan: ["applicationBuild", "goldenPath"],
  validateReadiness: ["packetReadiness", "packetLifecycleApi"],
  generatePacket: ["applicationBuild", "goldenPath", "packetLifecycleApi"],
  generatePdf: ["applicationBuild", "goldenPath", "packetLifecycleApi"],
};

const SAFETY_GATES = {
  authOwnership: ["packetLifecycleApi", "evidencePrivacyApi"],
  parserCertainty: ["packetReadiness"],
  evidenceAvailability: ["goldenPath", "packetReadiness"],
  packetEligibility: ["packetReadiness", "packetLifecycleApi"],
};

const SUPPORTING_EVIDENCE = {
  rawReportProof: "docs/production-scale/evidence/latest-storage-raw-report-machine-proof.json",
  alertingProof: "docs/production-scale/evidence/latest-alerting-machine-proof.json",
  rollbackSimulation: "docs/production-scale/evidence/latest-deploy-rollback-simulation.json",
  certificationHarness: "docs/production-scale/evidence/latest-production-scale-certification.json",
  legacyMachineProofs: "docs/production-scale/evidence/latest-machine-proof-summary.json",
  legacyPromotionPack: "docs/production-scale/evidence/latest-production-promotion-pack.json",
};

const COMMAND_TIMEOUT_MS = 10 * 60 * 1000;

function repoRootFromScript() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function normalizeRelativePath(value) {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function repoPath(rootDir, relativePath) {
  return path.join(rootDir, ...normalizeRelativePath(relativePath).split("/").filter(Boolean));
}

function safeGit(args, rootDir = process.cwd(), fallback = "unknown") {
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

function commandDefinitionById(commandPlan = BETA_LIVE_COMMANDS) {
  return new Map(commandPlan.map((entry) => [entry.id, entry]));
}

function normalizeCommandOutcome(outcome, commandPlan = BETA_LIVE_COMMANDS) {
  const definitions = commandDefinitionById(commandPlan);
  const definition = definitions.get(outcome.id) ?? {};
  return {
    id: outcome.id,
    label: outcome.label ?? definition.label ?? outcome.id,
    command: outcome.command ?? definition.command ?? "unknown",
    exitCode: Number.isInteger(outcome.exitCode) ? outcome.exitCode : 1,
    result: outcome.result ?? (outcome.exitCode === 0 ? "pass" : "fail"),
    startedAt: outcome.startedAt ?? null,
    completedAt: outcome.completedAt ?? null,
    durationMs: Number.isFinite(Number(outcome.durationMs)) ? Number(outcome.durationMs) : null,
    stdin: outcome.stdin ?? "ignore",
    stdoutCaptured: outcome.stdoutCaptured === true,
    stderrCaptured: outcome.stderrCaptured === true,
    rawOutputStored: false,
    rawOutputPrinted: false,
  };
}

function commandPassed(outcomesById, commandId) {
  return outcomesById.get(commandId)?.exitCode === 0;
}

function commandEvidence(outcomesById, commandIds, extraEvidence = []) {
  return [
    ...commandIds.map((commandId) => {
      const outcome = outcomesById.get(commandId);
      return {
        type: "command",
        id: commandId,
        command: outcome?.command ?? commandDefinitionById().get(commandId)?.command ?? commandId,
        result: outcome?.exitCode === 0 ? "pass" : "fail",
        exitCode: outcome?.exitCode ?? null,
      };
    }),
    ...extraEvidence,
  ];
}

function checkFromCommands(outcomesById, commandIds, extraEvidence = []) {
  const pass = commandIds.every((commandId) => commandPassed(outcomesById, commandId));
  return {
    pass,
    evidence: commandEvidence(outcomesById, commandIds, extraEvidence),
  };
}

function boolFromEvidence(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  if (typeof parsed.safeForBetaLive === "boolean") return parsed.safeForBetaLive;
  if (typeof parsed.CERTIFYING === "boolean") return parsed.CERTIFYING;
  if (typeof parsed.certifying === "boolean") return parsed.certifying;
  if (typeof parsed.allMachineProofsCertifying === "boolean") return parsed.allMachineProofsCertifying;
  if (parsed.status === "pass" || parsed.status === "passed" || parsed.status === "accepted") return true;
  if (parsed.status === "fail" || parsed.status === "failed") return false;
  return null;
}

function readSupportingEvidence(rootDir, artifact) {
  const normalized = normalizeRelativePath(artifact);
  const fullPath = repoPath(rootDir, normalized);
  if (!existsSync(fullPath)) {
    return {
      pass: null,
      artifact: normalized,
      status: "missing",
      supportingOnly: true,
    };
  }
  try {
    const parsed = JSON.parse(readFileSync(fullPath, "utf8"));
    return {
      pass: boolFromEvidence(parsed),
      artifact: normalized,
      status: parsed.status ?? (boolFromEvidence(parsed) === true ? "pass" : "not-certifying"),
      generatedAt: parsed.generatedAt ?? null,
      supportingOnly: true,
    };
  } catch {
    return {
      pass: false,
      artifact: normalized,
      status: "unreadable-json",
      supportingOnly: true,
    };
  }
}

export function collectSupportingEvidence(rootDir = process.cwd()) {
  return Object.fromEntries(
    Object.entries(SUPPORTING_EVIDENCE).map(([key, artifact]) => [key, readSupportingEvidence(rootDir, artifact)]),
  );
}

function blockersForChecks(groupName, checks) {
  return Object.entries(checks)
    .filter(([, value]) => value.pass !== true)
    .map(([key]) => ({
      code: `${groupName}.${key}`,
      severity: "fatal",
      message: `${groupName}.${key} did not pass beta-live certification.`,
    }));
}

function warningsForSupportingEvidence(supportingEvidence) {
  return Object.entries(supportingEvidence)
    .filter(([, value]) => value.pass !== true)
    .map(([key, value]) => ({
      code: `supportingEvidence.${key}`,
      severity: "supporting-only",
      message: `${key} is supporting evidence only and is not a competing beta-live decision surface.`,
      artifact: value.artifact,
      pass: value.pass,
      status: value.status,
    }));
}

export function buildBetaLiveCertificationReport({
  rootDir = process.cwd(),
  generatedAt = new Date().toISOString(),
  commit = safeGit(["rev-parse", "HEAD"], rootDir),
  branch = safeGit(["branch", "--show-current"], rootDir),
  commandOutcomes = [],
  commandPlan = BETA_LIVE_COMMANDS,
  productionEnvironment = detectProductionEnvironment(process.env),
  supportingEvidence = collectSupportingEvidence(rootDir),
} = {}) {
  const normalizedOutcomes = commandOutcomes.map((outcome) => normalizeCommandOutcome(outcome, commandPlan));
  const outcomesById = new Map(normalizedOutcomes.map((outcome) => [outcome.id, outcome]));
  const coreUserPath = Object.fromEntries(
    Object.entries(CORE_USER_PATH).map(([key, commandIds]) => [key, checkFromCommands(outcomesById, commandIds)]),
  );
  const safetyGates = Object.fromEntries(
    Object.entries(SAFETY_GATES).map(([key, commandIds]) => [key, checkFromCommands(outcomesById, commandIds)]),
  );

  const humanInteractionRequired = normalizedOutcomes.some((outcome) => outcome.stdin !== "ignore");
  const productionMutationDuringCertification = false;
  safetyGates.noProductionMutationInSimulation = {
    pass: productionEnvironment.productionLike !== true && productionMutationDuringCertification === false,
    evidence: [
      {
        type: "environment-guard",
        productionLike: productionEnvironment.productionLike === true,
        reason: productionEnvironment.reason || "not production-like",
      },
      {
        type: "command-runner",
        stdin: "ignore",
        productionMutationDuringCertification,
      },
    ],
  };

  const blockers = [
    ...blockersForChecks("coreUserPath", coreUserPath),
    ...blockersForChecks("safetyGates", safetyGates),
  ];
  if (humanInteractionRequired) {
    blockers.push({
      code: "humanInteractionRequired",
      severity: "fatal",
      message: "Beta-live certification must not require human interaction.",
    });
  }
  if (productionMutationDuringCertification) {
    blockers.push({
      code: "productionMutationDuringCertification",
      severity: "fatal",
      message: "Beta-live certification must not mutate production.",
    });
  }

  const safeForBetaLive =
    Object.values(coreUserPath).every((check) => check.pass === true) &&
    Object.values(safetyGates).every((check) => check.pass === true) &&
    humanInteractionRequired === false &&
    productionMutationDuringCertification === false &&
    blockers.length === 0;

  return {
    reportName: "beta-live-certification",
    generatedAt,
    commit,
    branch,
    safeForBetaLive,
    decision: `SAFE_FOR_BETA_LIVE=${safeForBetaLive ? "true" : "false"}`,
    humanInteractionRequired,
    productionMutationDuringCertification,
    coreUserPath,
    safetyGates,
    supportingEvidence,
    blockers,
    warnings: warningsForSupportingEvidence(supportingEvidence),
    commandOutcomes: normalizedOutcomes,
    legacyProofsAreSupportingEvidenceOnly: true,
    authoritativeDecisionArtifact: BETA_LIVE_CERTIFICATION_JSON_PATH,
  };
}

export function renderBetaLiveCertificationMarkdown(report) {
  const lines = [
    "# Beta-Live Certification",
    "",
    `Generated: ${report.generatedAt}`,
    `Commit: \`${report.commit}\``,
    `Branch: \`${report.branch}\``,
    "",
    "## Final Decision",
    "",
    report.decision,
    "",
    `- Safe for beta-live: ${report.safeForBetaLive ? "yes" : "no"}`,
    `- Human interaction required: ${report.humanInteractionRequired ? "yes" : "no"}`,
    `- Production mutation during certification: ${report.productionMutationDuringCertification ? "yes" : "no"}`,
    "",
    "## Core User Path",
    "",
    ...Object.entries(report.coreUserPath).map(([key, check]) => `- ${key}: ${check.pass ? "pass" : "fail"}`),
    "",
    "## Safety Gates",
    "",
    ...Object.entries(report.safetyGates).map(([key, check]) => `- ${key}: ${check.pass ? "pass" : "fail"}`),
    "",
    "## Supporting Evidence",
    "",
    ...Object.entries(report.supportingEvidence).map(([key, value]) =>
      `- ${key}: ${value.pass === null ? "not available" : value.pass ? "pass" : "not certifying"} (${value.artifact})`,
    ),
    "",
    "## Blockers",
    "",
    ...(report.blockers.length
      ? report.blockers.map((blocker) => `- [${blocker.severity}] ${blocker.code}: ${blocker.message}`)
      : ["- None."]),
    "",
    "## Warnings",
    "",
    ...(report.warnings.length
      ? report.warnings.map((warning) => `- ${warning.code}: ${warning.message}`)
      : ["- None."]),
    "",
    "## Control Plane Note",
    "",
    "The core user path and safety gates are the only beta-live decision inputs. Legacy machine proofs, promotion packs, raw-report proofs, alerting proofs, rollback simulations, and production-scale certification reports are retained as supporting evidence only.",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

export function writeBetaLiveCertificationReports(report, rootDir = process.cwd()) {
  const jsonPath = repoPath(rootDir, BETA_LIVE_CERTIFICATION_JSON_PATH);
  const mdPath = repoPath(rootDir, BETA_LIVE_CERTIFICATION_MD_PATH);
  mkdirSync(path.dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(mdPath, renderBetaLiveCertificationMarkdown(report), "utf8");
  return {
    jsonPath: BETA_LIVE_CERTIFICATION_JSON_PATH,
    markdownPath: BETA_LIVE_CERTIFICATION_MD_PATH,
  };
}

export function betaLiveExitCode(report) {
  return report.safeForBetaLive === true ? 0 : 1;
}

export function runCommandWithoutRawOutput(commandDef, {
  rootDir = process.cwd(),
  env = process.env,
  timeoutMs = COMMAND_TIMEOUT_MS,
} = {}) {
  const startedAt = new Date();
  return new Promise((resolve) => {
    let stdoutCaptured = false;
    let stderrCaptured = false;
    let settled = false;
    const child = spawn(commandDef.command, {
      cwd: rootDir,
      shell: true,
      env: {
        ...process.env,
        CI: process.env.CI ?? "1",
        CRP_BETA_LIVE_CERTIFICATION: "true",
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const finish = (exitCode, result = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const completedAt = new Date();
      resolve({
        id: commandDef.id,
        label: commandDef.label,
        command: commandDef.command,
        exitCode,
        result: result ?? (exitCode === 0 ? "pass" : "fail"),
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        stdin: "ignore",
        stdoutCaptured,
        stderrCaptured,
        rawOutputStored: false,
        rawOutputPrinted: false,
      });
    };

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(1, "timeout");
    }, timeoutMs);

    child.stdout?.on("data", () => {
      stdoutCaptured = true;
    });
    child.stderr?.on("data", () => {
      stderrCaptured = true;
    });
    child.on("error", () => finish(1));
    child.on("close", (code) => finish(code ?? 1));
  });
}

export async function runBetaLiveCertification({
  rootDir = process.cwd(),
  env = process.env,
  generatedAt = new Date().toISOString(),
  commandPlan = BETA_LIVE_COMMANDS,
  runCommand = runCommandWithoutRawOutput,
  writeReports = true,
} = {}) {
  const productionEnvironment = detectProductionEnvironment(env);
  const commandOutcomes = [];
  if (!productionEnvironment.productionLike) {
    for (const commandDef of commandPlan) {
      process.stdout.write(`Running ${commandDef.command}\n`);
      const outcome = await runCommand(commandDef, { rootDir, env });
      commandOutcomes.push(outcome);
      process.stdout.write(`${outcome.exitCode === 0 ? "PASS" : "FAIL"} ${commandDef.command}\n`);
    }
  }

  const report = buildBetaLiveCertificationReport({
    rootDir,
    generatedAt,
    commandOutcomes,
    commandPlan,
    productionEnvironment,
    supportingEvidence: collectSupportingEvidence(rootDir),
  });
  const outputs = writeReports ? writeBetaLiveCertificationReports(report, rootDir) : null;
  return { report, outputs };
}

async function main() {
  const rootDir = repoRootFromScript();
  const { report, outputs } = await runBetaLiveCertification({ rootDir, env: process.env });
  if (outputs) {
    console.log(`Beta-live certification Markdown: ${outputs.markdownPath}`);
    console.log(`Beta-live certification JSON: ${outputs.jsonPath}`);
  }
  console.log(report.decision);
  process.exitCode = betaLiveExitCode(report);
}

if (process.argv[1] && existsSync(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[beta-live:certify] ${error instanceof Error ? error.message : String(error)}`);
    console.log("SAFE_FOR_BETA_LIVE=false");
    process.exitCode = 1;
  });
}
