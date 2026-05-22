import { isMain, runMachineProofValidationCli } from "./lib/machineProofScript.mjs";
import { ALERTING_MACHINE_PROOF_CONFIG } from "./alerting-machine-proof.mjs";

if (isMain(import.meta.url)) {
  runMachineProofValidationCli(ALERTING_MACHINE_PROOF_CONFIG).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

