import { isMain, runMachineProofValidationCli } from "./lib/machineProofScript.mjs";
import { MIGRATION_MACHINE_PROOF_CONFIG } from "./migration-machine-proof.mjs";

if (isMain(import.meta.url)) {
  runMachineProofValidationCli(MIGRATION_MACHINE_PROOF_CONFIG).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
