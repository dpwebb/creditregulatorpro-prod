# Report Artifact And Attachment Storage

Updated: 2026-05-20

This document covers the storage behavior for new report artifact raw PDF uploads and new bureau communication attachments. It does not claim broad-production or production-at-scale readiness.

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

## Bureau Communication Attachments

New bureau communication file uploads now store bytes through the same storage adapter family instead of putting inline base64 in `evidenceAttachment.storageUrl`. The database stores a reference in this format:

`local:evidence/bureau-communications/<user-id>/<uuid>-<sha256-prefix>-<filename>`

Legacy evidence attachment rows that already contain inline base64 remain readable by compatibility helpers and metadata-only list paths. They are not migrated, deleted, or rewritten by this change.

Evidence attachment list responses continue to omit `storageUrl`, so list payloads do not expose raw file bytes, inline base64, storage object names, signed URLs, or storage secrets.

## Startup Directory Preflight

App startup runs an idempotent document-storage preflight before the HTTP server starts. The preflight creates missing required directories with recursive `mkdir` only; it never deletes or rewrites existing files.

Required local-storage directories:

- `document-storage`
- `document-storage/report-artifacts`
- `document-storage/packet-pdfs`
- `document-storage/evidence`
- `document-storage/evidence/bureau-communications`
- `document-storage/identification`
- `document-storage/packets`

In staging and production these resolve under the mounted container path `/app/document-storage`.

## Raw Report Inventory

Run:

```bash
pnpm run storage:raw-report-inventory
```

The command writes sanitized aggregate evidence only:

- `docs/production-scale/evidence/latest-storage-raw-report-inventory.md`
- `docs/production-scale/evidence/latest-storage-raw-report-inventory.json`

It counts possible inline `reportArtifact.storageUrl` and `evidenceAttachment.storageUrl` rows without printing raw values. It is non-destructive, does not migrate historical rows, does not delete old inline records, and does not print raw bytes, storage secrets, signed URLs, or PII.

If no staging-safe local database connection is available, the command still writes sanitized evidence marked `database-unavailable`; those unavailable counts must not be treated as zero inline rows.

## Historical Raw Report Remediation Plan

Run:

```bash
pnpm run storage:raw-report-remediation-plan
pnpm run storage:raw-report-remediation-acceptance
```

The plan command is dry-run only. It reads the sanitized inventory evidence when present, classifies aggregate row categories for `report_artifact.storage_url` and `evidence_attachment.storage_url`, and writes:

- `docs/production-scale/evidence/latest-storage-raw-report-remediation-plan.md`
- `docs/production-scale/evidence/latest-storage-raw-report-remediation-plan.json`

It does not delete rows, rewrite historical storage values, access production backups, print raw bytes, print raw base64, expose signed URLs, or include storage/database secrets.

The acceptance command writes latest validation output and does not close blocker 6 unless a separate sanitized operator artifact exists at:

- `docs/production-scale/evidence/storage-raw-report-remediation-acceptance-evidence.json`
- `docs/production-scale/evidence/latest-storage-raw-report-remediation-acceptance.md`
- `docs/production-scale/evidence/latest-storage-raw-report-remediation-acceptance.json`

That artifact must show inventory execution, approved remediation plan, operator or approved-process remediation, old inline compatibility testing, post-remediation counts, backup/restore prerequisite acknowledgement, signed operator acknowledgement, and no raw sensitive values in evidence.

## OCR Upload Validation

The OCR extraction route now uses the shared upload validation helpers for filename, MIME, base64, decoded-size, and raw request-body bounds while preserving the existing 15 MB PDF limit. Valid PDF extraction still calls the same OCR/canonical extraction path and returns the same response shape.

## Boundaries

This change does not alter parser output, OCR output for valid fixtures, violation detection, evidence binding, packet readiness, response lifecycle, ingest queue semantics, admin correction truth, deployment behavior, or historical inline records.
