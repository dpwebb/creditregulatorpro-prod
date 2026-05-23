# Production-Scale Certification Evidence

Generated: 2026-05-23T04:00:29.553Z
Current HEAD: `40fd438dd95a1afeee4b6d3a471b5769a44db513`
Target SHA: `40fd438dd95a1afeee4b6d3a471b5769a44db513`
Target environment: `production-scale-local-certification`
CERTIFYING:true

## Certification Rule

CERTIFYING:true only when every required automated gate passes, no gate is failed/stale/skipped/non-automated, and staging auth smokes remain explicitly labeled as staging proof rather than production runtime proof.

## Gate Summary

| Gate | Status | Command |
| --- | --- | --- |
| TypeScript typecheck | PASS | `pnpm run typecheck` |
| Application build | PASS | `pnpm run build` |
| Contract tests | PASS | `pnpm run test:contracts` |
| API tests | PASS | `pnpm run test:api` |
| Authenticated consumer upload-to-results smoke | PASS | `pnpm run smoke:auth-workflow` |
| Authenticated packet readiness/create/PDF smoke | PASS | `pnpm run smoke:auth-workflow:packet` |
| Golden path regression | PASS | `pnpm run test:golden-path` |
| Deterministic ingestion report | PASS | `pnpm run test:deterministic-ingestion-report` |
| Response soak check | PASS | `pnpm run response:soak-check` |
| Packet PDF cache-miss proof | PASS | `pnpm run packet-pdf:cache-miss-proof` |
| Migration governance | PASS | `pnpm run check:migrations` |
| Evidence ledger append-only tests | PASS | `pnpm run test:evidence-ledger` |
| Storage durability simulation | PASS | `pnpm run storage:durability-contract` |
| Ingest worker liveness simulation | PASS | `pnpm run ingest:worker:simulated-proof` |
| Rollback SHA workflow static check | PASS | `pnpm run deploy:rollback-sha-governance --write-evidence --json` |
| Deploy rollback simulation | PASS | `pnpm run deploy:rollback-simulation --write-evidence --json` |
| Disaster recovery restore machine proof | PASS | `pnpm run restore:machine-proof` |
| Production ingest worker runtime machine proof | PASS | `pnpm run production-worker:machine-proof` |
| Historical raw report byte remediation machine proof | PASS | `pnpm run storage:raw-report-machine-proof` |
| Alerting and observability machine proof | PASS | `pnpm run alerts:machine-proof` |
| Migration governance machine proof | PASS | `pnpm run migrations:machine-proof` |
| Retention archive restore machine proof | PASS | `pnpm run retention:archive-restore-machine-proof` |
| Combined production machine proof summary | PASS | `pnpm run production:machine-proofs` |
| Application check | PASS | `pnpm run check` |
| Evidence freshness check | PASS | `internal evidence freshness check` |

## Failed Gates

- None

## Missing Machine Runtime Inputs

- None

## Stale Gates

- None

## Skipped Gates

- None

## Staging-Only Proof Gates

- authenticatedUploadResults
- authenticatedPacketPdf

## Commands

- `pnpm run typecheck`
- `pnpm run build`
- `pnpm run test:contracts`
- `pnpm run test:api`
- `pnpm run smoke:auth-workflow`
- `pnpm run smoke:auth-workflow:packet`
- `pnpm run test:golden-path`
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
- `pnpm run storage:raw-report-machine-proof`
- `pnpm run alerts:machine-proof`
- `pnpm run migrations:machine-proof`
- `pnpm run retention:archive-restore-machine-proof`
- `pnpm run production:machine-proofs`
- `pnpm run check`
- `internal evidence freshness check`

## Output

Machine-readable evidence: `docs/production-scale/evidence/latest-production-scale-certification.json`

