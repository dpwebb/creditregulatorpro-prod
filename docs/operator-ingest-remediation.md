# Operator Ingest Remediation Runbook

Updated: 2026-05-20

## Current Cleanup Paths

The current cleanup helper is still destructive and best-effort. This task adds visibility and bounded remediation around that behavior; it does not replace cleanup with a new storage or lifecycle architecture.

`helpers/ingestReportHandler.tsx` calls `cleanupFailedIngest(artifactId, [])` when an artifact has a prior failed extraction state or no stored PDF bytes. In the queued architecture this path should be rare, but it remains as a compatibility guard.

`helpers/ingestReportHandler.tsx` also calls `cleanupFailedIngest(artifactId, context.createdTradelineIds)` when `executeIngestPipeline` throws. Before that call it marks the artifact failed and best-effort deletes evidence events whose description mentions the artifact.

`helpers/ingestCleanup.tsx` deletes packet, evidence event, packet impact, packet compliance, obligation, validation, snapshot, payment-history, tradeline, pass-extraction, report-subtable, edit-log, and report-artifact rows in dependency order. Cleanup errors are caught and logged so the original ingest failure is not masked.

`cleanupArtifactOnly(artifactId)` deletes pass extraction and report-artifact direct subtable rows before deleting the report artifact itself. It also catches and logs cleanup errors.

## Added Visibility

Queued ingest jobs now retain append-only job events for cleanup attempts and cleanup failures when a related job exists for the report artifact. Event payloads must stay metadata-only: no raw report bytes, extracted report text, storage URLs, account numbers, full SINs, credentials, or session material.

The operator dashboard surfaces ingest queue health counts for dead-lettered jobs, stale running jobs, retry backlog, cleanup attempts, failed cleanup events, cleanup-failed jobs, and remediation events.

## Admin Remediation

Admin-only remediation is bounded to metadata/status controls:

- Retry a dead-lettered job with explicit confirmation. The original dead-letter job remains terminal and append-only history is preserved. The replacement job reuses the original idempotency key, so repeated retry requests collapse to the active replacement.
- Mark a dead-lettered or stale-running job reviewed with explicit confirmation.
- Cancel only queued or failed jobs with explicit confirmation.

The remediation endpoint does not delete jobs, events, report artifacts, raw PDFs, parsed text, tradelines, evidence, violations, or packets.

## Stop Conditions

Stop and escalate if remediation would require parser, OCR, violation, evidence, packet, storage, response lifecycle, DB pool, retention, external alerting, or endpoint cutover changes.

Stop and preserve all evidence if cleanup-failure counts increase, a stale-running job persists after lease expiry, or a dead-letter retry repeatedly creates failed replacements.
