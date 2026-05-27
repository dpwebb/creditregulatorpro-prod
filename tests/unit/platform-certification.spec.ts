import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  DEPLOYMENT_CERTIFICATION_MODES,
  PLATFORM_CERTIFICATION_GATES,
  buildPlatformBlockers,
  buildPlatformCertificationReport,
  buildSubsystemCertificationMatrix,
  isDeferrableAdminCredentialLiveBlocker,
  resolveDeploymentCertificationMode,
  resolveCertificationGateCommand,
  scoreDeploymentReadiness,
  stagingAdminE2eCredentialsAvailable,
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

  it("defaults deployment certification mode to LIVE_PRODUCTION", () => {
    expect(resolveDeploymentCertificationMode({})).toBe(DEPLOYMENT_CERTIFICATION_MODES.LIVE_PRODUCTION);
    expect(resolveDeploymentCertificationMode({ CRP_DEPLOYMENT_CERTIFICATION_MODE: "invalid" })).toBe(
      DEPLOYMENT_CERTIFICATION_MODES.LIVE_PRODUCTION,
    );
    expect(resolveDeploymentCertificationMode({ CRP_DEPLOYMENT_CERTIFICATION_MODE: "offline_deployment" })).toBe(
      DEPLOYMENT_CERTIFICATION_MODES.OFFLINE_DEPLOYMENT,
    );
  });

  it("runs required Level 5 certification gates without destructive commands", () => {
    expect(PLATFORM_CERTIFICATION_GATES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "staticAudit", command: "pnpm run audit:static" }),
        expect.objectContaining({ id: "runtimeAudit", command: "pnpm run audit:runtime --json" }),
        expect.objectContaining({ id: "e2eOperationalAudit", command: "pnpm run audit:e2e" }),
        expect.objectContaining({ id: "resilienceAudit", command: "pnpm run audit:resilience" }),
        expect.objectContaining({
          id: "adminStaticCertification",
          command:
            "pnpm exec vitest run --config vitest.config.ts tests/unit/admin-sidebar-routes.spec.ts tests/contracts/route-auth-classification.spec.ts tests/api/support-role-privacy-matrix.spec.ts",
        }),
        expect.objectContaining({
          id: "adminClickThrough",
          command:
            "pnpm exec playwright test tests/e2e/admin-sidebar-routes.spec.ts tests/e2e/admin-security-functions.spec.ts",
        }),
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

  it("allows the static audit enough time for slow typecheck runs", () => {
    const staticAuditGate = PLATFORM_CERTIFICATION_GATES.find((entry) => entry.id === "staticAudit");

    expect(staticAuditGate?.timeoutMs).toBeGreaterThanOrEqual(20 * 60 * 1000);
  });

  it("certifies PASS only when every planned mandatory gate passes", async () => {
    const gates = [gate("staticAudit"), gate("runtimeAudit"), gate("adminClickThrough")];
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

  it("detects staging admin credentials for credentialed e2e orchestration", () => {
    expect(stagingAdminE2eCredentialsAvailable({})).toBe(false);
    expect(stagingAdminE2eCredentialsAvailable({
      STAGING_ADMIN_EMAIL: "admin@example.test",
      STAGING_ADMIN_PASSWORD: "secret-password",
    })).toBe(true);
    expect(stagingAdminE2eCredentialsAvailable({
      STAGING_ADMIN_SESSION_COOKIE: "floot_built_app_session=abc",
    })).toBe(true);
  });

  it("switches the operational audit gate to --require-admin when staging admin inputs exist", async () => {
    const gates = [gate("e2eOperationalAudit", { command: "pnpm run audit:e2e" })];
    const commands: string[] = [];
    const report = await buildPlatformCertificationReport({
      repoRoot: process.cwd(),
      gates,
      env: {
        STAGING_ADMIN_EMAIL: "admin@example.test",
        STAGING_ADMIN_PASSWORD: "secret-password",
      },
      runCommand: async (command: string, options: { gate: { id: string } }) => {
        commands.push(command);
        return runCommandWithFailures()(command, options);
      },
      currentCommit: COMMIT,
      currentBranch: "staging",
      runStartedAt: RUN_STARTED_AT,
      completedAt: RUN_COMPLETED_AT,
    });

    expect(resolveCertificationGateCommand(gates[0], {})).toBe("pnpm run audit:e2e");
    expect(commands).toEqual(["pnpm audit:e2e --require-admin"]);
    expect(report.exactCommandsRun[0]).toMatchObject({
      gateId: "e2eOperationalAudit",
      command: "pnpm audit:e2e --require-admin",
      status: "passed",
    });
    expect(report.certificationStatus).toBe("PASS");
  });

  it("keeps the non-admin e2e path when staging admin inputs are absent", async () => {
    const gates = [gate("e2eOperationalAudit", { command: "pnpm run audit:e2e" })];
    const commands: string[] = [];
    await buildPlatformCertificationReport({
      repoRoot: process.cwd(),
      gates,
      env: {},
      runCommand: async (command: string, options: { gate: { id: string } }) => {
        commands.push(command);
        return runCommandWithFailures()(command, options);
      },
      currentCommit: COMMIT,
      currentBranch: "staging",
      runStartedAt: RUN_STARTED_AT,
      completedAt: RUN_COMPLETED_AT,
    });

    expect(commands).toEqual(["pnpm run audit:e2e"]);
  });

  it("classifies missing admin credentials as input-blocked certification", async () => {
    const gates = [gate("runtimeAudit"), gate("adminClickThrough")];
    const report = await buildPlatformCertificationReport({
      repoRoot: process.cwd(),
      gates,
      runCommand: runCommandWithFailures(["adminClickThrough"], {
        adminClickThrough:
          "Admin click-through certification is required but E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD are unavailable.",
      }),
      currentCommit: COMMIT,
      currentBranch: "staging",
      runStartedAt: RUN_STARTED_AT,
      completedAt: RUN_COMPLETED_AT,
    });

    expect(report.certificationStatus).toBe("INCOMPLETE");
    expect(report.CERTIFYING).toBe(false);
    expect(report.BLOCKED_BY_INPUTS).toBe(true);
    expect(report.certificationMode).toBe(DEPLOYMENT_CERTIFICATION_MODES.LIVE_PRODUCTION);
    expect(report.liveProductionCertified).toBe(false);
    expect(report.nonPublicDeploymentAcceptable).toBe(false);
    expect(report.deploymentReadinessScore).toBe(50);
    expect(report.unresolvedBlockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gateId: "adminClickThrough",
          severity: "BLOCKED_BY_INPUTS",
          reason: expect.stringContaining("E2E admin credentials"),
        }),
      ]),
    );
  });

  it("defers only admin credential click-through blockers in non-public production test mode", async () => {
    const gates = [gate("runtimeAudit"), gate("adminClickThrough")];
    const report = await buildPlatformCertificationReport({
      repoRoot: process.cwd(),
      gates,
      env: {
        CRP_DEPLOYMENT_CERTIFICATION_MODE: "NON_PUBLIC_PRODUCTION_TEST",
      },
      runCommand: runCommandWithFailures(["adminClickThrough"], {
        adminClickThrough:
          "Admin click-through certification is required but E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD are unavailable.",
      }),
      currentCommit: COMMIT,
      currentBranch: "staging",
      runStartedAt: RUN_STARTED_AT,
      completedAt: RUN_COMPLETED_AT,
    });

    expect(report.certificationStatus).toBe("INCOMPLETE");
    expect(report.CERTIFYING).toBe(false);
    expect(report.liveProductionCertified).toBe(false);
    expect(report.nonPublicDeploymentAcceptable).toBe(true);
    expect(report.deferredLiveProductionBlockers).toEqual([
      expect.objectContaining({
        gateId: "adminClickThrough",
        severity: "DEFERRED_LIVE_PRODUCTION_BLOCKER",
        requiredBeforeLiveProduction: true,
      }),
    ]);
    expect(report.hardUnresolvedBlockers).toEqual([]);
  });

  it("defers e2e admin probe credential gaps only when the non-admin workflow otherwise passed", async () => {
    const gates = [gate("runtimeAudit"), gate("e2eOperationalAudit")];
    const report = await buildPlatformCertificationReport({
      repoRoot: process.cwd(),
      gates,
      env: {
        CRP_DEPLOYMENT_CERTIFICATION_MODE: "OFFLINE_DEPLOYMENT",
      },
      runCommand: runCommandWithFailures(["e2eOperationalAudit"], {
        e2eOperationalAudit:
          '{"status":"INCOMPLETE","certification":"Operational INCOMPLETE: non-admin staging workflow passed, but the admin packet workflow probe was skipped because admin credentials were missing.","metrics":{"adminProbeSkipCode":"ADMIN_PROBE_SKIPPED_CREDENTIALS_MISSING"}}',
      }),
      currentCommit: COMMIT,
      currentBranch: "staging",
      runStartedAt: RUN_STARTED_AT,
      completedAt: RUN_COMPLETED_AT,
    });

    expect(report.nonPublicDeploymentAcceptable).toBe(true);
    expect(report.deferredLiveProductionBlockers).toEqual([
      expect.objectContaining({
        gateId: "e2eOperationalAudit",
        requiredBeforeLiveProduction: true,
      }),
    ]);
  });

  it("does not defer runtime audit incompleteness in non-public mode", async () => {
    const gates = [gate("runtimeAudit"), gate("adminClickThrough")];
    const report = await buildPlatformCertificationReport({
      repoRoot: process.cwd(),
      gates,
      env: {
        CRP_DEPLOYMENT_CERTIFICATION_MODE: "NON_PUBLIC_PRODUCTION_TEST",
      },
      runCommand: runCommandWithFailures(["runtimeAudit", "adminClickThrough"], {
        runtimeAudit: '{"completion":"AUDIT_ACCESS_FAILURE","status":"FAIL"}',
        adminClickThrough:
          "Admin click-through certification is required but E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD are unavailable.",
      }),
      currentCommit: COMMIT,
      currentBranch: "staging",
      runStartedAt: RUN_STARTED_AT,
      completedAt: RUN_COMPLETED_AT,
    });

    expect(report.nonPublicDeploymentAcceptable).toBe(false);
    expect(report.deferredLiveProductionBlockers).toEqual([
      expect.objectContaining({ gateId: "adminClickThrough" }),
    ]);
    expect(report.hardUnresolvedBlockers).toEqual([
      expect.objectContaining({ gateId: "runtimeAudit" }),
    ]);
  });

  it("does not classify admin navigation or app behavior failures as deferrable credential blockers", () => {
    expect(
      isDeferrableAdminCredentialLiveBlocker({
        gateId: "adminClickThrough",
        severity: "BLOCKED_BY_INPUTS",
        reason: "Admin click-through certification timed out while loading staging login or admin routes.",
        diagnostic: { observedFailure: "admin-navigation-timeout" },
      }),
    ).toBe(false);
    expect(
      isDeferrableAdminCredentialLiveBlocker({
        gateId: "adminClickThrough",
        severity: "BLOCKED_BY_INPUTS",
        reason: "Admin click-through certification reached staging, but the configured E2E/STAGING admin credentials failed login.",
        diagnostic: { observedFailure: "FAIL_AUTH" },
      }),
    ).toBe(true);
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

  it("certifies PASS_WITH_WARNINGS when mandatory gates pass with runtime warn-only findings", async () => {
    const gates = [gate("runtimeAudit")];
    const report = await buildPlatformCertificationReport({
      repoRoot: process.cwd(),
      gates,
      runCommand: async () => ({
        exitCode: 0,
        timedOut: false,
        startedAt: "2026-05-25T12:00:01.000Z",
        completedAt: "2026-05-25T12:00:02.000Z",
        durationMs: 1000,
        stdoutTail: '{"completion":"FULL_RUNTIME_PASS_WITH_WARNINGS","status":"WARN"}',
        stderrTail: "",
      }),
      currentCommit: COMMIT,
      currentBranch: "staging",
      runStartedAt: RUN_STARTED_AT,
      completedAt: RUN_COMPLETED_AT,
    });

    expect(report.certificationStatus).toBe("PASS_WITH_WARNINGS");
    expect(report.CERTIFYING).toBe(true);
    expect(report.warnOnlyFindings).toEqual([
      expect.objectContaining({
        severity: "WARN_ONLY",
        gateId: "runtimeAudit",
      }),
    ]);
    expect(report.unresolvedBlockers).toEqual([]);
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

  it("classifies runtime SSH gaps as input-blocked production requirements", () => {
    const blockers = buildPlatformBlockers([gate("runtimeAudit")], [
      {
        id: "runtimeAudit",
        label: "Level 2 runtime/system audit",
        subsystem: "Infrastructure Readiness",
        command: "pnpm run audit:runtime --json",
        status: "incomplete",
        incompleteReason:
          "Runtime audit could not certify container, DB, storage, OCR/PDF, log, or volume state because staging SSH diagnostics were unavailable.",
      },
    ]);

    expect(blockers).toEqual([
      expect.objectContaining({
        severity: "BLOCKED_BY_INPUTS",
        subsystem: "Infrastructure Readiness",
        requiredBeforeProduction: true,
      }),
    ]);
  });

  it("classifies runtime audit access failure as incomplete, not platform failure", async () => {
    const gates = [gate("runtimeAudit")];
    const report = await buildPlatformCertificationReport({
      repoRoot: process.cwd(),
      gates,
      runCommand: runCommandWithFailures(["runtimeAudit"], {
        runtimeAudit: '{"completion":"AUDIT_ACCESS_FAILURE","status":"FAIL","checks":[{"subsystem":"SSH Diagnostics","status":"FAIL"}]}',
      }),
      currentCommit: COMMIT,
      currentBranch: "staging",
      runStartedAt: RUN_STARTED_AT,
      completedAt: RUN_COMPLETED_AT,
    });

    expect(report.certificationStatus).toBe("INCOMPLETE");
    expect(report.gates[0]).toMatchObject({
      status: "incomplete",
      incompleteReason: expect.stringContaining("Runtime audit diagnostics are unavailable"),
    });
    expect(report.infrastructureReadinessStatus).toBe("INCOMPLETE");
  });

  it("classifies admin click-through login rejection as credential/config incomplete", async () => {
    const gates = [gate("adminClickThrough")];
    const report = await buildPlatformCertificationReport({
      repoRoot: process.cwd(),
      gates,
      runCommand: runCommandWithFailures(["adminClickThrough"], {
        adminClickThrough: "Login failed for admin@example.test. Verify the E2E credentials and E2E_BASE_URL target.",
      }),
      currentCommit: COMMIT,
      currentBranch: "staging",
      runStartedAt: RUN_STARTED_AT,
      completedAt: RUN_COMPLETED_AT,
    });

    expect(report.certificationStatus).toBe("INCOMPLETE");
    expect(report.gates[0]).toMatchObject({
      status: "incomplete",
      diagnostic: expect.objectContaining({
        observedFailure: "FAIL_AUTH",
      }),
    });
    expect(report.unresolvedBlockers[0]).toMatchObject({
      severity: "BLOCKED_BY_INPUTS",
      reason: expect.stringContaining("failed login"),
    });
  });

  it("classifies admin route navigation timeouts separately from credential failures", async () => {
    const gates = [gate("adminClickThrough")];
    const report = await buildPlatformCertificationReport({
      repoRoot: process.cwd(),
      gates,
      runCommand: runCommandWithFailures(["adminClickThrough"], {
        adminClickThrough:
          'Test timeout of 60000ms exceeded. Error: page.goto: Test timeout of 60000ms exceeded. navigating to "https://staging.creditregulatorpro.com/admin-security", waiting until "domcontentloaded"',
      }),
      currentCommit: COMMIT,
      currentBranch: "staging",
      runStartedAt: RUN_STARTED_AT,
      completedAt: RUN_COMPLETED_AT,
    });

    expect(report.unresolvedBlockers[0]).toMatchObject({
      gateId: "adminClickThrough",
      reason: "Admin click-through certification timed out while loading staging login or admin routes.",
    });
    expect(report.gates[0].diagnostic).toMatchObject({
      observedFailure: "admin-navigation-timeout",
      rawOutputStored: false,
    });
  });

  it("classifies empty admin audit-log filter results", async () => {
    const gates = [gate("adminClickThrough")];
    const report = await buildPlatformCertificationReport({
      repoRoot: process.cwd(),
      gates,
      runCommand: runCommandWithFailures(["adminClickThrough"], {
        adminClickThrough:
          'expect(locator).toContainText(expected) failed. Expected substring: "DELETE". Received string: "No audit logs found matching your criteria."',
      }),
      currentCommit: COMMIT,
      currentBranch: "staging",
      runStartedAt: RUN_STARTED_AT,
      completedAt: RUN_COMPLETED_AT,
    });

    expect(report.unresolvedBlockers[0]).toMatchObject({
      gateId: "adminClickThrough",
      reason:
        "Admin click-through reached the Security & Compliance page, but the audit-log filter did not return the expected DELETE/FAILURE row.",
    });
    expect(report.gates[0].diagnostic).toMatchObject({
      observedFailure: "admin-audit-log-filter-empty",
      rawOutputStored: false,
    });
  });
});
