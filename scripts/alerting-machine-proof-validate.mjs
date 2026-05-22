import {
  isMain,
} from "./lib/machineProofScript.mjs";
import {
  runAlertingMachineProofValidationCli,
} from "./alerting-machine-proof.mjs";

if (isMain(import.meta.url)) {
  runAlertingMachineProofValidationCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
