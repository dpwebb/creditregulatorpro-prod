# Migration Governance Drift Evidence

Safety: non-mutating static source scan only; no database connection, credentials, DDL, or schema mutation.
Generated at: 2026-05-22T17:51:09.035Z
CERTIFYING:false
Current branch: staging
Current commit hash: b0c8de12b0d85ef47789ad35c7182ff1b6db4ca7
Scan roots: helpers, scripts, endpoints/migration
Ledger directory: migrations
Checker mode: production-promotion-gate-inventory
Governance status: promotion-gate-inventory-current
Release-blocking findings: 0
Warning-only findings: 18
Hard deploy gate enabled: yes
Production promotion gate command: pnpm run migrations:gate

## Runtime Ensure Functions
- helpers/aiAssistRunStore.ts (present): AI assist run audit table ensure.
- helpers/consumerIdentification.ts (present): Consumer identification document table ensure.
- helpers/disputePacketFindingsSchema.tsx (present): Dispute packet findings table/index ensure.
- helpers/ingestProcessingQueueSchema.ts (present): Ingest processing job and event table/index ensure.
- helpers/outcomeTrackingSchema.ts (present): Outcome comparison and finding outcome table/index ensure.
- helpers/parserRulePromotionSchema.tsx (present): Parser rule promotion table/index ensure.
- helpers/parserTestAdjudicationSchema.tsx (present): Parser test adjudication table/index ensure.
- helpers/parserTestTrainingArchive.tsx (present): Parser training archive table/index ensure.
- helpers/regulationReconciliationCandidateService.ts (present): Regulation reconciliation candidate table/index ensure.
- helpers/regulationRegistrySchema.ts (present): Regulation registry and mapping table/index ensure.
- helpers/regulationRuntimeBridgeMappingService.ts (present): Regulation runtime bridge mapping table/index ensure.
- helpers/responseDocumentSchema.ts (present): Response document, queue, orchestration, and lifecycle table/index ensure.
- helpers/violationCorrectionSchema.tsx (present): Violation correction and regulation reference table/index ensure.

## Bootstrap Scripts
- scripts/bootstrap-local-auth-schema.ts (present): Local auth/session/account bootstrap DDL.
- scripts/bootstrap-local-app-fixtures.ts (present): Local app fixture and core table bootstrap DDL.

## Migration Metadata Endpoints
- endpoints/migration/create_POST.ts (present): Admin metadata endpoint for recording migration entries; does not execute DDL.
- endpoints/migration/list_GET.ts (present): Admin metadata endpoint for listing migration entries; does not execute DDL.
- endpoints/migration/update_POST.ts (present): Admin metadata endpoint for updating migration status; does not execute DDL.

## Migration Ledger Entries
- migrations/0000-runtime-schema-inventory.md (2777 bytes)
- migrations/0001-ingest-processing-queue-reviewed-additive.md (1419 bytes)
- migrations/0001-ingest-processing-queue-reviewed-additive.sql (5004 bytes)
- migrations/0002-machine-governed-runtime-residuals.md (1675 bytes)

## Detected Schema Mutation Sources
- helpers/aiAssistRunStore.ts: 3 matched schema mutation pattern(s)
- helpers/consumerIdentification.ts: 2 matched schema mutation pattern(s)
- helpers/disputePacketFindingsSchema.tsx: 7 matched schema mutation pattern(s)
- helpers/ingestProcessingQueueSchema.ts: 13 matched schema mutation pattern(s)
- helpers/outcomeTrackingSchema.ts: 27 matched schema mutation pattern(s)
- helpers/parserRulePromotionSchema.tsx: 5 matched schema mutation pattern(s)
- helpers/parserTestAdjudicationSchema.tsx: 1 matched schema mutation pattern(s)
- helpers/parserTestTrainingArchive.tsx: 5 matched schema mutation pattern(s)
- helpers/regulationReconciliationCandidateService.ts: 10 matched schema mutation pattern(s)
- helpers/regulationRegistrySchema.ts: 11 matched schema mutation pattern(s)
- helpers/regulationRuntimeBridgeMappingService.ts: 12 matched schema mutation pattern(s)
- helpers/responseDocumentSchema.ts: 54 matched schema mutation pattern(s)
- helpers/violationCorrectionSchema.tsx: 14 matched schema mutation pattern(s)
- scripts/bootstrap-local-app-fixtures.ts: 47 matched schema mutation pattern(s)
- scripts/bootstrap-local-auth-schema.ts: 16 matched schema mutation pattern(s)

## Unknown Or Unledgered Schema Mutation Points
- Unknown source: none.
- Unledgered source: none.
- Missing expected source: none.
- Missing expected inventory entry: none.

## Release Findings
- [warning-only] known-runtime-ensure-source: helpers/aiAssistRunStore.ts (present) - Keep release-visible until this ensure path has an additive reviewed migration and rollback evidence.
- [warning-only] known-runtime-ensure-source: helpers/consumerIdentification.ts (present) - Keep release-visible until this ensure path has an additive reviewed migration and rollback evidence.
- [warning-only] known-runtime-ensure-source: helpers/disputePacketFindingsSchema.tsx (present) - Keep release-visible until this ensure path has an additive reviewed migration and rollback evidence.
- [warning-only] known-runtime-ensure-source: helpers/ingestProcessingQueueSchema.ts (present) - Keep release-visible until this ensure path has an additive reviewed migration and rollback evidence.
- [warning-only] known-runtime-ensure-source: helpers/outcomeTrackingSchema.ts (present) - Keep release-visible until this ensure path has an additive reviewed migration and rollback evidence.
- [warning-only] known-runtime-ensure-source: helpers/parserRulePromotionSchema.tsx (present) - Keep release-visible until this ensure path has an additive reviewed migration and rollback evidence.
- [warning-only] known-runtime-ensure-source: helpers/parserTestAdjudicationSchema.tsx (present) - Keep release-visible until this ensure path has an additive reviewed migration and rollback evidence.
- [warning-only] known-runtime-ensure-source: helpers/parserTestTrainingArchive.tsx (present) - Keep release-visible until this ensure path has an additive reviewed migration and rollback evidence.
- [warning-only] known-runtime-ensure-source: helpers/regulationReconciliationCandidateService.ts (present) - Keep release-visible until this ensure path has an additive reviewed migration and rollback evidence.
- [warning-only] known-runtime-ensure-source: helpers/regulationRegistrySchema.ts (present) - Keep release-visible until this ensure path has an additive reviewed migration and rollback evidence.
- [warning-only] known-runtime-ensure-source: helpers/regulationRuntimeBridgeMappingService.ts (present) - Keep release-visible until this ensure path has an additive reviewed migration and rollback evidence.
- [warning-only] known-runtime-ensure-source: helpers/responseDocumentSchema.ts (present) - Keep release-visible until this ensure path has an additive reviewed migration and rollback evidence.
- [warning-only] known-runtime-ensure-source: helpers/violationCorrectionSchema.tsx (present) - Keep release-visible until this ensure path has an additive reviewed migration and rollback evidence.
- [warning-only] bootstrap-script: scripts/bootstrap-local-auth-schema.ts (present) - Keep classified as bootstrap/local or controlled fixture setup; do not treat as production migration governance.
- [warning-only] bootstrap-script: scripts/bootstrap-local-app-fixtures.ts (present) - Keep classified as bootstrap/local or controlled fixture setup; do not treat as production migration governance.
- [warning-only] migration-metadata-endpoint: endpoints/migration/create_POST.ts (present) - Keep clear that this endpoint records metadata only and does not execute DDL.
- [warning-only] migration-metadata-endpoint: endpoints/migration/list_GET.ts (present) - Keep clear that this endpoint records metadata only and does not execute DDL.
- [warning-only] migration-metadata-endpoint: endpoints/migration/update_POST.ts (present) - Keep clear that this endpoint records metadata only and does not execute DDL.

## Recommendation
Keep runtime ensure residuals release-visible and convert them to reviewed additive ledger migrations one workstream at a time.

## Deploy Gate Recommendation
Run migrations:gate and migrations:machine-proof as hard non-mutating production promotion gates; temporary allowlist entries cannot certify production promotion.
