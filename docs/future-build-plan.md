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

Updated May 14, 2026.

### Implemented

1. Phase 1 deterministic extraction coverage has been expanded with 11 anonymized synthetic fixtures covering major TransUnion and Equifax layout families.
2. `pnpm run test:deterministic-ingestion-report` now protects exact tradeline counts, bureau metadata, report dates, TransUnion case IDs where present, DOB/address expectations where present, date/money fields, evidence coverage, replay-hash stability, and violation-search compatibility.
3. Parser-test and canonical-ingest coverage now include multiple layout families while keeping bureau-specific collection parsing isolated from generic report parsing.
4. Deterministic OCR code readiness exists with a fail-closed Tesseract/Poppler provider, OCR provenance, page confidence diagnostics, deterministic validation, scanned-PDF failure fixtures, and OCR-derived success fixtures.
5. Docker runtime dependencies for deterministic OCR are now installed in the app image: `poppler-utils`, `tesseract-ocr`, and `tesseract-ocr-eng`.
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

### Remaining High-Priority Work

1. Continue Phase 3 evidence hardening by broadening page-aware field coverage and converting observed complex real-world coordinate layouts into anonymized fixtures.
2. Add dedicated deterministic rule packs for creditor statements and collection letters.
3. Deepen admin-correction promotion into future parser, validation, violation, exception, and regression rules.
4. Continue Phase 4 rule defensibility, Phase 5 admin truth-loop hardening, and Phase 9 regulation/reference governance before adding broader packet outcome tracking.
5. Review whether `static/__dev/system-prompt.md` belongs under a publicly served static path.

---

## Phase 0: Governance and Release Safety

Goal: keep Codex and human changes bounded, reviewable, and regression-safe.

Status: Mostly complete.

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

Status: Code readiness, Docker runtime dependency installation, controlled Stage Lab scanned-PDF rejection handling, and a real scanned-PDF staging smoke test are complete. Phase 2 remains fail-closed and deterministic; broad scanned-PDF acceptance is not guaranteed because OCR quality and parser quality can still block canonical use.

Work:

1. Keep operational OCR runtime checks available for localhost, staging, and production app processes: `tesseract`, `pdftoppm`, and `CRP_DETERMINISTIC_OCR_ENABLED=true`.
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

Status: Started. Replay safety has been tightened so training-note/manual-only corrections do not replay into future deterministic violation truth, and direct status finalization cannot bypass finalize validation.

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

Status: Future work.

Work:

1. Compare later uploads against earlier canonical snapshots.
2. Detect changed, deleted, reinserted, or unchanged tradelines.
3. Link changes to dispute activity, packet delivery, and response deadlines.
4. Preserve silent-correction and stale-reporting guard behavior.
5. Show users plain-language outcome summaries.
6. Keep outcome summaries deterministic and evidence-linked.

Exit criteria:

1. Users can see what changed after they acted.
2. Outcome summaries use deterministic snapshot comparisons.
3. The platform can distinguish corrected, removed, unchanged, reinserted, and newly created issues.
4. Outcome tracking does not depend on AI interpretation.

---

## Phase 8: Operational Regression Dashboard

Goal: make stability visible before deployment.

Status: Golden Path exists and packet lifecycle endpoint coverage has been added. Broader endpoint-level release confidence and operator-readable dashboarding remain ongoing.

Work:

1. Summarize parser fixture coverage, replay status, evidence coverage, violation-search preservation, packet readiness, and PDF generation.
2. Add a local/staging regression report that can be run before promotion.
3. Track unsupported layouts and known risks.
4. Include packet lifecycle endpoint coverage in operational release checks.
5. Keep Stage Lab scanned-PDF controlled-error regression coverage visible in release checks.
6. Add endpoint-backed coverage for other critical user actions beyond packet lifecycle.
7. Show pass/fail output that a non-developer operator can read before approving deployment.

Exit criteria:

1. A release can show parser pass/fail, replay pass/fail, evidence coverage, packet-readiness pass/fail, and violation-search compatibility in one place.
2. Unsupported layouts are explicit rather than hidden.
3. Endpoint lifecycle tests exist for critical user actions.
4. The dashboard distinguishes helper-level logical tests from real endpoint/API tests.

---

## Phase 9: Regulation and Reference Governance

Goal: keep legal/regulatory references controlled, current, and non-hallucinated.

Status: Started. Read-only static-vs-DB reconciliation exists, inert reconciliation candidates can be persisted, a review-only admin UI exists, authenticated staging smoke has passed, a gated smoke harness exists, and a shadow bridge diagnostic endpoint exists. Runtime activation remains deferred.

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
7. Golden Path protects the logical chain, and packet lifecycle endpoint coverage now protects one critical API path. Additional endpoint-backed tests may still be needed for other critical user flows.
8. Packet-to-finding relational rows exist, staging smoke testing verifies lazy schema use, packet create join-row writes, and deterministic evidence-location snapshot hydration, and production schema readiness has been verified; broader outcome tracking and retention/delete behavior should still be monitored.
9. Old packets are not backfilled into `dispute_packet_findings` and must remain readable through legacy packet content.
10. No admin override path exists. This should remain true until readiness gates and auditability are stronger.
11. Production lazy DDL-helper permission for `dispute_packet_findings` has been verified for the current deployment, but schema-helper behavior should be rechecked after future helper or DB-role changes.
12. Scanned PDFs can still fail if OCR output or parser quality is low. That is correct fail-closed behavior, but the user-facing diagnostic must remain clear.
13. Localhost, staging, and production should still be rechecked after future deployments because host-level OCR tools are not enough when the app runs in Docker.
14. `static/__dev/system-prompt.md` may be publicly accessible depending on hosting behavior.
15. Dedicated creditor-statement and collection-letter parsers are not yet ready for broad use.
16. Runtime static regulation/reference mappings and the DB governance registry remain split by design; the DB registry remains non-runtime governance metadata, not active runtime truth.
17. Static runtime mappings remain active runtime truth.
18. Non-admin Reconciliation Candidates UI smoke remains limited/skipped unless a safe non-admin context is configured.
19. Candidate-specific audit-history display may still require a future endpoint.
20. A shadow bridge diagnostics endpoint exists for approved DB alternatives, but it is report-only and no runtime bridge activation exists.
21. No limited-runtime bridge activation exists yet.
22. No approved DB runtime bridge activation exists yet.
23. Formal runtime reference activation, rollback, and version approval remain future work.
24. No admin override path exists for regulation/reference activation.
25. No formal rule registry, rule-version approval workflow, or rollback workflow exists yet.
26. Manual-only correction classification still needs a real candidate model before broader truth-loop promotion.
27. Evidence IDs are not universal across all detector paths, even though evidence links and evidence-location metadata are improving.
28. Creditor-validation status/delete audit gaps remain.
29. Admin corrections need deeper controlled promotion into future deterministic rules.
30. Additional unseen older/regional bureau layouts should still be converted into anonymized fixtures when observed.
31. French OCR support is not installed unless added later as a specific requirement.

---

## Next Recommended Work Order

1. Run a design-only limited-runtime bridge activation rules pass only after shadow diagnostics and governance controls remain stable.
2. Keep the DB regulation registry non-runtime until bridge activation rules, tests, rollback, and approval are implemented.
3. Keep packet wording and packet readiness unchanged as part of regulation/reference reconciliation.
4. Do not add an admin override path.
5. Continue broader Phase 4/5 hardening only through bounded, reviewed tasks.
6. Continue avoiding admin override paths in other areas; no admin path should bypass evidence, ownership, sensitivity, or packet-type restrictions.
7. Design a controlled admin correction candidate classification model for parser-rule, alias/synonym, validation-rule, violation-rule, regulation/reference mapping, exception-rule, packet-template, evidence-correction, rejected, and manual-note outcomes.
8. Convert observed complex coordinate sidecar layouts into anonymized fixtures, especially unusual native PDF text ordering and scanned-PDF OCR cases that synthetic fixtures cannot fully represent.
9. Consider broader packet outcome tracking later, after rule defensibility and admin truth-loop hardening have stabilized.
10. Review whether `static/__dev/system-prompt.md` belongs under a publicly served static path if unresolved.
11. Recheck production `dispute_packet_findings` schema-helper behavior after future helper or production DB-role changes.
12. Add or extend Stage Lab scanned-PDF controlled-error regression coverage only if future OCR-path changes reveal coverage gaps.
