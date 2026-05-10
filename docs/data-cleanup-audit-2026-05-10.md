# Data Cleanup Audit - 2026-05-10

## Scope

Repository: `C:\Users\webbd\Projects\creditregulatorpro-staging`

Target inspected: local development database restored from staging, confirmed host `127.0.0.1`.

No production database or production path was modified.

## Read-Only Data Audit

The following stale, orphaned, and deleted-data candidates were checked:

- Expired sessions
- Expired OAuth states
- Expired or verified email verification tokens
- Login attempts older than 30 days
- Report artifacts older than 1 year
- Tradelines older than 1 year
- Packets older than 1 year
- Evidence events older than 1 year
- Expired report artifacts
- Tradelines referencing missing users
- Tradelines referencing missing report artifacts
- Packets referencing missing users
- Packets referencing missing tradelines
- Obligation instances referencing missing users
- Obligation instances referencing missing tradelines
- Evidence events referencing missing packets
- Report artifacts referencing missing users
- Cross-user tradeline/report artifact mismatches
- Cross-user packet/tradeline mismatches
- Ready-to-mail packets with incomplete processing status

Result: all checked counts were `0`.

## Semantic Audit

The admin semantic audit was run against localhost after signing in as the seeded local admin.

Result:

- Total checks: 86
- Passed: 86
- Failed: 0
- Findings: 0

## Data Removed

No data rows were removed because the read-only audit and semantic audit found no stale, orphaned, or deleted-data candidates in the local staging-copy database.

## Code Repair

The legacy `/admin/purge` endpoint previously deleted expired `reportArtifact` rows directly. That was unsafe because report artifact deletion must also remove downstream tradelines, packets, evidence, parser records, snapshots, and correction records through the established cascade helper.

Repair:

- `/admin/purge` now selects expired report artifacts and deletes each artifact through `deleteReportArtifactCascade`.
- A regression test was added to prevent the endpoint from reverting to direct `reportArtifact` deletion.

## Validation

Passed:

- `pnpm run typecheck`
- `pnpm exec vitest run --config vitest.config.ts tests/unit/admin-reset-cascade.spec.ts`

Full publish checks are expected to run through `pnpm run commit-push`.
