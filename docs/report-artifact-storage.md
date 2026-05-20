# Report Artifact Raw PDF Storage

Updated: 2026-05-20

This document covers the storage behavior for new report artifact raw PDF uploads. It does not claim broad-production or production-at-scale readiness.

## Current Format

New report PDF uploads store raw PDF bytes outside the `reportArtifact` database row. The database `reportArtifact.storageUrl` column stores a storage reference in this format:

`local:report-artifacts/<user-id>/<uuid>-<sha256-prefix>-<filename>`

In local development and any environment without configured object storage, the existing local file fallback writes the file under `LOCAL_DOCUMENT_STORAGE_PATH`, `DOCUMENT_STORAGE_PATH`, or `document-storage` relative to the app working directory.

No signed URL is generated or returned by this storage path.

## Compatibility

Existing legacy records that have inline base64 in `reportArtifact.storageUrl` are not migrated or deleted by this change. Read paths resolve both formats:

- `local:report-artifacts/...` references are read from file storage and converted to base64 for existing parser/viewer compatibility.
- Legacy inline base64 values are passed through unchanged.

The compatible resolver is used by ingest processing, the bounded ingest worker, source-text backfill, and owner/admin report artifact detail reads.

## Write Paths

The following new raw PDF writes store references instead of inline base64:

- authenticated report upload through `createReportArtifact`;
- Stage Lab materialization through `createReportArtifact`;
- review approval when it creates a report artifact;
- report-artifact create/update when the supplied `storageUrl` is a PDF base64 payload.

Report artifact list responses omit `storageUrl` so list payloads do not expose raw PDF bytes or storage references.

## Boundaries

This change does not alter parser output, OCR behavior, violation detection, evidence binding, packet readiness, response lifecycle, ingest queue semantics, admin correction truth, deployment behavior, or historical inline records.
