# Database Migration Policy

Updated: 2026-05-21

Controlling audit: `docs/production-at-scale-maximum-audit.md`

CreditRegulatorPro remains limited beta ready with strict constraints. It is not broad-production ready and is not production-at-scale ready. The maximum audit identifies the mixed migration and runtime schema ensure strategy as a production-scale blocker.

## Current Convention

- The root `migrations/` directory is the migration ledger for production schema governance.
- Ledger entries document schema ownership, intended DDL source, verification evidence, rollback considerations, and whether the entry is inventory-only or an executable migration.
- Runtime schema ensure functions remain in place until a later audited migration task replaces them with reviewed additive migrations.
- Runtime ensure functions must not be removed, disabled, or rewritten without a task that explicitly owns schema migration cutover and tests the affected runtime paths.
- The migration checker is non-mutating. It statically scans source files and ledger files only.
- `pnpm run check:migrations` writes the current runtime schema inventory and points to the hard production promotion gate.
- `pnpm run migrations:gate` is the accepted non-mutating production promotion gate. It fails closed for unknown, missing, unledgered, unapproved, or unauthorized runtime ensure sources.
- Temporary runtime ensure allowlist entries must include owner, reason, expiry, and `CERTIFYING:false`. Production migration governance cannot be certified while any temporary allowlist entry remains active.

## Required Future Migration Shape

Future executable migrations should use the root `migrations/` ledger and include:

- a unique ordered filename;
- the production blocker or change request that requires the schema change;
- additive DDL only unless destructive behavior is separately approved;
- affected tables/indexes;
- runtime ensure functions being replaced or retained;
- verification commands and rollback notes;
- explicit confirmation that parser output, canonical extraction, violation detection, evidence binding, packet readiness, response lifecycle, and auth behavior are unchanged unless the task owns one of those surfaces.

## Current Inventory

### Bootstrap DDL

- `scripts/bootstrap-local-auth-schema.ts`
- `scripts/bootstrap-local-app-fixtures.ts`

### Runtime Ensure Functions

- `helpers/aiAssistRunStore.ts`
- `helpers/consumerIdentification.ts`
- `helpers/disputePacketFindingsSchema.tsx`
- `helpers/ingestProcessingQueueSchema.ts`
- `helpers/outcomeTrackingSchema.ts`
- `helpers/parserRulePromotionSchema.tsx`
- `helpers/parserTestAdjudicationSchema.tsx`
- `helpers/parserTestTrainingArchive.tsx`
- `helpers/regulationReconciliationCandidateService.ts`
- `helpers/regulationRegistrySchema.ts`
- `helpers/regulationRuntimeBridgeMappingService.ts`
- `helpers/responseDocumentSchema.ts`
- `helpers/violationCorrectionSchema.tsx`

### Migration Metadata Endpoints

- `endpoints/migration/create_POST.ts`
- `endpoints/migration/list_GET.ts`
- `endpoints/migration/update_POST.ts`

These admin endpoints track migration metadata in application tables. They do not execute DDL and are not a production migration runner.

## Checker

Run:

```bash
pnpm run check:migrations
```

The checker reports:

- current branch, commit hash, and evidence timestamp;
- runtime ensure functions;
- bootstrap schema scripts;
- migration metadata endpoints;
- migration ledger entries;
- detected schema mutation sources;
- unknown or unledgered schema mutation points;
- missing expected sources and missing expected inventory entries;
- whether each finding is `release-blocking` or `warning-only`;
- the production promotion gate command and recommendation.

The checker writes:

- `docs/production-scale/evidence/latest-migration-governance.md`
- `docs/production-scale/evidence/latest-migration-governance.json`

The checker does not connect to the database, read credentials, run DDL, alter tables, update generated types, mutate production data, or change deployment gates.

Run the evidence command explicitly with:

```bash
pnpm run migrations:evidence
```

This uses the same non-mutating checker and writes the same release-visible evidence files.

## Migration Gate

Run:

```bash
pnpm run migrations:gate
```

The gate reads `docs/production-scale/migration-governance-policy.json` and writes:

- `docs/production-scale/evidence/latest-migration-gate.md`
- `docs/production-scale/evidence/latest-migration-gate.json`

Gate modes:

- `warning-only`: approved runtime ensure residuals remain visible warnings and blocker 10 is not policy-closed.
- `release-blocking`: approved runtime ensure residuals become blocking until reviewed additive migration cutover is complete.
- `waived`: approved runtime ensure residuals are formally waived with an accountable reason, role, timestamp, expiry, and conditions. Unknown, unledgered, missing, or unapproved mutation sources still fail the gate.

Current policy mode:

- `release-blocking`.
- `helpers/ingestProcessingQueueSchema.ts` is represented by reviewed additive migration `migrations/0001-ingest-processing-queue-reviewed-additive.sql`.
- Temporary runtime ensure allowlist residuals are tracked with owner, reason, expiry, and `CERTIFYING:false`, but remain release-blocking until converted to reviewed additive migration evidence or removed through governed cutover.
- Remaining runtime ensure residuals are explicitly time-bound temporary production allowlist entries that keep evidence `CERTIFYING:false` and fail the gate until converted.

The gate does not connect to the database, read credentials, run DDL, alter tables, update generated types, mutate production data, or change runtime behavior.

## Current Residual Risk

Runtime ensure functions remain active. They are production-promotion governed residuals, not fully certified migration governance. Unknown mutation sources, unledgered sources, missing expected sources, missing expected inventory entries, unauthorized runtime ensure sources, invalid converted migration entries, and active, expired, or incomplete temporary allowlist entries are release-blocking findings.

Migration governance is production-certifying only when `migrations:gate` accepts release-blocking mode with `CERTIFYING:true`. While any temporary runtime ensure allowlist entry remains active, the production promotion gate fails closed and the evidence must remain `CERTIFYING:false`.

## Remediation Path

Future additive migration ledger cutover should proceed one workstream at a time:

- add a reviewed ledger entry that names the runtime ensure source being replaced or retained;
- add additive DDL only, unless a separate destructive-change approval exists;
- prove the runtime ensure path can remain safely redundant or be removed in a separately authorized task;
- include rollback notes and verification commands;
- remove the temporary allowlist entry before expiry so the production promotion gate can become certifying.

## Stop Conditions

Stop before schema work if:

- the checker reports unknown schema mutation sources;
- a detected schema mutation source is not represented in the ledger;
- drift detection would require database credentials;
- a proposed fix requires removing runtime ensure functions in the same task;
- a proposed fix would change response schema behavior, parser truth, violation logic, evidence binding, packet readiness, auth/session behavior, or deployment gate behavior outside its approved scope.
