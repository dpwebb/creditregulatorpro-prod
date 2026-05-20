# Latest Sensitive List Endpoint Evidence

Generated at: 2026-05-20T19:11:15.370Z
Current branch: `staging`
Current commit hash: `0dffe029864319abd5f4f6c37718c5294143112d`
Status: passed

## Required Warnings

- This evidence is local/static and does not mutate production data.
- No real consumer PII, real credit reports, credentials, production database dumps, live mail delivery, or live external providers are used.
- Hidden-risk semantics remain partial/design-only; this report does not claim production-at-scale readiness.

## Parser-Test List

- List metadata-only: yes
- Raw text detail path admin-only: yes
- Raw text export path admin-only: yes

## Consumer Signature List

- List metadata-only: yes
- Signature detail includes signatureData: yes
- Signature detail owner/admin controlled: yes

## Hidden-Risk Design Artifact

- Status: partial-design-only
- Current endpoint uses full matching set for aggregate: yes
- Blind limit applied: no
- Safe future implementation:
  - Split aggregate counts into a dedicated aggregate query that preserves stale-suppression semantics.
  - Add a paginated row query with explicit limit/offset after the aggregate contract is separated.
  - Update Risk Triage UI to show aggregate totals independently from page size.
  - Add API/UI tests that prove total counts are full-set counts while rows are bounded.

