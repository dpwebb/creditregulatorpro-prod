# Runtime Size And Dependency Report

Generated at: 2026-05-21T01:35:22.854Z
Script: `scripts/runtime-size-report.mjs`

## Safety

- Reporting only: yes
- Threshold policy mode: warning-only
- Overall threshold status: WARN
- Blocking runtime-size failures: no
- Dependency version changes: no
- Vite chunking/build behavior changes: no
- PDF/OCR behavior changes: no
- Docker runtime package changes: no
- FAIL is emitted only when an explicit release-blocking policy enables it.

## Threshold Policy

Policy source: `docs/production-scale/runtime-size-threshold-policy.json`
Policy mode: `warning-only`
Evidence mode: `reporting-only`
Status counts: WARN=7, WAIVED=1

| Status | Policy row | Measured | Warning | Fail | Waiver / reason |
| --- | --- | ---: | ---: | ---: | --- |
| WARN | `main-js-raw` Largest JavaScript asset raw size | 3.14 MiB | 1.50 MiB | disabled | Metric exceeds the configured failBytes value, but this policy is warning-only for this threshold. |
| WARN | `main-js-gzip` Largest JavaScript asset gzip size | 878.8 KiB | 500.0 KiB | disabled | Metric exceeds the configured warning threshold. |
| WARN | `main-css-raw` Largest CSS asset raw size | 674.1 KiB | 500.0 KiB | disabled | Metric exceeds the configured warning threshold. |
| WARN | `main-css-gzip` Largest CSS asset gzip size | 101.5 KiB | 100.0 KiB | disabled | Metric exceeds the configured warning threshold. |
| WARN | `dependency-pdfjs-dist` pdfjs-dist installed size | 34.58 MiB | 20.00 MiB | disabled | Metric exceeds the configured warning threshold. |
| WARN | `dependency-pdf-parse` pdf-parse installed size | 27.03 MiB | 20.00 MiB | disabled | Metric exceeds the configured warning threshold. |
| WARN | `dependency-pdfmake` pdfmake installed size | 12.94 MiB | 10.00 MiB | disabled | Metric exceeds the configured warning threshold. |
| WAIVED | `docker-ocr-runtime-inventory` Docker OCR/PDF runtime package inventory | not byte-measured | unavailable | disabled | Docker package byte sizes are not measurable from this source-only report; Poppler/Tesseract package names are inventoried and any future package change requires OCR/parser regression evidence. |

## Frontend Build Assets

Build output: `dist`, 19 tracked asset(s), 4.19 MiB total raw size.

| Asset | Raw | Gzip | Brotli |
| --- | ---: | ---: | ---: |
| `dist/_assets/index-DEL5BOst.js` | 3.14 MiB | 878.8 KiB | 687.7 KiB |
| `dist/_assets/index-Oy3e-m6C.css` | 674.1 KiB | 101.5 KiB | 76.8 KiB |
| `dist/_assets/react-big-calendar-Cdggxsjy.js` | 136.6 KiB | 42.9 KiB | 37.9 KiB |
| `dist/_assets/index-C9ZQ3TTx.js` | 132.6 KiB | 32.1 KiB | 25.8 KiB |
| `dist/_assets/OnboardingTour-p7ihuno-.js` | 58.3 KiB | 19.4 KiB | 17.3 KiB |
| `dist/_assets/index-sk2ek4N-.css` | 28.5 KiB | 4.4 KiB | 3.8 KiB |
| `dist/_assets/react-big-calendar-Dm-SzPQi.css` | 14.0 KiB | 2.7 KiB | 2.3 KiB |
| `dist/_assets/PacketViewer-DXpfJyVd.js` | 7.7 KiB | 2.8 KiB | 2.5 KiB |
| `dist/_assets/index-B9fWrEk-.js` | 6.0 KiB | 2.2 KiB | 2.0 KiB |
| `dist/_assets/DeadlineCalendarView-DUXfNyuO.js` | 3.8 KiB | 1.5 KiB | 1.3 KiB |
| `dist/_assets/PacketViewer-DYFOtPtS.css` | 3.5 KiB | 1.1 KiB | 941 B |
| `dist/_assets/DeadlineCalendarView-DRrVFbAL.css` | 3.1 KiB | 865 B | 719 B |
| `dist/_assets/ComplianceCalendarContent-CdY8Afz5.css` | 2.4 KiB | 747 B | 603 B |
| `dist/_assets/SourceReportPdfView-Dd36mduW.css` | 1.9 KiB | 627 B | 496 B |
| `dist/_assets/ComplianceCalendarContent-Hx7LBIb1.js` | 1.9 KiB | 891 B | 791 B |

## Largest Installed Direct Dependencies

| Package | Version | Group | Installed size |
| --- | --- | --- | ---: |
| `pdfjs-dist` | 4.2.67 | dependency | 34.58 MiB |
| `lucide-react` | ^0.477.0 | dependency | 31.28 MiB |
| `pdf-parse` | 1.1.4 | dependency | 27.03 MiB |
| `typescript` | ^6.0.3 | devDependency | 23.22 MiB |
| `date-fns` | ^4.1.0 | dependency | 21.55 MiB |
| `pdfmake` | 0.2.21 | dependency | 12.94 MiB |
| `react-dom` | ^19.2.1 | dependency | 6.98 MiB |
| `jsdom` | ^29.1.1 | devDependency | 6.71 MiB |
| `stripe` | 16.12.0 | dependency | 4.78 MiB |
| `recharts` | ^2.15.1 | dependency | 4.43 MiB |
| `zod` | ^3.25.76 | dependency | 3.43 MiB |
| `kysely` | 0.28.16 | dependency | 3.14 MiB |
| `vite` | ^6.2.0 | devDependency | 2.53 MiB |
| `react-big-calendar` | ^1.19.4 | dependency | 2.48 MiB |
| `@types/node` | ^25.6.0 | devDependency | 2.24 MiB |
| `vitest` | ^4.1.5 | devDependency | 1.82 MiB |
| `hono` | ^4.7.5 | dependency | 1.32 MiB |
| `react-day-picker` | ^9.5.1 | dependency | 1.23 MiB |
| `react-hook-form` | ^7.54.2 | dependency | 1.22 MiB |
| `react-resizable-panels` | ^2.1.7 | dependency | 1004.4 KiB |

## PDF/OCR Dependency Inventory

| Package | Version | Group | Installed size |
| --- | --- | --- | ---: |
| `pdf-parse` | 1.1.4 | dependency | 27.03 MiB |
| `pdfjs-dist` | 4.2.67 | dependency | 34.58 MiB |
| `pdfmake` | 0.2.21 | dependency | 12.94 MiB |
| `pngjs` | 7.0.0 | dependency | 634.9 KiB |
| `jpeg-js` | 0.4.4 | dependency | 74.2 KiB |
| `@react-pdf-viewer/core` | 3.12.0 | dependency | 336.7 KiB |
| `@react-pdf-viewer/default-layout` | 3.12.0 | dependency | 56.3 KiB |
| `@react-pdf-viewer/search` | 3.12.0 | dependency | 61.9 KiB |

## Source Usage Inventory

Scanned roots: `helpers`, `endpoints`, `scripts`, `pages`, `components`

- `pdf-parse`: 2 file(s), examples: `helpers/pdfTextExtractor.tsx`, `helpers/transunionTextParsing.tsx`
- `pdfjs-dist`: 2 file(s), examples: `helpers/pdfWorker.ts`, `helpers/pdfjsEvidenceCoordinates.ts`
- `pdfmake`: 14 file(s), examples: `helpers/adminKbPdfContentSections.tsx`, `helpers/contentMarker.tsx`, `helpers/disputePacketPdf.ts`, `helpers/evidenceManager.tsx`, `helpers/evidencePackageSections.tsx`, `helpers/pdfGenerator.tsx`, `helpers/pdfServerUtils.tsx`, `endpoints/pdf/admin-knowledge-base_GET.ts`
- `tesseract`: 6 file(s), examples: `helpers/deterministicOcr.ts`, `helpers/disputePacketService.ts`, `helpers/evidenceLocationIndex.ts`, `helpers/ocrEvidenceCoordinates.ts`, `scripts/operator-regression-dashboard.ts`, `scripts/staging-observability-check.mjs`
- `pdftoppm`: 2 file(s), examples: `helpers/deterministicOcr.ts`, `scripts/staging-observability-check.mjs`
- `poppler`: 1 file(s), examples: `scripts/operator-regression-dashboard.ts`
- `deterministicOcr`: 10 file(s), examples: `helpers/canonicalCreditReportExtractor.tsx`, `helpers/creditReportPdfEligibility.ts`, `helpers/creditReportUploadRejectionAudit.ts`, `helpers/deterministicCreditReportPipeline.ts`, `helpers/deterministicOcr.ts`, `helpers/evidenceLocationIndex.ts`, `helpers/ingestCorePipeline.tsx`, `helpers/ingestReportHandler.tsx`

## Docker OCR/Runtime Package Inventory

- `Dockerfile`: apt-utils, poppler-utils, tesseract-ocr, tesseract-ocr-eng
  - line 6: `&& (DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends apt-utils >/tmp/apt-utils-install.log 2>&1 \`
  - line 7: `\|\| { cat /tmp/apt-utils-install.log; exit 1; }) \`
  - line 8: `&& DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \`
  - line 9: `poppler-utils \`
  - line 10: `tesseract-ocr \`
  - line 11: `tesseract-ocr-eng \`
  - line 12: `&& rm -f /tmp/apt-utils-install.log \`
  - line 26: `ENV CRP_DETERMINISTIC_OCR_ENABLED=true`

## Non-Blocking Threshold Recommendations

- frontend-js: Warning - Review any single JS asset above 1.5 MiB raw or 500 KiB gzip. Critical - Prioritize chunking or lazy-loading review above 3 MiB raw or 900 KiB gzip.
- frontend-css: Warning - Review any single CSS asset above 500 KiB raw or 100 KiB gzip. Critical - Prioritize CSS ownership review above 1 MiB raw or 200 KiB gzip.
- runtime-dependency: Warning - Review direct runtime packages above 20 MiB installed size. Critical - Plan dependency isolation or replacement evidence above 50 MiB installed size.
- docker-runtime: Warning - Record Poppler/Tesseract package changes whenever OCR/PDF runtime packages change. Critical - Do not make runtime package changes without OCR/parser regression evidence.

## Known Risks

- The main Vite JS asset is large enough to need tracking before any production-at-scale claim.
- PDF/OCR packages and Docker OCR runtimes remain necessary for deterministic report extraction and should be inventoried before dependency or image changes.
- Thresholds are recommendations only until a later audited task explicitly turns them into build gates.
