# Alerting Observability Machine Proof

Generated at: 2026-05-22T20:41:43.397Z
Evidence type: ALERTING_OBSERVABILITY_MACHINE_PROOF
Environment: machine-proof-simulation
Commit: `035b06c1271475e74d0bbd808daeb001898fe7b3`
Generator: `scripts/alerting-machine-proof.mjs`
Command: `pnpm run alerts:machine-proof`
Blocker ID: L10-P1-005
Branch: `staging`
Policy version: production-machine-proof-policy-2026-05-22
Status: pass
CERTIFYING:true
Expires at: 2026-05-23T20:41:43.397Z

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
- machine-proof-simulation:alerting
