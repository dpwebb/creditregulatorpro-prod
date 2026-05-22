import { isMain, runAttestedMachineProofCli } from "./lib/machineProofScript.mjs";

export const RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_JSON_PATH = "docs/production-scale/evidence/latest-retention-archive-restore-machine-proof.json";
export const RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_MD_PATH = "docs/production-scale/evidence/latest-retention-archive-restore-machine-proof.md";
export const RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_EVIDENCE_TYPE = "RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF";

export const RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_CONFIG = {
  title: "Retention Archive Restore Machine Proof",
  evidenceType: RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_EVIDENCE_TYPE,
  jsonPath: RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_JSON_PATH,
  markdownPath: RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_MD_PATH,
  generatorScript: "scripts/retention-archive-restore-machine-proof.mjs",
  command: "pnpm run retention:archive-restore-machine-proof",
  attestationEnv: "CRP_RETENTION_ARCHIVE_RESTORE_MACHINE_ATTESTATION_JSON",
  productionMutation: "synthetic-canary-cleaned-up",
  productionRuntimeProofRequired: true,
  blockerIdsClosedWhenCertifying: ["retention-archive-restore"],
  requiredChecks: [
    "safe-archive-candidate-selected",
    "archive-created-or-selected",
    "isolated-restore-target-created",
    "archive-restore-integrity-verified",
    "no-pii-exposed",
    "lifecycle-cleanup-verified",
    "rollback-recovery-notes-recorded",
    "isolated-restore-target-destroyed",
  ],
};

if (isMain(import.meta.url)) {
  runAttestedMachineProofCli(RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_CONFIG).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
