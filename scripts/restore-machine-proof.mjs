import { isMain, runAttestedMachineProofCli } from "./lib/machineProofScript.mjs";

export const RESTORE_MACHINE_PROOF_JSON_PATH = "docs/production-scale/evidence/latest-restore-machine-proof.json";
export const RESTORE_MACHINE_PROOF_MD_PATH = "docs/production-scale/evidence/latest-restore-machine-proof.md";
export const RESTORE_MACHINE_PROOF_EVIDENCE_TYPE = "DISASTER_RECOVERY_RESTORE_MACHINE_PROOF";

export const RESTORE_MACHINE_PROOF_CONFIG = {
  title: "Disaster Recovery Restore Machine Proof",
  evidenceType: RESTORE_MACHINE_PROOF_EVIDENCE_TYPE,
  jsonPath: RESTORE_MACHINE_PROOF_JSON_PATH,
  markdownPath: RESTORE_MACHINE_PROOF_MD_PATH,
  generatorScript: "scripts/restore-machine-proof.mjs",
  command: "pnpm run restore:machine-proof",
  attestationEnv: "CRP_RESTORE_MACHINE_ATTESTATION_JSON",
  productionMutation: "none",
  blockerIdsClosedWhenCertifying: ["L10-P1-002"],
  requiredChecks: [
    "latest-backup-selected",
    "isolated-restore-target-created",
    "rpo-measured",
    "rto-measured",
    "post-restore-auth-session-check",
    "post-restore-packet-pdf-retrieval-check",
    "post-restore-response-queue-check",
    "cleanup-lifecycle-check",
    "rollback-stop-verification",
    "isolated-restore-target-destroyed",
  ],
};

if (isMain(import.meta.url)) {
  runAttestedMachineProofCli(RESTORE_MACHINE_PROOF_CONFIG).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

