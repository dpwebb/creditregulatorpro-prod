import { isMain, runAttestedMachineProofCli } from "./lib/machineProofScript.mjs";

export const PRODUCTION_WORKER_MACHINE_PROOF_JSON_PATH = "docs/production-scale/evidence/latest-production-worker-machine-proof.json";
export const PRODUCTION_WORKER_MACHINE_PROOF_MD_PATH = "docs/production-scale/evidence/latest-production-worker-machine-proof.md";
export const PRODUCTION_WORKER_MACHINE_PROOF_EVIDENCE_TYPE = "PRODUCTION_WORKER_RUNTIME_MACHINE_PROOF";

export const PRODUCTION_WORKER_MACHINE_PROOF_CONFIG = {
  title: "Production Worker Runtime Machine Proof",
  evidenceType: PRODUCTION_WORKER_MACHINE_PROOF_EVIDENCE_TYPE,
  jsonPath: PRODUCTION_WORKER_MACHINE_PROOF_JSON_PATH,
  markdownPath: PRODUCTION_WORKER_MACHINE_PROOF_MD_PATH,
  generatorScript: "scripts/production-worker-machine-proof.mjs",
  command: "pnpm run production-worker:machine-proof",
  attestationEnv: "CRP_PRODUCTION_WORKER_MACHINE_ATTESTATION_JSON",
  productionMutation: "synthetic-canary-cleaned-up",
  productionRuntimeProofRequired: true,
  blockerIdsClosedWhenCertifying: ["L10-P1-003"],
  requiredChecks: [
    "queue-depth-before-captured",
    "worker-liveness-verified",
    "bounded-max-jobs-enforced",
    "synthetic-or-canary-job-processed",
    "queue-depth-after-captured",
    "processed-count-captured",
    "failed-dead-letter-stale-counts-captured",
    "worker-stop-rollback-verified",
    "canary-cleanup-verified",
  ],
};

if (isMain(import.meta.url)) {
  runAttestedMachineProofCli(PRODUCTION_WORKER_MACHINE_PROOF_CONFIG).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
