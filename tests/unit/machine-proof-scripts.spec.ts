import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildAttestedMachineProofReport,
  validateMachineProofForConfig,
} from "../../scripts/lib/machineProofScript.mjs";
import {
  RESTORE_MACHINE_PROOF_CONFIG,
  RESTORE_MACHINE_PROOF_RUNTIME_INPUTS,
  buildRestoreMachineProofReport,
  validateRestoreMachineProofEvidence,
} from "../../scripts/restore-machine-proof.mjs";
import { PRODUCTION_WORKER_MACHINE_PROOF_CONFIG } from "../../scripts/production-worker-machine-proof.mjs";
import { RAW_REPORT_MACHINE_PROOF_CONFIG } from "../../scripts/storage-raw-report-machine-remediation-proof.mjs";
import { ALERTING_MACHINE_PROOF_CONFIG } from "../../scripts/alerting-machine-proof.mjs";
import {
  MIGRATION_MACHINE_PROOF_CONFIG,
  buildMigrationMachineProofReport,
  validateMigrationMachineProofEvidence,
} from "../../scripts/migration-machine-proof.mjs";
import {
  RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_CONFIG,
  RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_RUNTIME_INPUTS,
  buildRetentionArchiveRestoreMachineProofReport,
  validateRetentionArchiveRestoreMachineProofEvidence,
} from "../../scripts/retention-archive-restore-machine-proof.mjs";

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

function validRestoreMetadata() {
  return {
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
  };
}

function validRetentionArchiveRestoreMetadata() {
  return {
    retentionProofKind: "non-interactive-machine-archive-restore",
    safeArchiveCandidate: {
      selected: true,
      safe: true,
      opaqueCandidateId: "retention-candidate-hash",
      syntheticCanary: true,
      realConsumerPiiUsed: false,
    },
    archive: {
      selected: true,
      created: true,
      archiveId: "retention-archive-hash",
      metadataVerified: true,
      manifestHash: "retention-manifest-hash",
      containsPii: false,
    },
    isolatedRestoreTarget: {
      created: true,
      destroyed: true,
      productionTarget: false,
      targetId: "retention-restore-target-hash",
    },
    restoreVerification: {
      integrityVerified: true,
      restoredHashMatchesArchive: true,
      expectedRecordCount: 1,
      verifiedRecordCount: 1,
    },
    lifecycleCleanup: {
      verified: true,
      temporaryArchiveCleaned: true,
      canaryCleanedUp: true,
    },
    rollbackRecovery: {
      verified: true,
      notesRecorded: true,
      rollbackPlanHash: "retention-rollback-notes-hash",
    },
    noPiiExposed: true,
  };
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("machine proof scripts", () => {
  it("fails closed when required runtime attestation input is missing", () => {
    const report = buildRestoreMachineProofReport({
      rootDir: tempRoot(),
      generatedAt: GENERATED_AT,
      env: {},
    });

    expect(report.CERTIFYING).toBe(false);
    expect(report.status).toBe("fail");
    expect(report.certifying).toBe(false);
    expect(report.humanInteractionRequired).toBe(false);
    expect(report.missingRuntimeInputs).toEqual(RESTORE_MACHINE_PROOF_RUNTIME_INPUTS);
    expect(report.failures).toEqual([
      expect.objectContaining({ code: "restore-machine-proof-runtime-inputs-missing" }),
    ]);
    expect(JSON.stringify(report)).not.toMatch(/human-observed|manual approval|operator acknowledgement/i);
  });

  it("accepts valid sanitized restore attestation", () => {
    const root = tempRoot();
    const attestationPath = writeAttestation(root, "restore-attestation", RESTORE_MACHINE_PROOF_CONFIG.requiredChecks, {
      ...validRestoreMetadata(),
    });
    const report = buildRestoreMachineProofReport({
      rootDir: root,
      generatedAt: GENERATED_AT,
      env: { CRP_MACHINE_EVIDENCE_COMMIT_HASH: HEAD },
      argv: ["--attestation", attestationPath],
    });

    expect(report.CERTIFYING).toBe(true);
    expect(report.humanInteractionRequired).toBe(false);
    expect(validateRestoreMachineProofEvidence(report, { now: NOW }).ok).toBe(true);
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
      ...validRestoreMetadata(),
      metadata: {
        webhook: "https://hooks.example.test/path?token=supersecretvalue",
      },
    });
    const report = buildRestoreMachineProofReport({
      rootDir: root,
      generatedAt: GENERATED_AT,
      env: { CRP_MACHINE_EVIDENCE_COMMIT_HASH: HEAD },
      argv: ["--attestation", attestationPath],
    });

    expect(report.CERTIFYING).toBe(false);
    expect(report.failures).toEqual([
      expect.objectContaining({ code: "restore-machine-proof-sensitive-value" }),
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

  it("accepts migration proof only when residuals are ledgered or reviewed and governed", () => {
    const report = buildMigrationMachineProofReport({
      generatedAt: GENERATED_AT,
      migrationGateEvidence: {
        CERTIFYING: true,
        releaseGateAccepted: true,
        status: "accepted-release-blocking",
        temporaryAllowlistActive: false,
        temporaryAllowlistResiduals: [],
        releaseBlockingFindings: [],
        blockerCoverage: { migrationGovernance: true },
        residualMachineStatuses: [
          {
            path: "helpers/ingestProcessingQueueSchema.ts",
            status: "certifying",
            classification: "ledgered additive migration",
            ledgerEntry: "migrations/0001-ingest-processing-queue-reviewed-additive.md",
            ledgerStatus: "ledgered additive migration",
            certifying: true,
          },
          {
            path: "helpers/responseDocumentSchema.ts",
            status: "certifying",
            classification: "reviewed and governed",
            ledgerEntry: "migrations/0002-machine-governed-runtime-residuals.md",
            ledgerStatus: "reviewed and governed",
            certifying: true,
          },
        ],
        governedRuntimeResiduals: [{ path: "helpers/responseDocumentSchema.ts" }],
        convertedRuntimeResiduals: [{ path: "helpers/ingestProcessingQueueSchema.ts" }],
        safety: { nonMutating: true, requiresDatabase: false, mutatesDatabase: false, executesDdl: false },
      },
    });

    expect(report.CERTIFYING).toBe(true);
    expect(report.metadata.residualStatuses.map((item: { classification: string }) => item.classification)).toEqual([
      "ledgered additive migration",
      "reviewed and governed",
    ]);
    expect(validateMigrationMachineProofEvidence(report, { now: NOW }).ok).toBe(true);
  });

  it("rejects migration proof that uses accepted-temporary-allowlist as certification basis", () => {
    const report = buildMigrationMachineProofReport({
      generatedAt: GENERATED_AT,
      migrationGateEvidence: {
        CERTIFYING: true,
        releaseGateAccepted: true,
        status: "accepted-temporary-allowlist",
        temporaryAllowlistActive: false,
        temporaryAllowlistResiduals: [],
        releaseBlockingFindings: [],
        blockerCoverage: { migrationGovernance: true },
        residualMachineStatuses: [
          {
            path: "helpers/runtimeEnsure.ts",
            status: "certifying",
            classification: "reviewed and governed",
            ledgerEntry: "migrations/0002-machine-governed-runtime-residuals.md",
            ledgerStatus: "reviewed and governed",
            certifying: true,
          },
        ],
        safety: { nonMutating: true, requiresDatabase: false, mutatesDatabase: false, executesDdl: false },
      },
    });

    expect(report.CERTIFYING).toBe(false);
    expect(validateMigrationMachineProofEvidence(report, { now: NOW }).errors.join("\n")).toMatch(/accepted-temporary-allowlist/i);
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

  it("fails closed when retention archive runtime inputs are missing", () => {
    const report = buildRetentionArchiveRestoreMachineProofReport({
      rootDir: tempRoot(),
      generatedAt: GENERATED_AT,
      env: {},
    });

    expect(report.CERTIFYING).toBe(false);
    expect(report.status).toBe("fail");
    expect(report.humanInteractionRequired).toBe(false);
    expect(report.missingRuntimeInputs).toEqual(RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_RUNTIME_INPUTS);
    expect(report.failures).toEqual([
      expect.objectContaining({ code: "retention-archive-restore-runtime-inputs-missing" }),
    ]);
  });

  it("accepts valid sanitized retention archive restore attestation", () => {
    const root = tempRoot();
    const attestationPath = writeAttestation(
      root,
      "retention-attestation",
      RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_CONFIG.requiredChecks,
      validRetentionArchiveRestoreMetadata(),
    );
    const report = buildRetentionArchiveRestoreMachineProofReport({
      rootDir: root,
      generatedAt: GENERATED_AT,
      env: { CRP_MACHINE_EVIDENCE_COMMIT_HASH: HEAD },
      argv: ["--attestation", attestationPath],
    });

    expect(report.CERTIFYING).toBe(true);
    expect(report.productionMutation).toBe("synthetic-canary-cleaned-up");
    expect(validateRetentionArchiveRestoreMachineProofEvidence(report, { now: NOW }).ok).toBe(true);
  });

  it("rejects retention archive proof without restore integrity verification", () => {
    const root = tempRoot();
    const metadata = validRetentionArchiveRestoreMetadata();
    delete (metadata as { restoreVerification?: unknown }).restoreVerification;
    const checks = RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_CONFIG.requiredChecks.filter(
      (check) => check !== "archive-restore-integrity-verified",
    );
    const attestationPath = writeAttestation(root, "retention-attestation", checks, metadata);
    const report = buildRetentionArchiveRestoreMachineProofReport({
      rootDir: root,
      generatedAt: GENERATED_AT,
      env: { CRP_MACHINE_EVIDENCE_COMMIT_HASH: HEAD },
      argv: ["--attestation", attestationPath],
    });

    expect(report.CERTIFYING).toBe(false);
    expect(validateRetentionArchiveRestoreMachineProofEvidence(report, { now: NOW }).errors.join("\n")).toMatch(/restore integrity/i);
  });

  it("rejects retention archive proof without cleanup verification", () => {
    const root = tempRoot();
    const metadata = validRetentionArchiveRestoreMetadata();
    (metadata as { lifecycleCleanup: unknown }).lifecycleCleanup = { verified: false };
    (metadata as { isolatedRestoreTarget: { destroyed: boolean } }).isolatedRestoreTarget.destroyed = false;
    const attestationPath = writeAttestation(
      root,
      "retention-attestation",
      RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_CONFIG.requiredChecks,
      metadata,
    );
    const report = buildRetentionArchiveRestoreMachineProofReport({
      rootDir: root,
      generatedAt: GENERATED_AT,
      env: { CRP_MACHINE_EVIDENCE_COMMIT_HASH: HEAD },
      argv: ["--attestation", attestationPath],
    });

    expect(report.CERTIFYING).toBe(false);
    expect(validateRetentionArchiveRestoreMachineProofEvidence(report, { now: NOW }).errors.join("\n")).toMatch(/cleanup|destruction/i);
  });

  it("rejects stale retention archive restore proof", () => {
    const root = tempRoot();
    const attestationPath = writeAttestation(
      root,
      "retention-attestation",
      RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_CONFIG.requiredChecks,
      validRetentionArchiveRestoreMetadata(),
    );
    const report = buildRetentionArchiveRestoreMachineProofReport({
      rootDir: root,
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: { CRP_MACHINE_EVIDENCE_COMMIT_HASH: HEAD },
      argv: ["--attestation", attestationPath],
    });

    const validation = validateRetentionArchiveRestoreMachineProofEvidence(report, { now: NOW });

    expect(validation.ok).toBe(false);
    expect(validation.errors).toContain("evidence is stale.");
  });

  it("rejects sensitive retention archive restore attestation values", () => {
    const root = tempRoot();
    const attestationPath = writeAttestation(
      root,
      "retention-attestation",
      RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_CONFIG.requiredChecks,
      {
        ...validRetentionArchiveRestoreMetadata(),
        archive: {
          ...validRetentionArchiveRestoreMetadata().archive,
          sanitizerProbe: "sk-retentiontest123456789",
        },
      },
    );
    const report = buildRetentionArchiveRestoreMachineProofReport({
      rootDir: root,
      generatedAt: GENERATED_AT,
      env: { CRP_MACHINE_EVIDENCE_COMMIT_HASH: HEAD },
      argv: ["--attestation", attestationPath],
    });

    expect(report.CERTIFYING).toBe(false);
    expect(report.failures).toEqual([
      expect.objectContaining({ code: "retention-archive-restore-sensitive-value" }),
    ]);
  });

  it("documents every non-interactive runtime input in the contract", () => {
    const contract = JSON.parse(readFileSync("docs/production-scale/evidence/machine-proof-runtime-input-contract.json", "utf8"));
    const inputNames = contract.inputs.map((input: { name: string }) => input.name);

    expect(contract.humanObservedProofAllowed).toBe(false);
    expect(contract.operatorAcknowledgementRequired).toBe(false);
    expect(inputNames).toEqual(expect.arrayContaining([
      "CRP_RESTORE_MACHINE_ATTESTATION_JSON",
      "CRP_PRODUCTION_WORKER_QUEUE_ACCESS",
      "CRP_PRODUCTION_WORKER_LIVENESS_ACCESS",
      "CRP_PRODUCTION_WORKER_CANARY_JOB_ACCESS",
      "CRP_PRODUCTION_WORKER_STOP_ROLLBACK_ACCESS",
      "CRP_PRODUCTION_WORKER_MACHINE_ATTESTATION_JSON",
      "CRP_RAW_REPORT_MACHINE_INVENTORY_ATTESTATION_JSON",
      "CRP_RAW_REPORT_MACHINE_REMEDIATION_ATTESTATION_JSON",
      "CRP_ALERTING_MACHINE_ATTESTATION_JSON",
      "CRP_RETENTION_ARCHIVE_RESTORE_MACHINE_ATTESTATION_JSON",
      "CRP_RETENTION_ARCHIVE_RESTORE_ARCHIVE_ACCESS",
      "CRP_RETENTION_ARCHIVE_RESTORE_ISOLATED_TARGET",
      "CRP_RETENTION_ARCHIVE_RESTORE_SAFE_CANDIDATE",
    ]));
    for (const input of contract.inputs) {
      expect(input.secret).toBe(false);
      expect(input.failureIfMissing).toMatchObject({
        status: "fail",
        certifying: false,
        humanInteractionRequired: false,
      });
    }
  });
});
