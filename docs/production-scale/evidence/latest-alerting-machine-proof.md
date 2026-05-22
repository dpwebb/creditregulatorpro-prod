# Alerting Observability Machine Proof

Generated at: 2026-05-22T16:26:40.374Z
Evidence type: ALERTING_OBSERVABILITY_MACHINE_PROOF
Environment: production
Commit: `d8e239e6115f4b1b917fe47558f3e0990162fb4e`
Generator: `scripts/alerting-machine-proof.mjs`
Command: `pnpm run alerts:machine-proof`
Blocker ID: L10-P1-005
Branch: `staging`
Policy version: production-machine-proof-policy-2026-05-22
Status: fail
CERTIFYING:false
Expires at: 2026-05-23T16:26:40.374Z

## Safety

- Non-interactive: yes
- Machine-attested: yes
- Human interaction required: no
- Human observed: no
- Manual approval required: no
- Dry-run only: no
- Production mutation: none
- Secrets printed: no
- PII printed: no
- Raw report bytes printed: no
- Signed URLs printed: no

## Checks

- [fail] synthetic-alert-triggered:
- [fail] alert-delivery-verified:
- [fail] sanitized-channel-id-recorded:
- [fail] correlation-id-recorded:
- [fail] machine-acknowledgment-verified:
- [fail] retry-or-failure-behavior-recorded:
- [fail] response-ops-readiness-verified:
- [fail] scheduler-status-verified:
- [fail] no-webhook-or-token-printed:

## Failures

- alerting-machine-proof-runtime-inputs-missing: Non-interactive alerting proof requires a sanitized machine attestation for live synthetic delivery or a repo-policy-approved automated exclusion.

## Missing Runtime Inputs

- CRP_ALERTING_MACHINE_ATTESTATION_JSON

## Sanitized Artifacts

- docs/production-scale/evidence/latest-alerting-machine-proof.json
- docs/production-scale/evidence/latest-alerting-machine-proof.md
