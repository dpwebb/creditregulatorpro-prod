import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  AUTH_WORKFLOW_SMOKE_ENV,
  DEFAULT_STAGING_AUTH_SMOKE_BASE_URL,
  REQUIRED_CERTIFICATION_GATES,
  buildCertificationHarnessFixEvidence,
  buildGateExecutionContext,
  buildProductionScaleCertificationReport,
  writeProductionScaleCertificationOutputs,
} from "../../scripts/production-scale-certification.mjs";

const HEAD = "a".repeat(40);
const RUN_STARTED_AT = "2026-05-21T12:00:00.000Z";
const RUN_COMPLETED_AT = "2026-05-21T12:00:05.000Z";

const tempRoots: string[] = [];

function tempRepoRoot() {
  const root = mkdtempSync(join(tmpdir(), "crp-production-scale-cert-"));
  tempRoots.push(root);
  return root;
}

function writeEvidence(root: string, relativePath: string, overrides = {}) {
  const filePath = join(root, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(
    filePath,
    `${JSON.stringify(
      {
        reportName: "mock-production-scale-evidence",
        generatedAt: "2026-05-21T12:00:02.000Z",
        currentHead: HEAD,
        status: "passed",
        ...overrides,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

function gate(id: string, command = `mock:${id}`, evidencePath?: string) {
  return {
    id,
    label: id,
    command,
    evidencePath,
  };
}

function freshnessGate() {
  return {
    id: "evidenceFreshness",
    label: "Evidence freshness check",
    command: "internal evidence freshness check",
    internal: true,
  };
}

function runCommandWithFailures(
  failedGateIds: string[] = [],
  onCommand: (command: string, options: { gate: { id: string }; env?: Record<string, string> }) => void = () => {},
) {
  return async (command: string, options: { gate: { id: string }; env?: Record<string, string> }) => {
    onCommand(command, options);
    return {
    command,
    exitCode: failedGateIds.includes(options.gate.id) ? 1 : 0,
    startedAt: "2026-05-21T12:00:01.000Z",
    completedAt: "2026-05-21T12:00:02.000Z",
    durationMs: 1000,
      stdout: `stdout:${options.gate.id}`,
      stderr: failedGateIds.includes(options.gate.id) ? `stderr:${options.gate.id}` : "",
    };
  };
}

async function buildMockReport(options: {
  repoRoot: string;
  gates: ReturnType<typeof gate>[];
  requiredGateIds?: string[];
  failedGateIds?: string[];
}) {
  return buildProductionScaleCertificationReport({
    repoRoot: options.repoRoot,
    gates: [...options.gates, freshnessGate()],
    requiredGateIds: options.requiredGateIds ?? [...options.gates.map((entry) => entry.id), "evidenceFreshness"],
    runCommand: runCommandWithFailures(options.failedGateIds),
    currentHead: HEAD,
    currentBranch: "staging",
    targetSha: HEAD,
    runStartedAt: RUN_STARTED_AT,
    completedAt: RUN_COMPLETED_AT,
  });
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("production-scale certification report", () => {
  it("includes authenticated upload-to-results as a required certification gate", () => {
    expect(REQUIRED_CERTIFICATION_GATES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "typecheck",
          command: "pnpm run typecheck",
        }),
        expect.objectContaining({
          id: "build",
          command: "pnpm run build",
        }),
        expect.objectContaining({
          id: "goldenPath",
          command: "pnpm run test:golden-path",
        }),
        expect.objectContaining({
          id: "authenticatedUploadResults",
          command: "pnpm run smoke:auth-workflow",
        }),
        expect.objectContaining({
          id: "authenticatedPacketPdf",
          command: "pnpm run smoke:auth-workflow:packet",
        }),
        expect.objectContaining({
          id: "machineProofSummary",
          command: "pnpm run production:machine-proofs",
          evidencePath: "docs/production-scale/evidence/latest-machine-proof-summary.json",
        }),
      ]),
    );
  });

  it("injects staging-safe auth smoke environment for auth workflow commands", async () => {
    const root = tempRepoRoot();
    const calls: Array<{ gateId: string; env?: Record<string, string> }> = [];
    const report = await buildProductionScaleCertificationReport({
      repoRoot: root,
      gates: [
        gate("authenticatedUploadResults", "pnpm run smoke:auth-workflow"),
        gate("authenticatedPacketPdf", "pnpm run smoke:auth-workflow:packet"),
        freshnessGate(),
      ],
      requiredGateIds: ["authenticatedUploadResults", "authenticatedPacketPdf", "evidenceFreshness"],
      runCommand: runCommandWithFailures([], (_command, options) => {
        calls.push({ gateId: options.gate.id, env: options.env });
      }),
      currentHead: HEAD,
      currentBranch: "staging",
      targetSha: HEAD,
      runStartedAt: RUN_STARTED_AT,
      completedAt: RUN_COMPLETED_AT,
      env: {},
    });

    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gateId: "authenticatedUploadResults",
          env: expect.objectContaining({
            [AUTH_WORKFLOW_SMOKE_ENV]: "true",
            STAGING_BASE_URL: DEFAULT_STAGING_AUTH_SMOKE_BASE_URL,
          }),
        }),
        expect.objectContaining({
          gateId: "authenticatedPacketPdf",
          env: expect.objectContaining({
            [AUTH_WORKFLOW_SMOKE_ENV]: "true",
            STAGING_BASE_URL: DEFAULT_STAGING_AUTH_SMOKE_BASE_URL,
            CRP_AUTH_WORKFLOW_SMOKE_INCLUDE_PACKET: "true",
          }),
        }),
      ]),
    );
    expect(report.gates.find((entry: { id: string }) => entry.id === "authenticatedUploadResults")).toMatchObject({
      proofScope: "staging",
      stagingProof: true,
      productionProof: false,
      environment: {
        [AUTH_WORKFLOW_SMOKE_ENV]: "true",
        STAGING_BASE_URL: DEFAULT_STAGING_AUTH_SMOKE_BASE_URL,
      },
    });
  });

  it("does not treat staging auth smokes as production runtime proof", async () => {
    const root = tempRepoRoot();
    const report = await buildMockReport({
      repoRoot: root,
      gates: [gate("authenticatedUploadResults", "pnpm run smoke:auth-workflow")],
    });
    const harnessFix = buildCertificationHarnessFixEvidence(report);
    const authGate = report.gates.find((entry: { id: string }) => entry.id === "authenticatedUploadResults");
    const exactCommand = report.exactCommandsRun.find(
      (entry: { gateId: string }) => entry.gateId === "authenticatedUploadResults",
    );

    expect(report.CERTIFYING).toBe(true);
    expect(report.stagingOnlyProofGates).toEqual(["authenticatedUploadResults"]);
    expect(authGate).toMatchObject({
      proofScope: "staging",
      stagingProof: true,
      productionProof: false,
      productionCredentialsRequired: false,
      productionDataMutated: false,
    });
    expect(exactCommand).toMatchObject({
      proofScope: "staging",
      stagingProof: true,
      productionProof: false,
    });
    expect(harnessFix).toMatchObject({
      CERTIFYING: false,
      productionProof: false,
      stagingProof: true,
      productionCredentialsRequired: false,
      productionDataMutated: false,
    });
  });

  it("preserves failing smoke command exit codes and records exact command results", async () => {
    const root = tempRepoRoot();
    const report = await buildProductionScaleCertificationReport({
      repoRoot: root,
      gates: [gate("authenticatedUploadResults", "pnpm run smoke:auth-workflow"), freshnessGate()],
      requiredGateIds: ["authenticatedUploadResults", "evidenceFreshness"],
      runCommand: async (command: string, options: { gate: { id: string } }) => ({
        command,
        exitCode: 7,
        startedAt: "2026-05-21T12:00:01.000Z",
        completedAt: "2026-05-21T12:00:02.000Z",
        durationMs: 1000,
        stdout: "smoke stdout",
        stderr: "smoke stderr",
      }),
      currentHead: HEAD,
      currentBranch: "staging",
      targetSha: HEAD,
      runStartedAt: RUN_STARTED_AT,
      completedAt: RUN_COMPLETED_AT,
      env: {},
    });

    expect(report.CERTIFYING).toBe(false);
    expect(report.failedGates).toContain("authenticatedUploadResults");
    expect(report.gates.find((entry: { id: string }) => entry.id === "authenticatedUploadResults")).toMatchObject({
      status: "failed",
      exitCode: 7,
      stdoutTail: "smoke stdout",
      stderrTail: "smoke stderr",
      notes: expect.arrayContaining(["command exited with 7"]),
    });
    expect(report.exactCommandsRun).toContainEqual(
      expect.objectContaining({
        gateId: "authenticatedUploadResults",
        command: "pnpm run smoke:auth-workflow",
        status: "failed",
        exitCode: 7,
        proofScope: "staging",
        stagingProof: true,
        productionProof: false,
      }),
    );
  });

  it("fails closed instead of running auth smokes against unsafe hosts", async () => {
    const root = tempRepoRoot();
    let called = false;
    const report = await buildProductionScaleCertificationReport({
      repoRoot: root,
      gates: [gate("authenticatedUploadResults", "pnpm run smoke:auth-workflow"), freshnessGate()],
      requiredGateIds: ["authenticatedUploadResults", "evidenceFreshness"],
      runCommand: async () => {
        called = true;
        return {
          command: "pnpm run smoke:auth-workflow",
          exitCode: 0,
          startedAt: "2026-05-21T12:00:01.000Z",
          completedAt: "2026-05-21T12:00:02.000Z",
          durationMs: 1000,
          stdout: "",
          stderr: "",
        };
      },
      currentHead: HEAD,
      currentBranch: "staging",
      targetSha: HEAD,
      runStartedAt: RUN_STARTED_AT,
      completedAt: RUN_COMPLETED_AT,
      env: { STAGING_BASE_URL: "https://creditregulatorpro.com" },
    });

    expect(called).toBe(false);
    expect(report.CERTIFYING).toBe(false);
    expect(report.failedGates).toContain("authenticatedUploadResults");
    expect(report.gates.find((entry: { id: string }) => entry.id === "authenticatedUploadResults")).toMatchObject({
      status: "failed",
      exitCode: 1,
      proofScope: "staging",
      productionProof: false,
    });
  });

  it("keeps package aliases explicit without creating false lint confidence", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

    expect(packageJson.scripts.test).toBe("pnpm run test:unit");
    expect(packageJson.scripts.lint).toContain("No lint infrastructure is configured");
    expect(packageJson.scripts.lint).toContain("process.exit(1)");
    expect(packageJson.scripts.check).toContain("pnpm run typecheck");
    expect(packageJson.scripts.check).toContain("pnpm run test:golden-path");
    expect(packageJson.scripts.check).toContain("pnpm run test:unit:check");
    expect(packageJson.scripts["test:unit:check"]).toContain("--testTimeout=60000");
    expect(packageJson.scripts["test:unit:check"]).toContain("--exclude tests/golden-path/**");
    expect(packageJson.scripts["test:unit:check"]).toContain("tests/api/response-processing-queue.spec.ts");
    expect(packageJson.scripts["test:unit:check"]).toContain("tests/api/ingest-processing-worker.spec.ts");
  });

  it("builds direct gate context with staging defaults", () => {
    const context = buildGateExecutionContext({ id: "authenticatedUploadResults" }, {});

    expect(context).toMatchObject({
      ok: true,
      proofScope: "staging",
      stagingProof: true,
      productionProof: false,
      env: {
        [AUTH_WORKFLOW_SMOKE_ENV]: "true",
        STAGING_BASE_URL: DEFAULT_STAGING_AUTH_SMOKE_BASE_URL,
      },
    });
  });

  it("marks CERTIFYING:false when a required gate is missing", async () => {
    const root = tempRepoRoot();
    const report = await buildMockReport({
      repoRoot: root,
      gates: [gate("contracts")],
      requiredGateIds: ["contracts", "api", "evidenceFreshness"],
    });

    expect(report.CERTIFYING).toBe(false);
    expect(report.skippedGates).toContain("api");
    expect(report.gateStatus.api).toBe("skipped");
  });

  it("marks CERTIFYING:false when a gate command fails", async () => {
    const root = tempRepoRoot();
    const report = await buildMockReport({
      repoRoot: root,
      gates: [gate("contracts"), gate("api")],
      failedGateIds: ["api"],
    });

    expect(report.CERTIFYING).toBe(false);
    expect(report.failedGates).toContain("api");
    expect(report.gateStatus.api).toBe("failed");
  });

  it("marks CERTIFYING:false when evidence is stale", async () => {
    const root = tempRepoRoot();
    const evidencePath = "docs/production-scale/evidence/mock-stale-evidence.json";
    writeEvidence(root, evidencePath, {
      generatedAt: "2026-05-21T11:00:00.000Z",
      currentHead: HEAD,
    });

    const report = await buildMockReport({
      repoRoot: root,
      gates: [gate("packetPdfCacheMiss", "mock:packet", evidencePath)],
    });

    expect(report.CERTIFYING).toBe(false);
    expect(report.staleGates).toContain("packetPdfCacheMiss");
    expect(report.gateStatus.evidenceFreshness).toBe("failed");
  });

  it("reports missing machine runtime inputs without human-proof language", async () => {
    const root = tempRepoRoot();
    const evidencePath = "docs/production-scale/evidence/latest-restore-machine-proof.json";
    writeEvidence(root, evidencePath, {
      evidenceType: "DISASTER_RECOVERY_RESTORE_MACHINE_PROOF",
      generatedAt: "2026-05-21T12:00:02.000Z",
      currentHead: HEAD,
      status: "fail",
      certifying: false,
      CERTIFYING: false,
      humanInteractionRequired: false,
      missingRuntimeInputs: ["CRP_RESTORE_MACHINE_ATTESTATION_JSON"],
    });

    const report = await buildMockReport({
      repoRoot: root,
      gates: [gate("restoreMachineProof", "pnpm run restore:machine-proof", evidencePath)],
    });

    expect(report.CERTIFYING).toBe(false);
    expect(report.missingMachineRuntimeInputs).toEqual(["CRP_RESTORE_MACHINE_ATTESTATION_JSON"]);
    expect(report.humanInteractionRequired).toBe(false);
    expect(JSON.stringify(report)).not.toMatch(/human-observed proof|required human|operator acknowledgement/i);
    expect(report.evidenceFreshness.find((entry: { gateId: string }) => entry.gateId === "restoreMachineProof"))
      .toMatchObject({
        missingRuntimeInputs: ["CRP_RESTORE_MACHINE_ATTESTATION_JSON"],
        humanInteractionRequired: false,
        reasons: expect.arrayContaining([
          "missing machine runtime inputs: CRP_RESTORE_MACHINE_ATTESTATION_JSON",
        ]),
      });
  });

  it("fails closed when combined machine proof summary is non-certifying", async () => {
    const root = tempRepoRoot();
    const evidencePath = "docs/production-scale/evidence/latest-machine-proof-summary.json";
    writeEvidence(root, evidencePath, {
      reportName: "production-machine-proof-summary",
      generatedAt: "2026-05-21T12:00:02.000Z",
      currentHead: HEAD,
      status: "failed",
      CERTIFYING: false,
      allMachineProofsCertifying: false,
      missingRuntimeInputs: ["CRP_RESTORE_MACHINE_ATTESTATION_JSON"],
      safetySummary: {
        humanInteractionRequired: false,
      },
    });

    const report = await buildMockReport({
      repoRoot: root,
      gates: [gate("machineProofSummary", "pnpm run production:machine-proofs", evidencePath)],
    });

    expect(report.CERTIFYING).toBe(false);
    expect(report.failedGates).toContain("evidenceFreshness");
    expect(report.staleGates).toContain("machineProofSummary");
    expect(report.missingMachineRuntimeInputs).toEqual(["CRP_RESTORE_MACHINE_ATTESTATION_JSON"]);
    expect(report.evidenceFreshness.find((entry: { gateId: string }) => entry.gateId === "machineProofSummary"))
      .toMatchObject({
        reasons: expect.arrayContaining([
          "nested evidence is not certifying.",
          "missing machine runtime inputs: CRP_RESTORE_MACHINE_ATTESTATION_JSON",
        ]),
      });
  });

  it("accepts machine proof summary commitHash as the freshness head", async () => {
    const root = tempRepoRoot();
    const evidencePath = "docs/production-scale/evidence/latest-machine-proof-summary.json";
    writeEvidence(root, evidencePath, {
      reportName: "production-machine-proof-summary",
      generatedAt: "2026-05-21T12:00:02.000Z",
      currentHead: undefined,
      currentCommitHash: undefined,
      commitHash: HEAD,
      status: "passed",
      CERTIFYING: true,
      allMachineProofsCertifying: true,
      missingRuntimeInputs: [],
      safetySummary: {
        humanInteractionRequired: false,
      },
    });

    const report = await buildMockReport({
      repoRoot: root,
      gates: [gate("machineProofSummary", "pnpm run production:machine-proofs", evidencePath)],
    });

    expect(report.CERTIFYING).toBe(true);
    expect(report.staleGates).toEqual([]);
  });

  it("marks CERTIFYING:true when every mocked gate and evidence check passes", async () => {
    const root = tempRepoRoot();
    const evidencePath = "docs/production-scale/evidence/mock-fresh-evidence.json";
    writeEvidence(root, evidencePath);

    const report = await buildMockReport({
      repoRoot: root,
      gates: [gate("contracts"), gate("packetPdfCacheMiss", "mock:packet", evidencePath)],
    });

    expect(report.CERTIFYING).toBe(true);
    expect(report.failedGates).toEqual([]);
    expect(report.staleGates).toEqual([]);
    expect(report.skippedGates).toEqual([]);
  });

  it("writes parseable stable JSON evidence", async () => {
    const root = tempRepoRoot();
    const evidencePath = "docs/production-scale/evidence/mock-fresh-evidence.json";
    writeEvidence(root, evidencePath);
    const report = await buildMockReport({
      repoRoot: root,
      gates: [gate("contracts"), gate("packetPdfCacheMiss", "mock:packet", evidencePath)],
    });

    const outputs = await writeProductionScaleCertificationOutputs(report, root);
    const parsed = JSON.parse(readFileSync(outputs.jsonPath, "utf8"));

    expect(parsed.reportName).toBe("production-scale-certification");
    expect(parsed.currentHead).toBe(HEAD);
    expect(parsed.targetSha).toBe(HEAD);
    expect(parsed.commandList).toEqual(["mock:contracts", "mock:packet", "internal evidence freshness check"]);
    expect(parsed.gateStatus).toEqual({
      contracts: "passed",
      packetPdfCacheMiss: "passed",
      evidenceFreshness: "passed",
    });
    expect(parsed.CERTIFYING).toBe(true);
  });
});
