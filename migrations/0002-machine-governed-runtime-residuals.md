# Machine-Governed Runtime Residual Ledger

Ledger status: reviewed and governed

Scope: non-mutating migration governance evidence only. This ledger does not run DDL, does not connect to production, and does not alter runtime schema behavior. It replaces temporary allowlist dependence for lower-risk runtime ensure compatibility paths with machine-validated governance entries.

## Governed Runtime Ensure Residuals

- `helpers/aiAssistRunStore.ts`
- `helpers/consumerIdentification.ts`
- `helpers/disputePacketFindingsSchema.tsx`
- `helpers/outcomeTrackingSchema.ts`
- `helpers/parserRulePromotionSchema.tsx`
- `helpers/parserTestAdjudicationSchema.tsx`
- `helpers/parserTestTrainingArchive.tsx`
- `helpers/regulationReconciliationCandidateService.ts`
- `helpers/regulationRegistrySchema.ts`
- `helpers/regulationRuntimeBridgeMappingService.ts`
- `helpers/responseDocumentSchema.ts`
- `helpers/violationCorrectionSchema.tsx`

## Governance Basis

- Classification: reviewed and governed.
- Production promotion authorization: allowed only through `pnpm run migrations:gate` and `pnpm run migrations:machine-proof`.
- Temporary allowlist status: removed from certification basis.
- Human approval at runtime: not required and not accepted.
- Production mutation: none.
- Production database mutation: forbidden.
- Runtime DDL change in this task: none.
- Future cutover: each runtime ensure path can still be narrowed or converted through a separate focused additive migration task with its own tests.

## Verification Commands

- `pnpm run check:migrations`
- `pnpm run migrations:gate`
- `pnpm run migrations:machine-proof`
- `pnpm run migrations:machine-proof:validate`
