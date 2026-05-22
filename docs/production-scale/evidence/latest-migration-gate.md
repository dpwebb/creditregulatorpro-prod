# Migration Governance Release Gate

Safety: non-mutating static source and policy validation only; no database connection, credentials, runtime DDL, or schema mutation.
Generated at: 2026-05-22T04:21:30.934Z
Branch: staging
Commit: 72a2bbfa97df8498620613ed1e0bf3051735f04f
Policy: docs/production-scale/migration-governance-policy.json
Policy mode: release-blocking
Status: failed
CERTIFYING:false
Release gate accepted: no
Production promotion gate accepted: no

## Gate Summary

- Unknown mutation sources: 0
- Unledgered mutation sources: 0
- Missing expected sources: 0
- Missing expected inventory entries: 0
- Runtime ensure residuals: 13
- Converted reviewed runtime ensure residuals: 1
- Temporary allowlist runtime ensure residuals: 12
- Runtime ensure residual impact: release-blocking

## Formal Waiver

- Accepted: no
- Approved by role: n/a
- Accepted at: n/a
- Expires on: n/a
- Reason: n/a

## Approved Runtime Ensure Residuals

- [release-blocking] helpers/aiAssistRunStore.ts: AI assist run audit table ensure.; classification still-requires-temporary-acceptance-with-explicit-expiry
- [release-blocking] helpers/consumerIdentification.ts: Consumer identification document table ensure.; classification still-requires-temporary-acceptance-with-explicit-expiry
- [release-blocking] helpers/disputePacketFindingsSchema.tsx: Dispute packet findings table/index ensure.; classification still-requires-temporary-acceptance-with-explicit-expiry
- [reviewed-additive] helpers/ingestProcessingQueueSchema.ts: Ingest processing job and event table/index ensure.; classification already-covered-by-additive-migration
- [release-blocking] helpers/outcomeTrackingSchema.ts: Outcome comparison and finding outcome table/index ensure.; classification still-requires-temporary-acceptance-with-explicit-expiry
- [release-blocking] helpers/parserRulePromotionSchema.tsx: Parser rule promotion table/index ensure.; classification still-requires-temporary-acceptance-with-explicit-expiry
- [release-blocking] helpers/parserTestAdjudicationSchema.tsx: Parser test adjudication table/index ensure.; classification still-requires-temporary-acceptance-with-explicit-expiry
- [release-blocking] helpers/parserTestTrainingArchive.tsx: Parser training archive table/index ensure.; classification still-requires-temporary-acceptance-with-explicit-expiry
- [release-blocking] helpers/regulationReconciliationCandidateService.ts: Regulation reconciliation candidate table/index ensure.; classification still-requires-temporary-acceptance-with-explicit-expiry
- [release-blocking] helpers/regulationRegistrySchema.ts: Regulation registry and mapping table/index ensure.; classification still-requires-temporary-acceptance-with-explicit-expiry
- [release-blocking] helpers/regulationRuntimeBridgeMappingService.ts: Regulation runtime bridge mapping table/index ensure.; classification still-requires-temporary-acceptance-with-explicit-expiry
- [release-blocking] helpers/responseDocumentSchema.ts: Response document, queue, orchestration, and lifecycle table/index ensure.; classification still-requires-temporary-acceptance-with-explicit-expiry
- [release-blocking] helpers/violationCorrectionSchema.tsx: Violation correction and regulation reference table/index ensure.; classification still-requires-temporary-acceptance-with-explicit-expiry

## Residual Classifications

- helpers/aiAssistRunStore.ts: still-requires-temporary-acceptance-with-explicit-expiry; impact release-blocking; reviewed migration n/a; expires 2026-06-30
- helpers/consumerIdentification.ts: still-requires-temporary-acceptance-with-explicit-expiry; impact release-blocking; reviewed migration n/a; expires 2026-06-30
- helpers/disputePacketFindingsSchema.tsx: still-requires-temporary-acceptance-with-explicit-expiry; impact release-blocking; reviewed migration n/a; expires 2026-06-30
- helpers/ingestProcessingQueueSchema.ts: already-covered-by-additive-migration; impact reviewed-additive; reviewed migration migrations/0001-ingest-processing-queue-reviewed-additive.sql; expires n/a
- helpers/outcomeTrackingSchema.ts: still-requires-temporary-acceptance-with-explicit-expiry; impact release-blocking; reviewed migration n/a; expires 2026-06-30
- helpers/parserRulePromotionSchema.tsx: still-requires-temporary-acceptance-with-explicit-expiry; impact release-blocking; reviewed migration n/a; expires 2026-06-30
- helpers/parserTestAdjudicationSchema.tsx: still-requires-temporary-acceptance-with-explicit-expiry; impact release-blocking; reviewed migration n/a; expires 2026-06-30
- helpers/parserTestTrainingArchive.tsx: still-requires-temporary-acceptance-with-explicit-expiry; impact release-blocking; reviewed migration n/a; expires 2026-06-30
- helpers/regulationReconciliationCandidateService.ts: still-requires-temporary-acceptance-with-explicit-expiry; impact release-blocking; reviewed migration n/a; expires 2026-06-30
- helpers/regulationRegistrySchema.ts: still-requires-temporary-acceptance-with-explicit-expiry; impact release-blocking; reviewed migration n/a; expires 2026-06-30
- helpers/regulationRuntimeBridgeMappingService.ts: still-requires-temporary-acceptance-with-explicit-expiry; impact release-blocking; reviewed migration n/a; expires 2026-06-30
- helpers/responseDocumentSchema.ts: still-requires-temporary-acceptance-with-explicit-expiry; impact release-blocking; reviewed migration n/a; expires 2026-06-30
- helpers/violationCorrectionSchema.tsx: still-requires-temporary-acceptance-with-explicit-expiry; impact release-blocking; reviewed migration n/a; expires 2026-06-30

## Converted Reviewed Runtime Ensure Residuals

- [reviewed-additive] helpers/ingestProcessingQueueSchema.ts: migrations/0001-ingest-processing-queue-reviewed-additive.sql

## Temporary Runtime Ensure Allowlist

- [release-blocking/CERTIFYING:false] helpers/aiAssistRunStore.ts: expires 2026-06-30; owner Release governance owner; classification still-requires-temporary-acceptance-with-explicit-expiry; reason Runtime ensure remains temporarily authorized while lower-risk audit tables are converted after production promotion gate activation.
- [release-blocking/CERTIFYING:false] helpers/consumerIdentification.ts: expires 2026-06-30; owner Release governance owner; classification still-requires-temporary-acceptance-with-explicit-expiry; reason Runtime ensure remains temporarily authorized while consumer identification document schema is converted through a focused additive migration task.
- [release-blocking/CERTIFYING:false] helpers/disputePacketFindingsSchema.tsx: expires 2026-06-30; owner Release governance owner; classification still-requires-temporary-acceptance-with-explicit-expiry; reason Runtime ensure remains temporarily authorized to preserve packet lookup behavior until packet finding schema is converted separately.
- [release-blocking/CERTIFYING:false] helpers/outcomeTrackingSchema.ts: expires 2026-06-30; owner Release governance owner; classification still-requires-temporary-acceptance-with-explicit-expiry; reason Runtime ensure remains temporarily authorized while outcome tracking schema is converted without changing response outcome behavior.
- [release-blocking/CERTIFYING:false] helpers/parserRulePromotionSchema.tsx: expires 2026-06-30; owner Release governance owner; classification still-requires-temporary-acceptance-with-explicit-expiry; reason Runtime ensure remains temporarily authorized while parser governance schema is converted without mutating parser truth.
- [release-blocking/CERTIFYING:false] helpers/parserTestAdjudicationSchema.tsx: expires 2026-06-30; owner Release governance owner; classification still-requires-temporary-acceptance-with-explicit-expiry; reason Runtime ensure remains temporarily authorized while parser adjudication schema is converted without changing deterministic extraction.
- [release-blocking/CERTIFYING:false] helpers/parserTestTrainingArchive.tsx: expires 2026-06-30; owner Release governance owner; classification still-requires-temporary-acceptance-with-explicit-expiry; reason Runtime ensure remains temporarily authorized while parser training archive schema is converted through an additive migration.
- [release-blocking/CERTIFYING:false] helpers/regulationReconciliationCandidateService.ts: expires 2026-06-30; owner Release governance owner; classification still-requires-temporary-acceptance-with-explicit-expiry; reason Runtime ensure remains temporarily authorized while regulation reconciliation schema is converted without changing regulation mappings.
- [release-blocking/CERTIFYING:false] helpers/regulationRegistrySchema.ts: expires 2026-06-30; owner Release governance owner; classification still-requires-temporary-acceptance-with-explicit-expiry; reason Runtime ensure remains temporarily authorized while regulation registry schema is converted without changing statutory/reference truth.
- [release-blocking/CERTIFYING:false] helpers/regulationRuntimeBridgeMappingService.ts: expires 2026-06-30; owner Release governance owner; classification still-requires-temporary-acceptance-with-explicit-expiry; reason Runtime ensure remains temporarily authorized while runtime bridge mapping schema is converted without changing bridge behavior.
- [release-blocking/CERTIFYING:false] helpers/responseDocumentSchema.ts: expires 2026-06-30; owner Release governance owner; classification still-requires-temporary-acceptance-with-explicit-expiry; reason Runtime ensure remains temporarily authorized because response document schema is broad and must be converted in its own focused additive task.
- [release-blocking/CERTIFYING:false] helpers/violationCorrectionSchema.tsx: expires 2026-06-30; owner Release governance owner; classification still-requires-temporary-acceptance-with-explicit-expiry; reason Runtime ensure remains temporarily authorized while admin correction schema is converted without changing violation truth or evidence binding.

## Gate Findings

- [release-blocking] unresolved-temporary-runtime-allowlist: helpers/aiAssistRunStore.ts (unresolved) - Production promotion remains blocked until this source is converted to a reviewed additive migration or removed through governed cutover.
- [release-blocking] unresolved-temporary-runtime-allowlist: helpers/consumerIdentification.ts (unresolved) - Production promotion remains blocked until this source is converted to a reviewed additive migration or removed through governed cutover.
- [release-blocking] unresolved-temporary-runtime-allowlist: helpers/disputePacketFindingsSchema.tsx (unresolved) - Production promotion remains blocked until this source is converted to a reviewed additive migration or removed through governed cutover.
- [reviewed-additive] converted-runtime-ensure-residual: helpers/ingestProcessingQueueSchema.ts (converted) - Keep the runtime ensure path as redundant compatibility until a separate task narrows it.
- [release-blocking] unresolved-temporary-runtime-allowlist: helpers/outcomeTrackingSchema.ts (unresolved) - Production promotion remains blocked until this source is converted to a reviewed additive migration or removed through governed cutover.
- [release-blocking] unresolved-temporary-runtime-allowlist: helpers/parserRulePromotionSchema.tsx (unresolved) - Production promotion remains blocked until this source is converted to a reviewed additive migration or removed through governed cutover.
- [release-blocking] unresolved-temporary-runtime-allowlist: helpers/parserTestAdjudicationSchema.tsx (unresolved) - Production promotion remains blocked until this source is converted to a reviewed additive migration or removed through governed cutover.
- [release-blocking] unresolved-temporary-runtime-allowlist: helpers/parserTestTrainingArchive.tsx (unresolved) - Production promotion remains blocked until this source is converted to a reviewed additive migration or removed through governed cutover.
- [release-blocking] unresolved-temporary-runtime-allowlist: helpers/regulationReconciliationCandidateService.ts (unresolved) - Production promotion remains blocked until this source is converted to a reviewed additive migration or removed through governed cutover.
- [release-blocking] unresolved-temporary-runtime-allowlist: helpers/regulationRegistrySchema.ts (unresolved) - Production promotion remains blocked until this source is converted to a reviewed additive migration or removed through governed cutover.
- [release-blocking] unresolved-temporary-runtime-allowlist: helpers/regulationRuntimeBridgeMappingService.ts (unresolved) - Production promotion remains blocked until this source is converted to a reviewed additive migration or removed through governed cutover.
- [release-blocking] unresolved-temporary-runtime-allowlist: helpers/responseDocumentSchema.ts (unresolved) - Production promotion remains blocked until this source is converted to a reviewed additive migration or removed through governed cutover.
- [release-blocking] unresolved-temporary-runtime-allowlist: helpers/violationCorrectionSchema.tsx (unresolved) - Production promotion remains blocked until this source is converted to a reviewed additive migration or removed through governed cutover.

## Future Cutover Procedure

- Select one remaining temporary runtime ensure source and create a reviewed additive migration entry.
- Name affected tables, indexes, runtime ensure function, rollback notes, and verification commands.
- Keep the runtime ensure function active until redundant-additive behavior is proven.
- Only remove or narrow an ensure path in a separate task with focused tests for that runtime path.
- Remove each temporary allowlist entry before its expiresOn date or the production promotion gate will fail.
