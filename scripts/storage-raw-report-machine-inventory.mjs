import { isMain, runAttestedMachineProofCli } from "./lib/machineProofScript.mjs";

export const RAW_REPORT_MACHINE_INVENTORY_JSON_PATH = "docs/production-scale/evidence/latest-storage-raw-report-machine-inventory.json";
export const RAW_REPORT_MACHINE_INVENTORY_MD_PATH = "docs/production-scale/evidence/latest-storage-raw-report-machine-inventory.md";
export const RAW_REPORT_MACHINE_INVENTORY_EVIDENCE_TYPE = "RAW_REPORT_BYTE_MACHINE_INVENTORY";

export const RAW_REPORT_MACHINE_INVENTORY_CONFIG = {
  title: "Raw Report Byte Machine Inventory",
  evidenceType: RAW_REPORT_MACHINE_INVENTORY_EVIDENCE_TYPE,
  jsonPath: RAW_REPORT_MACHINE_INVENTORY_JSON_PATH,
  markdownPath: RAW_REPORT_MACHINE_INVENTORY_MD_PATH,
  generatorScript: "scripts/storage-raw-report-machine-inventory.mjs",
  command: "pnpm run storage:raw-report-machine-inventory",
  attestationEnv: "CRP_RAW_REPORT_MACHINE_INVENTORY_ATTESTATION_JSON",
  productionMutation: "none",
  blockerIdsClosedWhenCertifying: [],
  requiredChecks: [
    "db-connectivity-reliable",
    "read-only-aggregate-counts-collected",
    "opaque-hashes-only",
    "unresolved-count-recorded",
    "remediation-candidate-count-recorded",
    "no-raw-bytes-or-pii-printed",
  ],
};

if (isMain(import.meta.url)) {
  runAttestedMachineProofCli(RAW_REPORT_MACHINE_INVENTORY_CONFIG).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

