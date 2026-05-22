import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildAttestedMachineProofReport,
  validateMachineProofForConfig,
} from "../../scripts/lib/machineProofScript.mjs";
import { RESTORE_MACHINE_PROOF_CONFIG } from "../../scripts/restore-machine-proof.mjs";
import { PRODUCTION_WORKER_MACHINE_PROOF_CONFIG } from "../../scripts/production-worker-machine-proof.mjs";
import { RAW_REPORT_MACHINE_PROOF_CONFIG } from "../../scripts/storage-raw-report-machine-remediation-proof.mjs";
import { ALERTING_MACHINE_PROOF_CONFIG } from "../../scripts/alerting-machine-proof.mjs";
import {
  MIGRATION_MACHINE_PROOF_CONFIG,
  buildMigrationMachineProofReport,
} from "../../scripts/migration-machine-proof.mjs";
import { RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_CONFIG } from "../../scripts/retention-archive-restore-machine-proof.mjs";

const HEAD = "a".repeat(40);
const GENERATED_AT = "2026-05-22T12:00:00.000Z";
const NOW = "2026-05-22T13:00:00.000Z";
const tempRoots: string[] = [];

function tempRoot() {
  const root = mkdtempSync(join(tmpdir(), "crp-machine-proof-"));
  tempRoots.push(root);
  return root;
}

function writeAttestation(root: string, name: string, checks: string[], overrides = {}) {
  const evidenceDir = join(root, "docs", "production-scale", "evidence");
  mkdirSync(evidenceDir, { recursive: true });
  const relativePath = `docs/production-scale/evidence/${name}.json`;
  writeFileSync(
    join(root, relativePath),
    `${JSON.stringify(
      {
        nonInteractive: true,
        machineAttested: true,
        generatedManually: false,
        simulatedOnly: false,
        environment: "production",
        status: "pass",
        certifying: true,
        checks: checks.map((check) => ({ name: check, status: "pass" })),
        metadata: {},
        ...overrides,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return relativePath;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("machine proof scripts", () => {
  it("fails closed when required runtime attestation input is missing", () => {
    const report = buildAttestedMachineProofReport(RESTORE_MACHINE_PROOF_CONFIG, {
      rootDir: tempRoot(),
      generatedAt: GENERATED_AT,
      env: {},
    });

    expect(report.CERTIFYING).toBe(false);
    expect(report.missingRuntimeInputs).toEqual(["CRP_RESTORE_MACHINE_ATTESTATION_JSON"]);
    expect(report.failures).toEqual([
      expect.objectContaining({ code: "attestation-unavailable" }),
    ]);
  });

  it("accepts valid sanitized restore attestation", () => {
    const root = tempRoot();
    const attestationPath = writeAttestation(root, "restore-attestation", RESTORE_MACHINE_PROOF_CONFIG.requiredChecks);
    const report = buildAttestedMachineProofReport(RESTORE_MACHINE_PROOF_CONFIG, {
      rootDir: root,
      generatedAt: GENERATED_AT,
      env: { CRP_MACHINE_EVIDENCE_COMMIT_HASH: HEAD },
      attestationPath,
    });

    expect(report.CERTIFYING).toBe(true);
    expect(validateMachineProofForConfig(RESTORE_MACHINE_PROOF_CONFIG, report, { now: NOW }).ok).toBe(true);
  });

  it("rejects dry-run-only production worker evidence that lacks runtime checks", () => {
    const root = tempRoot();
    const attestationPath = writeAttestation(root, "worker-attestation", [
      "queue-depth-before-captured",
      "worker-liveness-verified",
    ], {
      metadata: { mode: "dry-run" },
    });
    const report = buildAttestedMachineProofReport(PRODUCTION_WORKER_MACHINE_PROOF_CONFIG, {
      rootDir: root,
      generatedAt: GENERATED_AT,
      env: { CRP_MACHINE_EVIDENCE_COMMIT_HASH: HEAD },
      attestationPath,
    });

    expect(report.CERTIFYING).toBe(false);
    expect(validateMachineProofForConfig(PRODUCTION_WORKER_MACHINE_PROOF_CONFIG, report, { now: NOW }).ok).toBe(false);
  });

  it("accepts raw report proof only with reliable sanitized checks", () => {
    const root = tempRoot();
    const attestationPath = writeAttestation(root, "raw-report-attestation", RAW_REPORT_MACHINE_PROOF_CONFIG.requiredChecks, {
      metadata: {
        databaseReliable: true,
        sanitizedInventoryAccepted: true,
      },
    });
    const report = buildAttestedMachineProofReport(RAW_REPORT_MACHINE_PROOF_CONFIG, {
      rootDir: root,
      generatedAt: GENERATED_AT,
      env: { CRP_MACHINE_EVIDENCE_COMMIT_HASH: HEAD },
      attestationPath,
    });

    expect(report.CERTIFYING).toBe(true);
    expect(validateMachineProofForConfig(RAW_REPORT_MACHINE_PROOF_CONFIG, report, { now: NOW }).ok).toBe(true);
  });

  it("rejects secret-like attestation values", () => {
    const root = tempRoot();
    const attestationPath = writeAttestation(root, "secret-attestation", RESTORE_MACHINE_PROOF_CONFIG.requiredChecks, {
      metadata: {
        webhook: "https://hooks.example.test/path?token=supersecretvalue",
      },
    });
    const report = buildAttestedMachineProofReport(RESTORE_MACHINE_PROOF_CONFIG, {
      rootDir: root,
      generatedAt: GENERATED_AT,
      env: { CRP_MACHINE_EVIDENCE_COMMIT_HASH: HEAD },
      attestationPath,
    });

    expect(report.CERTIFYING).toBe(false);
    expect(report.failures).toEqual([
      expect.objectContaining({ code: "sensitive-attestation" }),
    ]);
  });

  it("accepts alerting formal exclusion only through the explicit accepted check set", () => {
    const root = tempRoot();
    const formalSet = ALERTING_MACHINE_PROOF_CONFIG.acceptedCheckSets.find((set) => set.name === "certifying-formal-exclusion");
    const attestationPath = writeAttestation(root, "alert-exclusion-attestation", formalSet?.checks ?? [], {
      metadata: {
        acceptedCheckSet: "certifying-formal-exclusion",
        alertingProofPath: "certifying-formal-exclusion",
        policyAllowsCertificationUnderExclusion: true,
      },
    });
    const report = buildAttestedMachineProofReport(ALERTING_MACHINE_PROOF_CONFIG, {
      rootDir: root,
      generatedAt: GENERATED_AT,
      env: { CRP_MACHINE_EVIDENCE_COMMIT_HASH: HEAD },
      attestationPath,
    });

    expect(report.CERTIFYING).toBe(true);
    expect(report.metadata.acceptedCheckSet).toBe("certifying-formal-exclusion");
  });

  it("rejects migration proof when temporary allowlist residuals remain unresolved", () => {
    const report = buildMigrationMachineProofReport({
      generatedAt: GENERATED_AT,
      migrationGateEvidence: {
        CERTIFYING: false,
        releaseGateAccepted: false,
        status: "failed",
        temporaryAllowlistActive: true,
        temporaryAllowlistResiduals: [{ path: "helpers/runtimeEnsure.ts" }],
        releaseBlockingFindings: [{ category: "unresolved-temporary-runtime-allowlist" }],
        blockerCoverage: { migrationGovernance: false },
        safety: { nonMutating: true, requiresDatabase: false, mutatesDatabase: false, executesDdl: false },
      },
    });

    expect(report.CERTIFYING).toBe(false);
    expect(validateMachineProofForConfig(MIGRATION_MACHINE_PROOF_CONFIG, report, { now: NOW }).ok).toBe(false);
  });

  it("rejects simulated-only retention evidence", () => {
    const root = tempRoot();
    const attestationPath = writeAttestation(
      root,
      "retention-attestation",
      RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_CONFIG.requiredChecks,
      { simulatedOnly: true },
    );
    const report = buildAttestedMachineProofReport(RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_CONFIG, {
      rootDir: root,
      generatedAt: GENERATED_AT,
      env: { CRP_MACHINE_EVIDENCE_COMMIT_HASH: HEAD },
      attestationPath,
    });

    expect(report.CERTIFYING).toBe(false);
    expect(validateMachineProofForConfig(RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_CONFIG, report, { now: NOW }).ok).toBe(false);
  });
});
