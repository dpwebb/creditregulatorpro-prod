# Alerting Observability Machine Proof

Generated at: 2026-05-22T05:46:50.410Z
Evidence type: ALERTING_OBSERVABILITY_MACHINE_PROOF
Environment: production
Commit: `2026701883302c9a80851158313669e015a3465f`
Generator: `scripts/alerting-machine-proof.mjs`
Command: `pnpm run alerting:machine-proof`
Status: fail
CERTIFYING:false
Expires at: 2026-05-23T05:46:50.410Z

## Safety

- Non-interactive: yes
- Machine-attested: yes
- Production mutation: none
- Secrets printed: no
- PII printed: no
- Raw report bytes printed: no
- Signed URLs printed: no

## Checks

- [fail] synthetic-alert-triggered: Machine attestation check missing or failed.
- [fail] alert-delivery-verified: Machine attestation check missing or failed.
- [fail] sanitized-channel-id-recorded: Machine attestation check missing or failed.
- [fail] correlation-id-recorded: Machine attestation check missing or failed.
- [fail] machine-acknowledgment-verified: Machine attestation check missing or failed.
- [fail] retry-or-failure-behavior-recorded: Machine attestation check missing or failed.
- [fail] response-ops-readiness-verified: Machine attestation check missing or failed.
- [fail] scheduler-status-verified: Machine attestation check missing or failed.
- [fail] no-webhook-or-token-printed: Machine attestation check missing or failed.

## Failures

- attestation-unavailable: machine attestation path was not provided.

## Missing Runtime Inputs

- CRP_ALERTING_MACHINE_ATTESTATION_JSON

## Sanitized Artifacts

- None.
