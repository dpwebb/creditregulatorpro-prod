# Alerting Observability Machine Proof

Generated at: 2026-05-23T01:24:41.046Z
Evidence type: ALERTING_OBSERVABILITY_MACHINE_PROOF
Environment: production
Commit: `d2fed22eb7e1c25d2304aee918336994aacd31cc`
Generator: `scripts/alerting-machine-proof.mjs`
Command: `pnpm run alerts:machine-proof`
Blocker ID: L10-P1-005
Branch: `staging`
Policy version: production-machine-proof-policy-2026-05-22
Status: pass
CERTIFYING:true
Expires at: 2026-05-24T01:24:41.046Z

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

- [pass] synthetic-alert-triggered:
- [pass] alert-delivery-verified:
- [pass] sanitized-channel-id-recorded:
- [pass] correlation-id-recorded:
- [pass] machine-acknowledgment-verified:
- [pass] retry-or-failure-behavior-recorded:
- [pass] response-ops-readiness-verified:
- [pass] scheduler-status-verified:
- [pass] no-webhook-or-token-printed:

## Failures

- None.

## Missing Runtime Inputs

- None.

## Sanitized Artifacts

- docs/production-scale/evidence/latest-alerting-machine-proof.json
- docs/production-scale/evidence/latest-alerting-machine-proof.md
- .local/production-proof/alerting-attestation.json
