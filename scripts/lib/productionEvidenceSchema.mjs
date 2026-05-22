import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { sanitizeProductionEvidenceValue } from "./sanitizeProductionEvidence.mjs";
import { PRODUCTION_MACHINE_PROOF_POLICY_VERSION } from "./productionMachineProofPolicy.mjs";

export const MACHINE_EVIDENCE_SCHEMA_VERSION = 1;

export const PRODUCTION_MUTATION_MODES = new Set([
  "none",
  "synthetic-canary-cleaned-up",
  "approved-bounded",
]);

export const MACHINE_EVIDENCE_STATUSES = new Set(["pass", "limited", "fail"]);

export function normalizeRelativePath(value) {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
}

export function repoPath(rootDir, relativePath) {
  return path.join(rootDir, ...normalizeRelativePath(relativePath).split("/").filter(Boolean));
}

export function safeGit(args, rootDir = process.cwd(), fallback = "unknown") {
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

export function addHoursIso(isoDate, hours) {
  const baseMs = Date.parse(isoDate);
  const numericHours = Number(hours);
  if (!Number.isFinite(baseMs) || !Number.isFinite(numericHours)) return null;
  return new Date(baseMs + numericHours * 60 * 60 * 1000).toISOString();
}

export function buildMachineEvidence({
  evidenceType,
  environment = "production",
  generatedAt = new Date().toISOString(),
  commitHash = null,
  rootDir = process.cwd(),
  blockerId = null,
  branch = null,
  generatorScript,
  command,
  nonInteractive = true,
  machineAttested = true,
  humanInteractionRequired = false,
  humanObserved = false,
  manualApprovalRequired = false,
  productionMutation = "none",
  secretsPrinted = false,
  piiPrinted = false,
  rawReportBytesPrinted = false,
  signedUrlsPrinted = false,
  status = "fail",
  certifying = false,
  freshnessWindowHours = 24,
  checks = [],
  failures = [],
  sanitizedArtifacts = [],
  missingRuntimeInputs = [],
  simulatedOnly = false,
  dryRunOnly = false,
  generatedManually = false,
  policyVersion = PRODUCTION_MACHINE_PROOF_POLICY_VERSION,
  metadata = {},
} = {}) {
  const resolvedCommit = commitHash ?? safeGit(["rev-parse", "HEAD"], rootDir);
  const resolvedBranch = branch ?? safeGit(["branch", "--show-current"], rootDir);
  const resolvedBlockerId = blockerId ?? evidenceType ?? "unknown";
  const normalizedStatus = MACHINE_EVIDENCE_STATUSES.has(String(status)) ? String(status) : "fail";
  const normalizedMutation = PRODUCTION_MUTATION_MODES.has(String(productionMutation))
    ? String(productionMutation)
    : "none";
  const normalizedChecks = Array.isArray(checks) ? checks : [];
  const normalizedFailures = Array.isArray(failures) ? failures : [];
  const normalizedMissingInputs = Array.isArray(missingRuntimeInputs) ? missingRuntimeInputs : [];
  const pass = normalizedStatus === "pass" &&
    certifying === true &&
    normalizedFailures.length === 0 &&
    normalizedMissingInputs.length === 0 &&
    normalizedChecks.length > 0 &&
    normalizedChecks.every((check) => check?.status === "pass");

  return sanitizeProductionEvidenceValue({
    schemaVersion: MACHINE_EVIDENCE_SCHEMA_VERSION,
    evidenceType,
    blockerId: resolvedBlockerId,
    environment,
    generatedAt,
    commitHash: resolvedCommit,
    currentCommitHash: resolvedCommit,
    currentHead: resolvedCommit,
    commit: resolvedCommit,
    branch: resolvedBranch,
    generatorScript,
    command,
    nonInteractive,
    machineAttested,
    humanInteractionRequired,
    humanObserved,
    manualApprovalRequired,
    generatedManually,
    simulatedOnly,
    dryRunOnly,
    productionMutation: normalizedMutation,
    secretsPrinted,
    piiPrinted,
    rawReportBytesPrinted,
    signedUrlsPrinted,
    status: pass ? "pass" : normalizedStatus === "pass" ? "fail" : normalizedStatus,
    certifying: pass,
    CERTIFYING: pass,
    freshnessWindowHours,
    expiresAt: addHoursIso(generatedAt, freshnessWindowHours),
    checks: normalizedChecks,
    failures: pass ? [] : normalizedFailures,
    sanitizedArtifacts: Array.isArray(sanitizedArtifacts) ? sanitizedArtifacts : [],
    missingRuntimeInputs: normalizedMissingInputs,
    policyVersion,
    metadata,
  });
}

export function renderMachineEvidenceMarkdown(evidence, title = "Production Machine Evidence") {
  const lines = [
    `# ${title}`,
    "",
    `Generated at: ${evidence.generatedAt}`,
    `Evidence type: ${evidence.evidenceType}`,
    `Environment: ${evidence.environment}`,
    `Commit: \`${evidence.commitHash}\``,
    `Generator: \`${evidence.generatorScript}\``,
    `Command: \`${evidence.command}\``,
    `Blocker ID: ${evidence.blockerId ?? "not provided"}`,
    `Branch: \`${evidence.branch ?? "unknown"}\``,
    `Policy version: ${evidence.policyVersion ?? "missing"}`,
    `Status: ${evidence.status}`,
    `CERTIFYING:${evidence.certifying ? "true" : "false"}`,
    `Expires at: ${evidence.expiresAt}`,
    "",
    "## Safety",
    "",
    `- Non-interactive: ${evidence.nonInteractive ? "yes" : "no"}`,
    `- Machine-attested: ${evidence.machineAttested ? "yes" : "no"}`,
    `- Human interaction required: ${evidence.humanInteractionRequired ? "yes" : "no"}`,
    `- Human observed: ${evidence.humanObserved ? "yes" : "no"}`,
    `- Manual approval required: ${evidence.manualApprovalRequired ? "yes" : "no"}`,
    `- Dry-run only: ${evidence.dryRunOnly ? "yes" : "no"}`,
    `- Production mutation: ${evidence.productionMutation}`,
    `- Secrets printed: ${evidence.secretsPrinted ? "yes" : "no"}`,
    `- PII printed: ${evidence.piiPrinted ? "yes" : "no"}`,
    `- Raw report bytes printed: ${evidence.rawReportBytesPrinted ? "yes" : "no"}`,
    `- Signed URLs printed: ${evidence.signedUrlsPrinted ? "yes" : "no"}`,
    "",
    "## Checks",
    "",
    ...(evidence.checks?.length
      ? evidence.checks.map((check) => `- [${check.status}] ${check.name}: ${check.summary ?? ""}`.trim())
      : ["- None."]),
    "",
    "## Failures",
    "",
    ...(evidence.failures?.length
      ? evidence.failures.map((failure) => `- ${failure.code ?? "failure"}: ${failure.message ?? failure}`)
      : ["- None."]),
    "",
    "## Missing Runtime Inputs",
    "",
    ...(evidence.missingRuntimeInputs?.length
      ? evidence.missingRuntimeInputs.map((input) => `- ${input}`)
      : ["- None."]),
    "",
    "## Sanitized Artifacts",
    "",
    ...(evidence.sanitizedArtifacts?.length
      ? evidence.sanitizedArtifacts.map((artifact) => `- ${artifact.path ?? artifact}`)
      : ["- None."]),
  ];

  return `${lines.join("\n")}\n`;
}

export function writeMachineEvidenceOutputs(evidence, {
  rootDir = process.cwd(),
  jsonPath,
  markdownPath,
  title,
} = {}) {
  const absoluteJsonPath = repoPath(rootDir, jsonPath);
  const absoluteMarkdownPath = repoPath(rootDir, markdownPath);
  mkdirSync(path.dirname(absoluteJsonPath), { recursive: true });
  mkdirSync(path.dirname(absoluteMarkdownPath), { recursive: true });
  writeFileSync(absoluteJsonPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  writeFileSync(absoluteMarkdownPath, renderMachineEvidenceMarkdown(evidence, title), "utf8");
  return { jsonPath: normalizeRelativePath(jsonPath), markdownPath: normalizeRelativePath(markdownPath) };
}
