import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SSH_HOST_KEY_PINNING_MD_PATH =
  "docs/production-scale/evidence/latest-ssh-host-key-pinning.md";
export const SSH_HOST_KEY_PINNING_JSON_PATH =
  "docs/production-scale/evidence/latest-ssh-host-key-pinning.json";

const SAMPLE_FINGERPRINT = "SHA256:abcdefghijklmnopqrstuvwxyz0123456789ABCDE";
const OTHER_FINGERPRINT = "SHA256:fedcba9876543210ZYXWVUTSRQPONMLKJIHGFED";

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

export function extractExpectedSha256Fingerprints(value) {
  return Array.from(new Set(String(value ?? "").match(/SHA256:[A-Za-z0-9+/=]+/g) ?? [])).sort();
}

export function simulateSshHostKeyPinning({
  environment = "production",
  expectedValue = "",
  scannedFingerprints = [],
} = {}) {
  const requireExpected = environment === "production";
  const expectedFingerprints = extractExpectedSha256Fingerprints(expectedValue);
  const scanned = Array.from(new Set(scannedFingerprints.map((value) => String(value).trim()).filter(Boolean))).sort();
  const events = [];

  events.push({ action: "scan-host-key", scannedCount: scanned.length });

  if (expectedFingerprints.length === 0) {
    if (requireExpected) {
      events.push({ action: "fail-closed", reason: "missing-expected-fingerprint" });
      return {
        environment,
        status: "failed",
        reason: "missing-expected-fingerprint",
        knownHostsWritten: false,
        certifying: false,
        CERTIFYING: false,
        events,
      };
    }

    events.push({ action: "staging-compatibility", reason: "missing-expected-fingerprint" });
    return {
      environment,
      status: "compatibility-warning",
      reason: "missing-expected-fingerprint",
      knownHostsWritten: true,
      certifying: false,
      CERTIFYING: false,
      events,
    };
  }

  const matched = scanned.some((fingerprint) => expectedFingerprints.includes(fingerprint));
  if (!matched) {
    events.push({ action: "fail-closed", reason: "fingerprint-mismatch" });
    return {
      environment,
      status: "failed",
      reason: "fingerprint-mismatch",
      knownHostsWritten: false,
      certifying: false,
      CERTIFYING: false,
      events,
    };
  }

  events.push({ action: "verify-fingerprint", result: "matched" });
  events.push({ action: "write-known-hosts", result: "after-verification" });
  return {
    environment,
    status: "passed",
    reason: "fingerprint-matched",
    knownHostsWritten: true,
    certifying: false,
    CERTIFYING: false,
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

function check(name, passed, details = {}) {
  return { name, passed, status: passed ? "passed" : "failed", ...details };
}

function prepareSshBlock(workflowText) {
  return String(workflowText ?? "").match(/- name: Prepare SSH[\s\S]*?\n      - name: Deploy selected commit/)?.[0] ?? "";
}

function indexAfter(text, firstNeedle, secondNeedle) {
  const first = text.indexOf(firstNeedle);
  const second = text.indexOf(secondNeedle);
  return first >= 0 && second > first;
}

export function validateSshHostKeyPinningWorkflowSafety({ stagingWorkflowText, productionWorkflowText }) {
  const stagingPrepare = prepareSshBlock(stagingWorkflowText);
  const productionPrepare = prepareSshBlock(productionWorkflowText);
  const stagingBash = bashSyntaxCheckWorkflowRunBlocks(stagingWorkflowText);
  const productionBash = bashSyntaxCheckWorkflowRunBlocks(productionWorkflowText);

  const checks = [
    check(
      "production requires expected SSH host fingerprint",
      productionPrepare.includes("PRODUCTION_SSH_HOST_KEY_SHA256") &&
        productionPrepare.includes("Refusing production deploy: PRODUCTION_SSH_HOST_KEY_SHA256 is required for fail-closed SSH host trust."),
    ),
    check(
      "production compares scanned key to expected fingerprint",
      productionPrepare.includes("normalize_expected_ssh_host_fingerprints()") &&
        productionPrepare.includes('ssh-keygen -lf "$target_file" -E sha256') &&
        productionPrepare.includes('grep -Fx -f "$expected_fingerprints_tmp" "$scanned_fingerprints_tmp"') &&
        productionPrepare.includes("verify_production_ssh_host_key"),
    ),
    check(
      "staging supports the same expected fingerprint verifier",
      stagingPrepare.includes("STAGING_SSH_HOST_KEY_SHA256") &&
        stagingPrepare.includes("verify_staging_ssh_host_key_if_configured") &&
        stagingPrepare.includes('ssh-keygen -lf "$target_file" -E sha256') &&
        stagingPrepare.includes('grep -Fx -f "$expected_fingerprints_tmp" "$scanned_fingerprints_tmp"'),
    ),
    check(
      "ssh-keyscan remains collection only",
      !productionPrepare.includes('ssh-keyscan -p "$PRODUCTION_SSH_PORT" "$PRODUCTION_HOST" >> ~/.ssh/known_hosts') &&
        stagingPrepare.includes("ssh-keyscan") &&
        productionPrepare.includes("ssh-keyscan") &&
        stagingPrepare.includes("ssh-keyscan"),
    ),
    check(
      "production known_hosts is written only after verification",
      indexAfter(productionPrepare, 'verify_production_ssh_host_key "$known_hosts_tmp"', 'cat "$known_hosts_tmp" >> ~/.ssh/known_hosts'),
    ),
    check(
      "staging known_hosts is written only after verifier gate",
      indexAfter(stagingPrepare, 'verify_staging_ssh_host_key_if_configured "$known_hosts_tmp"', 'cat "$known_hosts_tmp" >> ~/.ssh/known_hosts'),
    ),
    check(
      "shell blocks pass bash -n",
      stagingBash.status === "passed" && productionBash.status === "passed",
      {
        stagingFailedLines: stagingBash.failed.map((result) => result.line),
        productionFailedLines: productionBash.failed.map((result) => result.line),
      },
    ),
  ];

  const failedChecks = checks.filter((item) => !item.passed);
  return {
    status: failedChecks.length === 0 ? "passed" : "failed",
    checks,
    failedChecks,
    bashSyntax: {
      staging: stagingBash,
      production: productionBash,
    },
  };
}

export function buildSshHostKeyPinningReport({
  rootDir = process.cwd(),
  generatedAt = new Date().toISOString(),
} = {}) {
  const stagingWorkflowText = readText(rootDir, ".github/workflows/deploy-staging.yml");
  const productionWorkflowText = readText(rootDir, ".github/workflows/deploy-production.yml");
  const workflowValidation = validateSshHostKeyPinningWorkflowSafety({ stagingWorkflowText, productionWorkflowText });
  const simulations = [
    simulateSshHostKeyPinning({
      environment: "production",
      expectedValue: "",
      scannedFingerprints: [SAMPLE_FINGERPRINT],
    }),
    simulateSshHostKeyPinning({
      environment: "production",
      expectedValue: OTHER_FINGERPRINT,
      scannedFingerprints: [SAMPLE_FINGERPRINT],
    }),
    simulateSshHostKeyPinning({
      environment: "production",
      expectedValue: SAMPLE_FINGERPRINT,
      scannedFingerprints: [SAMPLE_FINGERPRINT, OTHER_FINGERPRINT],
    }),
    simulateSshHostKeyPinning({
      environment: "staging",
      expectedValue: SAMPLE_FINGERPRINT,
      scannedFingerprints: [SAMPLE_FINGERPRINT],
    }),
  ];

  const validationErrors = [];
  if (!simulations.some((item) => item.environment === "production" && item.reason === "missing-expected-fingerprint" && item.status === "failed")) {
    validationErrors.push("Missing production expected fingerprint did not fail closed.");
  }
  if (!simulations.some((item) => item.reason === "fingerprint-mismatch" && item.status === "failed" && item.knownHostsWritten === false)) {
    validationErrors.push("Mismatched expected fingerprint did not fail closed.");
  }
  if (!simulations.some((item) => item.reason === "fingerprint-matched" && item.status === "passed" && item.knownHostsWritten === true)) {
    validationErrors.push("Matched expected fingerprint did not pass.");
  }
  if (workflowValidation.status !== "passed") {
    validationErrors.push(...workflowValidation.failedChecks.map((item) => `Workflow check failed: ${item.name}`));
  }

  return {
    reportName: "ssh-host-key-pinning",
    generatedAt,
    currentHead: safeGit(["rev-parse", "HEAD"], rootDir),
    branch: safeGit(["branch", "--show-current"], rootDir),
    auditTarget: "P2-1 SSH host key trust uses runtime ssh-keyscan.",
    evidenceType: "AUTOMATED_LOCAL_SIMULATION_AND_STATIC_WORKFLOW_CHECK",
    status: validationErrors.length === 0 ? "passed" : "failed",
    certifying: false,
    CERTIFYING: false,
    liveDeploymentRequired: false,
    liveExternalProviderCallsMade: 0,
    requiredConfiguration: {
      production: "PRODUCTION_SSH_HOST_KEY_SHA256",
      staging: "STAGING_SSH_HOST_KEY_SHA256",
      format: "One or more SHA256: SSH host key fingerprints, separated by commas, semicolons, whitespace, or newlines.",
      valuesIncluded: false,
    },
    simulations,
    workflowValidation,
    summary: {
      productionMissingExpectedFails: simulations.some((item) => item.environment === "production" && item.reason === "missing-expected-fingerprint" && item.status === "failed"),
      mismatchFails: simulations.some((item) => item.reason === "fingerprint-mismatch" && item.status === "failed"),
      matchPasses: simulations.some((item) => item.reason === "fingerprint-matched" && item.status === "passed"),
      knownHostsWrittenAfterVerification: workflowValidation.checks
        .filter((item) => /known_hosts/.test(item.name))
        .every((item) => item.passed),
      shellBlocksBashSyntaxPassed: workflowValidation.bashSyntax.staging.status === "passed" &&
        workflowValidation.bashSyntax.production.status === "passed",
    },
    validation: {
      ok: validationErrors.length === 0,
      errors: validationErrors,
    },
    outputPaths: {
      markdown: SSH_HOST_KEY_PINNING_MD_PATH,
      json: SSH_HOST_KEY_PINNING_JSON_PATH,
    },
  };
}

export function renderSshHostKeyPinningMarkdown(report) {
  const lines = [
    "# SSH Host Key Pinning Evidence",
    "",
    `Generated: ${report.generatedAt}`,
    `Current HEAD: ${report.currentHead}`,
    `Status: ${report.status}`,
    "CERTIFYING:false",
    "",
    "## Required Configuration",
    "",
    "- Production must set `PRODUCTION_SSH_HOST_KEY_SHA256` as a GitHub secret or variable.",
    "- Staging supports `STAGING_SSH_HOST_KEY_SHA256` as a GitHub secret or variable; configure it to enforce the same pinning behavior on staging.",
    "- Values must be SSH host key fingerprints in `SHA256:...` format. This document intentionally does not include real values.",
    "",
    "## Summary",
    "",
    `- Missing production expected fingerprint fails closed: ${report.summary.productionMissingExpectedFails ? "passed" : "failed"}`,
    `- Mismatched expected fingerprint fails closed: ${report.summary.mismatchFails ? "passed" : "failed"}`,
    `- Matched expected fingerprint passes: ${report.summary.matchPasses ? "passed" : "failed"}`,
    `- known_hosts write happens after verifier gate: ${report.summary.knownHostsWrittenAfterVerification ? "passed" : "failed"}`,
    `- Bash syntax for extracted run blocks: ${report.summary.shellBlocksBashSyntaxPassed ? "passed" : "failed"}`,
    "",
    "## Workflow Validation",
    "",
  ];

  for (const checkResult of report.workflowValidation.checks) {
    lines.push(`- ${checkResult.status}: ${checkResult.name}`);
  }

  lines.push("");
  lines.push("## Simulation Results");
  lines.push("");
  for (const simulation of report.simulations) {
    lines.push(`- ${simulation.environment}: ${simulation.status} (${simulation.reason}); known_hosts written=${simulation.knownHostsWritten ? "yes" : "no"}`);
  }
  lines.push("");
  lines.push("## Boundaries");
  lines.push("");
  lines.push("- Automated local simulation and static workflow validation only; no live deployment was required.");
  lines.push("- No private keys, host key values, GitHub secrets, or production data are included.");
  lines.push("- `ssh-keyscan` remains a collection step; workflow trust comes from comparing the collected key fingerprint to configured expected values.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export function writeSshHostKeyPinningEvidence(report, { rootDir = process.cwd() } = {}) {
  mkdirSync(path.dirname(repoPath(rootDir, SSH_HOST_KEY_PINNING_JSON_PATH)), { recursive: true });
  writeFileSync(repoPath(rootDir, SSH_HOST_KEY_PINNING_JSON_PATH), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(repoPath(rootDir, SSH_HOST_KEY_PINNING_MD_PATH), renderSshHostKeyPinningMarkdown(report), "utf8");
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
  const report = buildSshHostKeyPinningReport({ rootDir: options.rootDir });
  if (options.writeEvidence) writeSshHostKeyPinningEvidence(report, { rootDir: options.rootDir });
  if (options.json) console.log(JSON.stringify(report, null, 2));
  if (!options.json) {
    console.log(`SSH host key pinning evidence: ${report.status}`);
    console.log(`Workflow checks: ${report.workflowValidation.checks.length}`);
    console.log(`Simulations: ${report.simulations.length}`);
  }
  if (report.validation.ok !== true) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
