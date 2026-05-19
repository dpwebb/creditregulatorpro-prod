# Future Build Plan

## Core Promise

Credit Regulator Pro should let a Canadian consumer upload a credit report, extract facts reliably, identify defensible credit-reporting issues, prepare simple evidence-backed action packets, and track what changed after action is taken.

All future work must protect this promise before adding breadth, convenience, or new automation.

## Product Boundaries

1. Canada only.
2. Consumer-facing language must stay plain and understandable.
3. Credit-report ingestion remains deterministic, replayable, and auditable.
4. AI and DocStrange may assist extraction or diagnostics only where deterministic validation accepts the result.
5. The system must not create unsupported legal conclusions.
6. The system must not create direct consumer-to-furnisher dispute packet flows.
7. Furnisher-related data issues are challenged through the Credit Bureau packet path.
8. Collection Agency packets remain a supported direct packet type.
9. Every user-visible issue, packet claim, and regulatory reference must be traceable to canonical data and evidence.
10. Personal PDFs and personal extracted text must not be committed as fixtures. Observed layouts must be converted into anonymized synthetic fixtures.

## Engineering Rules

1. Parser fixes must become durable deterministic rules, aliases, templates, validation rules, or regression fixtures.
2. Null or missing values must not overwrite valid extracted values without explicit justification.
3. Violation search compatibility must be preserved across ingestion and violation-model changes.
4. Packet generation must remain readiness-gated.
5. Every meaningful change must include targeted tests and a pass/fail report.
6. Broad refactors should not occur while critical flows are still being hardened.
7. Schema changes require a design-only pass first unless the change is trivial and already approved.
8. Admin override paths must not be added until evidence gates, endpoint lifecycle tests, and packet-to-finding tracking are stable.

## Current Implementation Status

Updated May 17, 2026.

### Implemented

1. Phase 1 deterministic extraction coverage has been expanded with 11 anonymized synthetic fixtures covering major TransUnion and Equifax layout families.
2. `pnpm run test:deterministic-ingestion-report` now protects exact tradeline counts, bureau metadata, report dates, TransUnion case IDs where present, DOB/address expectations where present, date/money fields, evidence coverage, replay-hash stability, and violation-search compatibility.
3. Parser-test and canonical-ingest coverage now include multiple layout families while keeping bureau-specific collection parsing isolated from generic report parsing.
4. Deterministic OCR code readiness exists with a fail-closed Tesseract/Poppler provider, OCR provenance, page confidence diagnostics, deterministic validation, scanned-PDF failure fixtures, and OCR-derived success fixtures.
5. Docker runtime dependencies for deterministic OCR and PDF handling are now installed in the app image: `apt-utils`, `poppler-utils`, `tesseract-ocr`, and `tesseract-ocr-eng`. The image bootstraps `apt-utils` before OCR/PDF package installation, the deployed staging container exposes `apt-utils 2.6.1`, `/usr/bin/apt-extracttemplates`, `/usr/bin/apt-ftparchive`, and `/usr/bin/apt-sortpkgs`, and the filtered deploy log no longer shows the Debian `apt-utils is not installed` warning. `apt-utils` is package-management tooling, not OCR, and does not change OCR acceptance rules.
6. `CRP_DETERMINISTIC_OCR_ENABLED=true` is now set in the container image.
7. Stable canonical evidence IDs exist for field evidence to support downstream violation and packet traceability.
8. Golden Path regression protection exists and covers the logical chain: upload contract, parse, canonical map, anomaly detection, violation detection, evidence binding, packet generation, and PDF download.
9. Packet generation is now active and readiness-gated. Build/create/save paths should reject parser-uncertain, dismissed, unverified, missing-evidence, manual-review, wrong-owner, wrong-bureau, mixed-owner, and unsafe cross-tradeline findings.
10. Single-issue packets now set `creditorObligationTestId`.
11. Multi-issue packets are constrained to the same owner and same tradeline; selected finding IDs remain preserved in structured packet content/metadata.
12. Packet UI and documentation now describe packet generation as active but readiness-gated rather than reset/paused.
13. Packet-dialog preselection from originating findings is implemented: clicking Create Packet from an eligible finding routes to the central packet dialog with the originating finding preselected, ineligible findings show a readiness-blocker message, and generic packet creation still works.
14. Repo-level and subsystem-level `AGENTS.md` guardrails exist for deterministic parsing, evidence, violation, packet, regulation, and service safety.
15. Stage Lab scanned-PDF/OCR rejection now maps known `SCANNED_PDF_UNSUPPORTED` errors to a controlled 400 response with side-effect-free parser-lab regression coverage.
16. Endpoint-backed packet lifecycle regression coverage now exists for readiness validation, packet preview/build, packet create, PDF download, non-owner PDF denial, missing/manual-review evidence rejection, dismissed finding rejection, and single-issue `creditorObligationTestId` persistence.
17. Real scanned-PDF staging smoke testing has been run against Stage Lab. The running staging and production containers expose `tesseract`, `pdftoppm`, and `CRP_DETERMINISTIC_OCR_ENABLED=true`; the smoke input used deterministic OCR, stayed side-effect free, produced no report/canonical/violation/evidence/packet rows, and returned controlled manual-review diagnostics when parser quality was not packet/canonical-ready.
18. Phase 3 Slice 1 evidence hardening has started with a no-schema evidence-location sidecar under `reportArtifact.data.evidenceLocationIndex`; it is keyed by stable `evidenceId`, preserves `pageNumber` only when reliable, omits missing or ambiguous page numbers, and leaves schema, canonical values, evidence IDs, replay hashes, violation logic, and packet readiness unchanged.
19. Phase 3 Slice 2 evidence enrichment is complete: violation evidence links now preserve structured `evidenceLocation` metadata when deterministically resolved, packet content preserves structured evidence location metadata by finding ID, readable packet evidence references remain unchanged, packet readiness and violation rules remain unchanged, and no schema change was made.
20. Phase 3 Coordinate Slice 1 is complete for OCR TSV word boxes: OCR TSV word boxes are parsed, OCR-derived `evidenceLocationIndex` entries can include optional `boundingBox` metadata when a deterministic, unambiguous, confidence-safe, non-sensitive OCR word-span match exists, `boundingBox` uses `px` units against rendered OCR image coordinates, `coordinateSource` is `tesseract_tsv_word`, bounding boxes remain optional, no schema change was made, and canonical values, evidence IDs, replay hash behavior, violation rules, OCR acceptance rules, packet readiness, packet wording, and packet PDF layout were not changed.
21. Phase 3 Coordinate Slice 2 is complete for native PDF/pdfjs coordinate sidecars: `pdfjs-dist` is used only as a sidecar while `pdf-parse` remains parser truth, native PDF `evidenceLocationIndex` entries can include optional `boundingBox` metadata when a deterministic, unambiguous, non-sensitive pdfjs text-item match exists, `boundingBox` uses `pt` units, `coordinateSource` is `pdfjs_text_item`, no schema change was made, and canonical values, evidence IDs, replay hash behavior, violation rules, OCR behavior, packet readiness, packet wording, packet UI, and packet PDF layout were not changed.
22. Synthetic Phase 3 coordinate sidecar edge-case coverage has been expanded for OCR TSV and native PDF/pdfjs fixtures, including repeated values, ambiguity omission, sensitive-overexposure omission, OCR low-confidence omission, no-match omission, and page ambiguity coverage.
23. The minimal packet-to-finding relational model is implemented through `dispute_packet_findings`: packet rows link to included findings, single-issue packets still set `creditorObligationTestId`, multi-issue packets create one row per selected finding, `selectedIssueIds` remain preserved in packet content/metadata, old packets without join rows remain readable, evidence snapshots are compact and privacy-safe, no backfill was performed, and no admin override was added.
24. `dispute_packet_findings` has passed staging smoke testing through the existing lazy schema-helper path: staging created/used the table, packet create wrote join rows, `evidence_location_snapshot` hydrated from deterministic evidence metadata with page and bounding-box data, and old packets without join rows remained readable.
25. The packet-finding and evidence-location bundle has been promoted to production at commit `1e78fb18a3aa9be58d8e0cd91cb19b471cfee554`; production `dispute_packet_findings` schema readiness was verified after invoking the lazy schema helper, with expected columns, indexes, constraints, foreign keys, and packet-scoped uniqueness, without creating production packet, user, finding, report, tradeline, evidence-event, or audit test records.
26. Phase 4A metadata-only rule defensibility hardening is implemented: final violation `technicalDetails` now include additive `defensibility` metadata where available, stable `deterministicRuleId` values are normalized for static and dynamic rules, factual trigger, source fields, evidence link presence, neutral explanation, regulation reference mode, packet eligibility summary, parser uncertainty status, and admin review status are carried as metadata, `packetEligibility` is informational only, evidence-location metadata remains optional and additive, no schema change was made, violation firing behavior did not change, and packet readiness and packet wording did not change.
27. Phase 4B Option A read-only regulation/reference reconciliation is implemented: a pure helper compares static runtime references with supplied DB governance snapshots and reports mismatches only, including missing records, citation mismatch, jurisdiction mismatch, missing source URL, missing effective date, missing approval status, unclear mapping, and consumer wording risk; the DB registry was not activated as runtime truth, no candidates are created, and runtime mappings are unchanged.
28. Phase 4B/Phase 9 inert regulation reconciliation candidate storage is implemented: `regulation_reconciliation_candidate` exists through the lazy schema-helper path, reconciliation findings can be persisted as inert governance candidates, candidate creation is idempotent through `dedupeKey`, the lifecycle is review-only, candidates can be approved for mapping review or registry update review without activating runtime truth, rejection requires a reason, audit logging exists for create/reuse/status actions, sanitization strips consumer personal data, packet content, raw/extracted report text, full SIN-like values, and full unmasked account-like values, the DB registry remains non-runtime governance metadata, static runtime mappings remain active runtime truth, and no runtime bridge was added.
29. A review-only admin Reconciliation Candidates tab is implemented inside Regulatory Updates: admins can list, filter, and inspect inert regulation reconciliation candidates and perform review-only status actions through the existing backend endpoints, no runtime activation controls exist, the DB registry remains non-runtime governance metadata, and static runtime mappings remain active runtime truth. A gated smoke harness exists at `scripts/staging-reconciliation-candidates-ui-smoke.ts`; it requires explicit `CRP_RECONCILIATION_CANDIDATE_UI_SMOKE=true`, refuses production hosts, and supports staging or local admin credentials/session-cookie contexts. Authenticated staging smoke has passed using a staging session-cookie method without recording secrets: admin access was verified, the Reconciliation Candidates tab was reachable, list/filter/detail flow passed, inert safety messaging passed, review-only status flow passed, the synthetic inert candidate was archived after the run, forbidden activation endpoint calls were zero, registry and mapping responses remained unchanged, the candidate remained inert, and the non-admin check was skipped because no safe non-admin context was configured.
30. A read-only shadow DB regulation runtime bridge report exists: static runtime references remain active truth, approved/active DB alternatives can be computed for shadow comparison, invalid, unapproved, inactive, superseded, or unsafe DB records are ignored or flagged, DB alternatives do not change consumer output, the DB registry is not runtime truth, no runtime activation exists, and packet readiness and wording were not changed.
31. An admin-only read-only shadow bridge diagnostic API endpoint exists at `GET /_api/regulation-registry/shadow-bridge/report`: it returns shadow diagnostics while static runtime references remain active, does not activate the DB registry, does not create reconciliation candidates, does not mutate registry or mapping rows, and does not change packet readiness or packet wording.
32. `regulation_runtime_bridge_mapping` governance storage and admin-only backend endpoints exist for future runtime bridge mapping review: bridge mappings can be drafted, listed, and status-updated as governance records; service/API paths reject `active_limited_runtime`; no runtime selector exists; the DB registry remains non-runtime governance metadata; static runtime mappings remain active runtime truth; and violation firing, packet readiness, packet wording, parser, canonical, and OCR logic were not changed. A gated authenticated staging smoke has passed using a staging session-cookie method without recording secrets: admin access was verified, a synthetic governance mapping was created through the runtime-bridge backend endpoint, duplicate create was blocked with HTTP 409, list/filter/update behavior was verified, the synthetic mapping was archived after the run, no runtime selector endpoint was called, registry, mapping, and reconciliation-candidate responses remained unchanged, packet readiness, packet wording, and violation firing endpoint calls were zero, the synthetic mapping remained governance-only, and the non-admin check was skipped because no safe non-admin context was configured.
33. A review-only Runtime Bridge Mappings admin UI exists inside Regulatory Updates: admins can list, filter, inspect, and perform review-only status actions for existing `regulation_runtime_bridge_mapping` governance records; no create UI exists; no runtime activation controls exist; the DB registry remains non-runtime governance metadata; static runtime mappings remain active runtime truth; no runtime selector exists; and packet readiness, packet wording, violation firing, parser, canonical, and OCR logic were not changed.
34. A gated Runtime Bridge Mappings UI smoke harness exists at `scripts/staging-runtime-bridge-mapping-ui-smoke.ts` and can be run with `pnpm run smoke:runtime-bridge-mapping-ui`; it requires `CRP_RUNTIME_BRIDGE_MAPPING_UI_SMOKE=true`, refuses production hosts, supports staging or local admin credentials/session-cookie contexts, creates only synthetic governance bridge mapping records, archives the synthetic mapping after review, checks that forbidden runtime activation controls and endpoint calls are absent, and does not activate the DB registry, static mappings, runtime selector, limited-runtime bridge, or admin override path. Authenticated staging smoke has passed using a staging session-cookie method without recording secrets: authenticated admin access was verified, the Runtime Bridge Mappings tab was verified on staging, list/filter/detail flow passed, governance-only safety messaging passed, review-only status flow passed, the synthetic governance mapping was archived after the run, no runtime selector endpoint was called, the DB registry remained non-runtime governance metadata, static runtime truth remained unchanged, registry, mapping, and reconciliation-candidate responses remained unchanged, packet readiness, packet wording, and violation firing endpoint calls were zero, and the non-admin check was skipped because no safe non-admin context was configured.
35. An advisory regulation bridge helper exists as a pure/internal computation layer: it has no endpoint, no UI, no schema change, and no runtime selector; static runtime references remain consumer-facing truth; `approved_for_advisory` mappings with advisory bridge mode can produce admin/internal advisory metadata only; invalid, ambiguous, unsafe, or incomplete DB records fail closed to the static fallback; private standards are not presented as law; internal-only references are not consumer-facing; and packet readiness, packet wording, and violation firing were not changed.
36. An admin-only read-only advisory bridge diagnostic endpoint exists at `GET /_api/regulation-registry/advisory-bridge/report`: it returns advisory diagnostics while static runtime references remain consumer-facing truth, does not activate the DB registry, does not mutate static mappings, does not mutate registry, mapping, or bridge rows, does not create reconciliation candidates, does not change packet readiness, packet wording, or violation firing, and adds no schema, UI, or runtime selector.
37. A gated advisory bridge diagnostic endpoint smoke harness exists at `scripts/staging-advisory-bridge-report-smoke.ts` and can be run with `pnpm run smoke:advisory-bridge-report`; it requires `CRP_ADVISORY_BRIDGE_REPORT_SMOKE=true`, refuses production hosts, supports staging or local admin credentials/session-cookie contexts, calls only the admin-only read-only advisory report endpoint and safe snapshot endpoints, compares before/after registry, mapping, bridge-mapping, and reconciliation-candidate responses when available, verifies advisory safety messages, and checks that runtime selector, mutation, packet, violation, parser, and OCR endpoints are not called. Authenticated staging smoke has passed using a temporary staging admin session-cookie method without recording secrets; the temporary admin session and user were cleaned up after the run, the advisory report returned `mode: advisory` and `runtimeSourceUsed: static_runtime`, the no-match report returned no advisory metadata, registry, mapping, bridge-mapping, and reconciliation-candidate responses remained unchanged, packet readiness, packet wording, and violation firing endpoint calls were zero, advisory diagnostics remained admin/internal only, and the non-admin check was skipped because no safe non-admin context was configured.
38. A production readiness gate exists at `scripts/production-readiness-gate.mjs` and can be run with `pnpm run readiness:production`; it verifies GitHub source-of-truth alignment, typecheck, Golden Path, contract/API suites, deterministic ingestion, credit parser regression, tradeline internal regression, violation correction regression, the staging validation gate, latest successful staging deploy SHA, staging app/login reachability, and unauthenticated protection for core admin/regulation endpoints. The gate passed against staging commit `bf0b0efad3a2ed3a6ba36154228c04f85cf6ae53`.
39. A bounded staging scale-baseline harness exists at `scripts/staging-scale-baseline.mjs` and can be run with `pnpm run baseline:staging-scale`; it requires `CRP_STAGING_SCALE_BASELINE=true`, refuses production hosts, allows staging by default and local only with an explicit flag, bounds iterations/concurrency/delay, and checks public shell, login, auth/session denial, invalid upload-contract rejection, and selected admin/regulation denial endpoints without authenticated requests, consumer data, runtime mutation, packet calls, violation calls, parser/OCR calls, or regulation activation. The harness passed against staging commit `bf5354caae7b3d1b3ef9e4d4315f141d64562883` with 28 bounded synthetic/unauthenticated requests and zero failures.
40. A staging backup/restore checklist gate exists at `scripts/staging-backup-restore-checklist.mjs` and can be run with `pnpm run check:staging-backup-restore`; it requires `CRP_STAGING_BACKUP_RESTORE_CHECK=true`, verifies that the existing staging-to-local refresh path retains local-only restore guards, dry-run support, custom-format dump support, volatile session/token cleanup, and ignored dump-artifact storage, and prints operator drill steps without reading secrets, printing secrets, dumping data, restoring data, modifying staging, or touching production. The checklist gate passed at staging commit `8cf9b473d95c5fbf1b21e16e67d1ba547bfba723`.
41. A read-only staging observability validation gate exists at `scripts/staging-observability-check.mjs` and can be run with `pnpm run check:staging-observability`; it requires `CRP_STAGING_OBSERVABILITY_CHECK=true`, refuses production and unapproved hosts, checks staging app/login/auth-session health, verifies the staging container is running, and parses a bounded container-log window for HTTP 5xx, parser/OCR failures, packet-generation failures, and background/unhandled error spikes without printing raw logs or secrets. It treats expected runtime-activation rejection messages as controlled non-alerts and does not modify app code, schema, runtime truth, or packet behavior. The gate passed against staging commit `c7137917eac93a84eaef8329d8c4978bcd60f5a4`.
42. A gated authenticated workflow smoke harness exists at `scripts/staging-auth-workflow-smoke.ts` and can be run with `pnpm run smoke:auth-workflow`; it requires `CRP_AUTH_WORKFLOW_SMOKE=true`, refuses production hosts, self-registers a temporary synthetic consumer, verifies logout/login/session behavior, updates the synthetic profile, generates and uploads an anonymized text-based synthetic credit-report PDF, reviews upload/parser results, finds a packet-ready credit-bureau finding through existing recommendations, validates packet readiness, builds and creates the packet, downloads the packet PDF, and then deletes the temporary consumer account through self-service account deletion. It does not use admin override, direct furnisher packets, runtime regulation activation, production hosts, private PDFs, or committed personal data. Staging execution remains pending.
43. `static/__dev/system-prompt.md` has been removed from the publicly served static tree and preserved as `docs/internal/system-prompt.md`; a unit guard now verifies the system prompt does not drift back under public static assets.
44. A design-only protected build slice plan exists at `docs/protected-build-slice-plan-2026-05-16.md` for Phase 3 evidence hardening, dedicated document-type rule packs, admin correction classification, and Phase 4/5/9 governance hardening. It defines upstream callers, downstream consumers, impact boundaries, tests, and stop conditions before protected runtime code is changed.
45. Remaining internal dev plans, notes, and scheduled-job drafts have been moved from publicly served `static/__dev` into `docs/internal/dev`; the public-static unit guard now verifies the internal dev archive stays outside `static`.
46. Phase 3 evidence hardening fixture coverage now includes a page-aware sidecar guard across consumer identity and tradeline field families, plus anonymized complex coordinate layouts for creditor-statement native PDF text items and collection-letter OCR TSV words. The new fixtures verify contextual spans can receive optional coordinates while repeated amount-only text fails closed, without changing canonical truth, evidence IDs, replay hashes, violation firing, packet readiness, packet wording, schema, or regulation mappings.
47. Initial dedicated deterministic document rule-pack scaffolding exists at `helpers/documentRulePacks.ts` for creditor statements and collection letters. The rule packs emit isolated, non-canonical facts with deterministic rule IDs and masked evidence snippets, fail closed on insufficient document-type indicators, refuse bureau credit-report text, and do not route statement or letter facts into credit-report canonical fields, violations, packets, schema, or regulation mappings.
48. Internal-document exposure guardrails now keep internal text docs out of publicly served static roots and keep internal/confidential PDFs out of generated output artifacts; the admin new-hire manual is preserved as reviewable Markdown under `docs/internal`, and the generated onboarding PDF is not committed under `output/pdf`.
49. A production readiness checklist now exists at `docs/production-readiness-checklist.md`, and `pnpm run production:readiness` provides an operator-readable local release report over branch/status/commit, required readiness files, required local checks, readiness levels, and rollback reminders. The report is governance-only: it does not query production DBs, create data, call production endpoints, promote production, activate bridge mappings, create packets, or use real consumer data.
50. An operator-readable regression dashboard now exists at `scripts/operator-regression-dashboard.ts` and can be run with `pnpm run operator:dashboard`; it separates helper-level logical checks, endpoint/API lifecycle checks, manual/gated smoke harnesses, operational notes, and known coverage gaps across parser, evidence, packet, regulation governance, public/static safety, and endpoint-backed release health. The dashboard is read-only by default, supports JSON and check listing, and does not run authenticated staging smoke, query production DBs, create data, promote production, activate runtime bridge mappings, generate packets, or use real consumer data.
51. First-slice endpoint-backed admin correction/truth-loop coverage now exists at `tests/api/admin-violation-correction-endpoint.spec.ts`: it covers synthetic admin correction creation, scoped evidence attachment safety, `trainingNoteOnly`/manual-only replay exclusion, direct `update_POST` finalize-bypass prevention, finalize-path validation and audit expectations, rejected/manual-only history preservation, non-admin and unauthenticated denial, and source-level guards that the endpoints do not call parser, canonical, OCR, packet, furnisher, admin-override, or runtime-registry activation paths. This is test coverage only; it does not complete admin correction candidate classification, rule promotion, schema work, or runtime truth activation.
52. Endpoint-backed violation search/status coverage now exists at `tests/api/violation-search-status-endpoint.spec.ts`: it covers synthetic creditor-validation listing, ownership scoping, supported filters, admin/support boundaries, non-owner denial, dismiss/update/delete endpoint contracts, packet-readiness consistency through existing gates, evidence/privacy expectations, current audit/logging expectations, and source-level guards that the endpoints do not call parser, canonical, OCR, packet wording, admin-override, furnisher, or runtime-registry activation paths. This is test coverage only; broader production-scale workflow coverage remains ongoing.
53. Endpoint-backed report ingest lifecycle coverage now exists at `tests/api/report-ingest-lifecycle-endpoint.spec.ts`: it covers synthetic upload/auth contracts, artifact ownership, SSE process ownership and controlled failure behavior, report artifact list/detail scoping, upload-results detail ownership, Stage Lab side-effect separation and scanned-PDF controlled failure behavior, privacy/no-overexposure expectations, and source-level guards that report endpoints do not create packets, change packet wording/readiness, activate regulation runtime truth, create admin override paths, or add direct furnisher packet flow. This is test coverage only; broader production-scale workflow coverage remains ongoing.
54. Endpoint-backed evidence privacy/ownership coverage now exists at `tests/api/evidence-privacy-endpoint.spec.ts`: it covers synthetic direct evidence event scoping, auth/ownership boundaries, admin/support behavior, evidence attachment list/upload/package behavior, stale/missing package-file safety, compact evidenceLocation exposure through indirect violation metadata, no raw text/full SIN/full account/storage-secret leakage, current audit expectations, and source-level guards that evidence endpoints do not call parser, canonical, OCR, packet readiness/wording, runtime-registry activation, admin-override, or direct furnisher paths. This is test coverage only; broader production-scale workflow coverage remains ongoing.
55. Endpoint-backed auth/session/logout lifecycle coverage now exists at `tests/api/auth-session-lifecycle-endpoint.spec.ts`: it covers synthetic password-login success/failure/lockout contracts, session summary refresh behavior, missing/malformed/invalid session handling, logout invalidation and cookie clearing, role boundaries, read-only admin guard samples, no client-side role escalation, no password/session/JWT/DB secret overexposure, and source-level guards that auth endpoints do not call parser, canonical, OCR, packet readiness/wording, runtime-registry activation, admin-override, or direct furnisher paths. This is test coverage only; broader production-scale workflow coverage remains ongoing.
56. Endpoint-backed admin audit-log filtering/sanitization coverage now exists at `tests/api/admin-audit-log-endpoint.spec.ts`: it covers admin-only access, support/non-admin denial, client-supplied role escalation rejection, supported filters and pagination, safe audit summaries, no secret/full SIN/full account/raw text/storage leakage, regulation governance, packet/evidence, and admin correction audit row safety where applicable, and source-level guards that audit endpoints do not call parser, canonical, OCR, evidence extraction, violation firing, packet readiness/wording, runtime-registry activation, admin-override, or direct furnisher paths. This is test coverage only; broader production-scale workflow coverage remains ongoing.
57. Endpoint-backed packet delivery/status/send coverage now exists at `tests/api/packet-delivery-status-endpoint.spec.ts`: it covers synthetic packet status updates, ownership and role boundaries, local delivery recording, mocked registered and first-class send behavior, no live PostGrid/mail/webhook calls, provider payload no-overexposure, send failure refund and non-corruption behavior, duplicate/retry blocking for already-sent packets, missing identification safety, list/get delivery field exposure, old packet readability without `dispute_packet_findings` rows, audit/evidence event expectations, and source-level guards that delivery endpoints do not call parser, canonical, OCR, evidence extraction, violation firing, packet readiness-rule changes, packet wording/PDF layout changes, runtime-registry activation, admin-override, or direct furnisher paths. This is test coverage only; broader production-scale workflow coverage remains ongoing.
58. A no-schema deterministic outcome comparison helper now exists at `helpers/outcomeComparison.ts`, with synthetic coverage at `tests/unit/outcome-comparison.spec.ts`: it compares previous/later report and tradeline snapshots, supports synthetic `dispute_packet_findings`-like packet-finding anchors, preserves compact evidence IDs/location snapshots, sanitizes full SIN/full account/raw text/storage secret markers, and classifies `unchanged`, `removed`, `corrected`, `partially_corrected`, `reinserted`, `new_issue`, `unresolved`, `needs_review`, `not_comparable`, and `response_received` without querying or mutating the DB.
59. Persisted backend outcome tracking has started: additive `outcome_comparison_run` and `finding_outcome` tables now exist through a guarded schema helper, `POST /_api/outcomes/compare`, `GET /_api/outcomes/list`, and `GET /_api/outcomes/get` now persist and read deterministic helper results, and endpoint coverage exists at `tests/api/outcome-tracking-endpoint.spec.ts` for owner/admin scoping, support non-admin behavior, report comparison classifications, packet-finding anchors, response-only outcomes, derived summaries, privacy-safe snapshots, and runtime-safety boundaries. Authenticated staging smoke has passed using synthetic API-created fixtures with marker `OUTCOME_SMOKE_20260517234714`: compare/list/get were verified for report artifacts `275` and `276`, the response-only comparison produced `response_received`, append-only synthetic outcome run `2` was created, only outcome rows were created, source report/tradeline/packet/finding rows were not mutated, parser/OCR/packet generation/packet readiness/packet wording/violation firing/regulation runtime/admin override/direct furnisher calls were zero, privacy/no-overexposure checks passed, the DB registry remained non-runtime governance metadata, and static runtime mappings remained active truth. The non-owner smoke check was skipped because no safe non-owner context was configured. Outcome compare/list/get remains backend/API first: no full consumer-facing outcome automation, no response capture UI, no inbox integration, no historical backfill, and no production-scale repeated outcome smoke coverage yet. Response documents and response-processing classifications remain intake/evidence records only and are not canonical credit-report facts.
60. Outcome admin-review backend coverage now exists and authenticated staging smoke has passed: `finding_outcome` and `outcome_comparison_run` have additive admin-review metadata fields, `POST /_api/outcomes/admin-review` is registered as an admin-only endpoint, and `tests/api/outcome-admin-review-endpoint.spec.ts` covers unauthenticated/user/support denial, relationship validation, supported review actions, required notes/confirmations, run-level review-status derivation, sanitized audit, deterministic `outcomeType`/confidence/matching/reason/snapshot preservation, source-record immutability, and runtime-safety boundaries. Authenticated staging smoke used a synthetic existing outcome run with marker `OUTCOME_SMOKE_20260517234714`, verified unauthenticated denial with HTTP 401, exercised `review_outcome`, `mark_needs_review`, `confirm_outcome`, `reject_match`, and `reject_classification`, confirmed required-note and confirmation validation returned controlled HTTP 400 responses, and confirmed unsupported override-style actions returned HTTP 400. The implementation and smoke are metadata-only: deterministic `outcomeType`, `matchingMethod`, `confidenceLevel`, and snapshots remained unchanged; source report/tradeline/packet/finding rows were not mutated; parser/OCR/packet generation/packet readiness/packet wording/violation firing/regulation runtime/admin override/direct furnisher calls were zero; privacy/no-overexposure checks passed; and review metadata, outcome rows, and audit rows remain append-only for smoke/audit. No consumer-facing outcome UI or response-document parser/inbox integration exists yet.
61. Admin outcome review UI now exists and authenticated staging smoke has passed: `/admin-outcome-reviews` is registered behind the admin route layout, appears in admin navigation, uses only existing outcome list/get/admin-review endpoints, and has local unit coverage at `tests/unit/outcome-admin-review-ui.spec.tsx` for list/filter behavior, detail loading, preservation notices, safe snapshot redaction, client-side review-note guardrails, metadata-only review actions, unsupported override-control absence, and source guards against parser/OCR/packet/violation/regulation activation/admin override/direct furnisher calls. Authenticated admin smoke used synthetic outcome run `2` with marker `OUTCOME_SMOKE_20260517234714` and verified route rendering, list loading, synthetic run visibility, detail panel opening, safety banner rendering, preservation notices, review action validation, and one metadata-only review action with HTTP 200. Unsupported override controls were absent, no consumer-facing outcome UI was used, deterministic `outcomeType`, `matchingMethod`, `confidenceLevel`, and snapshots remained unchanged, review metadata only changed, source report/tradeline/packet/finding rows were not mutated, parser/OCR/packet generation/packet readiness/packet wording/violation firing/regulation runtime/admin override/direct furnisher calls were zero, privacy/no-overexposure checks passed, and review metadata, outcome rows, and audit rows remain append-only for smoke/audit. No consumer-facing outcome UI, response-document parser/inbox integration, or admin override exists.
62. Bureau/collection-agency response-document capture backend has started with immutable metadata/evidence capture plus append-only deterministic processing, and authenticated staging smoke has passed in both admin and user-owned contexts: additive `bureau_response_event` and `response_processing_event` schema creation now exists at `helpers/responseDocumentSchema.ts`, service logic exists at `helpers/responseDocumentService.ts`, and `POST /_api/responses/capture`, `GET /_api/responses/list`, `GET /_api/responses/get`, and admin-only `GET /_api/responses/metrics` are registered. Endpoint coverage at `tests/api/response-document-endpoint.spec.ts` verifies schema idempotency, owner/admin/support boundaries, packet/dispute-packet-finding/outcome/finding/evidence/tradeline/violation relationship validation, deterministic processing metadata, metrics, sanitized audit, privacy/no-overexposure, and source guards that prevent credit-report parser/OCR pipeline, canonical mutation, violation firing, packet generation/readiness/wording/PDF, regulation runtime activation, admin override, and direct furnisher paths. Authenticated admin smoke verified capture/list/get with synthetic outcome run `2`, authenticated user smoke verified capture/list/get with user-owned synthetic outcome run `3`, both used `email` and `bureau_email_response`, response metadata linked to outcomes, unauthenticated response endpoints returned HTTP 401, and privacy/no-overexposure checks passed. Response documents do not become canonical credit-report facts, response classifications are intake outcomes only, later deterministic report comparison is still required for corrected/removed/unchanged source-truth outcomes, source report/tradeline/finding/packet rows are not mutated, packet readiness and wording are not changed, and no mailbox/Gmail/IMAP/inbox scraping or response capture UI exists yet.
63. Admin response-document list/detail UI exists, and its original read-only visibility smoke has passed: `/admin-response-documents` is registered behind the admin route layout, appears only in admin navigation, uses existing `GET /_api/responses/list` and `GET /_api/responses/get` endpoints for list/detail visibility, and has local unit coverage at `tests/unit/response-document-ui.spec.tsx`. Authenticated admin smoke used existing synthetic response `1` with marker `OUTCOME_SMOKE_20260517234714` and verified route rendering, list loading, synthetic response visibility, detail panel opening, safety banner rendering, evidence/metadata-only and later-report-comparison notices, and detail values for `email`, `bureau_email_response`, `linked_to_outcome`, comparison run `2`, and finding outcome `2`. The original visibility smoke verified no response capture, upload, parser, inbox, Gmail, IMAP, legal-conclusion, admin-override, direct-furnisher, or corrected/removed/unchanged controls. The page has since been extended with metadata-only admin-review controls recorded below; response documents remain evidence/metadata only, later deterministic report comparison remains required, and no source report/tradeline/finding/packet/outcome rows, packet readiness/wording, parser/OCR/canonical extraction, violation firing, regulation runtime, admin override, direct furnisher, or mailbox paths were mutated by the visibility smoke.
64. Response-document admin-review backend now exists as an admin-only metadata review endpoint, and authenticated staging smoke has passed: `POST /_api/responses/admin-review` is registered and covered by `tests/api/response-document-admin-review-endpoint.spec.ts`. It uses existing `bureau_response_event` review fields only, supports `mark_needs_review`, `mark_related`, `mark_unrelated`, `archive_response`, `link_to_packet`, `link_to_outcome`, and `add_review_note`, validates same-user packet/outcome/finding relationships, requires evidence-only/no-canonical-change/no-outcome-classification confirmations, writes sanitized audit details, and rejects corrected/removed/unchanged, legal-conclusion, runtime activation, force/final-truth, demand/enforce, override, and similar unsupported actions. Authenticated admin smoke verified response `1` with synthetic marker `OUTCOME_SMOKE_20260517234714`, comparison run `2`, and finding outcome `2`; unauthenticated POST returned HTTP 401; required-note validation returned controlled HTTP 400 responses; unsupported corrected/removed/unchanged/legal/override actions returned HTTP 400; and `link_to_outcome` plus `add_review_note` were exercised. It remains metadata-only: review metadata changed only, response processing events remain append-only, later deterministic report comparison remains required for source-truth outcome changes, the deterministic outcome hash remained unchanged, source report/tradeline/finding/packet/canonical facts were not mutated, packet readiness and wording were unchanged, parser/OCR/canonical extraction/violation firing/regulation runtime/admin override/direct furnisher/mailbox/inbox calls were zero, and privacy/no-overexposure checks passed. No response capture UI or mailbox/Gmail/IMAP/inbox integration exists.
65. Response-document admin-review UI controls now exist on the admin-only Response Documents detail panel, and authenticated staging smoke has passed: the UI uses only `GET /_api/responses/list`, `GET /_api/responses/get`, and `POST /_api/responses/admin-review`; local unit coverage at `tests/unit/response-document-ui.spec.tsx` covers list/detail behavior plus admin metadata review controls for `mark_needs_review`, `mark_related`, `mark_unrelated`, `archive_response`, `link_to_outcome`, and `add_review_note`. The gated UI smoke harness at `scripts/staging-response-document-admin-review-ui-smoke.ts` has been exercised through the autonomous post-deploy response auth suite using a synthetic response chain. It verified the admin-only route, selected response detail, admin metadata review controls, a neutral metadata-only review action, evidence/metadata-only notices, later-report-comparison notices, corrected/removed/unchanged control absence, parser/inbox/mailbox control absence, legal-conclusion wording absence, privacy/no-overexposure checks, and runtime-safety boundaries. The UI requires review notes where the backend requires them, requires explicit evidence-only/no-canonical-change/no-outcome-classification confirmations before mutation, validates link requirements for related/outcome actions, and rejects obvious full SIN, full unmasked account, raw text, storage/secret, and legal-conclusion review-note content before submission. Unsupported corrected/removed/unchanged, override, legal-violation, admitted-fault, activation, final-truth, force-outcome, demand/enforce, parser, inbox, mailbox, direct-furnisher, response capture, and consumer-facing controls remain absent. Response documents remain evidence/metadata only, later deterministic report comparison remains required, no corrected/removed/unchanged classification is created by the UI, and no schema, endpoint behavior, parser/OCR/canonical, violation firing, packet readiness/wording/PDF, regulation runtime, admin override, direct furnisher, mailbox/Gmail/IMAP/inbox, response capture UI, or consumer UI change was made.
66. The staging deploy workflow now includes an autonomous seeded/authenticated response auth smoke suite that runs after staging deploy and health checks. It creates one synthetic marker, bootstraps a synthetic admin through a safe staging-local DB setup path, logs in through the normal auth flow, verifies the resolved role is `admin`, creates a synthetic outcome fixture and response chain, then runs response capture/list/get smoke, response UI smoke, response admin-review backend smoke, and response admin-review UI smoke with the same marker through fixture -> outcome -> response capture -> admin review -> UI review. The suite passed on staging deploy run `26071304563` with marker `OUTCOME_SMOKE_Rc6abc93f_H611d3c4e`; synthetic admin cleanup/neutralization ran after the suite, randomized the password hash, demoted the synthetic account roles back to `user`, removed sessions where available, and verified the synthetic account was no longer admin. No DB URLs, cookies, generated passwords, auth headers, tokens, or secrets were printed. The workflow now scope-gates the full response-auth smoke suite: runtime/app/workflow/Docker/backend/UI/script changes run it, docs/readiness/operator-dashboard-only changes intentionally skip it, and unknown changed-file scope fails closed by running it. The gate was verified on staging deploy run `26079647117` after workflow changes, where the full suite ran and passed with synthetic admin neutralization. The automation confirmed response documents remain evidence/metadata only, later deterministic report comparison remains required, and no parser/OCR/canonical extraction, violation firing, packet readiness, packet wording/PDF, regulation runtime activation, admin override, direct furnisher, mailbox/Gmail/IMAP/inbox, schema, endpoint behavior, or app runtime behavior changed.
67. Response-processing hardening is implemented as an additive deterministic intake layer. `bureau_response_event` now preserves sanitized raw artifact metadata and normalized response metadata, while `response_processing_event` stores append-only deterministic classification events with classification, confidence, parser/rule version, uncertainty codes, evidence-linked provenance, regulation-reference review links where applicable, readiness/violation impact statements, idempotency metadata, and fallback flags. Capture creates the response row and processing event in one transaction, then exposes latest processing metadata for list/get. Admin-review actions now also write append-only `response_admin_review_event` rows with previous/next status, safe note hashes, confirmation flags, and explicit no-canonical/no-packet/no-runtime mutation flags; the response row keeps denormalized latest review state for filtering. The classifier supports verified/deleted, updated, remains, frivolous, unable-to-verify, duplicate, suspicious/non-compliant, and unknown/manual-review states with confidence gating, negation checks, contradiction detection, metadata-only/OCR-damaged fail-closed behavior, and suspicious-response manual-review precedence. No AI dependency is required, AI fallback remains disabled behind explicit gating metadata, and response processing does not mutate canonical report facts, violation truth, packet eligibility, packet readiness, or packet wording. Admin metrics aggregate parser failures, OCR fallback signals, uncertainty, dead letters, suspicious patterns, repeated mismatches, readiness regression, and workflow stalls without logging PII; OCR fallback counts require true fallback signals rather than key-name presence. The admin Response Documents UI shows deterministic/fallback source, manual-review state, rationale/provenance, and operator metrics; the consumer packet page shows a bounded response timeline only when response records exist and keeps unresolved response states visually explicit without admin controls. Local coverage includes response classification unit tests, response endpoint/schema/metrics tests, admin-review append-only ledger tests, admin UI tests, packet timeline tests, and smoke-harness expectation updates. Known limitations remain: classification is phrase/rule based, low-signal or contradictory language intentionally goes to manual review, no inbox/capture UI exists yet, and production-scale replay/backpressure/alert-delivery coverage remains future work.

### Remaining High-Priority Work

1. Continue Phase 3 evidence hardening by adding more anonymized fixtures from newly observed complex page/coordinate layouts that are not already represented by the current OCR and native-PDF sidecar tests.
2. Continue dedicated creditor-statement and collection-letter rule packs by adding parser-test/admin review integration, comparison rules, and fixtures before any canonical or packet consumer uses those facts.
3. Deepen admin-correction promotion into future parser, validation, violation, exception, and regression rules.
4. Continue Phase 4 rule defensibility, Phase 5 admin truth-loop hardening, and Phase 9 regulation/reference governance before adding broader packet outcome tracking.
5. Keep internal dev plans and notes outside publicly served static assets.

---

## Phase 0: Governance and Release Safety

Goal: keep Codex and human changes bounded, reviewable, and regression-safe.

Status: Mostly complete. The production readiness checklist and operator-readable local release report add Phase 0 governance progress, and the staging deploy workflow now includes scoped autonomous response-auth smoke gating. Runtime/app/workflow/Docker/backend/UI/script changes run the full response-auth smoke suite after deploy and health checks, docs/readiness/operator-dashboard-only changes intentionally skip the full suite, and unknown changed-file scope fails closed by running it. Selective publish discipline, rollback rehearsal, release evidence review, and production monitoring remain active operator responsibilities.

Work:

1. Keep root and subsystem `AGENTS.md` files current.
2. Require explain-before-edit for parser, evidence, violation, packet, regulation, schema, admin truth-layer, and deployment changes.
3. Avoid `git add -A` when unrelated working-tree changes exist.
4. Add a safer selective publish path or require Codex to list staged files before commit.
5. Keep a checkpoint commit before high-risk Codex work.
6. Review whether the standard `commit-push` command is too broad for mixed working trees.

Exit criteria:

1. Every Codex task reports changed files, risk boundaries, tests run, and remaining risk.
2. Release commits do not include unrelated changes.
3. The Golden Path and required regression checks stay green before promotion.

---

## Phase 1: Deterministic Extraction Coverage

Goal: improve supported credit-report layouts without loosening parser behavior.

Status: Complete for current known fixtures; ongoing for new observed layouts.

Work:

1. Add anonymized fixtures for newly observed TransUnion disclosure variations.
2. Add anonymized fixtures for newly observed Equifax account-section and collection-section variations.
3. Add exported portal PDF text-order fixtures when observed.
4. Add older and regional bureau layout fixtures when observed.
5. Keep bureau-specific template/rule logic isolated from generic parsing.
6. Preserve collection-account parsing differences between TransUnion and Equifax.

Exit criteria:

1. DOB, address, TransUnion case ID, bureau metadata, tradelines, dates, balances, and account status survive parser-test and ingest paths.
2. Replay hashes stay stable for identical inputs.
3. False-positive tradeline creation does not increase.
4. Violation search compatibility remains intact.

---

## Phase 2: Deterministic OCR Acceptance

Goal: support scanned or image-heavy PDFs without allowing AI-derived authoritative extraction.

Status: Code readiness, Docker runtime dependency installation, controlled Stage Lab scanned-PDF rejection handling, and a real scanned-PDF staging smoke test are complete. The app image now includes `apt-utils` before OCR/PDF package installation to remove package-install warning noise; `poppler-utils`, `tesseract-ocr`, and `tesseract-ocr-eng` remain installed. Phase 2 remains fail-closed and deterministic; `apt-utils` is not OCR and broad scanned-PDF acceptance is not guaranteed because OCR quality and parser quality can still block canonical use.

Work:

1. Keep operational OCR runtime checks available for localhost, staging, and production app processes: `tesseract`, `pdftoppm`, `CRP_DETERMINISTIC_OCR_ENABLED=true`, and container image dependency checks for `apt-utils`, `poppler-utils`, `tesseract-ocr`, and `tesseract-ocr-eng` when OCR/PDF package installation changes.
2. Keep Stage Lab side-effect free for scanned-PDF diagnostics.
3. Keep OCR fail-closed. Low-quality OCR or low-quality parser output must not become canonical data.
4. Keep Stage Lab scanned-PDF controlled-error regression coverage green as OCR paths evolve.
5. Consider `tesseract-ocr-fra` later only if French-language Canadian reports become in-scope.

Exit criteria:

1. OCR-derived canonical fields include source method, page, snippet, confidence/provenance, and replay metadata.
2. Image-only PDFs fail explicitly when deterministic OCR is unavailable or low-quality.
3. AI OCR cannot become canonical.
4. Stage Lab reports scanned-PDF OCR failure as a safe diagnostic response, not an app crash.
5. The running staging and production containers prove OCR binary availability.
6. Stage Lab scanned-PDF smoke inputs remain side-effect free; no report artifact, canonical, violation, evidence, or packet rows are created by Stage Lab.

---

## Phase 3: Evidence Model Hardening

Goal: make every user-visible issue defensible and traceable.

Status: Started. No-schema evidence-location sidecar exists, violation and packet evidence metadata are enriched where deterministically resolvable, OCR TSV bounding boxes are supported for OCR-derived evidence, native PDF/pdfjs sidecar bounding boxes are supported for native PDF evidence when safely matched, and synthetic edge-case coordinate coverage has been expanded. Complex real-world layouts still need anonymized fixture coverage as they are observed.

Work:

1. Expand field evidence coverage for required identity, report, and tradeline fields.
2. Broaden page-aware evidence by using deterministic `evidenceLocationIndex` metadata where PDF/OCR extraction provides reliable page boundaries.
3. Maintain additive violation evidence-link metadata from `evidenceLocationIndex` without changing violation rules or search behavior.
4. Maintain additive packet evidence-reference metadata from `evidenceLocationIndex` without changing readiness or packet wording.
5. Maintain OCR TSV bounding-box evidence only where extraction tooling supplies authoritative deterministic coordinates and matching remains deterministic, unambiguous, confidence-safe, and non-sensitive.
6. Maintain native PDF/pdfjs bounding-box evidence only where sidecar extraction supplies deterministic `pt` coordinates and matching remains deterministic, unambiguous, and non-sensitive while `pdf-parse` remains parser truth.
7. Keep expanding anonymized fixture coverage for complex real-world multi-column, repeated-value, rotated, scaled, and unusual PDF coordinate layouts as they are observed.
8. Add regression checks for evidence link presence on every final issue.
9. Store evidence provenance without exposing unnecessary consumer data.
10. Ensure OCR evidence carries method, page, confidence, and snippet details.

Exit criteria:

1. Each final issue has a rule ID, factual trigger, regulation/reference mapping, source fields, and evidence link.
2. Evidence IDs survive parser-test, ingest, violation detection, packet generation, and PDF output.
3. Existing violation search fields and filters remain backward-compatible.
4. Packet claims can point to evidence without relying on raw AI interpretation.

---

## Phase 4: Violation Rule Defensibility

Goal: improve issue quality without inventing legal conclusions.

Status: Started. Metadata-only defensibility hardening exists for final violation outputs; rule IDs, factual triggers, source fields, evidence links, neutral explanations, and packet eligibility summaries are now more consistently represented. Reference defensibility now also has a read-only static-vs-DB reconciliation layer for drift detection.

Work:

1. Review deterministic violation rules against current regulation/reference mappings.
2. Separate factual triggers from legal/regulatory references.
3. Add rule-level tests for creditor, bureau, collector, tradeline, evidence, and review-status search paths.
4. Strengthen neutral wording for user-facing explanations.
5. Ensure consumer-facing language says an item may require review under a reference unless reviewed authority classification supports stronger wording.
6. Preserve search by issue type, regulation/reference, consumer/report ID, tradeline, creditor, collection agency, evidence link, review status, and date.

Exit criteria:

1. No issue fires without a deterministic factual trigger.
2. No consumer-facing surface states unsupported legal conclusions.
3. Regulation/reference mappings are traceable and testable.
4. Search behavior remains stable.

---

## Phase 5: Admin Truth Loop

Goal: turn admin corrections into future deterministic behavior.

Status: Started. Replay safety has been tightened so training-note/manual-only corrections do not replay into future deterministic violation truth, direct status finalization cannot bypass finalize validation, and first-slice endpoint/API coverage now pins create, evidence attachment safety, update/finalize boundaries, audit expectations, and non-admin denial for the admin correction path. Admin correction candidate classification and formal rule promotion remain future work.

Work:

1. Convert accepted parser corrections into candidate aliases, mappings, templates, parser extraction rules, or validation rules.
2. Convert issue/violation corrections into rule updates, exception rules, regulation/reference mappings, or regression fixtures.
3. Require validation before any promoted rule activates.
4. Track promoted, blocked, pending, and rejected rule candidates.
5. Add audit logs for promotion decisions.
6. Prevent admin corrections from silently changing canonical truth without a replayable rule or reviewed override record.

Exit criteria:

1. Admin corrections are replayable and auditable.
2. A correction can explain what future deterministic behavior changed.
3. Rule activation cannot silently break parser, evidence, violation, or packet regression tests.
4. Human review is required before a promoted rule becomes active truth.

---

## Phase 6: User Action Reliability

Goal: connect extracted facts and detected issues to simple, useful user actions.

Status: Packet generation is active and readiness-gated. Originating-finding preselection is implemented in the central packet dialog, endpoint-backed packet lifecycle coverage now exists for readiness, preview/build, create, PDF download, and non-owner PDF denial, packet-to-finding tracking is implemented at a minimal relational level through `dispute_packet_findings`, and staging has smoke-tested lazy table creation/use plus packet create join-row writes.

Work:

1. Ensure dispute packets pull canonical fields and evidence links, not legacy parser artifacts.
2. Keep packet scope limited to Credit Bureau packets and Collection Agency packets.
3. Do not create direct Furnisher packet flows.
4. Include bureau-specific reference details such as TransUnion case ID where available.
5. Confirm dollar fields render consistently in UI, letters, saved outputs, evidence, and PDFs.
6. Add tests for packet generation from deterministic issue evidence.
7. Keep packet-dialog preselection covered so originating findings remain selected only when the existing eligible recommendation list says they are packet-ready.
8. Keep endpoint-backed packet lifecycle coverage green for readiness -> preview/build -> create -> PDF download -> non-owner denial.
9. Keep final packet creation blocked for missing evidence, manual review, dismissed findings, parser uncertainty, wrong owner, wrong bureau, and unsafe multi-issue selections.
10. Maintain minimal packet-to-finding relational rows while keeping stored packet content as the PDF source of truth.
11. Do not add admin override until evidence gates, endpoint lifecycle tests, and packet-to-finding tracking are stronger.
12. Consider broader outcome tracking later, after rule defensibility and admin truth-loop hardening.
13. Keep `dispute_packet_findings` evidence snapshots compact and derived from deterministic evidence metadata; do not use them as a replacement for source report artifacts or packet content.

Exit criteria:

1. A generated packet is traceable back to canonical fields and issue evidence.
2. A user can understand why an item is or is not packet-ready.
3. Clicking Create Packet from a finding continues to open the central packet dialog with the originating finding preselected when eligible, while ineligible findings show readiness blockers.
4. Endpoint-backed packet lifecycle tests prove packet-ready findings can validate, preview/build, create, persist `creditorObligationTestId`, download PDF, and deny non-owner PDF access.
5. Existing packet and outcome flows continue to work.
6. Multi-issue packet behavior remains constrained and auditable.
7. Packet-to-finding rows remain additive and old packets without rows remain readable.

---

## Phase 7: Outcome Tracking

Goal: close the loop after disputes, bureau responses, or collection-agency responses.

Status: Started. Deterministic outcome comparison, persisted outcome runs/finding outcomes, compare/list/get endpoints, the outcome admin-review endpoint, the admin Outcome Reviews UI, the response-document capture backend, append-only deterministic response-processing events, append-only response admin-review events, response-processing metrics, the admin Response Documents list/detail/processing UI, a bounded consumer response timeline, the response-document admin-review backend endpoint, and the response-document admin-review UI controls now exist. Authenticated staging smoke has passed for outcome tracking, outcome admin-review, admin Outcome Reviews UI, response-document capture in both admin and user-owned contexts, admin Response Documents UI, response-document admin-review backend, and response-document admin-review UI. The staging deploy workflow now runs a scope-gated autonomous seeded/authenticated response auth smoke chain after deploy and health checks for runtime/app/workflow/Docker/backend/UI/script changes, covering response capture/list/get, response UI, response admin-review backend, and response admin-review UI with one synthetic marker; docs/readiness/operator-dashboard-only changes intentionally skip the full suite, and unknown changed-file scope runs it fail-closed. Response processing remains intake-only and intentionally conservative: negated, contradictory, low-signal, metadata-only, and OCR-damaged response language stays in manual review; later deterministic report comparison is still required for corrected/removed/unchanged source-truth outcomes. Full response capture UI, inbox integration, historical backfill/replay tooling, production-scale repeated smoke coverage, external alert delivery, queue/backpressure workers, and broader hostile-response fixtures remain future work.

Work:

1. Compare later uploads against earlier canonical snapshots.
2. Detect changed, deleted, reinserted, or unchanged tradelines.
3. Link changes to dispute activity, packet delivery, and response deadlines.
4. Preserve silent-correction and stale-reporting guard behavior.
5. Show users plain-language outcome summaries.
6. Keep outcome summaries deterministic and evidence-linked.
7. Account for the operational observation that Equifax Canada commonly or typically may respond by email, while avoiding absolute channel assumptions, when designing dispute-packet response intake, evidence capture, and outcome tracking.
8. Support email-based bureau response capture as response evidence and `response_received` metadata only; email responses must remain separate from canonical credit-report facts, and corrected, removed, or unchanged outcomes still require deterministic later-report comparison.
9. Add admin/user response capture surfaces, admin response review, and monitoring only after the metadata-only backend and read-only admin visibility boundaries remain stable.

Exit criteria:

1. Users can see what changed after they acted.
2. Outcome summaries use deterministic snapshot comparisons.
3. The platform can distinguish corrected, removed, unchanged, reinserted, and newly created issues.
4. Outcome tracking does not depend on AI interpretation.

---

## Phase 8: Operational Regression Dashboard

Goal: make stability visible before deployment.

Status: Golden Path exists, packet lifecycle endpoint coverage has been added, first-slice admin correction/truth-loop endpoint coverage has been added, violation search/status endpoint coverage has been added, report ingest lifecycle endpoint coverage has been added, evidence privacy/ownership endpoint coverage has been added, auth/session/logout lifecycle endpoint coverage has been added, admin audit-log filtering/sanitization endpoint coverage has been added, packet delivery/status/send endpoint coverage has been added, no-schema outcome comparison helper coverage has been added, persisted backend outcome compare/list/get endpoint coverage has been added, outcome admin-review endpoint coverage has been added, admin outcome review UI unit coverage has been added, response-document capture/processing/metrics endpoint coverage has been added, response classification engine coverage has been added, response-document admin-review endpoint coverage has been added, admin Response Documents UI unit coverage now includes processing visibility, metrics, and metadata-only admin-review controls, authenticated persisted outcome tracking staging smoke has passed for a synthetic response-only outcome, authenticated outcome admin-review staging smoke has passed for a synthetic existing outcome run, authenticated Outcome Reviews UI staging smoke has passed for a synthetic existing outcome run, authenticated response-document capture staging smoke has passed for both admin and user-owned contexts, authenticated admin Response Documents UI smoke has passed for an existing synthetic response, authenticated response-document admin-review backend smoke has passed for an existing synthetic response, and authenticated response-document admin-review UI smoke has passed for a synthetic response review action. The staging deploy workflow now includes scope-gated autonomous seeded response auth smokes after deploy and health checks; runtime/app/workflow/Docker/backend/UI/script changes run the full suite for response capture/list/get, response UI, response admin-review backend, and response admin-review UI; docs/readiness/operator-dashboard-only changes skip the full suite by design; unknown changed-file scope runs it fail-closed; synthetic admin bootstrap and neutralization remain part of the gate; and no secrets are printed. This is a deploy-time safety gate, not full production-scale monitoring. `pnpm run readiness:production` now provides a production-readiness gate over source-of-truth, local regressions, latest staging deploy status, staging health, and protected unauthenticated endpoint boundaries, `pnpm run production:readiness` now provides an operator-readable local release report and points operators to the formal checklist at `docs/production-readiness-checklist.md`, `pnpm run operator:dashboard` now provides an operator-readable regression dashboard that distinguishes local logical checks, endpoint/API lifecycle checks, manual/gated smoke checks, operational notes, and known coverage gaps, `pnpm run baseline:staging-scale` now provides a bounded staging scale-baseline harness for public shell, login, auth/session denial, invalid upload-contract rejection, and selected admin/regulation denial endpoints, `pnpm run check:staging-backup-restore` now verifies the non-destructive staging backup/restore drill checklist and local-only restore guardrails, `pnpm run check:staging-observability` now validates container health plus bounded log alert categories, and `pnpm run smoke:auth-workflow` now provides a gated authenticated synthetic user workflow smoke from login through upload, finding review, packet readiness/build/create, PDF download, and account cleanup. Full response capture UI, inbox integration, historical backfill/replay tooling, non-owner outcome smoke coverage, production-scale repeated smoke coverage, broader production-scale workflow coverage, admin correction candidate classification, formal rule/version approval, backup/restore verification, external alert delivery, queue/backpressure proof, and repeated authenticated staging runs remain ongoing.

Work:

1. Summarize parser fixture coverage, replay status, evidence coverage, violation-search preservation, packet readiness, and PDF generation.
2. Add a local/staging regression report that can be run before promotion.
3. Track unsupported layouts and known risks.
4. Include packet lifecycle endpoint coverage in operational release checks.
5. Keep Stage Lab scanned-PDF controlled-error regression coverage visible in release checks.
6. Keep endpoint-backed coverage green for packet lifecycle, admin correction, violation search/status, report ingest lifecycle, evidence privacy/ownership, auth/session/logout lifecycle, admin audit-log filtering/sanitization, packet delivery/status/send, persisted outcome compare/list/get, outcome admin-review, response-document capture, and response-document admin-review paths, and keep no-schema outcome comparison helper coverage green.
7. Show pass/fail output that a non-developer operator can read before approving deployment.

Exit criteria:

1. A release can show parser pass/fail, replay pass/fail, evidence coverage, packet-readiness pass/fail, and violation-search compatibility in one place.
2. Unsupported layouts are explicit rather than hidden.
3. Endpoint lifecycle tests exist for critical user actions.
4. The dashboard distinguishes helper-level logical tests from real endpoint/API tests.

---

## Phase 9: Regulation and Reference Governance

Goal: keep legal/regulatory references controlled, current, and non-hallucinated.

Status: Started. Read-only static-vs-DB reconciliation exists, inert reconciliation candidates can be persisted, a review-only Reconciliation Candidates UI exists and has passed authenticated staging smoke, a shadow bridge diagnostic endpoint exists, regulation runtime bridge mapping governance storage/endpoints exist and have passed authenticated staging smoke, a review-only Runtime Bridge Mappings UI exists and has passed authenticated staging smoke, an advisory helper exists as a pure/internal computation layer, an admin-only read-only advisory diagnostic endpoint exists, and authenticated advisory diagnostic endpoint smoke has passed. Advisory output is admin/internal only, and runtime activation remains deferred.

Work:

1. Create or formalize a regulation/reference registry if not already sufficient.
2. Support admin-triggered update checks.
3. Support optional scheduled scans that create a review queue only.
4. Do not activate new or modified references without admin approval.
5. Store source URL, jurisdiction, effective date, version, category, summary, citation format, and approval status.
6. Map references to deterministic issue rules and packet language.
7. Preserve old versions and rollback history.
8. Separate regulatory references from legal conclusions in consumer-facing copy.

Exit criteria:

1. No law or regulation is silently invented, modified, or activated.
2. Each reference has an authoritative source and version history.
3. Each active mapping is approved and auditable.
4. Packet and issue wording can cite references without overstating conclusions.

---

## Phase 10: Dedicated Document Type Expansion

Goal: add support for creditor statements and collection letters without weakening credit-report parsing.

Status: Future work.

Work:

1. Create deterministic rule packs for creditor statements.
2. Create deterministic rule packs for collection letters.
3. Keep these inputs separate from bureau credit-report parsing.
4. Add document-type detection before extraction.
5. Require separate fixtures and regression tests.
6. Do not allow creditor-statement or collection-letter parsing to overwrite credit-report canonical facts without explicit comparison rules.

Exit criteria:

1. Creditor statements and collection letters have separate deterministic extraction paths.
2. Extracted document facts are evidence-linked.
3. Credit-report canonical facts remain protected from unrelated document parser behavior.
4. Unsupported document layouts fail clearly.

---

## Current Known Risks

1. Page-aware evidence metadata is linked into violation and packet references where deterministically resolvable, but broader field coverage is not complete.
2. Native PDF bounding boxes are optional and omitted on ambiguity, no match, sensitive overexposure, missing or ambiguous page data, or unusual layout uncertainty. Synthetic coverage now exercises these omissions, but complex real-world PDF layouts remain a risk.
3. OCR bounding boxes are optional and omitted on ambiguity, low confidence, sensitive overexposure, or missing page data. Synthetic coverage now exercises these omissions, but scanned-PDF OCR quality and layout variation remain risks.
4. `pdfjs-dist` item ordering can differ from `pdf-parse` text ordering on complex PDFs, so parser truth remains `pdf-parse`.
5. No backfill exists for older persisted violations or packets created before evidence-location metadata was linked.
6. Ambiguous field-name matches intentionally omit evidence-location metadata.
7. Golden Path protects the logical chain, packet lifecycle endpoint coverage protects one critical packet API path, first-slice admin correction endpoint coverage protects core create/update/evidence/finalize boundaries, violation search/status endpoint coverage protects ownership, filters/status, dismiss/delete contract behavior, packet-readiness consistency, privacy expectations, and non-owner denial, report ingest lifecycle endpoint coverage protects upload/auth, ownership, process/failure behavior, list/detail, Stage Lab separation, and privacy expectations, evidence privacy/ownership endpoint coverage protects direct evidence event scoping, attachment metadata/package paths, compact evidenceLocation exposure, no-overexposure expectations, and runtime-safety boundaries, auth/session/logout lifecycle endpoint coverage protects login/session/logout contracts, role boundaries, admin guard samples, client role-escalation denial, and secret/no-overexposure expectations, admin audit-log endpoint coverage protects admin-only access, filters/pagination, safe audit summaries, no-overexposure expectations, and runtime-safety boundaries, packet delivery/status endpoint coverage protects ownership, status/send/delivery contracts, provider mocking, audit/evidence expectations, duplicate-send blocking, stale attachment safety, no-overexposure expectations, and runtime-safety boundaries, and persisted outcome endpoint coverage protects backend compare/list/get ownership, deterministic classifications, derived summaries, privacy-safe snapshots, and source-record immutability. Broader production-scale workflow coverage remains ongoing.
8. Packet-to-finding relational rows exist, staging smoke testing verifies lazy schema use, packet create join-row writes, and deterministic evidence-location snapshot hydration, and production schema readiness has been verified; persisted outcome tables now exist for backend comparison history, authenticated staging smoke has verified synthetic response-only compare/list/get behavior, append-only outcome row creation, source-record immutability, privacy checks, DB-registry non-runtime posture, and static runtime mapping truth, authenticated outcome admin-review staging smoke now verifies admin-only metadata review with sanitized audit, deterministic/source preservation, required-note/confirmation validation, unsupported override-action rejection, and append-only review metadata, and authenticated Outcome Reviews UI staging smoke now verifies the admin-only UI, list/detail flow, safety and preservation notices, metadata-only review action, unsupported override-control absence, deterministic field preservation, no source mutation, and privacy/no-overexposure boundaries. Response-document capture now writes immutable response rows plus append-only deterministic processing events, authenticated admin plus user-owned staging smoke has verified response capture/list/get, outcome linkage, no packet readiness/wording mutation, no source mutation, and privacy/no-overexposure boundaries, authenticated Response Documents UI smoke verifies the admin-only list/detail/processing surface and admin-review controls, and local coverage now verifies deterministic classification, metrics, provenance, confidence gates, manual-review escalation, and no source-truth mutation. The staging deploy workflow now runs a scope-gated autonomous seeded response auth smoke suite after deploy and health checks; deploy run `26071304563` passed response capture/list/get, response UI, response admin-review backend, and response admin-review UI smokes with one synthetic marker and verified synthetic admin neutralization, deploy run `26072456855` passed after the `apt-utils` image update with the apt warning absent, and deploy run `26079647117` passed after the scope-gate workflow change with the full suite correctly run because workflow files changed. Docs/readiness/operator-dashboard-only commits intentionally skip the full suite, while unknown changed-file scope runs it fail-closed. Full response capture UI, inbox integration, historical backfill/replay tooling, production-scale repeated smoke, external alert delivery, queue/backpressure workers, and retention/delete behavior remain future work. Bureau response channels may differ by bureau and over time; Equifax Canada responses may arrive by email, so response-channel assumptions should remain configurable or reviewable, and email response metadata/documents must not be treated as canonical report facts.
9. Old packets are not backfilled into `dispute_packet_findings` and must remain readable through legacy packet content.
10. No admin override path exists. This should remain true until readiness gates and auditability are stronger.
11. Production lazy DDL-helper permission for `dispute_packet_findings` has been verified for the current deployment, but schema-helper behavior should be rechecked after future helper or DB-role changes.
12. Scanned PDFs can still fail if OCR output or parser quality is low. That is correct fail-closed behavior, but the user-facing diagnostic must remain clear.
13. Localhost, staging, and production should still be rechecked after future deployments because host-level OCR tools are not enough when the app runs in Docker.
14. Internal dev plans and notes have been moved out of the publicly served static tree; archived historical notes may still mention old `static/__dev` paths and should be treated as historical references, not active runtime paths.
15. Dedicated creditor-statement and collection-letter parsers are not yet ready for broad use.
16. Runtime static regulation/reference mappings and the DB governance registry remain split by design; the DB registry remains non-runtime governance metadata, not active runtime truth.
17. Static runtime mappings remain active runtime truth.
18. Non-admin Reconciliation Candidates UI smoke remains limited/skipped unless a safe non-admin context is configured.
19. Non-admin runtime bridge mapping smoke remains limited/skipped unless a safe non-admin context is configured.
20. Non-admin Runtime Bridge Mappings UI smoke remains limited/skipped unless a safe non-admin context is configured.
21. Candidate-specific audit-history display may still require a future endpoint.
22. A shadow bridge diagnostics endpoint exists for approved DB alternatives, but it is report-only and no runtime bridge activation exists.
23. `regulation_runtime_bridge_mapping` exists as governance storage for future bridge mappings, but no runtime selector exists and bridge mappings do not activate anything.
24. Advisory bridge metadata exists through pure/internal helper output and an admin-only read-only diagnostic endpoint, and must not be confused with runtime truth or consumer-facing reference wording.
25. Non-admin advisory diagnostic endpoint smoke remains limited/skipped unless a safe non-admin context is configured.
26. Non-owner outcome smoke remains limited/skipped unless a safe non-owner context is configured.
27. Service/API paths reject `active_limited_runtime`; direct SQL access must remain controlled because future statuses are reserved at the table level while service/API paths reject runtime activation.
28. No limited-runtime bridge activation exists yet.
29. No approved DB runtime bridge activation exists yet.
30. No formal runtime reference activation, rollback, version approval, or runtime bridge approval workflow exists yet.
31. No admin override path exists for regulation/reference activation.
32. No formal rule registry, rule-version approval workflow, or rollback workflow exists yet.
33. Manual-only correction replay exclusion is now covered at helper and endpoint-boundary levels, but manual-only correction classification still needs a real candidate model before broader truth-loop promotion.
34. Evidence IDs are not universal across all detector paths, even though evidence links and evidence-location metadata are improving.
35. Creditor-validation status/delete audit gaps remain.
36. Admin corrections need deeper controlled promotion into future deterministic rules.
37. Additional unseen older/regional bureau layouts should still be converted into anonymized fixtures when observed.
38. French OCR support is not installed unless added later as a specific requirement.
39. The production readiness gate verifies regression, staging deploy, and key unauthenticated boundary checks; the operator readiness report summarizes local release state and required checks; the operator regression dashboard separates helper-level logical checks, endpoint/API checks, manual/gated smoke checks, and known coverage gaps; the staging scale-baseline harness verifies a small bounded synthetic request baseline; the backup/restore checklist gate verifies drill guardrails; the observability gate validates container health and bounded log alert categories; the authenticated workflow smoke exercises one synthetic user path when explicitly gated; authenticated outcome tracking smoke has verified one synthetic response-only persisted outcome path; authenticated outcome admin-review smoke has verified one synthetic metadata-only review path; authenticated admin Outcome Reviews UI smoke has verified one synthetic admin-only UI path; authenticated response-document capture smoke has verified response capture in both admin and user-owned contexts; authenticated admin Response Documents UI smoke has verified the admin response UI path; authenticated response-document admin-review backend smoke has verified one metadata-only admin review path; authenticated response-document admin-review UI smoke has verified one metadata-only UI review action; response-document capture endpoint coverage now verifies immutable capture, append-only deterministic processing, metrics, and source-truth boundaries locally; response classification unit coverage verifies confidence gates and manual-review states; admin Response Documents UI unit coverage verifies list/detail, processing visibility, metrics, and metadata-only admin-review controls locally; and the staging deploy workflow now runs scope-gated autonomous seeded/authenticated response auth smokes after deploy and health checks. Runtime/app/workflow/Docker/backend/UI/script changes run the suite, docs/readiness/operator-dashboard-only changes skip the full suite by design, and unknown changed-file scope runs the suite fail-closed. These are not substitutes for sustained load testing, external alert delivery checks, a human-observed restore drill, full response capture UI, inbox integration, full consumer-facing outcome automation, non-owner outcome smoke, admin correction candidate classification, formal rule/version approval, production-scale workflow coverage, queue/backpressure proof, or production monitoring. No admin override exists, the DB registry remains non-runtime governance metadata, and static runtime mappings remain active runtime truth.

---

## Next Recommended Work Order

1. Keep the scope-gated autonomous post-deploy response auth smoke stable, verify docs/readiness/operator-dashboard-only skips remain intentional, and consider monitoring/alerting design for failures before broadening response workflow scope.
2. Design the response capture UI only if user/admin capture entry becomes priority; keep response documents evidence/metadata only, keep later deterministic report comparison required for corrected/removed/unchanged, and do not treat email response as proof of correction.
3. Keep the deterministic response-processing boundary intake-only until capture/review workflow and automated smoke remain stable; do not add inbox integration, change packet readiness or wording, or add an admin override.
4. Design the consumer-facing outcome/response display only with neutral wording, deterministic/evidence-linked boundaries, and no legal-conclusive language.
5. Design historical backfill strategy and outcome monitoring/alerting before broader production-scale outcome usage.
6. Add external alert-delivery validation for container health, HTTP 5xx spikes, parser/OCR failures, packet generation failures, outcome workflow failures, and background job/log error spikes if alerting infrastructure is available.
7. Continue staging-scale baseline runs before release candidates and keep results attached to release notes.
8. Run and record a human-observed staging restore drill into a local-only database using the existing refresh script before any broad production-scale launch.
9. Consider design-only admin UI advisory diagnostics only if operationally useful after the authenticated advisory diagnostic endpoint smoke pass.
10. Do not add a runtime selector yet.
11. Keep the DB regulation registry non-runtime until advisory or limited-runtime bridge rules, tests, rollback, and approval are implemented.
12. Keep packet wording and packet readiness unchanged as part of regulation/reference reconciliation and outcome tracking.
13. Do not add an admin override path.
14. Continue broader Phase 4/5 hardening only through bounded, reviewed tasks.
15. Continue avoiding admin override paths in other areas; no admin path should bypass evidence, ownership, sensitivity, or packet-type restrictions.
16. Design a controlled admin correction candidate classification model for parser-rule, alias/synonym, validation-rule, violation-rule, regulation/reference mapping, exception-rule, packet-template, evidence-correction, rejected, and manual-note outcomes.
17. Convert observed complex coordinate sidecar layouts into anonymized fixtures, especially unusual native PDF text ordering and scanned-PDF OCR cases that synthetic fixtures cannot fully represent.
18. Keep future internal dev plans and notes out of publicly served static assets.
19. Recheck production `dispute_packet_findings` schema-helper behavior after future helper or production DB-role changes.
20. Add or extend Stage Lab scanned-PDF controlled-error regression coverage only if future OCR-path changes reveal coverage gaps.
