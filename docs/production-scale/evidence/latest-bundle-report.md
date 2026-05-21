# Frontend Bundle Report

Generated at: 2026-05-21T11:53:48.178Z
Current HEAD: `ad08b59135630b8941e8bfdfe53c70e12e151993`
Script: `scripts/bundle-report.mjs`
CERTIFYING: false

## Safety

- Reporting only: yes
- Non-blocking: yes
- Production-scale certification dependency: no
- Dependency version changes: no
- UI redesign: no
- User flow changes: no
- Parser behavior changes: no
- Packet PDF output changes: no

## Commands

- `pnpm run report:bundle`: generated
- `pnpm exec vitest run --config vitest.config.ts tests/unit/bundle-report-script.spec.ts tests/unit/admin-sidebar-routes.spec.ts`: passed
- `pnpm run typecheck`: passed
- `pnpm run build`: passed
- `pnpm run check`: passed
- `git diff --check`: passed

## Route Splitting

- App route map present: yes
- Lazy route fallback present: yes
- All selected targets split: yes

| Route | Surface | Lazy loaded | Eager import removed | Reason |
| --- | --- | --- | --- | --- |
| `/packets` | packet-pdf | yes | yes | Packet list imports PDF viewer and delivery wizard surfaces; route-level split preserves packet APIs and PDF behavior. |
| `/admin-parser-testing` | admin-parser | yes | yes | Parser lab/test harness is admin-only and heavy; route-level split preserves parser execution and regression gates. |
| `/admin-parser-mappings` | admin-parser | yes | yes | Parser mapping admin panels are isolated from normal user routes; route-level split preserves mapping queries and admin flow. |
| `/admin-response-documents` | admin-response-documents | yes | yes | Large admin response-document workflow is not needed on normal user routes; route-level split preserves admin-only behavior. |

## Bundle Assets

Build output: `dist`, 28 tracked asset(s), 4.19 MiB total raw size.

| Asset | Raw | Gzip | Brotli |
| --- | ---: | ---: | ---: |
| `dist/_assets/index-B67QxIJB.js` | 2.88 MiB | 816.9 KiB | 642.8 KiB |
| `dist/_assets/index-c51JNdWS.css` | 603.4 KiB | 91.3 KiB | 69.2 KiB |
| `dist/_assets/admin-parser-testing-B6wp8oWE.js` | 142.8 KiB | 37.3 KiB | 31.4 KiB |
| `dist/_assets/react-big-calendar-BcF8CGEA.js` | 136.6 KiB | 42.9 KiB | 37.9 KiB |
| `dist/_assets/index-DEGQIRr7.js` | 132.6 KiB | 32.1 KiB | 25.9 KiB |
| `dist/_assets/OnboardingTour-DcQ_2Td0.js` | 58.3 KiB | 19.4 KiB | 17.4 KiB |
| `dist/_assets/admin-response-documents-DEkmxUFa.js` | 54.9 KiB | 12.6 KiB | 11.0 KiB |
| `dist/_assets/admin-parser-testing-DGTLj0Bn.css` | 37.8 KiB | 6.4 KiB | 5.6 KiB |
| `dist/_assets/index-sk2ek4N-.css` | 28.5 KiB | 4.4 KiB | 3.8 KiB |
| `dist/_assets/admin-parser-mappings-DPKe7uhc.js` | 27.7 KiB | 7.4 KiB | 6.5 KiB |
| `dist/_assets/packets-DTaErzk2.js` | 26.1 KiB | 8.2 KiB | 7.0 KiB |
| `dist/_assets/react-big-calendar-Dm-SzPQi.css` | 14.0 KiB | 2.7 KiB | 2.3 KiB |
| `dist/_assets/packets-CWxAgTPT.css` | 14.0 KiB | 2.9 KiB | 2.5 KiB |
| `dist/_assets/admin-response-documents-akbpNB3Q.css` | 9.9 KiB | 1.9 KiB | 1.6 KiB |
| `dist/_assets/admin-parser-mappings-D7806rg6.css` | 9.0 KiB | 1.9 KiB | 1.7 KiB |
| `dist/_assets/responseDocumentQueries-Cwp-yiGv.js` | 8.0 KiB | 1.9 KiB | 1.7 KiB |
| `dist/_assets/PacketViewer-B91crXie.js` | 7.7 KiB | 2.8 KiB | 2.5 KiB |
| `dist/_assets/index-B9fWrEk-.js` | 6.0 KiB | 2.2 KiB | 2.0 KiB |
| `dist/_assets/DeadlineCalendarView-gGBHzRkN.js` | 3.8 KiB | 1.5 KiB | 1.3 KiB |
| `dist/_assets/PacketViewer-DYFOtPtS.css` | 3.5 KiB | 1.1 KiB | 941 B |

## Threshold Summary

- Threshold policy mode: warning-only
- Threshold evidence mode: reporting-only
- Overall threshold status: WARN
- Blocking runtime-size failures: no
- Status counts: WARN=6, PASS=1, WAIVED=1

## Notes

- This report is non-blocking unless the runtime-size threshold policy is explicitly changed to a release-blocking mode with failOnExceed thresholds.
- Only route-level lazy loading was applied to selected heavy admin/parser/PDF surfaces.
- Definitive production-scale certification is not claimed by this performance evidence.
