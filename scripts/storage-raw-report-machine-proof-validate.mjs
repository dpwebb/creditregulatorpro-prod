import { isMain, runMachineProofValidationCli } from "./lib/machineProofScript.mjs";
import { RAW_REPORT_MACHINE_PROOF_CONFIG } from "./storage-raw-report-machine-remediation-proof.mjs";

if (isMain(import.meta.url)) {
  runMachineProofValidationCli(RAW_REPORT_MACHINE_PROOF_CONFIG).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

