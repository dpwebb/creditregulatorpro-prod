import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  PLATFORM_CERTIFICATION_GATES,
  buildPlatformBlockers,
  buildPlatformCertificationReport,
  buildSubsystemCertificationMatrix,
  scoreDeploymentReadiness,
} from "../../scripts/platform-certification.mjs";

const RUN_STARTED_AT = "2026-05-25T12:00:00.000Z";
const RUN_COMPLETED_AT = "2026-05-25T12:05:00.000Z";
const COMMIT = "a".repeat(40);

function gate(id: string, overrides = {}) {
  return {
    id,
    label: id,
    subsystem: id,
    command: `mock:${id}`,
    weight: 10,
    certifies: [id],
    ...overrides,
  };
}

function runCommandWithFailures(failedGateIds: string[] = [], stderrByGate: Record<string, string> = {}) {
  return async (_command: string, options: { gate: { id: string } }) => {
    const failed = failedGateIds.includes(options.gate.id);
    return {
      exitCode: failed ? 1 : 0,
      timedOut: false,
      startedAt: "2026-05-25T12:00:01.000Z",
      completedAt: "2026-05-25T12:00:02.000Z",
      durationMs: 1000,
      stdoutTail: failed ? "" : `stdout:${options.gate.id}`,
      stderrTail: failed ? stderrByGate[options.gate.id] ?? `stderr:${options.gate.id}` : "",
    };
  };
}

describe("platform certification command", () => {
  it("exposes pnpm certify:platform", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    expect(packageJson.scripts["certify:platform"]).toBe("node scripts/platform-certification.mjs");
  });

  it("runs required Level 5 certification gates without destructive commands", () => {
    expect(PLATFORM_CERTIFICATION_GATES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "staticAudit", command: "pnpm run audit:static" }),
        expect.objectContaining({ id: "runtimeAudit", command: "pnpm run audit:runtime --json" }),
        expect.objectContaining({ id: "e2eOperationalAudit", command: "pnpm run audit:e2e" }),
        expect.objectContaining({ id: "resilienceAudit", command: "pnpm run audit:resilience" }),
        expect.objectContaining({ id: "adminCertification", command: "pnpm run certify:admin" }),
        expect.objectContaining({ id: "rollbackSimulation", command: "pnpm run deploy:rollback-simulation --json" }),
      ]),
    );

    const commands = PLATFORM_CERTIFICATION_GATES.map((entry) => entry.command).join("\n");
    expect(commands).not.toMatch(/\breset:platform\b/);
    expect(commands).not.toMatch(/\bpromote:production\b/);
    expect(commands).not.toMatch(/\bcleanup:test-data\b/);
    expect(commands).not.toMatch(/\bdocker\s+(stop|kill|rm|compose\s+down)\b/i);
    expect(commands).not.toMatch(/\bcore-config:apply\b/);
  });

  it("certifies PASS only when every planned mandatory gate passes", async () => {
    const gates = [gate("staticAudit"), gate("runtimeAudit"), gate("adminCertification")];
    const report = await buildPlatformCertificationReport({
      repoRoot: process.cwd(),
      gates,
      runCommand: runCommandWithFailures(),
      currentCommit: COMMIT,
      currentBranch: "staging",
      runStartedAt: RUN_STARTED_AT,
      completedAt: RUN_COMPLETED_AT,
    });

    expect(report.certificationStatus).toBe("PASS");
    expect(report.CERTIFYING).toBe(true);
    expect(report.deploymentReadinessScore).toBe(100);
    expect(report.unresolvedBlockers).toEqual([]);
  });

  it("fails closed and identifies missing admin credentials", async () => {
    const gates = [gate("runtimeAudit"), gate("adminCertification")];
    const report = await buildPlatformCertificationReport({
      repoRoot: process.cwd(),
      gates,
      runCommand: runCommandWithFailures(["adminCertification"], {
        adminCertification:
          "Admin click-through certification is required but E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD are unavailable.",
      }),
      currentCommit: COMMIT,
      currentBranch: "staging",
      runStartedAt: RUN_STARTED_AT,
      completedAt: RUN_COMPLETED_AT,
    });

    expect(report.certificationStatus).toBe("FAIL");
    expect(report.CERTIFYING).toBe(false);
    expect(report.deploymentReadinessScore).toBe(50);
    expect(report.unresolvedBlockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gateId: "adminCertification",
          severity: "BLOCKER",
          reason: expect.stringContaining("E2E admin credentials"),
        }),
      ]),
    );
  });

  it("scores readiness by gate weights", () => {
    const gates = [
      gate("passed", { weight: 70 }),
      gate("failed", { weight: 30 }),
    ];
    const score = scoreDeploymentReadiness(gates, [
      { id: "passed", status: "passed" },
      { id: "failed", status: "failed" },
    ]);

    expect(score).toBe(70);
  });

  it("builds a subsystem matrix from failed gate results", () => {
    const matrix = buildSubsystemCertificationMatrix(
      [
        { id: "runtimeAudit", status: "failed" },
        { id: "stagingRoutingGate", status: "passed" },
      ],
      [
        {
          subsystem: "Runtime Validation",
          gateIds: ["runtimeAudit", "stagingRoutingGate"],
          requiredForPass: true,
        },
      ],
    );

    expect(matrix).toEqual([
      expect.objectContaining({
        subsystem: "Runtime Validation",
        status: "FAIL",
        failedGateIds: ["runtimeAudit"],
        passedGateIds: ["stagingRoutingGate"],
      }),
    ]);
  });

  it("classifies runtime SSH gaps as production blockers", () => {
    const blockers = buildPlatformBlockers([gate("runtimeAudit")], [
      {
        id: "runtimeAudit",
        label: "Level 2 runtime/system audit",
        subsystem: "Infrastructure Readiness",
        command: "pnpm run audit:runtime --json",
        status: "failed",
        failureReason:
          "Runtime audit could not certify container, DB, storage, OCR/PDF, log, or volume state because staging SSH diagnostics were unavailable.",
      },
    ]);

    expect(blockers).toEqual([
      expect.objectContaining({
        severity: "BLOCKER",
        subsystem: "Infrastructure Readiness",
        requiredBeforeProduction: true,
      }),
    ]);
  });
});
