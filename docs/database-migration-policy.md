# Database Migration Policy

Updated: 2026-05-20

Controlling audit: `docs/production-at-scale-maximum-audit.md`

CreditRegulatorPro remains limited beta ready with strict constraints. It is not broad-production ready and is not production-at-scale ready. The maximum audit identifies the mixed migration and runtime schema ensure strategy as a production-scale blocker.

## Current Convention

- The root `migrations/` directory is the migration ledger for production schema governance.
- Ledger entries document schema ownership, intended DDL source, verification evidence, rollback considerations, and whether the entry is inventory-only or an executable migration.
- Runtime schema ensure functions remain in place until a later audited migration task replaces them with reviewed additive migrations.
- Runtime ensure functions must not be removed, disabled, or rewritten without a task that explicitly owns schema migration cutover and tests the affected runtime paths.
- The migration checker is non-mutating. It statically scans source files and ledger files only.
- `pnpm run check:migrations` is release-visible reporting only. It writes non-mutating evidence, but it must not hard-fail production deploys until a later task wires a stable, audited gate.

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
- a deploy-gate recommendation.

The checker writes:

- `docs/production-scale/evidence/latest-migration-governance.md`
- `docs/production-scale/evidence/latest-migration-governance.json`

The checker does not connect to the database, read credentials, run DDL, alter tables, update generated types, mutate production data, or change deployment gates.

Run the evidence command explicitly with:

```bash
pnpm run migrations:evidence
```

This uses the same non-mutating checker and writes the same release-visible evidence files.

## Current Residual Risk

Runtime ensure functions remain active. They are release-visible residuals, not completed migration governance. Their presence is warning-only when every expected source exists and is represented in the ledger, but unknown mutation sources, unledgered sources, missing expected sources, and missing expected inventory entries are release-blocking findings for governance review.

Migration governance remains partial until runtime ensure ownership is fully governed through reviewed additive migrations, rollback notes, and a separately approved hard gate.

## Remediation Path

Future additive migration ledger cutover should proceed one workstream at a time:

- add a reviewed ledger entry that names the runtime ensure source being replaced or retained;
- add additive DDL only, unless a separate destructive-change approval exists;
- prove the runtime ensure path can remain safely redundant or be removed in a separately authorized task;
- include rollback notes and verification commands;
- only after repeated evidence, consider a hard deployment gate that blocks on release-blocking migration findings.

## Stop Conditions

Stop before schema work if:

- the checker reports unknown schema mutation sources;
- a detected schema mutation source is not represented in the ledger;
- drift detection would require database credentials;
- a proposed fix requires removing runtime ensure functions in the same task;
- a proposed fix would change response schema behavior, parser truth, violation logic, evidence binding, packet readiness, auth/session behavior, or deployment gate behavior outside its approved scope.
