# Operator Ingest Remediation Runbook

Updated: 2026-05-20

## Default Failed-Ingest Cleanup

Default failed-ingest cleanup is non-destructive. Failed ingest artifacts and any created tradelines are preserved for operator review instead of being deleted automatically.

`helpers/ingestReportHandler.tsx` calls `cleanupFailedIngest(artifactId, [])` when an artifact has a prior failed extraction state or no stored PDF bytes. In the queued architecture this path should be rare, but it remains as a compatibility guard.

`helpers/ingestReportHandler.tsx` also calls `cleanupFailedIngest(artifactId, context.createdTradelineIds)` when `executeIngestPipeline` throws. Before that call it marks the artifact failed. It no longer deletes evidence events by default.

`helpers/ingestCleanup.tsx` now updates `reportArtifact.processingStatus` to `failed` and stores a metadata-only `failedIngestCleanup` marker in `reportArtifact.data`. The marker records `state: remediation_required`, `cleanupRequired: true`, `remediationRequired: true`, `preservedForOperatorReview: true`, the cleanup mode, tradeline count, and timestamps. Repeated marking updates the same marker instead of appending unbounded data.

`cleanupArtifactOnly(artifactId)` follows the same non-destructive default path. It marks the artifact failed/remediation-required and preserves report artifact direct subtable rows for review.

## Lifecycle Visibility

Queued ingest jobs retain append-only `cleanup_attempted` events when a related job exists for the report artifact. Non-destructive remediation events include `cleanupDisposition: non_destructive_remediation`, `destructiveCleanupPath: false`, `cleanupRequired: true`, and `preservedForOperatorReview: true`.

Cleanup event payloads must stay metadata-only: no raw report bytes, extracted report text, storage URLs, account numbers, full SINs, credentials, or session material.

The operator dashboard surfaces ingest queue health counts for dead-lettered jobs, stale running jobs, retry backlog, cleanup attempts, failed cleanup events, cleanup-failed jobs, and remediation events. Operators can also inspect the artifact's `failedIngestCleanup` marker through safe admin/database review procedures.

## Admin Remediation

Admin-only remediation is bounded to metadata/status controls:

- Retry a dead-lettered job with explicit confirmation. The original dead-letter job remains terminal and append-only history is preserved. The replacement job reuses the original idempotency key, so repeated retry requests collapse to the active replacement.
- Mark a dead-lettered or stale-running job reviewed with explicit confirmation.
- Cancel only queued or failed jobs with explicit confirmation.

The remediation endpoint does not delete jobs, events, report artifacts, raw PDFs, parsed text, tradelines, evidence, violations, or packets.

## Explicit Destructive Cleanup

Automatic destructive cleanup is no longer the default path.

The legacy deletion sequence remains only as an explicit helper path for test or reviewed operator procedures. It requires `destructive: true` and `confirmDestructive: true`, records lifecycle evidence, and refuses production-like environments unless an explicit safe admin procedure separately authorizes it. It is not invoked by the normal ingest failure path.

## Stop Conditions

Stop and escalate if remediation would require parser, OCR, violation, evidence, packet, storage, response lifecycle, DB pool, retention, external alerting, production worker activation, or endpoint cutover changes.

Stop and preserve all evidence if cleanup-failure counts increase, a stale-running job persists after lease expiry, or a dead-letter retry repeatedly creates failed replacements.
