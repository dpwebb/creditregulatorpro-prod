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

export const BETA_LIVE_REQUIRED_TOP_LEVEL_FIELDS = [
  "generatedAt",
  "commit",
  "safeForBetaLive",
  "decision",
  "humanInteractionRequired",
  "productionMutationDuringCertification",
  "coreUserPath",
  "safetyGates",
  "supportingEvidence",
  "blockers",
  "warnings",
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

const REQUIRED_CORE_USER_PATH_KEYS = Object.freeze(Object.keys(CORE_USER_PATH));
const REQUIRED_SAFETY_GATE_KEYS = Object.freeze([...Object.keys(SAFETY_GATES), "noProductionMutationInSimulation"]);

const SUPPORTING_EVIDENCE = {
  rawReportProof: {
    artifact: "docs/production-scale/evidence/latest-storage-raw-report-machine-proof.json",
    requiredForFinalDecision: false,
  },
  alertingProof: {
    artifact: "docs/production-scale/evidence/latest-alerting-machine-proof.json",
    requiredForFinalDecision: false,
  },
  rollbackSimulation: {
    artifact: "docs/production-scale/evidence/latest-deploy-rollback-simulation.json",
    requiredForFinalDecision: false,
  },
  certificationHarness: {
    artifact: "docs/production-scale/evidence/latest-production-scale-certification.json",
    requiredForFinalDecision: false,
  },
  legacyMachineProofs: {
    artifact: "docs/production-scale/evidence/latest-machine-proof-summary.json",
    requiredForFinalDecision: false,
  },
  legacyPromotionPack: {
    artifact: "docs/production-scale/evidence/latest-production-promotion-pack.json",
    requiredForFinalDecision: false,
  },
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

function isStrictCommitHash(value) {
  return /^[a-f0-9]{40}$/i.test(String(value ?? ""));
}

function commandDefinitionById(commandPlan = BETA_LIVE_COMMANDS) {
  return new Map(commandPlan.map((entry) => [entry.id, entry]));
}

function normalizeCommandOutcome(outcome, commandPlan = BETA_LIVE_COMMANDS) {
  const definitions = commandDefinitionById(commandPlan);
  const safeOutcome = outcome && typeof outcome === "object" ? outcome : {};
  const definition = definitions.get(safeOutcome.id) ?? {};
  return {
    id: safeOutcome.id ?? "unknown",
    label: safeOutcome.label ?? definition.label ?? safeOutcome.id ?? "unknown",
    command: safeOutcome.command ?? definition.command ?? "unknown",
    exitCode: Number.isInteger(safeOutcome.exitCode) ? safeOutcome.exitCode : 1,
    result: safeOutcome.result ?? (safeOutcome.exitCode === 0 ? "pass" : "fail"),
    startedAt: safeOutcome.startedAt ?? null,
    completedAt: safeOutcome.completedAt ?? null,
    durationMs: Number.isFinite(Number(safeOutcome.durationMs)) ? Number(safeOutcome.durationMs) : null,
    stdin: safeOutcome.stdin ?? "ignore",
    stdoutCaptured: safeOutcome.stdoutCaptured === true,
    stderrCaptured: safeOutcome.stderrCaptured === true,
    rawOutputStored: false,
    rawOutputPrinted: false,
    productionMutationDuringCertification:
      safeOutcome.productionMutationDuringCertification === true ||
      safeOutcome.productionDataMutated === true ||
      safeOutcome.productionMutationOccurred === true,
  };
}

function commandPassed(outcomesById, commandId) {
  const outcome = outcomesById.get(commandId);
  return outcome?.exitCode === 0 && outcome.result === "pass";
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

function readSupportingEvidence(rootDir, descriptor) {
  const artifact = typeof descriptor === "string" ? descriptor : descriptor.artifact;
  const requiredForFinalDecision = descriptor.requiredForFinalDecision === true;
  const normalized = normalizeRelativePath(artifact);
  const fullPath = repoPath(rootDir, normalized);
  if (!existsSync(fullPath)) {
    return {
      pass: null,
      artifact: normalized,
      status: "missing",
      supportingOnly: true,
      requiredForFinalDecision,
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
      requiredForFinalDecision,
    };
  } catch {
    return {
      pass: false,
      artifact: normalized,
      status: "unreadable-json",
      supportingOnly: true,
      requiredForFinalDecision,
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

function blockersForRequiredSupportingEvidence(supportingEvidence) {
  return Object.entries(supportingEvidence)
    .filter(([, value]) => value.requiredForFinalDecision === true && value.pass !== true)
    .map(([key, value]) => ({
      code: `supportingEvidence.${key}`,
      severity: "fatal",
      message: `${key} is required for the beta-live decision and is not passing.`,
      artifact: value.artifact,
      status: value.status,
    }));
}

function blockersForRequiredShape({ generatedAt, commit, coreUserPath, safetyGates }) {
  const blockers = [];
  if (typeof generatedAt !== "string" || generatedAt.trim().length === 0) {
    blockers.push({
      code: "schema.generatedAt",
      severity: "fatal",
      message: "Beta-live certification requires a generatedAt timestamp.",
    });
  }
  if (!isStrictCommitHash(commit)) {
    blockers.push({
      code: "schema.commit",
      severity: "fatal",
      message: "Beta-live certification requires a detected 40-character git commit hash.",
    });
  }
  for (const key of REQUIRED_CORE_USER_PATH_KEYS) {
    const check = coreUserPath[key];
    if (!check || typeof check.pass !== "boolean" || !Array.isArray(check.evidence)) {
      blockers.push({
        code: `schema.coreUserPath.${key}`,
        severity: "fatal",
        message: `Required core user path check ${key} is missing or malformed.`,
      });
    }
  }
  for (const key of REQUIRED_SAFETY_GATE_KEYS) {
    const check = safetyGates[key];
    if (!check || typeof check.pass !== "boolean" || !Array.isArray(check.evidence)) {
      blockers.push({
        code: `schema.safetyGates.${key}`,
        severity: "fatal",
        message: `Required safety gate ${key} is missing or malformed.`,
      });
    }
  }
  return blockers;
}

export function validateBetaLiveCertificationReportSchema(report) {
  const errors = [];
  for (const field of BETA_LIVE_REQUIRED_TOP_LEVEL_FIELDS) {
    if (report?.[field] === undefined || report?.[field] === null) {
      errors.push(`Missing required top-level field: ${field}`);
    }
  }
  if (typeof report?.safeForBetaLive !== "boolean") errors.push("safeForBetaLive must be boolean.");
  if (!["SAFE_FOR_BETA_LIVE=true", "SAFE_FOR_BETA_LIVE=false"].includes(report?.decision)) {
    errors.push("decision must be SAFE_FOR_BETA_LIVE=true or SAFE_FOR_BETA_LIVE=false.");
  }
  if (report?.decision !== `SAFE_FOR_BETA_LIVE=${report?.safeForBetaLive ? "true" : "false"}`) {
    errors.push("decision must match safeForBetaLive.");
  }
  if (report?.humanInteractionRequired !== false && report?.safeForBetaLive === true) {
    errors.push("safe certification cannot require human interaction.");
  }
  if (report?.productionMutationDuringCertification !== false && report?.safeForBetaLive === true) {
    errors.push("safe certification cannot mutate production.");
  }
  for (const key of REQUIRED_CORE_USER_PATH_KEYS) {
    if (typeof report?.coreUserPath?.[key]?.pass !== "boolean" || !Array.isArray(report?.coreUserPath?.[key]?.evidence)) {
      errors.push(`coreUserPath.${key} must include pass and evidence.`);
    }
  }
  for (const key of REQUIRED_SAFETY_GATE_KEYS) {
    if (typeof report?.safetyGates?.[key]?.pass !== "boolean" || !Array.isArray(report?.safetyGates?.[key]?.evidence)) {
      errors.push(`safetyGates.${key} must include pass and evidence.`);
    }
  }
  if (!Array.isArray(report?.blockers)) errors.push("blockers must be an array.");
  if (!Array.isArray(report?.warnings)) errors.push("warnings must be an array.");
  return {
    valid: errors.length === 0,
    errors,
  };
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
  const productionMutationDuringCertification = normalizedOutcomes.some(
    (outcome) => outcome.productionMutationDuringCertification === true,
  );
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
    ...blockersForRequiredShape({ generatedAt, commit, coreUserPath, safetyGates }),
    ...blockersForRequiredSupportingEvidence(supportingEvidence),
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
    "## Final Decision Confirmation",
    "",
    report.decision,
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
        ...env,
        CI: "1",
        CRP_BETA_LIVE_CERTIFICATION: "true",
        CRP_PRODUCTION_MUTATION_ALLOWED: "false",
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
      let outcome;
      try {
        outcome = await runCommand(commandDef, { rootDir, env });
      } catch {
        outcome = {
          id: commandDef.id,
          label: commandDef.label,
          command: commandDef.command,
          exitCode: 1,
          result: "error",
          stdin: "ignore",
          stdoutCaptured: false,
          stderrCaptured: false,
          rawOutputStored: false,
          rawOutputPrinted: false,
        };
      }
      if (!outcome || typeof outcome !== "object") {
        outcome = {
          id: commandDef.id,
          label: commandDef.label,
          command: commandDef.command,
          exitCode: 1,
          result: "invalid-outcome",
          stdin: "ignore",
          stdoutCaptured: false,
          stderrCaptured: false,
          rawOutputStored: false,
          rawOutputPrinted: false,
        };
      }
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
