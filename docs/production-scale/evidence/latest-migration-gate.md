# Migration Governance Release Gate

Safety: non-mutating static source and policy validation only; no database connection, credentials, runtime DDL, or schema mutation.
Generated at: 2026-05-20T21:43:27.356Z
Branch: staging
Commit: 6c0f772662c7be75e7a51a51b100fb7f07d10680
Policy: docs/production-scale/migration-governance-policy.json
Policy mode: waived
Status: accepted-formal-waiver
Release gate accepted: yes

## Gate Summary

- Unknown mutation sources: 0
- Unledgered mutation sources: 0
- Missing expected sources: 0
- Missing expected inventory entries: 0
- Runtime ensure residuals: 13
- Runtime ensure residual impact: formally-waived

## Formal Waiver

- Accepted: yes
- Approved by role: Release governance owner
- Accepted at: 2026-05-20T00:00:00.000Z
- Expires on: 2026-08-20
- Reason: Approved runtime ensure residuals remain active while the additive migration ledger cutover is performed one workstream at a time; the gate blocks unknown, unledgered, missing, and unapproved mutation sources during the waiver window.

## Approved Runtime Ensure Residuals

- [formally-waived] helpers/aiAssistRunStore.ts: AI assist run audit table ensure.
- [formally-waived] helpers/consumerIdentification.ts: Consumer identification document table ensure.
- [formally-waived] helpers/disputePacketFindingsSchema.tsx: Dispute packet findings table/index ensure.
- [formally-waived] helpers/ingestProcessingQueueSchema.ts: Ingest processing job and event table/index ensure.
- [formally-waived] helpers/outcomeTrackingSchema.ts: Outcome comparison and finding outcome table/index ensure.
- [formally-waived] helpers/parserRulePromotionSchema.tsx: Parser rule promotion table/index ensure.
- [formally-waived] helpers/parserTestAdjudicationSchema.tsx: Parser test adjudication table/index ensure.
- [formally-waived] helpers/parserTestTrainingArchive.tsx: Parser training archive table/index ensure.
- [formally-waived] helpers/regulationReconciliationCandidateService.ts: Regulation reconciliation candidate table/index ensure.
- [formally-waived] helpers/regulationRegistrySchema.ts: Regulation registry and mapping table/index ensure.
- [formally-waived] helpers/regulationRuntimeBridgeMappingService.ts: Regulation runtime bridge mapping table/index ensure.
- [formally-waived] helpers/responseDocumentSchema.ts: Response document, queue, orchestration, and lifecycle table/index ensure.
- [formally-waived] helpers/violationCorrectionSchema.tsx: Violation correction and regulation reference table/index ensure.

## Gate Findings

- [formally-waived] approved-runtime-ensure-residual: helpers/aiAssistRunStore.ts (present) - Keep this residual visible until the reviewed additive migration ledger cutover is complete.
- [formally-waived] approved-runtime-ensure-residual: helpers/consumerIdentification.ts (present) - Keep this residual visible until the reviewed additive migration ledger cutover is complete.
- [formally-waived] approved-runtime-ensure-residual: helpers/disputePacketFindingsSchema.tsx (present) - Keep this residual visible until the reviewed additive migration ledger cutover is complete.
- [formally-waived] approved-runtime-ensure-residual: helpers/ingestProcessingQueueSchema.ts (present) - Keep this residual visible until the reviewed additive migration ledger cutover is complete.
- [formally-waived] approved-runtime-ensure-residual: helpers/outcomeTrackingSchema.ts (present) - Keep this residual visible until the reviewed additive migration ledger cutover is complete.
- [formally-waived] approved-runtime-ensure-residual: helpers/parserRulePromotionSchema.tsx (present) - Keep this residual visible until the reviewed additive migration ledger cutover is complete.
- [formally-waived] approved-runtime-ensure-residual: helpers/parserTestAdjudicationSchema.tsx (present) - Keep this residual visible until the reviewed additive migration ledger cutover is complete.
- [formally-waived] approved-runtime-ensure-residual: helpers/parserTestTrainingArchive.tsx (present) - Keep this residual visible until the reviewed additive migration ledger cutover is complete.
- [formally-waived] approved-runtime-ensure-residual: helpers/regulationReconciliationCandidateService.ts (present) - Keep this residual visible until the reviewed additive migration ledger cutover is complete.
- [formally-waived] approved-runtime-ensure-residual: helpers/regulationRegistrySchema.ts (present) - Keep this residual visible until the reviewed additive migration ledger cutover is complete.
- [formally-waived] approved-runtime-ensure-residual: helpers/regulationRuntimeBridgeMappingService.ts (present) - Keep this residual visible until the reviewed additive migration ledger cutover is complete.
- [formally-waived] approved-runtime-ensure-residual: helpers/responseDocumentSchema.ts (present) - Keep this residual visible until the reviewed additive migration ledger cutover is complete.
- [formally-waived] approved-runtime-ensure-residual: helpers/violationCorrectionSchema.tsx (present) - Keep this residual visible until the reviewed additive migration ledger cutover is complete.

## Future Cutover Procedure

- Select one runtime ensure source and create a reviewed additive ledger migration entry.
- Name affected tables, indexes, runtime ensure function, rollback notes, and verification commands.
- Keep the runtime ensure function active until redundant-additive behavior is proven.
- Only remove or narrow an ensure path in a separate task with focused tests for that runtime path.
- After all residuals are migrated or intentionally retained, switch currentMode to release-blocking in a reviewed policy update.
