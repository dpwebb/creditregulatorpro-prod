# Production-Scale Certification Evidence

Generated: 2026-05-22T00:45:03.277Z
Current HEAD: `4da09d1b87f4641f938bae3f02618f1aa142072d`
Target SHA: `4da09d1b87f4641f938bae3f02618f1aa142072d`
Target environment: `production-scale-local-certification`
CERTIFYING:false

## Certification Rule

CERTIFYING:true only when every required automated gate passes and no gate is failed, stale, skipped, or manual-only.

## Gate Summary

| Gate | Status | Command |
| --- | --- | --- |
| Contract tests | PASS | `pnpm run test:contracts` |
| API tests | PASS | `pnpm run test:api` |
| Authenticated consumer upload-to-results smoke | FAILED | `pnpm run smoke:auth-workflow` |
| Authenticated packet readiness/create/PDF smoke | FAILED | `pnpm run smoke:auth-workflow:packet` |
| Deterministic ingestion report | PASS | `pnpm run test:deterministic-ingestion-report` |
| Response soak check | PASS | `pnpm run response:soak-check` |
| Packet PDF cache-miss proof | PASS | `pnpm run packet-pdf:cache-miss-proof` |
| Migration governance | PASS | `pnpm run check:migrations` |
| Evidence ledger append-only tests | PASS | `pnpm run test:evidence-ledger` |
| Storage durability simulation | PASS | `pnpm run storage:durability-contract` |
| Ingest worker liveness simulation | PASS | `pnpm run ingest:worker:simulated-proof` |
| Rollback SHA workflow static check | PASS | `pnpm run deploy:rollback-sha-governance --write-evidence --json` |
| Deploy rollback simulation | PASS | `pnpm run deploy:rollback-simulation --write-evidence --json` |
| Application check | FAILED | `pnpm run check` |
| Evidence freshness check | PASS | `internal evidence freshness check` |

## Failed Gates

- authenticatedUploadResults
- authenticatedPacketPdf
- applicationCheck

## Stale Gates

- None

## Skipped Gates

- None

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
- `pnpm run check`
- `internal evidence freshness check`

## Output

Machine-readable evidence: `docs/production-scale/evidence/latest-production-scale-certification.json`

