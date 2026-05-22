import { isMain, runMachineProofValidationCli } from "./lib/machineProofScript.mjs";
import { RESTORE_MACHINE_PROOF_CONFIG } from "./restore-machine-proof.mjs";

if (isMain(import.meta.url)) {
  runMachineProofValidationCli(RESTORE_MACHINE_PROOF_CONFIG).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

