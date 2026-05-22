# Storage Raw Report Inventory

Sanitized read-only inventory. No raw report bytes, inline base64 values, signed URLs, storage secrets, real consumer PII, or production database dumps are printed.

Generated at: 2026-05-22T03:49:58.805Z
Branch: `staging`
Commit: `741a25497cded1907bdf07a3e253c6fcfcdb3749`
Environment: local
Evidence type: SANITIZED_READ_ONLY_INVENTORY
Status: database-unavailable
CERTIFYING:false
Database reachable: no
Counts reliable: no
Inventory method: read-only-aggregate-sql-counts
Confidence: unreliable
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

## Remediation Candidates

- reportArtifact candidates: unavailable
- evidenceAttachment candidates: unavailable
- Total candidates: unavailable

## Safety

- Production data mutated: no
- Live external providers connected: no
- Real consumer PII used: no
- Raw report bytes printed: no
- Raw report text, names, addresses, account numbers, and signed URLs printed: no
- Storage secrets or signed URLs printed: no
- Silent historical migration performed: no

## Remaining Work

Run this command again with a staging-safe local database connection before relying on inventory counts.
