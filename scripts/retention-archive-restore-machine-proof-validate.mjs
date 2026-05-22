import { isMain } from "./lib/machineProofScript.mjs";
import { runRetentionArchiveRestoreMachineProofValidationCli } from "./retention-archive-restore-machine-proof.mjs";

if (isMain(import.meta.url)) {
  runRetentionArchiveRestoreMachineProofValidationCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
