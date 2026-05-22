# Production-Scale Certification Evidence

Generated: 2026-05-22T13:49:26.903Z
Current HEAD: `a7bae388efa0edb1ebbf40fecee760bde4db6c1e`
Target SHA: `a7bae388efa0edb1ebbf40fecee760bde4db6c1e`
Target environment: `production-scale-local-certification`
CERTIFYING:false

## Certification Rule

CERTIFYING:true only when every required automated gate passes, no gate is failed/stale/skipped/non-automated, and staging auth smokes remain explicitly labeled as staging proof rather than production runtime proof.

## Gate Summary

| Gate | Status | Command |
| --- | --- | --- |
| Contract tests | PASS | `pnpm run test:contracts` |
| API tests | PASS | `pnpm run test:api` |
| Authenticated consumer upload-to-results smoke | PASS | `pnpm run smoke:auth-workflow` |
| Authenticated packet readiness/create/PDF smoke | PASS | `pnpm run smoke:auth-workflow:packet` |
| Deterministic ingestion report | PASS | `pnpm run test:deterministic-ingestion-report` |
| Response soak check | PASS | `pnpm run response:soak-check` |
| Packet PDF cache-miss proof | PASS | `pnpm run packet-pdf:cache-miss-proof` |
| Migration governance | PASS | `pnpm run check:migrations` |
| Evidence ledger append-only tests | PASS | `pnpm run test:evidence-ledger` |
| Storage durability simulation | PASS | `pnpm run storage:durability-contract` |
| Ingest worker liveness simulation | PASS | `pnpm run ingest:worker:simulated-proof` |
| Rollback SHA workflow static check | PASS | `pnpm run deploy:rollback-sha-governance --write-evidence --json` |
| Deploy rollback simulation | PASS | `pnpm run deploy:rollback-simulation --write-evidence --json` |
| Disaster recovery restore machine proof | FAILED | `pnpm run restore:machine-proof` |
| Production ingest worker runtime machine proof | FAILED | `pnpm run production-worker:machine-proof` |
| Historical raw report byte remediation machine proof | FAILED | `pnpm run storage:raw-report-machine-remediation-proof` |
| Alerting and observability machine proof | FAILED | `pnpm run alerting:machine-proof` |
| Migration governance machine proof | FAILED | `pnpm run migrations:machine-proof` |
| Retention archive restore machine proof | FAILED | `pnpm run retention:archive-restore-machine-proof` |
| Application check | PASS | `pnpm run check` |
| Evidence freshness check | FAILED | `internal evidence freshness check` |

## Failed Gates

- restoreMachineProof
- productionWorkerMachineProof
- rawReportMachineProof
- alertingMachineProof
- migrationMachineProof
- retentionArchiveRestoreMachineProof
- evidenceFreshness

## Missing Machine Runtime Inputs

- CRP_RESTORE_MACHINE_ATTESTATION_JSON
- CRP_PRODUCTION_WORKER_MACHINE_ATTESTATION_JSON
- CRP_RAW_REPORT_MACHINE_REMEDIATION_ATTESTATION_JSON
- CRP_ALERTING_MACHINE_ATTESTATION_JSON
- CRP_RETENTION_ARCHIVE_RESTORE_MACHINE_ATTESTATION_JSON

## Stale Gates

- restoreMachineProof
- productionWorkerMachineProof
- rawReportMachineProof
- alertingMachineProof
- migrationMachineProof
- retentionArchiveRestoreMachineProof

## Skipped Gates

- None

## Staging-Only Proof Gates

- authenticatedUploadResults
- authenticatedPacketPdf

## Commands

- `pnpm run test:contracts`
- `pnpm run test:api`
- `pnpm run smoke:auth-workflow`
- `pnpm run smoke:auth-workflow:packet`
- `pnpm run test:deterministic-ingestion-report`
- `pnpm run response:soak-check`
- `pnpm run packet-pdf:cache-miss-proof`
- `pnpm run check:migrations`
- `pnpm run test:evidence-ledger`
- `pnpm run storage:durability-contract`
- `pnpm run ingest:worker:simulated-proof`
- `pnpm run deploy:rollback-sha-governance --write-evidence --json`
- `pnpm run deploy:rollback-simulation --write-evidence --json`
- `pnpm run restore:machine-proof`
- `pnpm run production-worker:machine-proof`
- `pnpm run storage:raw-report-machine-remediation-proof`
- `pnpm run alerting:machine-proof`
- `pnpm run migrations:machine-proof`
- `pnpm run retention:archive-restore-machine-proof`
- `pnpm run check`
- `internal evidence freshness check`

## Output

Machine-readable evidence: `docs/production-scale/evidence/latest-production-scale-certification.json`

