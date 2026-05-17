---
created: 2026-04-18T13:40:10.636Z
updated: 2026-04-18T13:40:10.636Z
---

## Summary
Prevent the ingestion pipeline from leaving orphaned database records when report processing fails. Currently, every upload attempt — including failures — creates report_artifact records, pass_extraction records, obligation_instances, obligation_challenge_logs, tradeline_snapshots, and more. Failed/partial runs accumulate stale data that confuses users (e.g. showing "letters sent" when no letters were sent).

## Problem
1. Phase 1 (`handleIngestSubmit`) creates a `report_artifact` before attempting extraction. On failure, the artifact stays with `extractionStatus: "failed"`.
2. Phase 2 (`handleIngestProcess`) creates `pass_extraction`, `obligation_instance`, `obligation_challenge_log`, `tradeline_snapshot`, `evidence_event`, `creditor_obligation_test`, and `metro2_validation_log` records at various stages — none are rolled back if a later stage fails.
3. Anonymous upload (`anonymous-report_POST`) also creates artifacts that persist on failure.
4. There is no cleanup mechanism for stale/failed records.

## Approach

### Step 1: Add cleanup on Phase 2 failure
In `handleIngestProcess`, wrap the processing in a try/catch that cleans up all intermediate records when any stage fails:
- Delete `pass_extraction` records for the artifact
- Delete `obligation_challenge_log` records for newly-persisted tradeline IDs
- Delete `obligation_instance` records for newly-persisted tradeline IDs
- Delete `tradeline_snapshot` records for newly-persisted tradeline IDs
- Delete `creditor_obligation_test` records for newly-persisted tradeline IDs
- Delete `metro2_validation_log` records for newly-persisted tradeline IDs
- Delete `evidence_event` records for newly-persisted packets/tradelines
- Delete newly-persisted tradelines themselves
- Mark the artifact as `processingStatus: "failed"`

### Step 2: Add cleanup on Phase 1 failure
In `handleIngestSubmit`, if extraction fails, delete the artifact record entirely instead of leaving it with `extractionStatus: "failed"`. The user gains nothing from a failed artifact sitting in the DB.

### Step 3: Add cleanup for anonymous uploads
In `anonymous-report_POST`, if extraction fails, delete the artifact record in the catch block instead of just marking it as "failed".

### Step 4: Add a scheduled cleanup job for any remaining orphans
Create a cron job that runs daily to purge:
- `report_artifact` records with `processingStatus` in ("failed", "pending", "extracting") older than 24 hours
- `pass_extraction` records whose `report_artifact_id` no longer exists or whose artifact is failed
- Any orphaned `obligation_instance`, `obligation_challenge_log`, etc. records linked to non-existent tradelines

## Files to Modify

### helpers/ingestReportHandler.tsx
- In `handleIngestSubmit`: On extraction failure, delete the artifact instead of leaving it. Remove the code that updates the artifact data with "failed" status and replace with DELETE.
- In `handleIngestProcess`: Add a cleanup helper function that deletes all intermediate records (pass_extraction, obligation_instance, obligation_challenge_log, tradeline_snapshot, creditor_obligation_test, metro2_validation_log, evidence_event, tradelines) created during the current run. Call this cleanup function whenever we `send({ type: "error" })` before returning.

### endpoints/ingest/anonymous-report_POST.ts
- In the catch block: Change from updating `processingStatus: "failed"` to deleting the artifact entirely (`DELETE FROM report_artifact WHERE id = artifactId`).

## Files to Create

### helpers/ingestCleanup.tsx
- A new helper with a `cleanupFailedIngest(artifactId, tradelineIds?)` function
- Deletes all related records in the correct order (respecting foreign keys):
  1. `evidence_event` (by packet_id for packets linked to these tradelines)
  2. `packet_impact_assessment` (by packet_id)
  3. `packet_compliance_audit` (by packet_id)
  4. `packet` (by tradeline_id)
  5. `obligation_challenge_log` (by tradeline_id)
  6. `deadline_event` (by obligation_instance_id)
  7. `success_metric` (by obligation_instance_id)
  8. `obligation_instance` (by tradeline_id)
  9. `creditor_obligation_test` (by tradeline_id)
  10. `metro2_validation_log` (by tradeline_id)
  11. `tradeline_snapshot` (by tradeline_id)
  12. `tradeline_artifact_presence` (by tradeline_id)
  13. `tradeline_payment_history` (by tradeline_id)
  14. `tradeline` (by report_artifact_id)
  15. `pass_extraction` (by report_artifact_id)
  16. `report_consumer_info`, `report_credit_score`, `report_inquiry`, `report_public_record`, `report_consumer_statement`, `report_employment_info` (by report_artifact_id)
  17. `report_artifact` (by id) — only if full cleanup is requested

### static/__dev/scheduled-jobs.json (update)
- Add a daily cron job that calls an endpoint to purge stale failed artifacts older than 24 hours

### endpoints/admin/cleanup-failed-artifacts_POST.ts
- Admin-only endpoint that runs the cleanup for stale failed artifacts
- Also callable by the cron job
- Finds all `report_artifact` with `processingStatus` in ("failed", "pending", "extracting") and `created_at` older than 24 hours
- Calls `cleanupFailedIngest` for each

## Risks & Considerations
- **Foreign key order matters**: Deletions must happen in the correct order to avoid FK constraint violations. The cleanup helper must delete child records before parent records.
- **Backward compatibility**: The cleanup changes are internal to the ingestion pipeline. No endpoint inputs/outputs change. The new admin endpoint is additive.
- **Race conditions**: If Phase 2 is actively processing while cleanup runs, we could delete records in use. The 24-hour grace period on the cron job prevents this for scheduled cleanup. For inline cleanup (on Phase 2 failure), this isn't a concern since we only clean up records created in the current run.
- **Anonymous uploads**: Deleting the artifact on failure means the user can't see "failed" status — but since anonymous uploads don't have a dashboard, this is fine. They just see the error message.
