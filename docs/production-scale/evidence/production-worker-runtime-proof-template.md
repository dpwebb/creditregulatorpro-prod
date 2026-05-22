# Production Worker Runtime Proof Template

Status: Template only. This is not accepted production worker runtime proof.

The operator must submit a sanitized filled JSON artifact after an explicitly guarded bounded production worker apply run. Dry-run, default-off, or deferred activation evidence is not accepted as production runtime proof.

## Guarded Commands

- Dry-run command: `pnpm run ingest:worker --dry-run --max-jobs 1 --concurrency 1 --worker-id production-ingest-worker-dry-run --source authenticated_ingest_process`
- Apply command: `pnpm run ingest:worker --apply --max-jobs <1-5> --concurrency 1 --worker-id production-bounded-ingest-worker --source authenticated_ingest_process`

## Required Production Apply Guards

- CRP_ENV=production
- CRP_PRODUCTION_INGEST_WORKER_APPLY=explicit-bounded-production-ingest-worker-apply
- CRP_PRODUCTION_INGEST_WORKER_ONE_SHOT=true
- CRP_PRODUCTION_INGEST_WORKER_MAX_JOBS matching --max-jobs
- CRP_PRODUCTION_INGEST_WORKER_OPERATOR set to a safe token
- --max-jobs explicitly set to 1-5
- --concurrency=1
- --source=authenticated_ingest_process
- --worker-id present

## JSON Shape

```json
{
  "schemaVersion": 1,
  "templateOnly": true,
  "generatedAt": "2026-05-22T03:32:34.288Z",
  "evidenceType": "PRODUCTION_WORKER_RUNTIME_PROOF",
  "evidenceId": "PROD-WORKER-RUNTIME-YYYYMMDD-001",
  "environment": "production",
  "mode": "apply",
  "dryRunOnly": false,
  "operatorId": "OPS1",
  "timestamp": "2026-05-22T00:00:00Z",
  "workerId": "production-bounded-ingest-worker",
  "source": "authenticated_ingest_process",
  "maxJobs": 1,
  "queueDepth": {
    "before": {
      "total": 1,
      "queued": 1,
      "running": 0,
      "failed": 0,
      "deadLettered": 0,
      "staleRunning": 0
    },
    "after": {
      "total": 0,
      "queued": 0,
      "running": 0,
      "failed": 0,
      "deadLettered": 0,
      "staleRunning": 0
    }
  },
  "processedCount": 1,
  "failedCount": 0,
  "deadLetterCount": 0,
  "staleCount": 0,
  "workerExitCode": 0,
  "productionGuard": {
    "crpEnvProduction": true,
    "applyGuardAcknowledged": true,
    "oneShot": true,
    "maxJobsMatched": true,
    "operatorTokenPresent": true,
    "sourceMatched": true,
    "concurrencyOne": true,
    "workerIdPresent": true
  },
  "workerLivenessCheck": {
    "observed": true,
    "status": "passed - bounded one-shot worker exited or is idle after run"
  },
  "rollbackStopVerification": {
    "verified": true,
    "evidenceSummary": "sanitized stop/rollback verification summary"
  },
  "operatorAcknowledgement": {
    "signed": true,
    "evidenceSummary": "operator attested this is sanitized human-observed production worker runtime evidence"
  },
  "attestations": {
    "noRawReportBytesPrinted": true,
    "noPiiPrinted": true,
    "noSecretsPrinted": true,
    "noSignedUrlsPrinted": true,
    "sanitizedForAudit": true
  },
  "evidenceAttachments": [
    "docs/production-scale/evidence/REPLACE_WITH_SANITIZED_WORKER_RUNTIME_ATTACHMENT.md"
  ]
}
```
