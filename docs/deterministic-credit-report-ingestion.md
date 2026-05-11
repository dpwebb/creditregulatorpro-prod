# Deterministic Credit Report Ingestion

## Current Ingestion Flow Map

Authenticated upload:

1. `endpoints/ingest/report_POST.ts`
2. `helpers/ingestReportHandler.tsx` phase 1 stores the PDF as `reportArtifact.storageUrl`
3. `endpoints/ingest/process_POST.ts`
4. `helpers/ingestCorePipeline.tsx`
5. `helpers/canonicalCreditReportExtractor.tsx`
6. `helpers/reportParser.tsx`
7. bureau/template extractors, consumer extractors, tradeline extractors
8. `helpers/parserExtractionRules.tsx`
9. `helpers/parserPipelineFieldReconciliation.tsx`
10. `helpers/deterministicCreditReportPipeline.ts`
11. `helpers/ingestTradelinePersistence.tsx`
12. `helpers/comprehensiveReportStorage.tsx`
13. deterministic compliance scanners through `helpers/complianceScanner.tsx`
14. final SSE output from `helpers/ingestResponseBuilder.tsx`

Parser-test path:

1. `endpoints/parser-test-case/create_POST.ts`
2. `helpers/parserTestProductionParser.tsx`
3. `helpers/canonicalCreditReportExtractor.tsx`
4. parser-test persistence in `parserTestCase.parserContext`
5. `endpoints/parser-test-case/run_POST.ts` and `run-all_POST.ts`
6. parser-test persistence in `parserTestRun.fieldResults`

Other parser entry points:

1. anonymous preview uses `endpoints/ingest/anonymous-report_POST.ts`
2. parser lab uses `helpers/parserLabStage.tsx`
3. OCR review and source-text backfill call `extractCanonicalCreditReport`
4. parser mapping tests still exercise DocStrange HTML mapping for admin diagnostics, not canonical ingestion

Violation search path:

1. violations persist in `creditorObligationTest`
2. search/list APIs continue to read existing fields from `creditorObligationTest`, `tradeline`, `creditor`, and `bureau`
3. upload results continue to return `topFindings`, stats, and challenge access points from the existing model
4. creditor-validation list continues to filter by creditor, obligation state, tradeline, limit, and offset

## Identified Drop Points

1. Canonical candidate selection could previously select AI/DocStrange output if it appeared higher quality.
2. Parser rules applied after extraction could change fields without a shared canonical field object.
3. DocStrange/LLM mapping could flow into `mapDocStrangeResponseToResult` and become authoritative in some paths.
4. Parser-test persistence stored `actualConsumerInfo` and `actualTradelines` without the same normalized final package used by ingest.
5. Ingest storage persisted tradelines and report artifacts without a replayable canonical field package.
6. `parseReport` defaulted to OCR fallback and AI augmentation for direct callers unless they explicitly disabled it.
7. Field reconciliation audited drops, but did not expose a full candidate pool, alternatives, semantic zones, or stable replay hash.

## Deterministic Architecture

The canonical extraction path is now PDF text first and deterministic only. The authoritative output package is produced by `helpers/deterministicCreditReportPipeline.ts` and includes:

1. target pipeline stage list from upload through final output
2. structural segmentation based on normalized text and section/header patterns
3. semantic zones for report header, consumer identity, tradeline accounts, inquiries, public records, and employment
4. raw tokenization with token class, page, line, section, and zone
5. candidate pools per canonical field
6. documented deterministic scoring
7. selected canonical fields with `confidence: 1.0`, `deterministic: true`, evidence, alternatives, and history
8. null overwrite policy: reject null over valid canonical values
9. LLM policy: diagnostic candidates cannot become canonical
10. stable `canonicalResultSha256` and `replayHash`
11. replay validation through `helpers/deterministicReplayValidator.ts`, which rebuilds the package from the same typed inputs and fails closed if hashes, candidate pools, or final output diverge

Parser-test, parser lab, and ingest storage now use the same deterministic package:

1. parser-test create stores `canonicalOutput`, `replayHash`, and `replayValidation` in `parserContext`
2. parser-test run/run-all store `canonicalOutput`, `replayHash`, and `replayValidation` in `parserTestRun.fieldResults`
3. ingest stores `deterministicPipeline`, `canonicalOutput`, `replayHash`, and `replayValidation` in `reportArtifact.data`
4. final ingest SSE output includes additive `canonicalOutput`, `replayHash`, and `replayValidation`

## Current Fixture Coverage

The regression suite now includes deterministic synthetic fixtures for:

1. TransUnion Canada consumer disclosure text with a page-one TransUnion case ID
2. TransUnion collapsed personal-information cells
3. TransUnion collapsed two-tradeline exported text order
4. TransUnion legacy numbered-section disclosure
5. TransUnion regional numbered disclosure
6. TransUnion exported portal-style layout
7. Equifax Canada `Accounts - Revolving` account sections
8. Equifax installment account sections
9. Equifax account-only sections that must not become consumer identity
10. Equifax mortgage account sections
11. Equifax collection-account sections, including collapsed agency-line label/value records

`pnpm run test:deterministic-ingestion-report` verifies exact tradeline counts for every fixture, DOB/address expectations where present, bureau metadata, TransUnion case IDs where present, date and money fields, 100% required source-evidence coverage, stable replay hashes, and violation-search compatibility. Parser-test and canonical-ingest path coverage also exercises the new Phase 1 fixture families through the shared deterministic PDF parser path with AI fallback disabled.

The production PDFs supplied for local verification remain read-only reference inputs. Do not commit personal report PDFs or personal extracted text as fixtures. Convert observed layouts into anonymized deterministic fixtures before they enter the regression library.

## Deterministic Scoring V1

Candidate scoring is explicit:

1. label proximity: `+5`
2. expected semantic zone: `+10`
3. valid field format: `+3`
4. structured parser source: `+6`
5. repeated consistency across candidates: `+8`
6. conflicting section context: `-10`

Tie-break order is:

1. canonical-eligible candidates before diagnostics
2. higher score
3. source method lexical order
4. normalized value lexical order
5. original candidate order

## Root-Cause Analysis

The anomalies came from multiple representations of the same extracted report:

1. raw parser output
2. DocStrange/LLM mapped output
3. parser-rule-mutated output
4. parser-test persisted output
5. database persisted tradeline/report output

Those representations did not share one canonical field contract. Non-null data could survive raw extraction and then disappear after mapping or persistence because the pipeline lacked a field-level candidate pool, selected candidate history, and a single replayable final package. AI fallback also created a risk that a non-repeatable extraction could become authoritative.

## Violation Search Preservation

This refactor does not rename or migrate violation IDs, violation categories, regulation references, evidence-link fields, status fields, or search query parameters. It keeps the existing `creditorObligationTest` search model intact and stores the new deterministic canonical report package alongside existing artifact data.

Regression coverage in `tests/unit/violation-search-preservation.spec.ts` asserts the upload-results and creditor-validation lookup fields, joins, filters, sorting, bureau counts, collection flags, creditor fields, tradeline fields, and response assumptions remain present.

## Hard-Isolated Legacy Components

These components are retained only as compatibility shims or admin diagnostics; they cannot update canonical ingestion output:

1. DocStrange/LLM HTML mapping in parser mapping diagnostics
2. DocStrange submission/polling helpers, which now fail closed
3. OpenAI/Gemini PDF fallback helpers, which now return `null`
4. Gemini OCR and payment-grid parser helpers, which now return empty diagnostic output
5. Gemini tradeline gap-fill, which now returns zero updates
6. AI scanning-rule generation, which is disabled so rules must be explicit deterministic definitions
7. legacy stored `docstrangeRawHtml` artifacts, which are counted and skipped by compliance backfill

Direct `parseReport` and `extractTextFromPdf` defaults are now deterministic: OCR fallback and AI augmentation default to `false`.

## Remaining Parser Risks

1. Scanned image-only PDFs require a deterministic OCR engine before they can be fully supported without AI.
2. Older bureau layouts and regional variations need more explicit rule packs and fixtures.
3. Current semantic zones use text structure and section patterns; PDF bounding boxes are not yet populated.
4. Known template rules should be added for bureau-specific legacy formats instead of broadening generic patterns.
5. Violation evidence can reference stored source text and technical details today, but page/bounding-box evidence needs deterministic PDF text coordinates.
6. Admin corrections still need broader automatic conversion into aliases, section mappings, validation rules, and regression fixtures.
