# 0000 Runtime Schema Inventory

Recorded: 2026-05-20

Inventory base commit: `28e10e37689916a3e96bd4079f6eb2b9f86ed85a`

Type: inventory-only ledger entry

This entry records existing schema creation and mutation sources. It does not execute DDL and does not replace runtime ensure functions.

## Bootstrap DDL

- `scripts/bootstrap-local-auth-schema.ts`
- `scripts/bootstrap-local-app-fixtures.ts`

## Runtime Ensure Functions

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

## Migration Metadata Endpoints

- `endpoints/migration/create_POST.ts`
- `endpoints/migration/list_GET.ts`
- `endpoints/migration/update_POST.ts`

## Deployment Gate Status

`pnpm run check:migrations` is release-visible reporting only. It writes non-mutating evidence to:

- `docs/production-scale/evidence/latest-migration-governance.md`
- `docs/production-scale/evidence/latest-migration-governance.json`

This inventory does not change production deployment behavior and does not hard-fail deploys.

The checker distinguishes warning-only residuals from release-blocking governance findings. Known runtime ensure sources represented in this inventory are warning-only residuals. Unknown mutation sources, unledgered mutation sources, missing expected source files, missing expected inventory entries, or a missing ledger are release-blocking governance findings for review.

## Cutover Notes

Future migration tasks should convert runtime DDL ownership into additive, reviewed ledger migrations one workstream at a time. Runtime ensure functions must stay active until each replacement migration and rollback path is tested.

Migration governance remains partial until those runtime ensure residuals have a fully governed additive migration strategy and a separately approved hard gate.
