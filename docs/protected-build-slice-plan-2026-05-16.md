# Protected Build Slice Plan - May 16, 2026

This plan covers the next protected-system work after the authenticated workflow smoke and static prompt relocation.

## Model Path And Risk

Selected model path: GPT-5.5 Extra High for design and risk boundary decisions, then GPT-5.3 Codex for approved bounded implementation slices.

Overall risk: high. The requested work touches evidence binding, deterministic parsing, admin correction promotion, violation defensibility, and regulation governance. No protected runtime truth should change without a bounded slice, regression fixture, test update, and review trail.

## Slice 1: Phase 3 Evidence Hardening

Goal: broaden page-aware field coverage and add anonymized complex coordinate fixtures without changing canonical values, evidence IDs, violation firing, packet readiness, or packet wording.

Upstream callers:
- `helpers/ingestCorePipeline.tsx`
- `helpers/deterministicCreditReportPipeline.ts`
- `helpers/pdfjsEvidenceCoordinates.ts`
- `helpers/ocrEvidenceCoordinates.ts`

Downstream consumers:
- `helpers/violationRuleEvidence.ts`
- `helpers/disputePacketService.ts`
- `dispute_packet_findings.evidence_location_snapshot`
- packet PDF/download flows

Impact boundary:
- Add synthetic fixture coverage for multi-column, repeated value, rotated/scaled, ambiguous page, and sensitive-overexposure layouts.
- Only add optional sidecar metadata when deterministic, unambiguous, confidence-safe, and non-sensitive.
- Do not change parser truth, canonical field values, replay hash behavior, or packet readiness.

Regression tests:
- `pnpm run test:golden-path`
- `pnpm run test:deterministic-ingestion-report`
- `pnpm exec vitest run --config vitest.config.ts tests/unit/evidence-location-index.spec.ts tests/unit/pdfjs-evidence-coordinates.spec.ts tests/unit/ocr-evidence-coordinates.spec.ts tests/unit/violation-evidence-location.spec.ts tests/unit/dispute-packet-evidence-location.spec.ts`

## Slice 2: Dedicated Document Type Rule Packs

Goal: add deterministic rule-pack scaffolding for creditor statements and collection letters while keeping credit-report parsing isolated.

Upstream callers:
- document-type detection helpers
- canonical extraction entry points
- parser test-case workflows

Downstream consumers:
- deterministic pipeline package
- parser test case review
- future evidence-bound document facts

Impact boundary:
- Design separate rule-pack modules and fixtures for creditor statements and collection letters.
- Unsupported documents must fail clearly or remain diagnostic-only.
- Do not let statement or letter facts overwrite credit-report canonical facts.
- Do not route these documents into bureau credit-report parsers.

Regression tests:
- `pnpm run test:golden-path`
- `pnpm run test:deterministic-ingestion-report`
- targeted document-type tests to prove bureau report output is unchanged

## Slice 3: Admin Correction Candidate Classification

Goal: classify admin corrections into future deterministic candidate types without activating new truth.

Candidate types:
- `parser_rule`
- `alias_synonym`
- `validation_rule`
- `violation_rule`
- `regulation_reference_mapping`
- `exception_rule`
- `packet_template`
- `evidence_correction`
- `rejected`
- `manual_note`

Upstream callers:
- parser test adjudication and rule-promotion endpoints
- violation correction finalize flows
- admin correction UI surfaces

Downstream consumers:
- parser rule candidates
- violation training examples
- audit logs
- future deterministic rule review queues

Impact boundary:
- Add inert classification metadata and tests first.
- No automatic activation.
- Manual-only/training-note corrections must not replay into future deterministic violation truth.
- Finalization must remain validation-gated.

Regression tests:
- `pnpm run test:violation-corrections`
- `pnpm run test:unit -- tests/unit/parser-rule-promotion-decision.spec.ts`
- `pnpm run test:golden-path`

## Slice 4: Phase 4/5/9 Governance Hardening

Goal: continue rule defensibility, admin truth-loop hardening, and regulation/reference governance before outcome tracking.

Upstream callers:
- deterministic violation rule envelope builders
- regulation reconciliation and advisory bridge helpers
- admin review endpoints

Downstream consumers:
- consumer finding explanations
- packet eligibility metadata
- regulation candidate review UI
- advisory/shadow bridge diagnostics

Impact boundary:
- Keep static runtime mappings as active consumer-facing truth.
- Keep DB registry non-runtime.
- Do not add runtime selector, limited-runtime activation, or admin override.
- Keep consumer-facing language neutral: "may require review under [reference]."

Regression tests:
- `pnpm run test:golden-path`
- `pnpm run test:unit -- tests/unit/violation-rule-evidence.spec.ts tests/unit/regulation-reconciliation-candidates.spec.ts tests/unit/regulation-runtime-bridge-mappings.spec.ts tests/unit/regulation-runtime-bridge-advisory.spec.ts`
- existing gated staging smokes for reconciliation candidates, runtime bridge mappings, and advisory bridge reports when explicitly configured

## Stop Conditions

Stop and do not modify protected runtime code if a slice requires:
- schema changes without a review path,
- active regulation/reference truth changes,
- packet readiness or wording changes,
- parser canonical output shape changes,
- evidence ID or replay hash behavior changes,
- admin override paths,
- direct furnisher packet flows,
- probabilistic AI in deterministic paths.
