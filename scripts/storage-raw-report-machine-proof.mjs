export {
  RAW_REPORT_DATABASE_ACCESS_INPUT,
  RAW_REPORT_MACHINE_PROOF_CONFIG,
  RAW_REPORT_MACHINE_PROOF_EVIDENCE_TYPE,
  RAW_REPORT_MACHINE_PROOF_JSON_PATH,
  RAW_REPORT_MACHINE_PROOF_MD_PATH,
  RAW_REPORT_MACHINE_PROOF_RUNTIME_INPUTS,
  buildRawReportMachineProofEvidence,
  buildRawReportMachineProofReport,
  collectRawReportStorageInventory,
  resolveRawReportDatabaseAccess,
  runRawReportMachineProofCli,
} from "./storage-raw-report-machine-remediation-proof.mjs";

import { isMain } from "./lib/machineProofScript.mjs";
import { runRawReportMachineProofCli } from "./storage-raw-report-machine-remediation-proof.mjs";

if (isMain(import.meta.url)) {
  runRawReportMachineProofCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
