# Storage Raw Report Remediation Plan

Sanitized dry-run-only plan. No raw report bytes, inline base64 values, raw report text, signed URLs, storage secrets, database URLs, or real consumer PII are printed.

Generated at: 2026-05-22T00:47:06.512Z
Branch: `staging`
Commit: `4da09d1b87f4641f938bae3f02618f1aa142072d`
Evidence type: SANITIZED_DRY_RUN_REMEDIATION_PLAN
Status: inventory-unreliable
Dry-run only: yes
Production mutation refused: yes

## Inventory Evidence

- Path: `docs/production-scale/evidence/latest-storage-raw-report-inventory.json`
- Exists: yes
- Status: database-unavailable
- Counts reliable: no
- Sensitive findings: 0

## Estimated Counts

### reportArtifact.storageUrl

| Metric | Estimated count |
| --- | ---: |
| Total rows | unavailable |
| Rows with storageUrl | unavailable |
| local: storage references | unavailable |
| Possible inline base64 rows | unavailable |
| data:*;base64 rows | unavailable |
| Non-local external-style references | unavailable |
| Null storage rows | unavailable |

### evidenceAttachment.storageUrl

| Metric | Estimated count |
| --- | ---: |
| Total rows | unavailable |
| Rows with storageUrl | unavailable |
| local: storage references | unavailable |
| Possible inline base64 rows | unavailable |
| data:*;base64 rows | unavailable |
| Non-local external-style references | unavailable |
| Null storage rows | unavailable |

## Remediation Categories

| Table | Field | Category | Estimated rows | Planned action |
| --- | --- | --- | ---: | --- |
| report_artifact | storage_url | legacy-inline-pdf-candidates | unavailable | Operator-approved copy to report-artifact storage reference after checksum verification; keep legacy resolver compatibility during rollout. |
| report_artifact | storage_url | data-url-inline-pdf-candidates | unavailable | Operator-approved normalize data URL payload to storage reference after validation; preserve rollback snapshot. |
| report_artifact | storage_url | already-reference-or-null | unavailable | No byte migration planned; validate compatibility and metadata visibility only. |
| evidence_attachment | storage_url | legacy-inline-attachment-candidates | unavailable | Operator-approved copy to evidence attachment storage reference after checksum verification; keep legacy resolver compatibility during rollout. |
| evidence_attachment | storage_url | data-url-inline-attachment-candidates | unavailable | Operator-approved normalize data URL payload to storage reference after validation; preserve rollback snapshot. |
| evidence_attachment | storage_url | already-reference-or-null | unavailable | No byte migration planned; validate compatibility and metadata visibility only. |

## Operator Approval Requirements

- Named operator or role approves the plan before execution.
- Approval references the sanitized inventory and this dry-run plan evidence.
- Approval confirms no raw PII, raw report bytes, signed URLs, storage secrets, or database URLs are included in evidence.
- Approval confirms Codex will not run production mutation.
- Approval records bounded batch size, rollback owner, and validation owner.

## Backup Prerequisite

A fresh backup and restore-readiness acknowledgement are required before any operator-approved remediation process runs.

## Rollback Strategy

- Do not delete historical rows during remediation.
- Capture a pre-remediation backup and row-count snapshot before any operator-run process.
- Use transaction-bounded batches so failed batches can be rolled back independently.
- Preserve legacy inline resolver compatibility until post-remediation validation is complete.
- If validation fails, restore affected storage_url values from the approved backup/snapshot and rerun compatibility checks.

## Post-Remediation Validation

- Rerun pnpm run storage:raw-report-inventory and compare aggregate counts only.
- Verify legacy inline reportArtifact records remain readable through resolveReportArtifactPdfBase64 compatibility tests.
- Verify legacy inline evidenceAttachment records remain readable through resolveEvidenceAttachmentBase64 compatibility tests.
- Run pnpm run test:api and focused storage compatibility tests.
- Submit sanitized acceptance evidence with post-remediation counts and signed acknowledgement.

## Safety

- This is a dry-run-only remediation plan.
- This command does not delete historical rows.
- This command does not migrate production data.
- This command does not print raw base64, raw PDFs, raw report text, PII, storage secrets, signed URLs, or database URLs.
- Blocker 6 remains remediation-required until sanitized operator acceptance evidence is submitted and accepted.
