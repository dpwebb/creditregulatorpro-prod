# Runtime Size And Dependency Report

Updated: 2026-05-20

This document records non-blocking bundle/runtime dependency evidence for production-scale tracking. It does not claim broad-production readiness or production-at-scale readiness.

## Command

Run after a production build:

```bash
pnpm run build
pnpm run report:runtime-size
```

The report script is `scripts/runtime-size-report.mjs`. It uses Node built-ins only and does not change dependency versions, Vite chunking, PDF/OCR behavior, Docker runtime packages, or production build behavior.

## Current Findings

Collected on 2026-05-20 after `pnpm run build` and `pnpm run report:runtime-size`.

### Frontend Build Assets

Tracked build output: `dist`, 19 assets, 4.18 MiB total raw size.

Largest current assets:

| Asset | Raw | Gzip | Brotli |
| --- | ---: | ---: | ---: |
| `dist/_assets/index-DdbjxR56.js` | 3.12 MiB | 875.8 KiB | 685.1 KiB |
| `dist/_assets/index-KZnEr7HZ.css` | 673.8 KiB | 101.4 KiB | 76.7 KiB |
| `dist/_assets/react-big-calendar-CD2U94Gz.js` | 136.6 KiB | 42.9 KiB | 38.0 KiB |
| `dist/_assets/index-CfvCFeKJ.js` | 132.6 KiB | 32.1 KiB | 25.8 KiB |
| `dist/_assets/OnboardingTour-CuYeGPaH.js` | 58.3 KiB | 19.4 KiB | 17.3 KiB |

The main Vite JS asset is the primary frontend scale risk. This task does not split chunks or change Vite behavior.

### Largest Installed Direct Dependencies

Largest installed direct dependency findings from the local `node_modules` inventory:

| Package | Version | Group | Installed size |
| --- | --- | --- | ---: |
| `pdfjs-dist` | 4.2.67 | dependency | 34.58 MiB |
| `lucide-react` | ^0.477.0 | dependency | 31.28 MiB |
| `pdf-parse` | 1.1.4 | dependency | 27.03 MiB |
| `typescript` | ^6.0.3 | devDependency | 23.22 MiB |
| `date-fns` | ^4.1.0 | dependency | 21.55 MiB |
| `pdfmake` | 0.2.21 | dependency | 12.94 MiB |

The PDF/OCR-related package size risk is concentrated in `pdfjs-dist`, `pdf-parse`, and `pdfmake`.

### PDF/OCR Runtime Inventory

Declared PDF/OCR and PDF-viewer packages:

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

Source usage inventory currently finds:

- `pdf-parse`: `helpers/pdfTextExtractor.tsx`, `helpers/transunionTextParsing.tsx`
- `pdfjs-dist`: `helpers/pdfWorker.ts`, `helpers/pdfjsEvidenceCoordinates.ts`
- `pdfmake`: 14 files, including packet/admin PDF generation helpers
- `tesseract`: 6 files, including deterministic OCR and observability checks
- `pdftoppm`: 2 files, including deterministic OCR and staging observability checks
- `poppler`: 1 file, in operator dashboard runtime checks
- `deterministicOcr`: 10 files across ingest, parser eligibility, and evidence helpers

### Docker OCR Runtime Inventory

`Dockerfile` currently installs:

- `apt-utils`
- `poppler-utils`
- `tesseract-ocr`
- `tesseract-ocr-eng`

`Dockerfile` also sets `CRP_DETERMINISTIC_OCR_ENABLED=true`.

This task does not modify Docker packages.

## Non-Blocking Threshold Recommendations

These thresholds are recommendations only. The build does not fail on them yet.

| Area | Warning recommendation | Critical review recommendation |
| --- | --- | --- |
| Frontend JS | Review any single JS asset above 1.5 MiB raw or 500 KiB gzip. | Prioritize chunking or lazy-loading review above 3 MiB raw or 900 KiB gzip. |
| Frontend CSS | Review any single CSS asset above 500 KiB raw or 100 KiB gzip. | Prioritize CSS ownership review above 1 MiB raw or 200 KiB gzip. |
| Runtime dependencies | Review direct runtime packages above 20 MiB installed size. | Plan dependency isolation or replacement evidence above 50 MiB installed size. |
| Docker runtime | Record Poppler/Tesseract package changes whenever OCR/PDF runtime packages change. | Do not make runtime package changes without OCR/parser regression evidence. |

## Current Risk Statement

Runtime-size reporting now exists, but performance gates are not enforced. The app remains limited beta ready with strict constraints only; it is not broad-production ready and is not production-at-scale ready.

Before any production-at-scale claim, a later audited task should decide whether to:

- keep this report non-blocking but collect repeated evidence;
- add warning-only CI artifact capture;
- add hard thresholds after stability baselines are accepted;
- split or lazy-load large frontend chunks with full UI regression evidence;
- isolate or replace heavy PDF/OCR dependencies only with deterministic ingestion, parser, packet, and OCR regression evidence.
