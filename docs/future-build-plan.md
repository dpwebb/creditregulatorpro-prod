# Future Build Plan

## Core Promise

Upload a credit report, extract facts reliably, identify defensible violations, help the user take action, and track outcomes.

All future work should protect this promise before adding breadth or convenience.

## Build Principles

1. Credit ingestion remains deterministic, replayable, and auditable.
2. AI and DocStrange remain diagnostic-only unless a future explicit deterministic validation path accepts their suggestions.
3. Parser fixes become durable rules, aliases, templates, validation rules, or regression fixtures.
4. Null or missing values must not overwrite valid extracted values without explicit justification.
5. Violation search compatibility must be preserved across ingestion and violation-model changes.
6. Personal PDFs and personal extracted text must not be committed as fixtures; convert observed layouts into anonymized synthetic fixtures.
7. Every phase must include targeted regression tests and a pass/fail report before moving to the next phase.

## Current Implementation Status

Updated May 11, 2026.

Implemented:

1. Phase 1: Completed deterministic extraction coverage expansion with 11 anonymized synthetic fixtures covering TransUnion consumer disclosure, collapsed TransUnion text, TransUnion legacy numbered sections, TransUnion exported portal text order, TransUnion regional numbered disclosure, Equifax revolving plus collection, Equifax installment, Equifax account-only, Equifax mortgage, and collapsed Equifax collection sections.
2. Phase 1: Tightened `pnpm run test:deterministic-ingestion-report` so each fixture must preserve exact tradeline counts, bureau metadata, report dates, TransUnion case IDs where present, DOB/address expectations where present, date and money fields, 100% required evidence coverage, replay-hash stability, and violation-search compatibility.
3. Phase 1: Added parser-test/canonical-ingest path coverage for the new layout families while keeping bureau-specific collection parsing isolated from generic TransUnion parsing.
4. Phase 3: Added stable canonical evidence IDs to field evidence for downstream violation and packet traceability.
5. Phase 8: Added `pnpm run test:deterministic-ingestion-report` and included it in `pnpm run check` so replay stability, required evidence coverage, fixture support, and violation-search preservation are visible before publish.

Remaining high-priority work:

1. Deterministic OCR evaluation and scanned-PDF fixtures.
2. Page-aware and bounding-box evidence.
3. Dedicated deterministic rule packs for creditor statements and collection letters.
4. Deeper admin-correction promotion into future parser, validation, violation, exception, and regression rules.

## Phase 1: Deterministic Extraction Coverage

Goal: improve supported report layouts without loosening parser behavior.

Status: Complete as of May 11, 2026. The active regression gate covers 11 anonymized layouts and fails if replay hashes change, exact tradeline counts drift, required source evidence drops below 100%, or violation-search compatibility is lost.

Work:

1. Add anonymized fixtures for more TransUnion disclosure variations.
2. Add anonymized fixtures for more Equifax account-section and collection-section variations.
3. Add exported portal PDF text-order fixtures.
4. Add older bureau layout fixtures where observed.
5. Keep bureau-specific template/rule logic isolated from generic parsing.

Exit criteria:

1. DOB, address, TransUnion case ID, bureau metadata, tradelines, dates, and money fields survive parser-test and ingest paths.
2. Replay hashes stay stable for identical inputs.
3. False-positive tradeline creation does not increase.

## Phase 2: Deterministic OCR Readiness

Goal: support scanned or image-heavy PDFs without AI-derived authoritative extraction.

Work:

1. Evaluate deterministic OCR tooling that can run locally or server-side without probabilistic field mapping.
2. Store OCR text with provenance, page references, and confidence diagnostics.
3. Require deterministic validation before OCR text can feed canonical fields.
4. Add scanned-PDF failure fixtures and OCR-derived success fixtures.

Exit criteria:

1. Image-only PDFs fail explicitly when deterministic OCR is unavailable.
2. OCR-derived canonical fields include source method, page, snippet, and replay metadata.
3. AI OCR cannot become canonical.

## Phase 3: Evidence Model Hardening

Goal: make every user-visible violation defensible and traceable.

Work:

1. Expand field evidence coverage for required identity, report, and tradeline fields.
2. Add page-aware evidence where PDF text extraction provides page boundaries.
3. Add stable evidence IDs that survive parser-test, ingest, violation detection, and dispute packet generation.
4. Add regression checks for evidence link presence on violations.

Exit criteria:

1. Each final violation has a rule ID, factual trigger, regulation reference, source fields, and evidence link.
2. Existing violation search fields and filters remain backward-compatible.

## Phase 4: Violation Rule Defensibility

Goal: improve violation quality without inventing legal conclusions.

Work:

1. Review deterministic violation rules against current regulation mappings.
2. Separate factual triggers from legal/regulatory references.
3. Add rule-level tests for creditor, bureau, collector, tradeline, evidence, and review-status search paths.
4. Strengthen neutral wording for user-facing violation explanations.

Exit criteria:

1. No violation fires without a deterministic factual trigger and mapped authority.
2. Search by violation type, regulation reference, consumer/report ID, tradeline, creditor, collection agency, evidence link, review status, and date remains intact.

## Phase 5: Admin Truth Loop

Goal: turn admin corrections into future deterministic behavior.

Work:

1. Convert accepted parser corrections into candidate aliases, mappings, templates, or parser extraction rules.
2. Convert violation corrections into rule updates, exception rules, regulation mappings, or regression fixtures.
3. Require validation before any promoted rule activates.
4. Track promoted, blocked, and pending rule candidates.

Exit criteria:

1. Admin corrections are replayable and auditable.
2. A correction can explain what future deterministic behavior changed.
3. Rule activation cannot silently break parser or violation regression tests.

## Phase 6: User Action Reliability

Goal: connect extracted facts and violations to useful user actions.

Work:

1. Ensure dispute packets pull canonical fields and evidence links, not legacy parser artifacts.
2. Include bureau-specific reference details such as TransUnion case ID where available.
3. Confirm dollar fields render consistently in UI, letters, saved outputs, and evidence.
4. Add tests for packet generation from deterministic violation evidence.

Exit criteria:

1. A generated action is traceable back to canonical fields and violation evidence.
2. Existing packet and outcome flows continue to work.

## Phase 7: Outcome Tracking

Goal: close the loop after disputes or bureau/creditor responses.

Work:

1. Compare later uploads against earlier canonical snapshots.
2. Detect changed, deleted, reinserted, or unchanged tradelines.
3. Link changes to dispute activity and deadlines.
4. Preserve silent-correction and stale-reporting guard behavior.

Exit criteria:

1. Users can see what changed after they acted.
2. Outcome summaries use deterministic snapshot comparisons.

## Phase 8: Operational Regression Dashboard

Goal: make stability visible before deployment.

Work:

1. Summarize parser fixture coverage, replay status, evidence coverage, and violation-search preservation.
2. Add a local/staging regression report that can be run before promotion.
3. Track unsupported layouts and known risks.

Exit criteria:

1. A release can show parser pass/fail, replay pass/fail, evidence coverage, and violation-search compatibility in one place.
2. Unsupported layouts are explicit rather than hidden.

## Current Known Risks

1. Scanned image-only PDFs still need deterministic OCR before canonical ingestion.
2. PDF bounding boxes are not yet populated in canonical evidence.
3. Creditor statements and collection letters need dedicated deterministic rule packs before broad support.
4. Admin corrections need deeper automated conversion into future deterministic rules.
5. Additional unseen older/regional bureau layouts should still be converted into anonymized fixtures when observed.

## Next Recommended Work Item

Start with Phase 1 fixture expansion using anonymized text derived from observed TransUnion and Equifax variations. This gives the safest signal before changing deeper parser logic.
