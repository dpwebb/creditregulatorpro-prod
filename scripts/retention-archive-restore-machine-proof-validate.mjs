import { isMain, runMachineProofValidationCli } from "./lib/machineProofScript.mjs";
import { RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_CONFIG } from "./retention-archive-restore-machine-proof.mjs";

if (isMain(import.meta.url)) {
  runMachineProofValidationCli(RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF_CONFIG).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

