# Production Proof Preflight

Generated: 2026-05-23T03:39:14.576Z

## Plain English Result

The real evidence proof environment looks ready to attempt. This command did not change production.

- Real evidence ready to run: yes
- Production mutation occurred: no
- Secret values printed: no
- Production promotion safe: no
- Production promotion blocked: yes

## Report Files

- Markdown: `docs/production-scale/evidence/latest-production-proof-preflight.md`
- JSON: `docs/production-scale/evidence/latest-production-proof-preflight.json`

## Real Production Proof Inputs

Present input names:

- CRP_RAW_REPORT_DATABASE_ACCESS
- CRP_RAW_REPORT_MACHINE_REMEDIATION_ATTESTATION_JSON
- CRP_RESTORE_MACHINE_ATTESTATION_JSON
- CRP_RESTORE_MACHINE_BACKUP_SOURCE
- CRP_RESTORE_MACHINE_ISOLATED_TARGET
- CRP_RESTORE_MACHINE_SAFE_FIXTURE
- CRP_PRODUCTION_WORKER_MACHINE_ATTESTATION_JSON
- CRP_PRODUCTION_WORKER_QUEUE_ACCESS
- CRP_PRODUCTION_WORKER_LIVENESS_ACCESS
- CRP_PRODUCTION_WORKER_CANARY_JOB_ACCESS
- CRP_PRODUCTION_WORKER_STOP_ROLLBACK_ACCESS
- CRP_ALERTING_MACHINE_ATTESTATION_JSON
- CRP_RETENTION_ARCHIVE_RESTORE_MACHINE_ATTESTATION_JSON
- CRP_RETENTION_ARCHIVE_RESTORE_ARCHIVE_ACCESS
- CRP_RETENTION_ARCHIVE_RESTORE_ISOLATED_TARGET
- CRP_RETENTION_ARCHIVE_RESTORE_SAFE_CANDIDATE

Missing input names:

- None

Still simulation-only:

- None

## Proof Families

### Raw report byte proof

- Ready to run in real-evidence mode: yes
- Status: Ready to run with real evidence.
- Report path: `docs/production-scale/evidence/latest-storage-raw-report-machine-proof.json`
- Missing inputs: none
- Simulation-only inputs: none
- Current proof is simulation-only: no
- Safety checks:
  - read-only-database-source: pass - A supported database access source is present by name only.

### Disaster recovery restore proof

- Ready to run in real-evidence mode: yes
- Status: Ready to run with real evidence.
- Report path: `docs/production-scale/evidence/latest-restore-machine-proof.json`
- Missing inputs: none
- Simulation-only inputs: none
- Current proof is simulation-only: no
- Safety checks:
  - isolated-restore-target-not-production: pass - The target is clearly marked as isolated and not production.

### Production worker canary proof

- Ready to run in real-evidence mode: yes
- Status: Ready to run with real evidence.
- Report path: `docs/production-scale/evidence/latest-production-worker-machine-proof.json`
- Missing inputs: none
- Simulation-only inputs: none
- Current proof is simulation-only: no
- Safety checks:
  - worker-canary-non-destructive: pass - The worker canary is bounded, cleanup is verified, and rollback control is present.

### Alerting proof

- Ready to run in real-evidence mode: yes
- Status: Ready to run with real evidence.
- Report path: `docs/production-scale/evidence/latest-alerting-machine-proof.json`
- Missing inputs: none
- Simulation-only inputs: none
- Current proof is simulation-only: no
- Safety checks:
  - approved-alert-route-or-sink: pass - Alerting is configured for a sink or no-external-delivery route.

### Retention archive restore proof

- Ready to run in real-evidence mode: yes
- Status: Ready to run with real evidence.
- Report path: `docs/production-scale/evidence/latest-retention-archive-restore-machine-proof.json`
- Missing inputs: none
- Simulation-only inputs: none
- Current proof is simulation-only: no
- Safety checks:
  - retention-isolated-target-not-production: pass - The target is clearly marked as isolated and not production.

### Migration governance proof

- Ready to run in real-evidence mode: yes
- Status: Ready to run with real evidence.
- Report path: `docs/production-scale/evidence/latest-migration-machine-proof.json`
- Missing inputs: none
- Simulation-only inputs: none
- Current proof is simulation-only: no
- Safety checks:
  - non-mutating-governance-check: pass - Migration governance proof has no extra production secret input for this preflight.

## Production Promotion

- Safe: no
- Blocked: yes
- Certification report certifying: no
- Promotion pack certifying: no
- Can promote production at scale: no
- Summary: Production promotion remains blocked until certification and the promotion pack both certify true.

## Next Safe Human Action

Run pnpm run production-proof:real-evidence. Do not run production promotion from this preflight.

