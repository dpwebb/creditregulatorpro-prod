import { isMain } from "./lib/machineProofScript.mjs";
import { runRestoreMachineProofValidationCli } from "./restore-machine-proof.mjs";

if (isMain(import.meta.url)) {
  runRestoreMachineProofValidationCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
