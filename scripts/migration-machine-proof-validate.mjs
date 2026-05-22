import { isMain } from "./lib/machineProofScript.mjs";
import { runMigrationMachineProofValidationCli } from "./migration-machine-proof.mjs";

if (isMain(import.meta.url)) {
  runMigrationMachineProofValidationCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
