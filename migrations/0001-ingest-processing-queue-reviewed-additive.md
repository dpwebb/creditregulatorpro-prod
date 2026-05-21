# 0001 Ingest Processing Queue Reviewed Additive Migration

Recorded: 2026-05-21

Type: reviewed additive migration ledger entry

Runtime ensure source converted first:

- `helpers/ingestProcessingQueueSchema.ts`

Executable migration artifact:

- `migrations/0001-ingest-processing-queue-reviewed-additive.sql`

## Scope

This migration records the ingest processing queue tables, heartbeat table, constraints, and indexes as reviewed additive DDL. It preserves the existing runtime ensure function as a compatibility safety path while production promotion governance begins requiring every runtime ensure source to be either converted to a reviewed migration or explicitly time-bound on the temporary allowlist.

## Safety

- Additive DDL only.
- No destructive schema changes.
- No data deletion, data rewrite, or backfill.
- No production database access during validation.
- Runtime ensure path remains active until a separately authorized task narrows or removes it.

## Verification

Automated verification is through:

- `pnpm run check:migrations`
- `pnpm run migrations:gate`
- `pnpm exec vitest run --config vitest.config.ts tests/unit/migration-gate.spec.ts tests/unit/migration-checker.spec.ts`

The reviewed migration simulator applies `migrations/0001-ingest-processing-queue-reviewed-additive.sql` against a fresh platform schema simulation with expected base tables and rejects destructive statements.
