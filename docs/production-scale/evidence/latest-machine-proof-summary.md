# Production Machine Proof Summary

Generated: 2026-05-23T01:55:52.966Z
Commit: `c086dd1e846598870719cbd16be08bf2bb68050d`
Branch: `staging`
Policy version: `production-machine-proof-policy-2026-05-22`
allMachineProofsCertifying:true

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
