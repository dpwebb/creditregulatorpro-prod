# Deterministic OCR Readiness

Updated May 11, 2026.

## Decision

Use deterministic local/server-side OCR as an optional text source only after selectable PDF text fails quality validation. The initial provider is `pdftoppm` page rendering plus `tesseract` text extraction. It produces OCR text, page-level snippets, word-confidence diagnostics, engine/renderer versions, and replay metadata.

AI OCR, Gemini, OpenAI, DocStrange, or LLM-derived field mapping cannot become canonical.

## Runtime Gate

Deterministic OCR is unavailable unless all conditions are true:

1. `CRP_DETERMINISTIC_OCR_ENABLED=true`
2. `tesseract` is available on PATH
3. `pdftoppm` is available on PATH
4. OCR output passes deterministic credit-report text-quality validation

If any condition fails, scanned/image-only PDFs fail with `SCANNED_PDF_UNSUPPORTED` and audit-safe OCR diagnostics.

## Evaluation

Selected:

1. `pdftoppm` from Poppler for deterministic page rendering.
2. `tesseract` CLI for deterministic OCR text and TSV confidence diagnostics.

Rejected for canonical authority:

1. AI OCR or LLM field extraction because output is probabilistic and cannot be replayed as canonical truth.
2. OCR text without deterministic quality validation.
3. OCR output without page provenance and replay metadata.

Local status during implementation: `tesseract --version` was not available on PATH, so local scanned-PDF support remains fail-closed until the runtime is installed.

## Regression Coverage

Covered by `tests/unit/deterministic-ocr-readiness.spec.ts`:

1. image-only PDFs fail explicitly when deterministic OCR is unavailable
2. OCR-derived canonical fields include `sourceMethod: "ocr_text"`, page, snippet, OCR provenance, replay hash, and replay validation
3. AI fallback requests remain diagnostic-only and cannot become canonical
