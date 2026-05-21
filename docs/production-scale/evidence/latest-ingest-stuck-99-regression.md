# Ingest Stuck-99 Regression Evidence

Generated at: 2026-05-21T02:09:15.589Z

- Scope: synthetic local status-regression evidence only.
- Production mutation: false.
- Production worker activated: false.
- Parser/OCR/violation/packet behavior changed: false.
- Raw report data included: false.

| Scenario | UI status | Next action | Diagnostic code | Message |
| --- | --- | --- | --- | --- |
| queued_waiting_for_worker | queued_waiting_for_worker | wait_for_worker | INGEST_QUEUED_WAITING_FOR_WORKER | Your report was received and is waiting for processing. You can leave this page; we'll update your account when processing completes. |
| processing_active | processing | wait_for_processing | INGEST_PROCESSING_ACTIVE | Processing is active. This usually takes a few moments. |
| completed | completed | review_results | INGEST_PROCESSING_COMPLETED | Credit file processed. Review your results. |
| failed | failed | check_status | INGEST_PROCESSING_FAILED | Processing could not be completed. Please upload the report again or contact support if the problem continues. |
| manual_review_required | manual_review_required | manual_review | INGEST_MANUAL_REVIEW_REQUIRED | Manual review is required before this report can continue. Support will review the upload and update your account. |
| stale_processing | stale | check_status | INGEST_PROCESSING_STALE | Processing is taking longer than expected. Use Check status to refresh, or upload again if this does not change. |
