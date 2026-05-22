# Storage Raw Report Inventory

Sanitized read-only inventory. No raw report bytes, inline base64 values, signed URLs, storage secrets, real consumer PII, or production database dumps are printed.

Generated at: 2026-05-22T00:47:09.364Z
Branch: `staging`
Commit: `4da09d1b87f4641f938bae3f02618f1aa142072d`
Evidence type: SANITIZED_READ_ONLY_INVENTORY
Status: database-unavailable
Database reachable: no
Counts reliable: no
Non-destructive: yes
Historical rows migrated: no
Raw storageUrl values printed: no

## Counts

Counts are unavailable because the local database connection was unavailable. Do not treat unavailable counts as zero.

### reportArtifact.storageUrl

| Metric | Count |
| --- | ---: |
| Total rows | unavailable |
| Rows with storageUrl | unavailable |
| local: storage references | unavailable |
| Possible inline base64 rows | unavailable |
| data:*;base64 rows | unavailable |
| Non-local external-style references | unavailable |
| Null storage rows | unavailable |

### evidenceAttachment.storageUrl

| Metric | Count |
| --- | ---: |
| Total rows | unavailable |
| Rows with storageUrl | unavailable |
| local: storage references | unavailable |
| Possible inline base64 rows | unavailable |
| data:*;base64 rows | unavailable |
| Non-local external-style references | unavailable |
| Null storage rows | unavailable |

## Safety

- Production data mutated: no
- Live external providers connected: no
- Real consumer PII used: no
- Raw report bytes printed: no
- Storage secrets or signed URLs printed: no
- Silent historical migration performed: no

## Remaining Work

Run this command again with a staging-safe local database connection before relying on inventory counts.
