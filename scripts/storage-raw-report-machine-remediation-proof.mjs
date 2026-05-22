import { isMain, runAttestedMachineProofCli } from "./lib/machineProofScript.mjs";

export const RAW_REPORT_MACHINE_PROOF_JSON_PATH = "docs/production-scale/evidence/latest-storage-raw-report-machine-proof.json";
export const RAW_REPORT_MACHINE_PROOF_MD_PATH = "docs/production-scale/evidence/latest-storage-raw-report-machine-proof.md";
export const RAW_REPORT_MACHINE_PROOF_EVIDENCE_TYPE = "RAW_REPORT_BYTE_REMEDIATION_MACHINE_PROOF";

export const RAW_REPORT_MACHINE_PROOF_CONFIG = {
  title: "Raw Report Byte Remediation Machine Proof",
  evidenceType: RAW_REPORT_MACHINE_PROOF_EVIDENCE_TYPE,
  jsonPath: RAW_REPORT_MACHINE_PROOF_JSON_PATH,
  markdownPath: RAW_REPORT_MACHINE_PROOF_MD_PATH,
  generatorScript: "scripts/storage-raw-report-machine-remediation-proof.mjs",
  command: "pnpm run storage:raw-report-machine-remediation-proof",
  attestationEnv: "CRP_RAW_REPORT_MACHINE_REMEDIATION_ATTESTATION_JSON",
  productionMutation: "approved-bounded",
  blockerIdsClosedWhenCertifying: ["L10-P1-004"],
  requiredChecks: [
    "db-connectivity-reliable",
    "sanitized-inventory-accepted",
    "remediation-policy-verified",
    "unresolved-count-zero-or-policy-accepted",
    "remediated-count-recorded",
    "opaque-hashes-only",
    "no-raw-bytes-or-pii-printed",
    "rollback-recovery-notes-recorded",
  ],
};

if (isMain(import.meta.url)) {
  runAttestedMachineProofCli(RAW_REPORT_MACHINE_PROOF_CONFIG).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

