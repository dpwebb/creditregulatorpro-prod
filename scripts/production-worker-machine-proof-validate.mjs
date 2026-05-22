import { isMain } from "./lib/machineProofScript.mjs";
import { runProductionWorkerMachineProofValidationCli } from "./production-worker-machine-proof.mjs";

if (isMain(import.meta.url)) {
  runProductionWorkerMachineProofValidationCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
