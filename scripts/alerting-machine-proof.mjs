import { isMain, runAttestedMachineProofCli } from "./lib/machineProofScript.mjs";

export const ALERTING_MACHINE_PROOF_JSON_PATH = "docs/production-scale/evidence/latest-alerting-machine-proof.json";
export const ALERTING_MACHINE_PROOF_MD_PATH = "docs/production-scale/evidence/latest-alerting-machine-proof.md";
export const ALERTING_MACHINE_PROOF_EVIDENCE_TYPE = "ALERTING_OBSERVABILITY_MACHINE_PROOF";

export const ALERTING_MACHINE_PROOF_CONFIG = {
  title: "Alerting Observability Machine Proof",
  evidenceType: ALERTING_MACHINE_PROOF_EVIDENCE_TYPE,
  jsonPath: ALERTING_MACHINE_PROOF_JSON_PATH,
  markdownPath: ALERTING_MACHINE_PROOF_MD_PATH,
  generatorScript: "scripts/alerting-machine-proof.mjs",
  command: "pnpm run alerting:machine-proof",
  attestationEnv: "CRP_ALERTING_MACHINE_ATTESTATION_JSON",
  productionMutation: "none",
  blockerIdsClosedWhenCertifying: ["L10-P1-005"],
  acceptedCheckSets: [
    {
      name: "live-alert-delivery",
      checks: [
        "synthetic-alert-triggered",
        "alert-delivery-verified",
        "sanitized-channel-id-recorded",
        "correlation-id-recorded",
        "machine-acknowledgment-verified",
        "retry-or-failure-behavior-recorded",
        "response-ops-readiness-verified",
        "scheduler-status-verified",
        "no-webhook-or-token-printed",
      ],
    },
    {
      name: "certifying-formal-exclusion",
      checks: [
        "formal-exclusion-file-validated",
        "policy-allows-certifying-exclusion",
        "compensating-controls-validated",
        "operator-approval-machine-verified",
        "exclusion-not-stale",
        "next-review-recorded",
        "exclusion-does-not-overclaim-production-pass",
        "no-webhook-or-token-printed",
      ],
    },
  ],
  requiredChecks: [
    "synthetic-alert-triggered",
    "alert-delivery-verified",
    "sanitized-channel-id-recorded",
    "correlation-id-recorded",
    "machine-acknowledgment-verified",
    "retry-or-failure-behavior-recorded",
    "response-ops-readiness-verified",
    "scheduler-status-verified",
    "no-webhook-or-token-printed",
  ],
};

if (isMain(import.meta.url)) {
  runAttestedMachineProofCli(ALERTING_MACHINE_PROOF_CONFIG).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
