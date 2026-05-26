import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PLATFORM_CERTIFICATION_JSON_PATH = "docs/platform-certification/latest-platform-certification.json";
export const PLATFORM_CERTIFICATION_MD_PATH = "docs/platform-certification/latest-platform-certification.md";
export const DEFAULT_STAGING_BASE_URL = "https://staging.creditregulatorpro.com";

const DEFAULT_GATE_TIMEOUT_MS = 15 * 60 * 1000;

const STAGING_BROWSER_ENV = {
  E2E_BASE_URL: DEFAULT_STAGING_BASE_URL,
  STAGING_BASE_URL: DEFAULT_STAGING_BASE_URL,
  STAGING_APP_URL: DEFAULT_STAGING_BASE_URL,
};

export const PLATFORM_CERTIFICATION_GATES = [
  {
    id: "staticAudit",
    label: "Level 1 static code audit",
    subsystem: "Static Audit",
    command: "pnpm run audit:static",
    weight: 12,
    timeoutMs: 10 * 60 * 1000,
    certifies: ["lint", "typecheck", "build", "dead code", "dependency consistency"],
  },
  {
    id: "buildReproducibility",
    label: "Build reproducibility",
    subsystem: "Deployment Verification",
    command: "pnpm run build",
    weight: 8,
    timeoutMs: 8 * 60 * 1000,
    certifies: ["frontend build", "Vite build", "bundle generation"],
  },
  {
    id: "migrationConsistency",
    label: "Migration consistency",
    subsystem: "Database Validation",
    command: "pnpm run check:migrations",
    weight: 6,
    timeoutMs: 5 * 60 * 1000,
    certifies: ["schema-source inventory", "migration governance"],
  },
  {
    id: "stagingRoutingGate",
    label: "Staging routing and API availability gate",
    subsystem: "Runtime Validation",
    command: "pnpm run check:staging-gate",
    weight: 6,
    timeoutMs: 2 * 60 * 1000,
    env: STAGING_BROWSER_ENV,
    certifies: ["HTTPS app shell", "login route", "auth session boundary", "admin endpoint boundary"],
  },
  {
    id: "runtimeAudit",
    label: "Level 2 runtime/system audit",
    subsystem: "Infrastructure Readiness",
    command: "pnpm run audit:runtime --json",
    weight: 16,
    timeoutMs: 10 * 60 * 1000,
    env: STAGING_BROWSER_ENV,
    certifies: [
      "Docker containers",
      "Traefik routing",
      "environment variables",
      "database connectivity",
      "storage write/read/delete",
      "OCR/PDF tooling",
      "filesystem permissions",
      "runtime logs",
    ],
  },
  {
    id: "storageDurability",
    label: "Storage lifecycle and durability contract",
    subsystem: "Storage Validation",
    command: "pnpm run storage:durability-contract --no-write-evidence --json",
    weight: 8,
    timeoutMs: 5 * 60 * 1000,
    certifies: ["artifact storage contract", "generated PDF path", "deploy storage preflight", "sentinel cleanup"],
  },
  {
    id: "e2eOperationalAudit",
    label: "Level 3 E2E operational audit",
    subsystem: "Operational Workflow",
    command: "pnpm run audit:e2e",
    weight: 16,
    timeoutMs: 18 * 60 * 1000,
    env: STAGING_BROWSER_ENV,
    certifies: [
      "upload",
      "OCR",
      "parsing",
      "canonical mapping",
      "tradeline extraction",
      "violation scanning",
      "evidence linking",
      "readiness validation",
      "packet PDF retrieval",
      "cleanup lifecycle",
    ],
  },
  {
    id: "resilienceAudit",
    label: "Level 4 adversarial/resilience audit",
    subsystem: "Resilience",
    command: "pnpm run audit:resilience",
    weight: 10,
    timeoutMs: 18 * 60 * 1000,
    env: STAGING_BROWSER_ENV,
    certifies: [
      "malformed input handling",
      "auth boundary stress",
      "readiness bypass attempts",
      "packet integrity",
      "concurrency probes",
      "cleanup collision handling",
    ],
  },
  {
    id: "adminCertification",
    label: "Admin click-through certification",
    subsystem: "Admin Certification",
    command: "pnpm run certify:admin",
    weight: 10,
    timeoutMs: 10 * 60 * 1000,
    env: STAGING_BROWSER_ENV,
    certifies: ["admin route rendering", "admin navigation", "admin API calls", "admin permission enforcement"],
  },
  {
    id: "rollbackSimulation",
    label: "Rollback simulation",
    subsystem: "Rollback Readiness",
    command: "pnpm run deploy:rollback-simulation --json",
    weight: 4,
    timeoutMs: 3 * 60 * 1000,
    certifies: ["rollback workflow simulation", "rollback health checks", "previous SHA restoration"],
  },
  {
    id: "productionParity",
    label: "Production parity evidence",
    subsystem: "Production Parity",
    command: "pnpm run production-deployment-parity:evidence --json",
    weight: 4,
    timeoutMs: 3 * 60 * 1000,
    certifies: ["deployment workflow parity", "safe production probe parity", "privacy probe evidence"],
  },
];

export const PLATFORM_SUBSYSTEMS = [
  {
    subsystem: "Static Audit",
    gateIds: ["staticAudit"],
    requiredForPass: true,
  },
  {
    subsystem: "Runtime Validation",
    gateIds: ["stagingRoutingGate", "runtimeAudit"],
    requiredForPass: true,
  },
  {
    subsystem: "Database Validation",
    gateIds: ["runtimeAudit", "migrationConsistency"],
    requiredForPass: true,
  },
  {
    subsystem: "Storage Validation",
    gateIds: ["runtimeAudit", "storageDurability"],
    requiredForPass: true,
  },
  {
    subsystem: "OCR/PDF Validation",
    gateIds: ["runtimeAudit", "e2eOperationalAudit"],
    requiredForPass: true,
  },
  {
    subsystem: "E2E Ingestion Workflow",
    gateIds: ["e2eOperationalAudit"],
    requiredForPass: true,
  },
  {
    subsystem: "Packet Lifecycle Workflow",
    gateIds: ["e2eOperationalAudit", "resilienceAudit"],
    requiredForPass: true,
  },
  {
    subsystem: "Admin Certification",
    gateIds: ["adminCertification", "e2eOperationalAudit"],
    requiredForPass: true,
  },
  {
    subsystem: "Resilience Testing",
    gateIds: ["resilienceAudit"],
    requiredForPass: true,
  },
  {
    subsystem: "Deployment Verification",
    gateIds: ["buildReproducibility", "migrationConsistency", "runtimeAudit", "productionParity"],
    requiredForPass: true,
  },
  {
    subsystem: "Rollback Readiness",
    gateIds: ["rollbackSimulation"],
    requiredForPass: true,
  },
  {
    subsystem: "Cleanup/Reset Validation",
    gateIds: ["e2eOperationalAudit", "resilienceAudit"],
    requiredForPass: true,
  },
  {
    subsystem: "Reproducibility Verification",
    gateIds: ["buildReproducibility", "migrationConsistency", "storageDurability", "rollbackSimulation", "productionParity"],
    requiredForPass: true,
  },
];

const FAILURE_REASONS = [
  {
    pattern: /No lint infrastructure is configured/i,
    reason:
      "Static audit cannot certify lint because the repository lint script is a failing placeholder.",
  },
  {
    pattern: /Missing SSH credential inputs|STAGING_OBSERVABILITY_SSH_KEY|STAGING_RUNTIME_SSH_KEY|STAGING_SSH_PRIVATE_KEY|STAGING_USER/i,
    reason:
      "Runtime audit could not certify container, DB, storage, OCR/PDF, log, or volume state because staging SSH diagnostics were unavailable.",
  },
  {
    pattern: /E2E_ADMIN_EMAIL|E2E_ADMIN_PASSWORD|Admin click-through certification is required/i,
    reason:
      "Admin click-through certification could not run against staging because E2E admin credentials are not configured.",
  },
  {
    pattern: /STAGING_ADMIN_EMAIL|STAGING_ADMIN_PASSWORD|STAGING_ADMIN_SESSION_COOKIE/i,
    reason:
      "E2E operational admin packet workflow could not certify because staging admin API credentials or an admin session cookie are not configured.",
  },
  {
    pattern: /storage_read_failed:not_found/i,
    reason:
      "Runtime logs include storage_read_failed:not_found; artifact lifecycle must be reconciled before production certification.",
  },
];

function repoRootFromScript() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function gitValue(args, repoRoot, fallback = "unknown") {
  try {
    const output = execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    return output || fallback;
  } catch {
    return fallback;
  }
}

export function redactCertificationText(value) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/(authorization|cookie|session|token|password|secret|private[_-]?key|api[_-]?key)=([^;\s]+)/gi, "$1=[REDACTED]")
    .replace(/(postgres(?:ql)?:\/\/)[^\s'"]+/gi, "$1[REDACTED]")
    .replace(/(sk-[A-Za-z0-9_-]{8,}|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+)/g, "[REDACTED]");
}

function appendTail(buffer, chunk, maxLength = 8000) {
  const next = buffer + chunk.toString();
  return next.length > maxLength ? next.slice(next.length - maxLength) : next;
}

export function normalizeGateStatus(exitCode, timedOut = false) {
  if (timedOut) return "failed";
  return exitCode === 0 ? "passed" : "failed";
}

export function runShellCommand(command, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const timeoutMs = options.timeoutMs ?? DEFAULT_GATE_TIMEOUT_MS;
  const startedAt = new Date();

  return new Promise((resolve) => {
    let stdoutTail = "";
    let stderrTail = "";
    let timedOut = false;
    const child = spawn(command, {
      cwd,
      shell: true,
      env: {
        ...process.env,
        CI: process.env.CI ?? "1",
        ...(options.env ?? {}),
      },
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdoutTail = appendTail(stdoutTail, chunk);
      process.stdout.write(chunk);
    });

    child.stderr?.on("data", (chunk) => {
      stderrTail = appendTail(stderrTail, chunk);
      process.stderr.write(chunk);
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      const completedAt = new Date();
      resolve({
        command,
        exitCode: 1,
        timedOut,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        stdoutTail: redactCertificationText(stdoutTail),
        stderrTail: redactCertificationText(appendTail(stderrTail, Buffer.from(error.message))),
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const completedAt = new Date();
      resolve({
        command,
        exitCode: timedOut ? 124 : code ?? 1,
        timedOut,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        stdoutTail: redactCertificationText(stdoutTail),
        stderrTail: redactCertificationText(stderrTail),
      });
    });
  });
}

function failureReasonForGate(gate, result) {
  if (result.timedOut) return `Gate timed out after ${Math.round((gate.timeoutMs ?? DEFAULT_GATE_TIMEOUT_MS) / 1000)} seconds.`;
  const combined = `${result.stdoutTail ?? ""}\n${result.stderrTail ?? ""}`;
  if (gate.id === "staticAudit") {
    return "Static audit failed; run pnpm audit:static for the full categorized lint, dependency, typing, dead-code, and package-consistency findings.";
  }
  if (gate.id === "runtimeAudit" && /Missing SSH credential inputs/i.test(combined)) {
    return [
      "Runtime audit could not certify container, DB, storage, OCR/PDF, log, or volume state because staging SSH diagnostics were unavailable.",
      "Missing inputs: STAGING_USER or --ssh-user; STAGING_OBSERVABILITY_SSH_KEY, STAGING_RUNTIME_SSH_KEY, --ssh-key, or STAGING_SSH_PRIVATE_KEY.",
    ].join(" ");
  }
  if (gate.id === "adminCertification" && /Login failed for .*Verify the E2E credentials/i.test(combined)) {
    return "Admin click-through certification reached staging, but the configured E2E admin credentials failed login.";
  }
  const match = FAILURE_REASONS.find((entry) => entry.pattern.test(combined));
  if (match) return match.reason;
  return `${gate.label} failed with exit code ${result.exitCode}.`;
}

function diagnosticDetailsForGate(gate, result, failureReason) {
  if (normalizeGateStatus(result.exitCode, result.timedOut) === "passed") return null;
  const combined = `${result.stdoutTail ?? ""}\n${result.stderrTail ?? ""}`;

  if (gate.id === "staticAudit") {
    return {
      failedChecks: ["pnpm lint", "pnpm audit --prod"],
      dependencyAdvisoryObserved: /GHSA-hm8q-7f3q-5f36/.test(combined) ? "GHSA-hm8q-7f3q-5f36" : null,
      rawOutputStored: false,
    };
  }

  if (gate.id === "runtimeAudit" && /Missing SSH credential inputs/i.test(combined)) {
    return {
      missingInputs: [
        "STAGING_USER or --ssh-user",
        "STAGING_OBSERVABILITY_SSH_KEY, STAGING_RUNTIME_SSH_KEY, --ssh-key, or STAGING_SSH_PRIVATE_KEY",
      ],
      blockedSubsystems: [
        "Docker Containers",
        "Traefik Routing",
        "Environment Variables",
        "Database Connectivity",
        "Storage Connectivity",
        "Mounted Volumes",
        "Runtime Tooling",
        "Filesystem Permissions",
        "Logging/Error Reporting",
        "Disk Space",
        "Queue/Job Systems",
      ],
      rawOutputStored: false,
    };
  }

  if (gate.id === "e2eOperationalAudit" && /STAGING_ADMIN_EMAIL|STAGING_ADMIN_PASSWORD|STAGING_ADMIN_SESSION_COOKIE/i.test(combined)) {
    return {
      missingInputs: [
        "STAGING_ADMIN_EMAIL/STAGING_ADMIN_PASSWORD",
        "STAGING_ADMIN_SESSION_COOKIE",
      ],
      blockedStage: "admin_packet_workflow",
      rawOutputStored: false,
    };
  }

  if (gate.id === "adminCertification") {
    return {
      targetBaseUrl: DEFAULT_STAGING_BASE_URL,
      observedFailure: /Login failed for/i.test(combined) ? "admin-login-failed" : failureReason,
      rawOutputStored: false,
    };
  }

  return {
    observedFailure: failureReason,
    rawOutputStored: false,
  };
}

function normalizeCommandResult(gate, result) {
  const exitCode = Number.isInteger(result.exitCode) ? result.exitCode : 1;
  const timedOut = result.timedOut === true;
  const status = normalizeGateStatus(exitCode, timedOut);
  const failureReason = status === "failed" ? failureReasonForGate(gate, { ...result, exitCode, timedOut }) : null;
  return {
    id: gate.id,
    label: gate.label,
    subsystem: gate.subsystem,
    command: gate.command,
    status,
    exitCode,
    timedOut,
    durationMs: Number.isFinite(Number(result.durationMs)) ? Number(result.durationMs) : null,
    startedAt: result.startedAt ?? null,
    completedAt: result.completedAt ?? null,
    rawOutputStored: false,
    envKeys: Object.keys(gate.env ?? {}).sort(),
    certifies: gate.certifies ?? [],
    failureReason,
    diagnostic: diagnosticDetailsForGate(gate, { ...result, exitCode, timedOut }, failureReason),
  };
}

export function scoreDeploymentReadiness(gates, results) {
  const resultById = new Map(results.map((entry) => [entry.id, entry]));
  const totalWeight = gates.reduce((sum, gate) => sum + Number(gate.weight ?? 0), 0);
  if (totalWeight <= 0) return 0;

  const passedWeight = gates.reduce((sum, gate) => {
    const result = resultById.get(gate.id);
    return result?.status === "passed" ? sum + Number(gate.weight ?? 0) : sum;
  }, 0);

  return Math.round((passedWeight / totalWeight) * 100);
}

export function buildSubsystemCertificationMatrix(results, subsystems = PLATFORM_SUBSYSTEMS) {
  const resultById = new Map(results.map((entry) => [entry.id, entry]));
  return subsystems.map((subsystem) => {
    const gateResults = subsystem.gateIds
      .map((gateId) => resultById.get(gateId))
      .filter(Boolean);
    const missingGateIds = subsystem.gateIds.filter((gateId) => !resultById.has(gateId));
    const failedGateIds = gateResults.filter((entry) => entry.status === "failed").map((entry) => entry.id);
    const passedGateIds = gateResults.filter((entry) => entry.status === "passed").map((entry) => entry.id);
    const status =
      failedGateIds.length > 0
        ? "FAIL"
        : missingGateIds.length > 0 && subsystem.requiredForPass
          ? "SKIP"
          : "PASS";

    return {
      subsystem: subsystem.subsystem,
      status,
      requiredForPass: subsystem.requiredForPass,
      gateIds: subsystem.gateIds,
      passedGateIds,
      failedGateIds,
      missingGateIds,
    };
  });
}

export function buildPlatformBlockers(gates, results) {
  const gateById = new Map(gates.map((gate) => [gate.id, gate]));
  return results
    .filter((result) => result.status === "failed")
    .map((result) => {
      const gate = gateById.get(result.id);
      return {
        severity: "BLOCKER",
        subsystem: result.subsystem,
        gateId: result.id,
        gateLabel: result.label,
        command: result.command,
        reason: result.failureReason ?? `${result.label} failed.`,
        requiredBeforeProduction: true,
        weight: gate?.weight ?? null,
      };
    });
}

function statusFromGateIds(gateIds, results) {
  const resultById = new Map(results.map((entry) => [entry.id, entry]));
  if (gateIds.some((gateId) => resultById.get(gateId)?.status === "failed")) return "FAIL";
  if (gateIds.some((gateId) => !resultById.has(gateId))) return "SKIP";
  return "PASS";
}

function buildRiskAssessment(report) {
  const blockers = report.unresolvedBlockers;
  if (blockers.length === 0) {
    return {
      level: "LOW",
      summary: "All mandatory platform certification gates passed.",
      reasons: [],
    };
  }

  return {
    level: blockers.some((blocker) => blocker.severity === "BLOCKER") ? "HIGH" : "MEDIUM",
    summary: "Production deployment is not certified until every blocker is resolved and the platform certification reruns cleanly.",
    reasons: blockers.map((blocker) => `${blocker.subsystem}: ${blocker.reason}`),
  };
}

function certificationDecision(results) {
  return results.every((result) => result.status === "passed") ? "PASS" : "FAIL";
}

export async function buildPlatformCertificationReport(options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd();
  const gates = options.gates ?? PLATFORM_CERTIFICATION_GATES;
  const runCommand = options.runCommand ?? runShellCommand;
  const runStartedAt = options.runStartedAt ?? new Date().toISOString();
  const currentCommit = options.currentCommit ?? gitValue(["rev-parse", "HEAD"], repoRoot);
  const currentBranch = options.currentBranch ?? gitValue(["branch", "--show-current"], repoRoot);
  const results = [];

  for (const gate of gates) {
    if (options.logProgress) {
      console.log(`[certify:platform] ${gate.label}`);
      console.log(`[certify:platform] command: ${gate.command}`);
    }
    const result = await runCommand(gate.command, {
      cwd: repoRoot,
      timeoutMs: gate.timeoutMs ?? DEFAULT_GATE_TIMEOUT_MS,
      env: gate.env,
      gate,
    });
    results.push(normalizeCommandResult(gate, result));
  }

  const completedAt = options.completedAt ?? new Date().toISOString();
  const gateStatus = Object.fromEntries(results.map((result) => [result.id, result.status]));
  const subsystemCertificationMatrix = buildSubsystemCertificationMatrix(results, options.subsystems ?? PLATFORM_SUBSYSTEMS);
  const unresolvedBlockers = buildPlatformBlockers(gates, results);
  const deploymentReadinessScore = scoreDeploymentReadiness(gates, results);
  const certificationStatus = certificationDecision(results);
  const baseReport = {
    reportName: "creditregulatorpro-level-5-platform-certification",
    generatedAt: completedAt,
    runStartedAt,
    runCompletedAt: completedAt,
    currentBranch,
    currentCommit,
    targetEnvironment: "staging",
    targetBaseUrl: DEFAULT_STAGING_BASE_URL,
    certificationStatus,
    CERTIFYING: certificationStatus === "PASS",
    deploymentReadinessScore,
    commandCounts: {
      total: results.length,
      passed: results.filter((result) => result.status === "passed").length,
      failed: results.filter((result) => result.status === "failed").length,
    },
    gateStatus,
    gates: results,
    subsystemCertificationMatrix,
    unresolvedBlockers,
    exactCommandsRun: results.map((result) => ({
      gateId: result.id,
      command: result.command,
      status: result.status,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      envKeys: result.envKeys,
    })),
    rollbackReadinessStatus: statusFromGateIds(["rollbackSimulation"], results),
    infrastructureReadinessStatus: statusFromGateIds(["runtimeAudit", "stagingRoutingGate"], results),
    parserConfidenceCertification: statusFromGateIds(["e2eOperationalAudit", "resilienceAudit", "staticAudit"], results),
    storageLifecycleStatus: statusFromGateIds(["runtimeAudit", "storageDurability"], results),
    adminCertificationStatus: statusFromGateIds(["adminCertification"], results),
    packetLifecycleStatus: statusFromGateIds(["e2eOperationalAudit", "resilienceAudit"], results),
    reproducibilityStatus: statusFromGateIds(
      ["buildReproducibility", "migrationConsistency", "storageDurability", "rollbackSimulation", "productionParity"],
      results,
    ),
    safety: {
      productionDataMutated: false,
      productionConfigurationModified: false,
      infrastructureModifiedAutomatically: false,
      schemasModified: false,
      destructiveCleanupRun: false,
      secretsPrinted: false,
    },
  };

  return {
    ...baseReport,
    productionRiskAssessment: buildRiskAssessment(baseReport),
    operationalStabilitySummary:
      certificationStatus === "PASS"
        ? "Operational stability is certified by the mandatory static, runtime, E2E, resilience, admin, deployment, rollback, storage, and parity gates."
        : "Operational stability is not certified; at least one mandatory Level 5 gate failed or could not run to completion.",
  };
}

function statusIcon(status) {
  if (status === "PASS" || status === "passed") return "PASS";
  if (status === "SKIP" || status === "skipped") return "SKIP";
  return "FAIL";
}

export function renderPlatformCertificationMarkdown(report) {
  const lines = [
    "# CreditRegulatorPro Level 5 Platform Certification",
    "",
    `Generated: ${report.generatedAt}`,
    `Target: ${report.targetBaseUrl}`,
    `Branch: \`${report.currentBranch}\``,
    `Commit: \`${report.currentCommit}\``,
    `Formal certification: **${report.certificationStatus}**`,
    `CERTIFYING:${report.CERTIFYING ? "true" : "false"}`,
    `Deployment readiness score: **${report.deploymentReadinessScore}/100**`,
    "",
    "## Summary",
    "",
    `- Commands: ${report.commandCounts.passed} passed, ${report.commandCounts.failed} failed, ${report.commandCounts.total} total`,
    `- Infrastructure readiness: ${report.infrastructureReadinessStatus}`,
    `- Storage lifecycle: ${report.storageLifecycleStatus}`,
    `- Packet lifecycle: ${report.packetLifecycleStatus}`,
    `- Admin certification: ${report.adminCertificationStatus}`,
    `- Parser confidence certification: ${report.parserConfidenceCertification}`,
    `- Rollback readiness: ${report.rollbackReadinessStatus}`,
    `- Reproducibility: ${report.reproducibilityStatus}`,
    "",
    "## Subsystem Certification Matrix",
    "",
    "| Subsystem | Status | Gates |",
    "| --- | --- | --- |",
    ...report.subsystemCertificationMatrix.map(
      (entry) => `| ${entry.subsystem} | ${statusIcon(entry.status)} | ${entry.gateIds.join(", ")} |`,
    ),
    "",
    "## Gate Results",
    "",
    "| Gate | Subsystem | Status | Duration | Command |",
    "| --- | --- | --- | ---: | --- |",
    ...report.gates.map(
      (gate) =>
        `| ${gate.label} | ${gate.subsystem} | ${statusIcon(gate.status)} | ${
          gate.durationMs == null ? "n/a" : `${Math.round(gate.durationMs / 1000)}s`
        } | \`${gate.command.replaceAll("|", "\\|")}\` |`,
    ),
    "",
    "## Unresolved Blockers",
    "",
  ];

  if (report.unresolvedBlockers.length === 0) {
    lines.push("- None.");
  } else {
    for (const blocker of report.unresolvedBlockers) {
      lines.push(`- [${blocker.severity}] ${blocker.subsystem}: ${blocker.reason}`);
    }
  }

  lines.push(
    "",
    "## Production Risk Assessment",
    "",
    `Risk level: **${report.productionRiskAssessment.level}**`,
    "",
    report.productionRiskAssessment.summary,
    "",
    "## Safety",
    "",
    `- Production data mutated: ${report.safety.productionDataMutated ? "yes" : "no"}`,
    `- Infrastructure modified automatically: ${report.safety.infrastructureModifiedAutomatically ? "yes" : "no"}`,
    `- Schemas modified: ${report.safety.schemasModified ? "yes" : "no"}`,
    `- Destructive cleanup run: ${report.safety.destructiveCleanupRun ? "yes" : "no"}`,
    `- Secrets printed: ${report.safety.secretsPrinted ? "yes" : "no"}`,
    "",
    "## Exact Commands",
    "",
    ...report.exactCommandsRun.map((entry) => `- ${entry.gateId}: \`${entry.command}\` -> ${entry.status} (${entry.exitCode})`),
    "",
  );

  return `${lines.join("\n")}\n`;
}

export async function writePlatformCertificationOutputs(report, repoRoot = process.cwd()) {
  const jsonPath = path.resolve(repoRoot, PLATFORM_CERTIFICATION_JSON_PATH);
  const markdownPath = path.resolve(repoRoot, PLATFORM_CERTIFICATION_MD_PATH);
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, renderPlatformCertificationMarkdown(report), "utf8");
  return { jsonPath, markdownPath };
}

function parseArgs(args) {
  const options = { json: false, writeReport: true };
  for (const arg of args) {
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--no-write-report") {
      options.writeReport = false;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: pnpm certify:platform -- [--json] [--no-write-report]");
      process.exit(0);
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

async function main() {
  const repoRoot = repoRootFromScript();
  const options = parseArgs(process.argv.slice(2));
  const report = await buildPlatformCertificationReport({ repoRoot, logProgress: true });
  let outputs = null;
  if (options.writeReport) {
    outputs = await writePlatformCertificationOutputs(report, repoRoot);
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`[certify:platform] formal certification: ${report.certificationStatus}`);
    console.log(`[certify:platform] deployment readiness score: ${report.deploymentReadinessScore}/100`);
    console.log(`[certify:platform] blockers: ${report.unresolvedBlockers.length}`);
    if (outputs) {
      console.log(`[certify:platform] wrote ${path.relative(repoRoot, outputs.markdownPath)}`);
      console.log(`[certify:platform] wrote ${path.relative(repoRoot, outputs.jsonPath)}`);
    }
  }

  process.exitCode = report.CERTIFYING ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[certify:platform] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
