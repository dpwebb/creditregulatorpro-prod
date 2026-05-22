import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  RESTORE_MACHINE_PROOF_CONFIG,
  RESTORE_MACHINE_PROOF_RUNTIME_INPUTS,
  buildRestoreMachineProofReport,
  restoreMachineProofDomainValidation,
  validateRestoreMachineProofEvidence,
} from "../../scripts/restore-machine-proof.mjs";

const GENERATED_AT = "2026-05-22T12:00:00.000Z";
const NOW = "2026-05-22T13:00:00.000Z";
const HEAD = "a".repeat(40);
const tempRoots: string[] = [];

function tempRoot() {
  const root = mkdtempSync(join(tmpdir(), "crp-restore-proof-"));
  tempRoots.push(root);
  return root;
}

function passingChecks() {
  return RESTORE_MACHINE_PROOF_CONFIG.requiredChecks.map((name) => ({ name, status: "pass" }));
}

function validRestoreAttestation(overrides: Record<string, unknown> = {}) {
  return {
    nonInteractive: true,
    machineAttested: true,
    generatedManually: false,
    humanObserved: false,
    manualApprovalRequired: false,
    simulatedOnly: false,
    checklistOnly: false,
    environment: "production",
    status: "pass",
    certifying: true,
    restoreProofKind: "non-interactive-machine-restore",
    latestBackup: {
      selectedLatest: true,
      opaqueBackupId: "backup-hash-20260522",
      createdAt: "2026-05-22T11:45:00.000Z",
    },
    isolatedRestoreTarget: {
      created: true,
      destroyed: true,
      productionTarget: false,
      targetId: "restore-target-hash",
    },
    safeFixture: {
      fixtureId: "restore-fixture-hash",
      syntheticCredentials: true,
      packetPdfFixture: true,
    },
    rpo: {
      targetMinutes: 15,
      actualMinutes: 4,
      status: "pass",
    },
    rto: {
      targetMinutes: 30,
      actualMinutes: 11,
      status: "pass",
    },
    postRestoreChecks: {
      authSession: true,
      packetPdfRetrieval: true,
      responseQueueState: true,
      cleanupLifecycle: true,
      rollbackStop: true,
    },
    checks: passingChecks(),
    ...overrides,
  };
}

function writeAttestation(root: string, attestation: Record<string, unknown>) {
  const evidenceDir = join(root, "docs", "production-scale", "evidence");
  mkdirSync(evidenceDir, { recursive: true });
  const relativePath = "docs/production-scale/evidence/restore-attestation.json";
  writeFileSync(join(root, relativePath), `${JSON.stringify(attestation, null, 2)}\n`, "utf8");
  return relativePath;
}

function buildReport(attestation: Record<string, unknown>) {
  const root = tempRoot();
  const attestationPath = writeAttestation(root, attestation);
  return buildRestoreMachineProofReport({
    rootDir: root,
    generatedAt: GENERATED_AT,
    env: { CRP_MACHINE_EVIDENCE_COMMIT_HASH: HEAD },
    argv: ["--attestation", attestationPath],
  });
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("restore machine proof", () => {
  it("rejects simulated restore evidence", () => {
    const report = buildReport(validRestoreAttestation({
      simulatedOnly: true,
      restoreProofKind: "simulated-only",
    }));

    expect(report.CERTIFYING).toBe(false);
    expect(validateRestoreMachineProofEvidence(report, { now: NOW }).ok).toBe(false);
    expect(report.failures.map((failure: { message: string }) => failure.message).join("\n")).toMatch(/simulated-only/i);
  });

  it("rejects checklist-only restore evidence", () => {
    const report = buildReport(validRestoreAttestation({
      checklistOnly: true,
      restoreProofKind: "checklist-only",
    }));

    expect(report.CERTIFYING).toBe(false);
    expect(validateRestoreMachineProofEvidence(report, { now: NOW }).ok).toBe(false);
    expect(report.failures.map((failure: { message: string }) => failure.message).join("\n")).toMatch(/checklist-only/i);
  });

  it("fails when RPO or RTO is missing", () => {
    const report = buildReport(validRestoreAttestation({
      rpo: undefined,
      rto: undefined,
    }));

    expect(report.CERTIFYING).toBe(false);
    expect(report.failures.map((failure: { message: string }) => failure.message).join("\n")).toMatch(/RPO|RTO/);
  });

  it("fails when packet PDF retrieval proof is missing", () => {
    const checks = passingChecks().map((check) =>
      check.name === "post-restore-packet-pdf-retrieval-check"
        ? { ...check, status: "fail" }
        : check);
    const report = buildReport(validRestoreAttestation({
      checks,
      postRestoreChecks: {
        authSession: true,
        packetPdfRetrieval: false,
        responseQueueState: true,
        cleanupLifecycle: true,
        rollbackStop: true,
      },
    }));

    expect(report.CERTIFYING).toBe(false);
    expect(report.failures.map((failure: { message: string }) => failure.message).join("\n")).toMatch(/packet PDF/i);
  });

  it("fails when cleanup proof is missing", () => {
    const checks = passingChecks().map((check) =>
      check.name === "isolated-restore-target-destroyed" || check.name === "cleanup-lifecycle-check"
        ? { ...check, status: "fail" }
        : check);
    const report = buildReport(validRestoreAttestation({
      checks,
      isolatedRestoreTarget: {
        created: true,
        destroyed: false,
        productionTarget: false,
        targetId: "restore-target-hash",
      },
      postRestoreChecks: {
        authSession: true,
        packetPdfRetrieval: true,
        responseQueueState: true,
        cleanupLifecycle: false,
        rollbackStop: true,
      },
    }));

    expect(report.CERTIFYING).toBe(false);
    expect(report.failures.map((failure: { message: string }) => failure.message).join("\n")).toMatch(/cleanup|destroyed/i);
  });

  it("accepts a valid sanitized restore fixture", () => {
    const report = buildReport(validRestoreAttestation());
    const validation = validateRestoreMachineProofEvidence(report, { now: NOW });

    expect(report.CERTIFYING).toBe(true);
    expect(report.humanInteractionRequired).toBe(false);
    expect(validation).toMatchObject({
      ok: true,
      certifying: true,
      errors: [],
    });
  });

  it("reports exact missing runtime inputs when restore configuration is unavailable", () => {
    const report = buildRestoreMachineProofReport({
      rootDir: tempRoot(),
      generatedAt: GENERATED_AT,
      env: {},
      argv: [],
    });

    expect(report.CERTIFYING).toBe(false);
    expect(report.humanInteractionRequired).toBe(false);
    expect(report.missingRuntimeInputs).toEqual(RESTORE_MACHINE_PROOF_RUNTIME_INPUTS);
    expect(restoreMachineProofDomainValidation(report).missingRuntimeInputs).toEqual(
      expect.arrayContaining([
        "CRP_RESTORE_MACHINE_BACKUP_SOURCE",
        "CRP_RESTORE_MACHINE_ISOLATED_TARGET",
        "CRP_RESTORE_MACHINE_SAFE_FIXTURE",
      ]),
    );
  });
});
