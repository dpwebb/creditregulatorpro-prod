# Production Machine Proof Summary

Generated: 2026-05-23T03:54:54.098Z
Commit: `40fd438dd95a1afeee4b6d3a471b5769a44db513`
Branch: `staging`
Policy version: `production-machine-proof-policy-2026-05-22`
allMachineProofsCertifying:true

> Supporting evidence only for beta-live. This summary is not the authoritative beta-live readiness decision; run `pnpm run beta-live:certify` and read `docs/production-scale/evidence/latest-beta-live-certification.json` for `SAFE_FOR_BETA_LIVE=true/false`.

## Safety Summary

- Non-interactive: yes
- Prompted: no
- Stdin read: no
- Human interaction required: no
- Manual approval required: no
- No secrets/PII/raw bytes/signed URLs printed: yes

## Proof Results

| Proof area | Status | Certifying | Evidence | Missing inputs |
| --- | --- | --- | --- | --- |
| Disaster recovery / restore | pass | true | `docs/production-scale/evidence/latest-restore-machine-proof.json` | none |
| Production ingest worker runtime | pass | true | `docs/production-scale/evidence/latest-production-worker-machine-proof.json` | none |
| Raw report byte remediation | pass | true | `docs/production-scale/evidence/latest-storage-raw-report-machine-proof.json` | none |
| Alerting and observability | pass | true | `docs/production-scale/evidence/latest-alerting-machine-proof.json` | none |
| Migration governance | pass | true | `docs/production-scale/evidence/latest-migration-machine-proof.json` | none |
| Retention archive/restore | pass | true | `docs/production-scale/evidence/latest-retention-archive-restore-machine-proof.json` | none |
| Production promotion pack guard | fail | false | `docs/production-scale/evidence/latest-production-promotion-pack.json` | none |

## Open Blockers

- L10-P1-001 (productionPromotionPackGuard): latest-production-promotion-pack.json has CERTIFYING !== true.

## Missing Runtime Inputs

- None

## Production Mutation Summary

- Any production mutation: yes
- Synthetic/canary cleanup succeeded: yes
