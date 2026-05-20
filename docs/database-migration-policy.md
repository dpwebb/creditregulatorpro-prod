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
- `pnpm run check:migrations` is informational only. It must not hard-fail production deploys until a later task wires a stable, audited gate.

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

- runtime ensure functions;
- bootstrap schema scripts;
- migration metadata endpoints;
- migration ledger entries;
- detected schema mutation sources;
- unknown or unledgered schema mutation points;
- a deploy-gate recommendation.

The checker does not connect to the database, read credentials, run DDL, alter tables, update generated types, or change deployment gates.

## Stop Conditions

Stop before schema work if:

- the checker reports unknown schema mutation sources;
- a detected schema mutation source is not represented in the ledger;
- drift detection would require database credentials;
- a proposed fix requires removing runtime ensure functions in the same task;
- a proposed fix would change response schema behavior, parser truth, violation logic, evidence binding, packet readiness, auth/session behavior, or deployment gate behavior outside its approved scope.
