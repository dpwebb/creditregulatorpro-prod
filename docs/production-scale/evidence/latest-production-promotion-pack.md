# Production Promotion Evidence Pack

Generated at: 2026-05-22T16:27:04.663Z
Current branch: `staging`
Current commit hash: `d8e239e6115f4b1b917fe47558f3e0990162fb4e`
Current HEAD: `d8e239e6115f4b1b917fe47558f3e0990162fb4e`
Target environment: `production`
Target SHA: `d8e239e6115f4b1b917fe47558f3e0990162fb4e`
CERTIFYING:false
Audit file path: `docs/production-at-scale-maximum-audit.md`
Audit date: 2026-05-20
Recommended readiness classification: **limited beta**
Production-ready claim: **false**

## Required Statements

- SIMULATED proof is not production proof.
- Dashboard PASS alone is not complete release evidence when checks are skipped.
- Codex must not promote readiness classification beyond evidence.
- Machine proof gates are non-interactive and require only machine attestations.
- Missing runtime inputs are machine inputs and keep CERTIFYING:false.
- Disaster recovery, ingest runtime, raw report remediation, alerting, migration, and retention closure require accepted machine-attested evidence.
- Machine-attested production evidence can close production blockers only when non-interactive, sanitized, current, and CERTIFYING:true.
- Measured load evidence must be local or staging-safe, threshold-passing, synthetic, and zero-provider-call only.
- Staging ingest worker queue-drain evidence is staging proof only and does not activate production.
- Migration governance requires a non-mutating accepted gate policy or a formal waiver with reason.
- Runtime-size closure requires accepted hard-gate policy evidence or an accepted warning-only formal waiver.
- Response operations readiness requires exact scheduler, backfill, purge/archive, alerting, dashboard, and soak evidence commands.
- Existing stale, skipped, manual-only, failed, or non-automated evidence is historical and non-certifying.

## Certification Gate

- CERTIFYING: false
- Target environment: `production`
- Target SHA: `d8e239e6115f4b1b917fe47558f3e0990162fb4e`
- Missing required checks: none
- Stale checks: storageDurability, evidenceLedger, rollbackSimulation, restoreMachineProof, productionWorkerMachineProof, rawReportMachineProof, alertingMachineProof, retentionArchiveRestoreMachineProof
- Non-automated checks: none
- Skipped checks: none
- Failed checks: queueLiveness, evidenceLedger, rollbackSimulation, restoreMachineProof, productionWorkerMachineProof, rawReportMachineProof, alertingMachineProof, retentionArchiveRestoreMachineProof
- Missing machine runtime inputs: CRP_RESTORE_MACHINE_ATTESTATION_JSON, CRP_RESTORE_MACHINE_BACKUP_SOURCE, CRP_RESTORE_MACHINE_ISOLATED_TARGET, CRP_RESTORE_MACHINE_SAFE_FIXTURE, CRP_PRODUCTION_WORKER_MACHINE_ATTESTATION_JSON, CRP_PRODUCTION_WORKER_QUEUE_ACCESS, CRP_PRODUCTION_WORKER_LIVENESS_ACCESS, CRP_PRODUCTION_WORKER_CANARY_JOB_ACCESS, CRP_PRODUCTION_WORKER_STOP_ROLLBACK_ACCESS, CRP_RAW_REPORT_MACHINE_REMEDIATION_ATTESTATION_JSON, CRP_ALERTING_MACHINE_ATTESTATION_JSON, CRP_RETENTION_ARCHIVE_RESTORE_MACHINE_ATTESTATION_JSON

### Required Certification Checks

- Queue liveness: non-certifying; status=prepared-awaiting-machine-production-evidence; head=d8e239e6115f4b1b917fe47558f3e0990162fb4e; timestamp=2026-05-22T16:27:04.663Z; command=`pnpm run production-worker:readiness-evidence`
- Storage durability: non-certifying; status=missing; head=99b97e37f9326916b48161da4ac79ac762d7a026; timestamp=2026-05-22T15:46:16.415Z; command=`pnpm run storage:durability-contract`
- Evidence ledger: non-certifying; status=missing; head=5c1eaef164726a0cf7c3332ad969fb53462a3525; timestamp=2026-05-21T05:20:12.2044194Z; command=`pnpm run production-scale:evidence`
- Migration governance: CERTIFYING; status=accepted-release-blocking; head=d8e239e6115f4b1b917fe47558f3e0990162fb4e; timestamp=2026-05-22T16:27:04.663Z; command=`pnpm run migrations:gate`
- Rollback simulation: non-certifying; status=passed; head=99b97e37f9326916b48161da4ac79ac762d7a026; timestamp=2026-05-22T15:46:36.715Z; command=`pnpm run deploy:rollback-simulation`
- Disaster recovery restore machine proof: non-certifying; status=fail; head=d8e239e6115f4b1b917fe47558f3e0990162fb4e; timestamp=2026-05-22T16:26:36.411Z; command=`pnpm run restore:machine-proof`
- Production worker runtime machine proof: non-certifying; status=fail; head=d8e239e6115f4b1b917fe47558f3e0990162fb4e; timestamp=2026-05-22T16:26:37.808Z; command=`pnpm run production-worker:machine-proof`
- Raw report byte remediation machine proof: non-certifying; status=fail; head=d8e239e6115f4b1b917fe47558f3e0990162fb4e; timestamp=2026-05-22T16:26:39.084Z; command=`pnpm run storage:raw-report-machine-remediation-proof`
- Alerting observability machine proof: non-certifying; status=fail; head=d8e239e6115f4b1b917fe47558f3e0990162fb4e; timestamp=2026-05-22T16:26:40.374Z; command=`pnpm run alerting:machine-proof`
- Migration governance machine proof: CERTIFYING; status=pass; head=d8e239e6115f4b1b917fe47558f3e0990162fb4e; timestamp=2026-05-22T16:27:04.663Z; command=`pnpm run migrations:machine-proof`
- Retention archive restore machine proof: non-certifying; status=fail; head=d8e239e6115f4b1b917fe47558f3e0990162fb4e; timestamp=2026-05-22T16:26:43.332Z; command=`pnpm run retention:archive-restore-machine-proof`

### Machine-Attested Proof Gates

- Disaster recovery restore machine proof: not accepted; status=fail; certifying=false; missingRuntimeInputs=CRP_RESTORE_MACHINE_ATTESTATION_JSON, CRP_RESTORE_MACHINE_BACKUP_SOURCE, CRP_RESTORE_MACHINE_ISOLATED_TARGET, CRP_RESTORE_MACHINE_SAFE_FIXTURE; humanInteractionRequired=false; evidence=`docs/production-scale/evidence/latest-restore-machine-proof.json`
- Production worker runtime machine proof: not accepted; status=fail; certifying=false; missingRuntimeInputs=CRP_PRODUCTION_WORKER_MACHINE_ATTESTATION_JSON, CRP_PRODUCTION_WORKER_QUEUE_ACCESS, CRP_PRODUCTION_WORKER_LIVENESS_ACCESS, CRP_PRODUCTION_WORKER_CANARY_JOB_ACCESS, CRP_PRODUCTION_WORKER_STOP_ROLLBACK_ACCESS; humanInteractionRequired=false; evidence=`docs/production-scale/evidence/latest-production-worker-machine-proof.json`
- Raw report byte remediation machine proof: not accepted; status=fail; certifying=false; missingRuntimeInputs=CRP_RAW_REPORT_MACHINE_REMEDIATION_ATTESTATION_JSON; humanInteractionRequired=false; evidence=`docs/production-scale/evidence/latest-storage-raw-report-machine-proof.json`
- Alerting observability machine proof: not accepted; status=fail; certifying=false; missingRuntimeInputs=CRP_ALERTING_MACHINE_ATTESTATION_JSON; humanInteractionRequired=false; evidence=`docs/production-scale/evidence/latest-alerting-machine-proof.json`
- Migration governance machine proof: accepted; status=pass; certifying=true; missingRuntimeInputs=none; humanInteractionRequired=false; evidence=`docs/production-scale/evidence/latest-migration-machine-proof.json`
- Retention archive restore machine proof: not accepted; status=fail; certifying=false; missingRuntimeInputs=CRP_RETENTION_ARCHIVE_RESTORE_MACHINE_ATTESTATION_JSON; humanInteractionRequired=false; evidence=`docs/production-scale/evidence/latest-retention-archive-restore-machine-proof.json`

### Missing Machine Runtime Inputs

- CRP_RESTORE_MACHINE_ATTESTATION_JSON
- CRP_RESTORE_MACHINE_BACKUP_SOURCE
- CRP_RESTORE_MACHINE_ISOLATED_TARGET
- CRP_RESTORE_MACHINE_SAFE_FIXTURE
- CRP_PRODUCTION_WORKER_MACHINE_ATTESTATION_JSON
- CRP_PRODUCTION_WORKER_QUEUE_ACCESS
- CRP_PRODUCTION_WORKER_LIVENESS_ACCESS
- CRP_PRODUCTION_WORKER_CANARY_JOB_ACCESS
- CRP_PRODUCTION_WORKER_STOP_ROLLBACK_ACCESS
- CRP_RAW_REPORT_MACHINE_REMEDIATION_ATTESTATION_JSON
- CRP_ALERTING_MACHINE_ATTESTATION_JSON
- CRP_RETENTION_ARCHIVE_RESTORE_MACHINE_ATTESTATION_JSON

### Exact Commands Run By This Evidence Pack

- `pnpm run production-scale:promotion-pack` - passed; started=2026-05-22T16:27:04.663Z; completed=2026-05-22T16:27:04.663Z

## Command Result Summary

- `pnpm run typecheck` - reference-required; evidence: none
- `pnpm run build` - reference-required; evidence: none
- `pnpm run test:contracts` - reference-required; evidence: none
- `pnpm run test:api` - reference-required; evidence: none
- `pnpm run test:golden-path` - reference-required; evidence: none
- `pnpm run test:regression-dashboard` - reference-required; evidence: none
- `pnpm run test:deterministic-ingestion-report` - reference-required; evidence: none
- `pnpm run baseline:production-scale-measured -- --local` - evidence-file-present; evidence: docs/production-scale/evidence/latest-load-measured.md, docs/production-scale/evidence/latest-load-measured.json
- `pnpm run response:soak-check` - reference-required; evidence: none
- `pnpm run operator:dashboard` - reference-required; evidence: none
- `pnpm run alerts:dry-run` - evidence-file-present; evidence: docs/production-scale/evidence/latest-alerts-dry-run.md, docs/production-scale/evidence/latest-alerts-dry-run.json
- `pnpm run alerts:exclusion:validate` - evidence-file-present; evidence: docs/production-scale/evidence/latest-alerting-exclusion-validation.md, docs/production-scale/evidence/latest-alerting-exclusion-validation.json, docs/production-scale/evidence/latest-alerting-acceptance.md, docs/production-scale/evidence/latest-alerting-acceptance.json
- `pnpm run response-ops:readiness-evidence` - evidence-file-present; evidence: docs/production-scale/evidence/latest-response-ops-readiness.md, docs/production-scale/evidence/latest-response-ops-readiness.json, docs/production-scale/evidence/latest-alerting-acceptance.md, docs/production-scale/evidence/latest-alerting-acceptance.json
- `pnpm run response:ops-readiness-evidence` - evidence-file-present; evidence: docs/production-scale/evidence/latest-response-ops-readiness.md, docs/production-scale/evidence/latest-response-ops-readiness.json, docs/production-scale/evidence/latest-alerting-acceptance.md, docs/production-scale/evidence/latest-alerting-acceptance.json
- `pnpm run production-deployment-parity:evidence` - evidence-file-present; evidence: docs/production-scale/evidence/latest-production-deployment-parity.md, docs/production-scale/evidence/latest-production-deployment-parity.json
- `pnpm run production-worker:activation-evidence` - evidence-file-present; evidence: docs/production-scale/evidence/latest-production-worker-activation-evidence.md, docs/production-scale/evidence/latest-production-worker-activation-evidence.json
- `pnpm run production-worker:runtime-proof` - evidence-file-present; evidence: docs/production-scale/evidence/latest-production-worker-runtime-proof.md, docs/production-scale/evidence/latest-production-worker-runtime-proof.json
- `pnpm run production-worker:machine-proof` - evidence-file-present; evidence: docs/production-scale/evidence/latest-production-worker-machine-proof.md, docs/production-scale/evidence/latest-production-worker-machine-proof.json
- `pnpm run production-worker:readiness-evidence` - evidence-file-present; evidence: docs/production-scale/evidence/latest-production-worker-readiness.md, docs/production-scale/evidence/latest-production-worker-readiness.json
- `pnpm run ingest:worker:staging-evidence` - evidence-file-present; evidence: docs/production-scale/evidence/latest-staging-ingest-worker-evidence.md, docs/production-scale/evidence/latest-staging-ingest-worker-evidence.json
- `pnpm run pr-guardrails:evidence` - evidence-file-present; evidence: docs/production-scale/evidence/latest-pr-guardrails.md, docs/production-scale/evidence/latest-pr-guardrails.json
- `pnpm run storage:raw-report-remediation-plan` - evidence-file-present; evidence: docs/production-scale/evidence/latest-storage-raw-report-remediation-plan.md, docs/production-scale/evidence/latest-storage-raw-report-remediation-plan.json
- `pnpm run storage:raw-report-remediation-acceptance` - evidence-file-present; evidence: docs/production-scale/evidence/latest-storage-raw-report-remediation-acceptance.md, docs/production-scale/evidence/latest-storage-raw-report-remediation-acceptance.json
- `pnpm run storage:raw-report-machine-inventory` - evidence-file-present; evidence: docs/production-scale/evidence/latest-storage-raw-report-machine-inventory.md, docs/production-scale/evidence/latest-storage-raw-report-machine-inventory.json
- `pnpm run storage:raw-report-machine-remediation-proof` - evidence-file-present; evidence: docs/production-scale/evidence/latest-storage-raw-report-machine-proof.md, docs/production-scale/evidence/latest-storage-raw-report-machine-proof.json
- `pnpm run storage:durability-contract` - evidence-file-present; evidence: docs/production-scale/evidence/latest-storage-durability.md, docs/production-scale/evidence/latest-storage-durability.json
- `pnpm run check:migrations` - reference-required; evidence: none
- `pnpm run migrations:gate` - evidence-file-present; evidence: docs/production-scale/evidence/latest-migration-gate.md, docs/production-scale/evidence/latest-migration-gate.json
- `pnpm run migrations:machine-proof` - evidence-file-present; evidence: docs/production-scale/evidence/latest-migration-machine-proof.md, docs/production-scale/evidence/latest-migration-machine-proof.json
- `pnpm run deploy:rollback-simulation` - evidence-file-present; evidence: docs/production-scale/evidence/latest-deploy-rollback-simulation.md, docs/production-scale/evidence/latest-deploy-rollback-simulation.json
- `pnpm run restore:machine-proof` - evidence-file-present; evidence: docs/production-scale/evidence/latest-restore-machine-proof.md, docs/production-scale/evidence/latest-restore-machine-proof.json
- `pnpm run alerts:machine-proof` - evidence-file-present; evidence: docs/production-scale/evidence/latest-alerting-machine-proof.md, docs/production-scale/evidence/latest-alerting-machine-proof.json
- `pnpm run alerting:machine-proof` - evidence-file-present; evidence: docs/production-scale/evidence/latest-alerting-machine-proof.md, docs/production-scale/evidence/latest-alerting-machine-proof.json
- `pnpm run retention:archive-restore-machine-proof` - evidence-file-present; evidence: docs/production-scale/evidence/latest-retention-archive-restore-machine-proof.md, docs/production-scale/evidence/latest-retention-archive-restore-machine-proof.json
- `pnpm run report:runtime-size` - evidence-file-present; evidence: docs/production-scale/evidence/latest-runtime-size.md, docs/production-scale/evidence/latest-runtime-size.json
- `pnpm run runtime-size:policy-acceptance` - evidence-file-present; evidence: docs/production-scale/evidence/latest-runtime-size-policy-acceptance.md, docs/production-scale/evidence/latest-runtime-size-policy-acceptance.json
- `git diff --check` - reference-required; evidence: none
- `pnpm run production-scale:evidence` - evidence-file-present; evidence: docs/production-scale/evidence/latest-production-scale-evidence.md, docs/production-scale/evidence/latest-production-scale-evidence.json
- `pnpm run restore:drill:simulated` - evidence-file-present; evidence: docs/production-scale/evidence/latest-restore-drill-simulated.md, docs/production-scale/evidence/latest-restore-drill-simulated.json
- `pnpm run ingest:worker:simulated-proof` - evidence-file-present; evidence: docs/production-scale/evidence/latest-ingest-worker-simulated.md, docs/production-scale/evidence/latest-ingest-worker-simulated.json
- `pnpm run baseline:production-scale-local -- --simulated` - evidence-file-present; evidence: docs/production-scale/evidence/latest-load-simulated.md, docs/production-scale/evidence/latest-load-simulated.json
- `pnpm run storage:raw-report-inventory` - evidence-file-present; evidence: docs/production-scale/evidence/latest-storage-raw-report-inventory.md, docs/production-scale/evidence/latest-storage-raw-report-inventory.json
- `pnpm run retention:archive-restore:simulated` - evidence-file-present; evidence: docs/production-scale/evidence/latest-retention-archive-restore-simulated.md, docs/production-scale/evidence/latest-retention-archive-restore-simulated.json
- `pnpm run packet-pdf:cache-miss-proof` - evidence-file-present; evidence: docs/production-scale/evidence/latest-packet-pdf-cache-miss-proof.md, docs/production-scale/evidence/latest-packet-pdf-cache-miss-proof.json
- `pnpm run production-worker:activation-plan` - evidence-file-present; evidence: docs/production-scale/evidence/latest-production-worker-activation-plan.md, docs/production-scale/evidence/latest-production-worker-activation-plan.json
- `pnpm run migrations:evidence` - evidence-file-present; evidence: docs/production-scale/evidence/latest-migration-governance.md, docs/production-scale/evidence/latest-migration-governance.json
- `pnpm run production-safe-probes:evidence` - evidence-file-present; evidence: docs/production-scale/evidence/latest-production-safe-probes.md, docs/production-scale/evidence/latest-production-safe-probes.json
- `pnpm run staging-owner-denial-smoke:evidence` - evidence-file-present; evidence: docs/production-scale/evidence/latest-staging-owner-denial-smoke.md, docs/production-scale/evidence/latest-staging-owner-denial-smoke.json
- `pnpm run sensitive-list-endpoints:evidence` - evidence-file-present; evidence: docs/production-scale/evidence/latest-sensitive-list-endpoints.md, docs/production-scale/evidence/latest-sensitive-list-endpoints.json
- `pnpm run check:runtime-size` - evidence-file-present; evidence: docs/production-scale/evidence/latest-runtime-size.md, docs/production-scale/evidence/latest-runtime-size.json
- `pnpm run restore:evidence:template` - reference-required; evidence: none
- `pnpm run restore:machine-proof:validate` - reference-required; evidence: none
- `pnpm run retention:archive-restore-machine-proof:validate` - reference-required; evidence: none
- `pnpm run baseline:production-scale-local -- --dry-run` - reference-required; evidence: none
- `pnpm run alerting:machine-proof:validate` - reference-required; evidence: none
- `pnpm run response:orchestration-check` - reference-required; evidence: none
- `pnpm run response:worker-orchestrate -- --dry-run` - reference-required; evidence: none
- `pnpm run response:lifecycle -- --dry-run` - reference-required; evidence: none
- `pnpm run response:replay -- --dry-run` - reference-required; evidence: none
- `pnpm run ingest:worker -- --dry-run --max-jobs 1 --concurrency 1` - reference-required; evidence: none
- `pnpm run production-worker:runtime-proof-template` - reference-required; evidence: none
- `pnpm run production-worker:machine-proof:validate` - reference-required; evidence: none
- `pnpm run staging:ingest-worker -- --dry-run` - reference-required; evidence: none
- `pnpm run storage:raw-report-machine-proof:validate` - reference-required; evidence: none
- `pnpm run migrations:machine-proof:validate` - reference-required; evidence: none
- `pnpm run production-scale:promotion-pack` - reference-required; evidence: none

## Skipped Checks

- Dashboard command: `pnpm run operator:dashboard -- --json`
- Dashboard available: yes
- Checks skipped: true
- Skip count: 55
- SKIP treated as PASS: no

## Restore Evidence Acceptance

- Status: not-submitted
- Accepted: no
- Production proof: no
- Staging proof: no
- Evidence path: `docs/production-scale/evidence/restore-evidence-submission.json`
- Environment: not submitted
- Blocker 1 production coverage: not accepted
- Blocker 22 production coverage: not accepted
- Staging restore evidence is recorded but not counted as production proof.

## Legacy Restore Drill Evidence (Non-Certifying)

- Status: not-submitted
- Accepted: no
- Evidence path: `not submitted`
- Blocker 1 coverage: not accepted
- Blocker 22 coverage: not accepted
- SIMULATED-only submitted as legacy proof: no

## Restore Evidence Current Readiness

- Status: simulated-only
- Current operational proof: no
- Evidence type: SIMULATED
- Legacy observed flag: no
- SIMULATED-only: yes
- Stale: no
- Restore date/time: not available
- Evidence age days: not available
- Blocker 1 current coverage: not accepted
- Missing fields: human-observed evidence type, operator name or role, date/time, environment, backup source, restore target, RPO result, RTO result, auth/session post-restore result, packet PDF post-restore result, response queue post-restore result, cleanup/lifecycle post-restore result, retention archive/restore result or explicit retention exclusion, rollback/cleanup result, signed operator acknowledgement, explicit sanitized evidence statement

## Production Deployment Parity Evidence

- Status: accepted-production-deployment-parity
- Current: yes
- Production proof: no
- Production-safe probe evidence accepted: yes
- Staging/local owner-denial evidence accepted: yes
- Runtime production probes executed by this command: no
- Runtime production probes read-only: yes
- Rollback SHA input required: yes
- Health check after rollback required: yes
- Blocker 11 coverage: accepted
- Blocker 20 coverage: accepted
- Static POST and retired-route proof is not runtime production proof.

## Production Worker Runtime Proof

- Status: dry-run-only
- Accepted: no
- Production proof: no
- Staging proof: no
- Dry-run only: yes
- Evidence path: `docs/production-scale/evidence/production-worker-runtime-proof-submission.json`
- Processed/failed/dead-letter/stale: 0/0/0/0
- Blocker 2 runtime coverage: not accepted
- Dry-run, default-off, and deferred activation evidence are not production runtime proof.

## Production Worker Readiness Evidence

- Status: prepared-awaiting-machine-production-evidence
- Production proof accepted: no
- Runtime proof evidence accepted: no
- Runtime proof evidence path: `docs/production-scale/evidence/production-worker-runtime-proof-submission.json`
- Blocker 2 coverage: not accepted
- Blocker 11 coverage: not accepted
- Codex processed production jobs: no

## Production Worker Activation Evidence

- Status: prepared-default-off
- Production worker default-off: yes
- Production activation deferred: yes
- Explicit activation inputs required: yes
- Staging worker evidence detected: yes
- Dry-run mutates queue: no
- Future queue depth before/after: required/required
- This activation evidence does not close blocker 2 without accepted production queue-depth evidence.

## Staging Ingest Worker Evidence

- Status: accepted-staging-queue-drain
- Accepted staging queue drain: yes
- Production proof: no
- Queue depth before/after: 2/0
- Processed/failed/dead-lettered: 2/0/0
- Blocker 2 staging queue drain: accepted
- Blocker 2 production runtime: not accepted
- Production worker activation remains deferred.

## Raw Report Remediation Acceptance

- Status: not-submitted
- Accepted: no
- Production proof: no
- Evidence path: `not submitted`
- Reliable inventory accepted: no
- Remediation plan accepted: no
- Blocker 6 coverage: not accepted
- Sensitive findings: 0

## Measured Load Evidence Acceptance

- Status: accepted
- Accepted: yes
- Evidence path: `docs/production-scale/evidence/latest-load-measured.json`
- Evidence type: MEASURED_STAGING_SAFE
- Threshold mode: release-blocking
- Threshold status: passed
- Request count: 32
- Latency p50/p95/max ms: 24.67/46/46.49
- DB pool configured max: 3
- DB pool observed signal: available
- Rate limiter accepted/rejected: 2/22
- Packet PDF cache hit/miss: 4/2
- External provider calls made: 0
- Blocker 3 coverage: accepted
- Blocker 16 coverage: accepted
- Blocker 17 coverage: accepted

## Runtime Size Policy Acceptance

- Status: accepted-warning-only-waiver
- Accepted: yes
- Acceptance kind: warning-only-waiver
- Policy mode: warning-only
- Policy path: `docs/production-scale/runtime-size-threshold-policy.json`
- Evidence path: `docs/production-scale/evidence/latest-runtime-size.json`
- Runtime overall status: WARN
- Runtime blocking failures: no
- WARN rows governed: 6/6
- WAIVED rows with reasons: 1/1
- Formal waiver accepted: yes
- Blocker 18 hard-gate coverage: not accepted
- Blocker 18 warning-only waiver coverage: accepted
- Dependency versions changed: no
- Build chunking changed: no
- PDF/OCR behavior changed: no

## Migration Gate Evidence

- Status: accepted-release-blocking
- Policy mode: release-blocking
- CERTIFYING:true
- Release gate accepted: yes
- Production promotion gate accepted: yes
- Temporary allowlist active: no
- Runtime ensure residual impact: reviewed-governed
- Release-blocking findings: 0
- Formal waiver accepted: no
- Formal waiver reason: n/a
- Blocker 10 coverage: accepted
- Gate mutates DB: no
- Gate executes DDL: no

## Response Ops Readiness Evidence

- Status: machine-ready-with-deferred-controls
- Live scheduler status: disabled
- Backfill readiness status: machine-controlled-deferred
- Purge/archive readiness status: machine-controlled-deferred
- Response soak status: command-available
- Dashboard status/SKIP count: not-collected/unknown
- Alerting status: dry-run-only
- Alerting acceptance status/path: dry-run-only/none
- Alerting acceptance accepted: no
- Alerting exclusion accepted: no
- Live alert proof accepted: no
- Blocker 8 coverage: accepted
- Blocker 9 coverage: not accepted
- Response queue semantics changed: no

## Disallowed Manual Proof Dependencies

- None.

## Simulated Proof-Only Checks

- None.

## Staging Proof-Only Checks

- None.

## Waivers

- #18 Runtime-size gates (Medium; waived with explicit reason) - Keep the warning-only waiver evidence current, and only enable a release-blocking gate through a later reviewed threshold-policy change.

## Unresolved Production Blockers

- #1 Disaster recovery (Critical; machine proof required) - Provide CRP_RESTORE_MACHINE_ATTESTATION_JSON from a safe isolated restore target and rerun restore:machine-proof.
- #2 Production ingest runtime (Critical; machine proof required) - Provide CRP_PRODUCTION_WORKER_MACHINE_ATTESTATION_JSON from a bounded safe canary/runtime proof and rerun production-worker:machine-proof.
- #6 Historical raw report bytes (High; machine proof required) - Provide reliable sanitized DB inventory and remediation attestation JSON inputs, then rerun the raw report machine proof commands.
- #9 Observability/alerting (High; machine proof required) - Provide CRP_ALERTING_MACHINE_ATTESTATION_JSON for live delivery or an approved certifying exclusion and rerun alerts:machine-proof.
- #22 Retention archive/restore proof (Medium; machine proof required) - Provide CRP_RETENTION_ARCHIVE_RESTORE_MACHINE_ATTESTATION_JSON from a safe retention archive/restore proof and rerun retention:archive-restore-machine-proof.

## Unresolved Scale Blockers

- None.

## Generated Evidence File References

- `docs/production-scale/evidence/latest-production-scale-evidence.md` - present
- `docs/production-scale/evidence/latest-production-scale-evidence.json` - present
- `docs/production-scale/evidence/latest-restore-drill-simulated.md` - present
- `docs/production-scale/evidence/latest-restore-drill-simulated.json` - present; evidenceType=SIMULATED
- `docs/production-scale/evidence/latest-human-restore-drill-evidence-acceptance.md` - present
- `docs/production-scale/evidence/latest-human-restore-drill-evidence-acceptance.json` - present
- `docs/production-scale/evidence/latest-restore-acceptance.md` - present
- `docs/production-scale/evidence/latest-restore-acceptance.json` - present
- `docs/production-scale/evidence/latest-restore-readiness-check.md` - present
- `docs/production-scale/evidence/latest-restore-readiness-check.json` - present; evidenceType=SIMULATED
- `docs/production-scale/evidence/latest-ingest-worker-simulated.md` - present
- `docs/production-scale/evidence/latest-ingest-worker-simulated.json` - present; evidenceType=SIMULATED
- `docs/production-scale/evidence/latest-staging-ingest-worker-evidence.md` - present
- `docs/production-scale/evidence/latest-staging-ingest-worker-evidence.json` - present; evidenceType=STAGING_INGEST_WORKER_QUEUE_DRAIN
- `docs/production-scale/evidence/latest-load-simulated.md` - present
- `docs/production-scale/evidence/latest-load-simulated.json` - present; evidenceType=SIMULATED
- `docs/production-scale/evidence/latest-load-measured.md` - present
- `docs/production-scale/evidence/latest-load-measured.json` - present; evidenceType=MEASURED_STAGING_SAFE
- `docs/production-scale/evidence/latest-alerts-dry-run.md` - present
- `docs/production-scale/evidence/latest-alerts-dry-run.json` - present; evidenceType=SIMULATED
- `docs/production-scale/evidence/latest-alerting-exclusion-validation.md` - present
- `docs/production-scale/evidence/latest-alerting-exclusion-validation.json` - present; evidenceType=ALERTING_EXCLUSION_VALIDATION
- `docs/production-scale/evidence/latest-alerting-acceptance.md` - present
- `docs/production-scale/evidence/latest-alerting-acceptance.json` - present; evidenceType=ALERTING_ACCEPTANCE
- `docs/production-scale/evidence/latest-response-ops-readiness.md` - present
- `docs/production-scale/evidence/latest-response-ops-readiness.json` - present; evidenceType=RESPONSE_OPS_READINESS_EVIDENCE
- `docs/production-scale/evidence/latest-storage-raw-report-inventory.md` - present
- `docs/production-scale/evidence/latest-storage-raw-report-inventory.json` - present; evidenceType=SANITIZED_READ_ONLY_INVENTORY
- `docs/production-scale/evidence/latest-storage-raw-report-remediation-plan.md` - present
- `docs/production-scale/evidence/latest-storage-raw-report-remediation-plan.json` - present; evidenceType=SANITIZED_DRY_RUN_REMEDIATION_PLAN
- `docs/production-scale/evidence/latest-storage-raw-report-remediation-acceptance.md` - present
- `docs/production-scale/evidence/latest-storage-raw-report-remediation-acceptance.json` - present
- `docs/production-scale/evidence/latest-retention-archive-restore-simulated.md` - present
- `docs/production-scale/evidence/latest-retention-archive-restore-simulated.json` - present; evidenceType=SIMULATED
- `docs/production-scale/evidence/latest-packet-pdf-cache-miss-proof.md` - present
- `docs/production-scale/evidence/latest-packet-pdf-cache-miss-proof.json` - present; evidenceType=SIMULATED
- `docs/production-scale/evidence/latest-storage-durability.md` - present
- `docs/production-scale/evidence/latest-storage-durability.json` - present; evidenceType=AUTOMATED_LOCAL_AND_STATIC_DEPLOY_PREFLIGHT
- `docs/production-scale/evidence/latest-deploy-rollback-simulation.md` - present
- `docs/production-scale/evidence/latest-deploy-rollback-simulation.json` - present; evidenceType=AUTOMATED_LOCAL_SIMULATION_AND_STATIC_WORKFLOW_CHECK
- `docs/production-scale/evidence/latest-production-worker-activation-plan.md` - present
- `docs/production-scale/evidence/latest-production-worker-activation-plan.json` - present; evidenceType=DESIGN_AND_GUARD_EVIDENCE
- `docs/production-scale/evidence/latest-production-worker-activation-evidence.md` - present
- `docs/production-scale/evidence/latest-production-worker-activation-evidence.json` - present; evidenceType=PRODUCTION_WORKER_ACTIVATION_EVIDENCE
- `docs/production-scale/evidence/latest-production-worker-runtime-proof.md` - present
- `docs/production-scale/evidence/latest-production-worker-runtime-proof.json` - present
- `docs/production-scale/evidence/latest-production-worker-machine-proof.md` - present
- `docs/production-scale/evidence/latest-production-worker-machine-proof.json` - present; evidenceType=PRODUCTION_WORKER_RUNTIME_MACHINE_PROOF
- `docs/production-scale/evidence/latest-production-worker-readiness.md` - present
- `docs/production-scale/evidence/latest-production-worker-readiness.json` - present; evidenceType=PRODUCTION_WORKER_READINESS_EVIDENCE
- `docs/production-scale/evidence/latest-pr-guardrails.md` - present
- `docs/production-scale/evidence/latest-pr-guardrails.json` - present
- `docs/production-scale/evidence/latest-production-deployment-parity.md` - present
- `docs/production-scale/evidence/latest-production-deployment-parity.json` - present; evidenceType=PRODUCTION_DEPLOYMENT_PARITY_EVIDENCE
- `docs/production-scale/evidence/latest-migration-governance.md` - present
- `docs/production-scale/evidence/latest-migration-governance.json` - present
- `docs/production-scale/evidence/latest-migration-gate.md` - present
- `docs/production-scale/evidence/latest-migration-gate.json` - present; evidenceType=MIGRATION_GATE_EVIDENCE
- `docs/production-scale/evidence/latest-migration-machine-proof.md` - present
- `docs/production-scale/evidence/latest-migration-machine-proof.json` - present; evidenceType=MIGRATION_GOVERNANCE_MACHINE_PROOF
- `docs/production-scale/evidence/latest-restore-machine-proof.md` - present
- `docs/production-scale/evidence/latest-restore-machine-proof.json` - present; evidenceType=DISASTER_RECOVERY_RESTORE_MACHINE_PROOF
- `docs/production-scale/evidence/latest-alerting-machine-proof.md` - present
- `docs/production-scale/evidence/latest-alerting-machine-proof.json` - present; evidenceType=ALERTING_OBSERVABILITY_MACHINE_PROOF
- `docs/production-scale/evidence/latest-storage-raw-report-machine-inventory.md` - present
- `docs/production-scale/evidence/latest-storage-raw-report-machine-inventory.json` - present; evidenceType=RAW_REPORT_BYTE_MACHINE_INVENTORY
- `docs/production-scale/evidence/latest-storage-raw-report-machine-proof.md` - present
- `docs/production-scale/evidence/latest-storage-raw-report-machine-proof.json` - present; evidenceType=RAW_REPORT_BYTE_REMEDIATION_MACHINE_PROOF
- `docs/production-scale/evidence/latest-retention-archive-restore-machine-proof.md` - present
- `docs/production-scale/evidence/latest-retention-archive-restore-machine-proof.json` - present; evidenceType=RETENTION_ARCHIVE_RESTORE_MACHINE_PROOF
- `docs/production-scale/evidence/latest-production-safe-probes.md` - present
- `docs/production-scale/evidence/latest-production-safe-probes.json` - present
- `docs/production-scale/evidence/latest-staging-owner-denial-smoke.md` - present
- `docs/production-scale/evidence/latest-staging-owner-denial-smoke.json` - present
- `docs/production-scale/evidence/latest-sensitive-list-endpoints.md` - present
- `docs/production-scale/evidence/latest-sensitive-list-endpoints.json` - present
- `docs/production-scale/evidence/latest-runtime-size.md` - present
- `docs/production-scale/evidence/latest-runtime-size.json` - present
- `docs/production-scale/evidence/latest-runtime-size-policy-acceptance.md` - present
- `docs/production-scale/evidence/latest-runtime-size-policy-acceptance.json` - present
- `docs/production-scale/evidence/restore-evidence-template.md` - present
- `docs/production-scale/evidence/restore-evidence-template.json` - present
- `docs/production-scale/evidence/restore-evidence-submission.json` - missing
- `docs/production-scale/evidence/human-restore-drill-evidence.md` - missing
- `docs/production-scale/evidence/human-restore-drill-evidence.json` - missing
- `docs/production-scale/evidence/production-worker-runtime-proof-template.md` - present
- `docs/production-scale/evidence/production-worker-runtime-proof-template.json` - present; evidenceType=PRODUCTION_WORKER_RUNTIME_PROOF
- `docs/production-scale/evidence/production-worker-runtime-proof-submission.json` - missing
- `docs/production-scale/evidence/production-worker-queue-depth-evidence.json` - missing
- `docs/production-scale/evidence/production-worker-queue-depth-evidence.md` - missing
- `docs/production-scale/evidence/latest-evidence-ledger.md` - present
- `docs/production-scale/evidence/latest-evidence-ledger.json` - present
- `docs/production-scale/evidence/storage-raw-report-remediation-acceptance-evidence.json` - missing
- `docs/production-scale/evidence/storage-raw-report-remediation-acceptance-evidence.md` - missing
- `docs/production-scale/evidence/storage-raw-report-remediation-acceptance-template.json` - present; evidenceType=HUMAN_OBSERVED_RAW_REPORT_REMEDIATION
- `docs/production-scale/evidence/storage-raw-report-remediation-acceptance-template.md` - present
- `docs/production-scale/evidence/alerting-live-proof-template.json` - present; evidenceType=HUMAN_OBSERVED_LIVE_ALERT_DELIVERY
- `docs/production-scale/evidence/alerting-live-proof-template.md` - present
- `docs/production-scale/evidence/alerting-exclusion-template.json` - present; evidenceType=FORMAL_ALERTING_EXCLUSION
- `docs/production-scale/evidence/alerting-exclusion-template.md` - present
- `docs/production-scale/evidence/alerting-exclusion-evidence.json` - missing
- `docs/production-scale/evidence/alerting-exclusion-evidence.md` - missing
- `docs/production-scale/evidence/live-alert-proof.json` - missing
- `docs/production-scale/evidence/live-alert-proof.md` - missing
- `docs/production-scale/migration-governance-policy.json` - present
- `docs/production-scale/load-threshold-policy.json` - present
- `docs/restore-drill-evidence-template.md` - present
- `docs/staging-ingest-worker-operation.md` - present
- `docs/production-ingest-worker-activation.md` - present
- `docs/production-scale-load-harness.md` - present
- `docs/packet-pdf-cache.md` - present
- `docs/packet-pdf-cache-miss-scaling-decision.md` - present
- `docs/operator-ingest-remediation.md` - present
- `docs/report-artifact-storage.md` - present
- `docs/response-processing-production-ops-runbook.md` - present
- `docs/production-observability-metrics.md` - present
- `docs/production-scale/alerting-exclusion-template.md` - present
- `docs/database-migration-policy.md` - present
- `migrations/0000-runtime-schema-inventory.md` - present
- `docs/production-at-scale-execution-tracker.md` - present
- `docs/runtime-size-and-dependency-report.md` - present
- `docs/production-scale/runtime-size-threshold-policy.json` - present
- `docs/production-at-scale-endpoint-auth-appendix.md` - present
- `docs/production-scale/evidence/latest-production-promotion-pack.md` - present
- `docs/production-scale/evidence/latest-production-promotion-pack.json` - present
- `docs/production-scale/README.md` - present
- `docs/production-scale/blocker-registry.json` - present

## Stale Reference Detection

- Audit commit reference: `6fb3b063622fdaf236b97bb6aac0f9a999b5bd88`
- Audit commit reference stale: yes

