# Migration Governance Release Gate

Safety: non-mutating static source and policy validation only; no database connection, credentials, runtime DDL, or schema mutation.
Generated at: 2026-05-23T03:23:38.662Z
Branch: staging
Commit: 40fd438dd95a1afeee4b6d3a471b5769a44db513
Policy: docs/production-scale/migration-governance-policy.json
Policy mode: release-blocking
Status: accepted-release-blocking
CERTIFYING:true
Release gate accepted: yes
Production promotion gate accepted: yes

## Gate Summary

- Unknown mutation sources: 0
- Unledgered mutation sources: 0
- Missing expected sources: 0
- Missing expected inventory entries: 0
- Runtime ensure residuals: 13
- Converted reviewed runtime ensure residuals: 1
- Machine-governed runtime ensure residuals: 12
- Temporary allowlist runtime ensure residuals: 0
- Runtime ensure residual impact: reviewed-governed

## Formal Waiver

- Accepted: no
- Approved by role: n/a
- Accepted at: n/a
- Expires on: n/a
- Reason: n/a

## Approved Runtime Ensure Residuals

- [reviewed-governed] helpers/aiAssistRunStore.ts: AI assist run audit table ensure.; classification reviewed and governed
- [reviewed-governed] helpers/consumerIdentification.ts: Consumer identification document table ensure.; classification reviewed and governed
- [reviewed-governed] helpers/disputePacketFindingsSchema.tsx: Dispute packet findings table/index ensure.; classification reviewed and governed
- [reviewed-additive] helpers/ingestProcessingQueueSchema.ts: Ingest processing job and event table/index ensure.; classification already-covered-by-additive-migration
- [reviewed-governed] helpers/outcomeTrackingSchema.ts: Outcome comparison and finding outcome table/index ensure.; classification reviewed and governed
- [reviewed-governed] helpers/parserRulePromotionSchema.tsx: Parser rule promotion table/index ensure.; classification reviewed and governed
- [reviewed-governed] helpers/parserTestAdjudicationSchema.tsx: Parser test adjudication table/index ensure.; classification reviewed and governed
- [reviewed-governed] helpers/parserTestTrainingArchive.tsx: Parser training archive table/index ensure.; classification reviewed and governed
- [reviewed-governed] helpers/regulationReconciliationCandidateService.ts: Regulation reconciliation candidate table/index ensure.; classification reviewed and governed
- [reviewed-governed] helpers/regulationRegistrySchema.ts: Regulation registry and mapping table/index ensure.; classification reviewed and governed
- [reviewed-governed] helpers/regulationRuntimeBridgeMappingService.ts: Regulation runtime bridge mapping table/index ensure.; classification reviewed and governed
- [reviewed-governed] helpers/responseDocumentSchema.ts: Response document, queue, orchestration, and lifecycle table/index ensure.; classification reviewed and governed
- [reviewed-governed] helpers/violationCorrectionSchema.tsx: Violation correction and regulation reference table/index ensure.; classification reviewed and governed

## Residual Classifications

- helpers/aiAssistRunStore.ts: reviewed and governed; impact reviewed-governed; ledger status reviewed and governed; ledger migrations/0002-machine-governed-runtime-residuals.md; reviewed migration n/a; expires n/a
- helpers/consumerIdentification.ts: reviewed and governed; impact reviewed-governed; ledger status reviewed and governed; ledger migrations/0002-machine-governed-runtime-residuals.md; reviewed migration n/a; expires n/a
- helpers/disputePacketFindingsSchema.tsx: reviewed and governed; impact reviewed-governed; ledger status reviewed and governed; ledger migrations/0002-machine-governed-runtime-residuals.md; reviewed migration n/a; expires n/a
- helpers/ingestProcessingQueueSchema.ts: already-covered-by-additive-migration; impact reviewed-additive; ledger status ledgered additive migration; ledger migrations/0001-ingest-processing-queue-reviewed-additive.md; reviewed migration migrations/0001-ingest-processing-queue-reviewed-additive.sql; expires n/a
- helpers/outcomeTrackingSchema.ts: reviewed and governed; impact reviewed-governed; ledger status reviewed and governed; ledger migrations/0002-machine-governed-runtime-residuals.md; reviewed migration n/a; expires n/a
- helpers/parserRulePromotionSchema.tsx: reviewed and governed; impact reviewed-governed; ledger status reviewed and governed; ledger migrations/0002-machine-governed-runtime-residuals.md; reviewed migration n/a; expires n/a
- helpers/parserTestAdjudicationSchema.tsx: reviewed and governed; impact reviewed-governed; ledger status reviewed and governed; ledger migrations/0002-machine-governed-runtime-residuals.md; reviewed migration n/a; expires n/a
- helpers/parserTestTrainingArchive.tsx: reviewed and governed; impact reviewed-governed; ledger status reviewed and governed; ledger migrations/0002-machine-governed-runtime-residuals.md; reviewed migration n/a; expires n/a
- helpers/regulationReconciliationCandidateService.ts: reviewed and governed; impact reviewed-governed; ledger status reviewed and governed; ledger migrations/0002-machine-governed-runtime-residuals.md; reviewed migration n/a; expires n/a
- helpers/regulationRegistrySchema.ts: reviewed and governed; impact reviewed-governed; ledger status reviewed and governed; ledger migrations/0002-machine-governed-runtime-residuals.md; reviewed migration n/a; expires n/a
- helpers/regulationRuntimeBridgeMappingService.ts: reviewed and governed; impact reviewed-governed; ledger status reviewed and governed; ledger migrations/0002-machine-governed-runtime-residuals.md; reviewed migration n/a; expires n/a
- helpers/responseDocumentSchema.ts: reviewed and governed; impact reviewed-governed; ledger status reviewed and governed; ledger migrations/0002-machine-governed-runtime-residuals.md; reviewed migration n/a; expires n/a
- helpers/violationCorrectionSchema.tsx: reviewed and governed; impact reviewed-governed; ledger status reviewed and governed; ledger migrations/0002-machine-governed-runtime-residuals.md; reviewed migration n/a; expires n/a

## Machine Residual Statuses

- helpers/aiAssistRunStore.ts: reviewed and governed; status certifying; ledger status reviewed and governed; ledger migrations/0002-machine-governed-runtime-residuals.md
- helpers/consumerIdentification.ts: reviewed and governed; status certifying; ledger status reviewed and governed; ledger migrations/0002-machine-governed-runtime-residuals.md
- helpers/disputePacketFindingsSchema.tsx: reviewed and governed; status certifying; ledger status reviewed and governed; ledger migrations/0002-machine-governed-runtime-residuals.md
- helpers/ingestProcessingQueueSchema.ts: ledgered additive migration; status certifying; ledger status ledgered additive migration; ledger migrations/0001-ingest-processing-queue-reviewed-additive.md
- helpers/outcomeTrackingSchema.ts: reviewed and governed; status certifying; ledger status reviewed and governed; ledger migrations/0002-machine-governed-runtime-residuals.md
- helpers/parserRulePromotionSchema.tsx: reviewed and governed; status certifying; ledger status reviewed and governed; ledger migrations/0002-machine-governed-runtime-residuals.md
- helpers/parserTestAdjudicationSchema.tsx: reviewed and governed; status certifying; ledger status reviewed and governed; ledger migrations/0002-machine-governed-runtime-residuals.md
- helpers/parserTestTrainingArchive.tsx: reviewed and governed; status certifying; ledger status reviewed and governed; ledger migrations/0002-machine-governed-runtime-residuals.md
- helpers/regulationReconciliationCandidateService.ts: reviewed and governed; status certifying; ledger status reviewed and governed; ledger migrations/0002-machine-governed-runtime-residuals.md
- helpers/regulationRegistrySchema.ts: reviewed and governed; status certifying; ledger status reviewed and governed; ledger migrations/0002-machine-governed-runtime-residuals.md
- helpers/regulationRuntimeBridgeMappingService.ts: reviewed and governed; status certifying; ledger status reviewed and governed; ledger migrations/0002-machine-governed-runtime-residuals.md
- helpers/responseDocumentSchema.ts: reviewed and governed; status certifying; ledger status reviewed and governed; ledger migrations/0002-machine-governed-runtime-residuals.md
- helpers/violationCorrectionSchema.tsx: reviewed and governed; status certifying; ledger status reviewed and governed; ledger migrations/0002-machine-governed-runtime-residuals.md

## Converted Reviewed Runtime Ensure Residuals

- [reviewed-additive] helpers/ingestProcessingQueueSchema.ts: migrations/0001-ingest-processing-queue-reviewed-additive.sql

## Machine-Governed Runtime Ensure Residuals

- [reviewed-governed] helpers/aiAssistRunStore.ts: migrations/0002-machine-governed-runtime-residuals.md; ledger status reviewed and governed
- [reviewed-governed] helpers/consumerIdentification.ts: migrations/0002-machine-governed-runtime-residuals.md; ledger status reviewed and governed
- [reviewed-governed] helpers/disputePacketFindingsSchema.tsx: migrations/0002-machine-governed-runtime-residuals.md; ledger status reviewed and governed
- [reviewed-governed] helpers/outcomeTrackingSchema.ts: migrations/0002-machine-governed-runtime-residuals.md; ledger status reviewed and governed
- [reviewed-governed] helpers/parserRulePromotionSchema.tsx: migrations/0002-machine-governed-runtime-residuals.md; ledger status reviewed and governed
- [reviewed-governed] helpers/parserTestAdjudicationSchema.tsx: migrations/0002-machine-governed-runtime-residuals.md; ledger status reviewed and governed
- [reviewed-governed] helpers/parserTestTrainingArchive.tsx: migrations/0002-machine-governed-runtime-residuals.md; ledger status reviewed and governed
- [reviewed-governed] helpers/regulationReconciliationCandidateService.ts: migrations/0002-machine-governed-runtime-residuals.md; ledger status reviewed and governed
- [reviewed-governed] helpers/regulationRegistrySchema.ts: migrations/0002-machine-governed-runtime-residuals.md; ledger status reviewed and governed
- [reviewed-governed] helpers/regulationRuntimeBridgeMappingService.ts: migrations/0002-machine-governed-runtime-residuals.md; ledger status reviewed and governed
- [reviewed-governed] helpers/responseDocumentSchema.ts: migrations/0002-machine-governed-runtime-residuals.md; ledger status reviewed and governed
- [reviewed-governed] helpers/violationCorrectionSchema.tsx: migrations/0002-machine-governed-runtime-residuals.md; ledger status reviewed and governed

## Temporary Runtime Ensure Allowlist

- None.

## Gate Findings

- [reviewed-governed] machine-governed-runtime-residual: helpers/aiAssistRunStore.ts (governed) - Keep the runtime ensure path as compatibility redundancy until a separate task narrows it.
- [reviewed-governed] machine-governed-runtime-residual: helpers/consumerIdentification.ts (governed) - Keep the runtime ensure path as compatibility redundancy until a separate task narrows it.
- [reviewed-governed] machine-governed-runtime-residual: helpers/disputePacketFindingsSchema.tsx (governed) - Keep the runtime ensure path as compatibility redundancy until a separate task narrows it.
- [reviewed-additive] converted-runtime-ensure-residual: helpers/ingestProcessingQueueSchema.ts (converted) - Keep the runtime ensure path as redundant compatibility until a separate task narrows it.
- [reviewed-governed] machine-governed-runtime-residual: helpers/outcomeTrackingSchema.ts (governed) - Keep the runtime ensure path as compatibility redundancy until a separate task narrows it.
- [reviewed-governed] machine-governed-runtime-residual: helpers/parserRulePromotionSchema.tsx (governed) - Keep the runtime ensure path as compatibility redundancy until a separate task narrows it.
- [reviewed-governed] machine-governed-runtime-residual: helpers/parserTestAdjudicationSchema.tsx (governed) - Keep the runtime ensure path as compatibility redundancy until a separate task narrows it.
- [reviewed-governed] machine-governed-runtime-residual: helpers/parserTestTrainingArchive.tsx (governed) - Keep the runtime ensure path as compatibility redundancy until a separate task narrows it.
- [reviewed-governed] machine-governed-runtime-residual: helpers/regulationReconciliationCandidateService.ts (governed) - Keep the runtime ensure path as compatibility redundancy until a separate task narrows it.
- [reviewed-governed] machine-governed-runtime-residual: helpers/regulationRegistrySchema.ts (governed) - Keep the runtime ensure path as compatibility redundancy until a separate task narrows it.
- [reviewed-governed] machine-governed-runtime-residual: helpers/regulationRuntimeBridgeMappingService.ts (governed) - Keep the runtime ensure path as compatibility redundancy until a separate task narrows it.
- [reviewed-governed] machine-governed-runtime-residual: helpers/responseDocumentSchema.ts (governed) - Keep the runtime ensure path as compatibility redundancy until a separate task narrows it.
- [reviewed-governed] machine-governed-runtime-residual: helpers/violationCorrectionSchema.tsx (governed) - Keep the runtime ensure path as compatibility redundancy until a separate task narrows it.

## Future Cutover Procedure

- Select one machine-governed runtime ensure source when ready for narrowing and create a reviewed additive migration entry.
- Name affected tables, indexes, runtime ensure function, rollback notes, and verification commands.
- Keep the runtime ensure function active until redundant-additive behavior is proven.
- Only remove or narrow an ensure path in a separate task with focused tests for that runtime path.
- Temporary allowlist entries are not a certifying production promotion path.
