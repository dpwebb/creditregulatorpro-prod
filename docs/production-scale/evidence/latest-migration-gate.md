# Migration Governance Release Gate

Safety: non-mutating static source and policy validation only; no database connection, credentials, runtime DDL, or schema mutation.
Generated at: 2026-05-22T00:46:12.554Z
Branch: staging
Commit: 4da09d1b87f4641f938bae3f02618f1aa142072d
Policy: docs/production-scale/migration-governance-policy.json
Policy mode: release-blocking
Status: accepted-temporary-allowlist
CERTIFYING:false
Release gate accepted: yes
Production promotion gate accepted: yes

## Gate Summary

- Unknown mutation sources: 0
- Unledgered mutation sources: 0
- Missing expected sources: 0
- Missing expected inventory entries: 0
- Runtime ensure residuals: 13
- Converted reviewed runtime ensure residuals: 1
- Temporary allowlist runtime ensure residuals: 12
- Runtime ensure residual impact: temporary-allowlist

## Formal Waiver

- Accepted: no
- Approved by role: n/a
- Accepted at: n/a
- Expires on: n/a
- Reason: n/a

## Approved Runtime Ensure Residuals

- [temporary-allowlist] helpers/aiAssistRunStore.ts: AI assist run audit table ensure.
- [temporary-allowlist] helpers/consumerIdentification.ts: Consumer identification document table ensure.
- [temporary-allowlist] helpers/disputePacketFindingsSchema.tsx: Dispute packet findings table/index ensure.
- [reviewed-additive] helpers/ingestProcessingQueueSchema.ts: Ingest processing job and event table/index ensure.
- [temporary-allowlist] helpers/outcomeTrackingSchema.ts: Outcome comparison and finding outcome table/index ensure.
- [temporary-allowlist] helpers/parserRulePromotionSchema.tsx: Parser rule promotion table/index ensure.
- [temporary-allowlist] helpers/parserTestAdjudicationSchema.tsx: Parser test adjudication table/index ensure.
- [temporary-allowlist] helpers/parserTestTrainingArchive.tsx: Parser training archive table/index ensure.
- [temporary-allowlist] helpers/regulationReconciliationCandidateService.ts: Regulation reconciliation candidate table/index ensure.
- [temporary-allowlist] helpers/regulationRegistrySchema.ts: Regulation registry and mapping table/index ensure.
- [temporary-allowlist] helpers/regulationRuntimeBridgeMappingService.ts: Regulation runtime bridge mapping table/index ensure.
- [temporary-allowlist] helpers/responseDocumentSchema.ts: Response document, queue, orchestration, and lifecycle table/index ensure.
- [temporary-allowlist] helpers/violationCorrectionSchema.tsx: Violation correction and regulation reference table/index ensure.

## Converted Reviewed Runtime Ensure Residuals

- [reviewed-additive] helpers/ingestProcessingQueueSchema.ts: migrations/0001-ingest-processing-queue-reviewed-additive.sql

## Temporary Runtime Ensure Allowlist

- [CERTIFYING:false] helpers/aiAssistRunStore.ts: expires 2026-06-30; owner Release governance owner; reason Runtime ensure remains temporarily authorized while lower-risk audit tables are converted after production promotion gate activation.
- [CERTIFYING:false] helpers/consumerIdentification.ts: expires 2026-06-30; owner Release governance owner; reason Runtime ensure remains temporarily authorized while consumer identification document schema is converted through a focused additive migration task.
- [CERTIFYING:false] helpers/disputePacketFindingsSchema.tsx: expires 2026-06-30; owner Release governance owner; reason Runtime ensure remains temporarily authorized to preserve packet lookup behavior until packet finding schema is converted separately.
- [CERTIFYING:false] helpers/outcomeTrackingSchema.ts: expires 2026-06-30; owner Release governance owner; reason Runtime ensure remains temporarily authorized while outcome tracking schema is converted without changing response outcome behavior.
- [CERTIFYING:false] helpers/parserRulePromotionSchema.tsx: expires 2026-06-30; owner Release governance owner; reason Runtime ensure remains temporarily authorized while parser governance schema is converted without mutating parser truth.
- [CERTIFYING:false] helpers/parserTestAdjudicationSchema.tsx: expires 2026-06-30; owner Release governance owner; reason Runtime ensure remains temporarily authorized while parser adjudication schema is converted without changing deterministic extraction.
- [CERTIFYING:false] helpers/parserTestTrainingArchive.tsx: expires 2026-06-30; owner Release governance owner; reason Runtime ensure remains temporarily authorized while parser training archive schema is converted through an additive migration.
- [CERTIFYING:false] helpers/regulationReconciliationCandidateService.ts: expires 2026-06-30; owner Release governance owner; reason Runtime ensure remains temporarily authorized while regulation reconciliation schema is converted without changing regulation mappings.
- [CERTIFYING:false] helpers/regulationRegistrySchema.ts: expires 2026-06-30; owner Release governance owner; reason Runtime ensure remains temporarily authorized while regulation registry schema is converted without changing statutory/reference truth.
- [CERTIFYING:false] helpers/regulationRuntimeBridgeMappingService.ts: expires 2026-06-30; owner Release governance owner; reason Runtime ensure remains temporarily authorized while runtime bridge mapping schema is converted without changing bridge behavior.
- [CERTIFYING:false] helpers/responseDocumentSchema.ts: expires 2026-06-30; owner Release governance owner; reason Runtime ensure remains temporarily authorized because response document schema is broad and must be converted in its own focused additive task.
- [CERTIFYING:false] helpers/violationCorrectionSchema.tsx: expires 2026-06-30; owner Release governance owner; reason Runtime ensure remains temporarily authorized while admin correction schema is converted without changing violation truth or evidence binding.

## Gate Findings

- [temporary-allowlist] temporary-runtime-ensure-allowlist: helpers/aiAssistRunStore.ts (present) - Do not certify production migration governance while this allowlist remains active; convert this source to a reviewed additive migration before expiry.
- [temporary-allowlist] temporary-runtime-ensure-allowlist: helpers/consumerIdentification.ts (present) - Do not certify production migration governance while this allowlist remains active; convert this source to a reviewed additive migration before expiry.
- [temporary-allowlist] temporary-runtime-ensure-allowlist: helpers/disputePacketFindingsSchema.tsx (present) - Do not certify production migration governance while this allowlist remains active; convert this source to a reviewed additive migration before expiry.
- [reviewed-additive] converted-runtime-ensure-residual: helpers/ingestProcessingQueueSchema.ts (converted) - Keep the runtime ensure path as redundant compatibility until a separate task narrows it.
- [temporary-allowlist] temporary-runtime-ensure-allowlist: helpers/outcomeTrackingSchema.ts (present) - Do not certify production migration governance while this allowlist remains active; convert this source to a reviewed additive migration before expiry.
- [temporary-allowlist] temporary-runtime-ensure-allowlist: helpers/parserRulePromotionSchema.tsx (present) - Do not certify production migration governance while this allowlist remains active; convert this source to a reviewed additive migration before expiry.
- [temporary-allowlist] temporary-runtime-ensure-allowlist: helpers/parserTestAdjudicationSchema.tsx (present) - Do not certify production migration governance while this allowlist remains active; convert this source to a reviewed additive migration before expiry.
- [temporary-allowlist] temporary-runtime-ensure-allowlist: helpers/parserTestTrainingArchive.tsx (present) - Do not certify production migration governance while this allowlist remains active; convert this source to a reviewed additive migration before expiry.
- [temporary-allowlist] temporary-runtime-ensure-allowlist: helpers/regulationReconciliationCandidateService.ts (present) - Do not certify production migration governance while this allowlist remains active; convert this source to a reviewed additive migration before expiry.
- [temporary-allowlist] temporary-runtime-ensure-allowlist: helpers/regulationRegistrySchema.ts (present) - Do not certify production migration governance while this allowlist remains active; convert this source to a reviewed additive migration before expiry.
- [temporary-allowlist] temporary-runtime-ensure-allowlist: helpers/regulationRuntimeBridgeMappingService.ts (present) - Do not certify production migration governance while this allowlist remains active; convert this source to a reviewed additive migration before expiry.
- [temporary-allowlist] temporary-runtime-ensure-allowlist: helpers/responseDocumentSchema.ts (present) - Do not certify production migration governance while this allowlist remains active; convert this source to a reviewed additive migration before expiry.
- [temporary-allowlist] temporary-runtime-ensure-allowlist: helpers/violationCorrectionSchema.tsx (present) - Do not certify production migration governance while this allowlist remains active; convert this source to a reviewed additive migration before expiry.

## Future Cutover Procedure

- Select one remaining temporary runtime ensure source and create a reviewed additive migration entry.
- Name affected tables, indexes, runtime ensure function, rollback notes, and verification commands.
- Keep the runtime ensure function active until redundant-additive behavior is proven.
- Only remove or narrow an ensure path in a separate task with focused tests for that runtime path.
- Remove each temporary allowlist entry before its expiresOn date or the production promotion gate will fail.
