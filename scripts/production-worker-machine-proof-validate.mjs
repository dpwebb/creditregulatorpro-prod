import { isMain, runMachineProofValidationCli } from "./lib/machineProofScript.mjs";
import { PRODUCTION_WORKER_MACHINE_PROOF_CONFIG } from "./production-worker-machine-proof.mjs";

if (isMain(import.meta.url)) {
  runMachineProofValidationCli(PRODUCTION_WORKER_MACHINE_PROOF_CONFIG).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

