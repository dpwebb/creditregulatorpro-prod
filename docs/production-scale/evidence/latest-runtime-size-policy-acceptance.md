# Runtime Size Policy Acceptance

This acceptance evidence validates runtime-size policy governance only. It does not change dependency versions, build chunks, OCR/PDF behavior, or production data.

Generated at: 2026-05-21T00:20:18.797Z
Status: accepted-warning-only-waiver
Accepted: yes
Acceptance kind: warning-only-waiver
Policy mode: warning-only
Policy path: `docs/production-scale/runtime-size-threshold-policy.json`
Runtime-size evidence path: `docs/production-scale/evidence/latest-runtime-size.json`

## Formal Waiver

- Accepted: yes
- Approved by role: Release governance owner
- Accepted at: 2026-05-20T12:00:00.000Z
- Review/expiry date: 2026-08-20
- Reason: Runtime-size thresholds remain warning-only for limited beta because dependency and chunk refactors are explicitly out of scope; WARN rows have owners and dates, and future release-blocking activation requires reviewed threshold policy change.
- Accepted risk statement: The warning-only runtime-size posture is formally accepted for limited beta and must not be represented as a release-blocking hard gate.

## Runtime Evidence

- Generated at: 2026-05-21T00:10:38.819Z
- Age hours: 0.16
- Overall status: WARN
- Blocking failures: no
- Largest JS raw/gzip: 3.13 MiB/877.4 KiB
- Largest CSS raw/gzip: 674.0 KiB/101.5 KiB

## WARN Row Governance

- accepted: `main-js-raw` Largest JavaScript asset raw size; owner=Frontend platform owner; target=2026-08-20; waiver=n/a
- accepted: `main-js-gzip` Largest JavaScript asset gzip size; owner=Frontend platform owner; target=2026-08-20; waiver=n/a
- accepted: `main-css-raw` Largest CSS asset raw size; owner=UI platform owner; target=2026-08-20; waiver=n/a
- accepted: `main-css-gzip` Largest CSS asset gzip size; owner=UI platform owner; target=2026-08-20; waiver=n/a
- accepted: `dependency-pdfjs-dist` pdfjs-dist installed size; owner=PDF/OCR platform owner; target=2026-08-20; waiver=n/a
- accepted: `dependency-pdf-parse` pdf-parse installed size; owner=PDF/OCR platform owner; target=2026-08-20; waiver=n/a
- accepted: `dependency-pdfmake` pdfmake installed size; owner=Packet PDF platform owner; target=2026-08-20; waiver=n/a

## WAIVED Rows

- accepted: `docker-ocr-runtime-inventory` Docker OCR/PDF runtime package inventory; owner=PDF/OCR platform owner; review=2026-08-20; reason=Docker package byte sizes are not measurable from this source-only report; Poppler/Tesseract package names are inventoried and any future package change requires OCR/parser regression evidence.

## Dependency Version Check

- Determinable: yes
- Dependency versions changed: no
- Fields checked: dependencies, devDependencies, optionalDependencies, peerDependencies

## Safety

- Non-mutating: yes
- Production data mutated: no
- Dependency versions changed: no
- Build chunking changed: no
- Build behavior changed: no
- PDF/OCR behavior changed: no
- Hard gate claimed while warning-only: no
