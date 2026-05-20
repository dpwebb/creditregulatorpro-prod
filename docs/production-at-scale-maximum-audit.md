# Production At Scale Maximum Readiness Audit

Audit date: 2026-05-20

Scope: hostile current-state audit of the CreditRegulatorPro staging repository at the current `HEAD`. This is an audit/report artifact only. It does not implement runtime changes, refactor code, alter schema, change parser behavior, change packet readiness, change response-processing lifecycle behavior, change deployment behavior, or change auth behavior.

## A. Executive Verdict

| Field | Value |
| --- | --- |
| Current branch | `staging` |
| Current commit hash | `6fb3b063622fdaf236b97bb6aac0f9a999b5bd88` |
| Previous baseline requested | `06861e9` |
| Previous baseline comparison | Unavailable locally. `git cat-file -e 06861e9^{commit}` failed, so this audit uses current `HEAD`, recent commit history, and prior blocker categories as comparison evidence. |
| Final readiness classification | Limited beta ready with strict constraints |
| Safe for limited beta? | Conditional yes, only under `docs/limited-beta-operator-launch-policy.md`, bounded operator procedures, and current stop conditions. |
| Safe for broad production? | No. |
| Safe for production at scale? | No. |

Summary: The current repository is materially stronger than the earlier limited-beta posture. Upload limits, route auth classification, response queue protections, durable ingest queueing, a bounded ingest worker, ingest endpoint cutover, report-artifact object-storage references for new uploads, report-artifact metadata-only lists, packet PDF caching/events, bearer-only cron auth, retention apply guards, DB/session tuning, migration inventory, observability metrics, privacy smokes, load-harness scaffolding, restore evidence templates, response ops runbooks, frontend readiness UX, and runtime-size reporting are now present and locally verified. The correct conservative verdict remains **limited beta ready with strict constraints**, not broad production and not production-at-scale ready, because several scale blockers are still evidence or operations gaps: no completed restore drill, dry-run-only load evidence, no production ingest worker activation, cache-miss packet PDFs still render synchronously, destructive ingest cleanup remains, external alert delivery is absent, runtime-size thresholds are non-blocking, and some sensitive/high-growth surfaces remain intentionally compatible but not scale-clean.

### Verification Commands

| Command | Result | Evidence |
| --- | --- | --- |
| `git status --short` | Pass | Clean before audit. |
| `git branch --show-current` | Pass | `staging`. |
| `git rev-parse HEAD` | Pass | `6fb3b063622fdaf236b97bb6aac0f9a999b5bd88`. |
| `git log --oneline -20` | Pass | Recent commits include `6fb3b06 Add staging ingest worker orchestration` through `30fe900 Surface ingest lifecycle remediation`. |
| `git diff --name-status 06861e9..HEAD` | Unavailable | Baseline commit `06861e9` is not present locally. |
| `git diff --stat 06861e9..HEAD` | Unavailable | Same baseline limitation. |
| `pnpm run typecheck` | Pass | TypeScript no-emit succeeded. |
| `pnpm run build` | Pass | Vite build succeeded; main JS asset reported at 3,276.59 kB raw / 899.31 kB gzip in build output. |
| `pnpm run test:contracts` | Pass | 2 files, 11 tests; route auth classification covers 283 endpoint handlers. |
| `pnpm run test:api` | Pass | 34 files, 288 tests. |
| `pnpm run test:golden-path` | Pass | Upload, parse, canonical map, anomaly, violation, evidence bind, packet generate, and PDF download all passed. |
| `pnpm run test:regression-dashboard` | Pass | Human-readable dashboard result PASS. |
| `pnpm run test:deterministic-ingestion-report` | Pass | 11 deterministic fixtures; replay stable; required evidence coverage 100 percent; `violationSearchPreserved: true`. |
| `pnpm run response:soak-check` | Pass | Duplicate collapse, retry backlog, dead-letter, stale-running, replay dry-run, retention preview, drift detection, and synthetic cleanup verified. |
| `pnpm run operator:dashboard` | Pass | Dashboard passed and surfaced open gaps: live mailbox integration, live scheduled daemon operation, physical purge/archive, production backfill, non-owner smoke, repeated production-scale coverage, external alerts, backup/restore verification. |
| `pnpm run check:migrations` | Pass | Non-mutating static migration inventory; no unknown, unledgered, or missing expected schema mutation sources. |
| `pnpm run check:restore-drill-evidence` | Pass | Template validation only; no dump/restore and no completed restore claim. |
| `pnpm run baseline:production-scale-local -- --dry-run` | Pass | Dry-run harness refused production mutation, made zero external provider calls, and passed a bounded concurrency self-check. |
| `pnpm run report:runtime-size` | Pass | Non-blocking report produced current bundle/dependency inventory. |
| `git diff --check` | Pass | No whitespace errors before report write. |

## B. Delta From Previous Audit

| Previous blocker | Current status | Evidence | Files/tests | Remaining risk | Next action |
| --- | --- | --- | --- | --- | --- |
| Unbounded server-side base64 upload contracts | Partially fixed | Shared strict upload validation now covers report, anonymous report, evidence, bureau communication, report artifact, review approve, consumer ID, parser lab/test/admin mock lifecycle. | `helpers/uploadPayloadValidation.ts`; `tests/api/report-ingest-lifecycle-endpoint.spec.ts`; `tests/api/evidence-privacy-endpoint.spec.ts`; `tests/api/consumer-identification-upload-boundary.spec.ts`; `tests/unit/parser-admin-upload-boundary.spec.ts`. | `endpoints/ocr/extract_POST.schema.ts` still has a route-local `bytesBase64` schema; some DB storage surfaces still carry base64 for compatibility. | Finish OCR route inventory and storage-boundary task without changing parser behavior. |
| Synchronous report ingestion/OCR/compliance pipeline | Fixed architecturally, operationally partial | Process endpoint enqueues jobs; worker calls existing deterministic path. | `endpoints/ingest/process_POST.ts:176`; `helpers/ingestProcessingQueueService.ts:912`; `scripts/ingest-processing-worker.ts:255`; API/worker tests in `pnpm run test:api`. | Runtime execution depends on worker operation. Staging has opt-in bounded orchestration; production activation is deferred. | Add production-scoped worker activation only after staging evidence. |
| Raw uploaded report PDFs stored in `reportArtifact.storageUrl` | Fixed for new report uploads, historical risk remains | New report PDFs use object/local storage references and old inline records remain readable. | `helpers/reportArtifactStorage.ts`; `helpers/ingestArtifactCreator.tsx`; `endpoints/review/approve_POST.ts`; `tests/unit/report-artifact-storage.spec.ts`; `tests/api/report-artifact-storage-reference.spec.ts`. | Historical inline records remain in DB; bureau communication attachments still store `fileDataBase64` in `storageUrl`. | Plan non-destructive historical inventory and move bureau communication attachment storage. |
| Synchronous packet PDF generation | Partially fixed | Content-addressed cache and durable render/cache-hit events exist. | `helpers/packetPdfCache.ts:140`; `endpoints/packet/pdf_GET.ts:142`; `endpoints/packet/send-first-class_POST.ts:369`; `endpoints/packet/send-registered_POST.ts:378`; `tests/unit/packet-pdf-cache.spec.ts`. | Cache misses still render synchronously in request/send paths; no render queue. | Add bounded async render queue or prove cache-miss capacity under measured load. |
| Packet/list and report-artifact/list scale bounds | Mostly fixed | Packet and report artifact lists default to 50/max 100; report artifact list omits storage and large parsed data. | `endpoints/packet/list_GET.schema.ts`; `endpoints/report-artifact/list_GET.schema.ts`; `endpoints/report-artifact/list_GET.ts`; API list tests. | Other bounded list routes still include sensitive compatibility fields such as parser raw text and signature data. | Keep list inventory current and move remaining sensitive list fields to get-by-id where safe. |
| Clock scan status mismatch and unbounded scan behavior | Fixed | Clock scan and cron routes are bearer-only; route auth contract rejects query/legacy token fallbacks. | `endpoints/clock/scan_POST.ts`; `tests/api/clock-scan-endpoint.spec.ts`; `tests/contracts/route-auth-classification.spec.ts`. | Scheduled-operation evidence under real cron cadence remains limited. | Add scheduled-job operating evidence after deployment. |
| Production deployment workflow thinner than staging | Partially fixed | Production workflow now includes public and invalid-session denial probes. | `.github/workflows/deploy-production.yml:180`; `scripts/production-readiness-gate.mjs`; `tests/unit/deploy-production-workflow.spec.ts`. | Production still avoids seeded owner-denial smokes and has no production worker activation. | Keep production probes read-only; add staging-only seeded proofs and production worker task later. |
| Fixed DB pool and session write amplification | Fixed in code, evidence partial | Env-driven pool config and session touch throttling exist. | `helpers/runtimeTuningConfig.ts:55`; `helpers/db.tsx:7`; `helpers/getServerUserSession.tsx:104`; unit/API tests passed. | Production sizing and pool pressure evidence remain limited. | Record pool metrics under measured staging load. |
| Mixed migration strategy | Partially fixed | Policy, ledger inventory, and non-mutating checker exist. | `docs/database-migration-policy.md`; `migrations/0000-runtime-schema-inventory.md`; `scripts/check-migrations.mjs`; `pnpm run check:migrations`. | Runtime ensure functions remain and checker is not a hard deploy gate. | Convert inventory to reviewed additive migration convention in a later scoped task. |
| Destructive/best-effort ingest cleanup | Partially fixed | Cleanup attempts/failures now produce lifecycle events. | `helpers/ingestCleanup.tsx:79`; `helpers/ingestCleanup.tsx:158`; `tests/unit/ingest-cleanup-lifecycle.spec.ts`. | Cleanup still deletes artifacts/tradelines on failure. | Replace destructive cleanup with non-destructive failed-state/remediation path or prove containment. |
| Incomplete observability for ingest/PDF/storage/auth/DB | Partially fixed | Sanitized dashboard metrics and thresholds exist. | `helpers/productionObservabilityMetrics.ts`; `scripts/operator-regression-dashboard.ts:331`; `docs/production-observability-metrics.md`. | External alert delivery, production repetition, and release gating remain absent. | Add alert dry-run/accepted exclusion and repeated operating evidence. |
| Incomplete disaster recovery proof | Unchanged in outcome, process added | Runbook, template, and non-mutating validator exist. | `docs/disaster-recovery-restore-drill-runbook.md`; `docs/restore-drill-evidence-template.md`; `pnpm run check:restore-drill-evidence`. | No actual restore drill, no signed evidence, no proven RPO/RTO. | Perform human-observed restore drill and validate filled evidence. |
| Missing route-wide auth classification | Fixed | Executable contract covers every endpoint and passed. | `tests/contracts/route-auth-classification.spec.ts`; `docs/production-at-scale-endpoint-auth-appendix.md`. | Support/owner-positive production probes still require safe fixture strategy. | Keep contract mandatory and add staging fixture smokes as needed. |

## C. Top 25 Production-At-Scale Blockers

| # | Severity | Area | Affected files/routes/functions | Evidence | Why it matters and impact | Beta impact | Recommended fix and smallest safe task | Tests required | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Critical | Disaster recovery | `docs/disaster-recovery-restore-drill-runbook.md`; `docs/restore-drill-evidence-template.md`; `scripts/staging-backup-restore-checklist.mjs` | `pnpm run check:restore-drill-evidence` validates a template only. | Production cannot prove recovery, RPO, RTO, post-restore auth, packet PDF, response queue, or cleanup. | Conditional beta only if data loss risk is accepted and backups are operator-managed. | Human operator performs restore drill; Codex only validates filled sanitized evidence. | Evidence validator, golden path after restore, auth/session, packet PDF, response dashboard. | Old unresolved issue. |
| 2 | Critical | Production ingest runtime | `scripts/ingest-processing-worker.ts`; `.github/workflows/deploy-staging.yml:620`; production workflow | Staging has opt-in one-shot `run_ingest_worker=true`; production workflow has no ingest worker activation. | Queued uploads can remain queued indefinitely if no operator/worker is running; staging incident already exposed this class. | Beta requires explicit operator worker procedure. | Add a production-scoped bounded worker/service only after staging evidence. | Worker tests, deploy tests, staging/production workflow tests, queue no-op safety. | Newly discovered operational gap after endpoint cutover. |
| 3 | High | Load/concurrency proof | `scripts/production-scale-harness.mjs`; `baseline:production-scale-local` | Harness dry-run reports planned domains only and refuses mutation. | No measured throughput, latency, queue depth, OCR duration, PDF cache-miss behavior, or DB pressure under target load. | Limited cohort only. | Run local/staging non-production load evidence with bounded fixtures and dashboard before/after. | Harness safety, measured artifact report, operator dashboard, DB metrics. | Old unresolved issue. |
| 4 | High | Packet PDF scaling | `helpers/packetPdfCache.ts:140`; `endpoints/packet/pdf_GET.ts:142`; send routes | Cache hit avoids generator, but cache miss calls `renderBase64()` inside request/send path. | Cache-miss storms can still block requests and mail-send paths. | Acceptable only with low volume and operator monitoring. | Add bounded render queue or prove cache-miss envelope. | First render/cache-hit/invalidation/failure, load cache-miss, non-owner denial. | Partially fixed old issue. |
| 5 | High | Ingest cleanup/data safety | `helpers/ingestCleanup.tsx:79`; `helpers/ingestCleanup.tsx:158` | Cleanup records lifecycle events but still performs ordered deletes. | Failed ingest can remove records instead of preserving a failed lifecycle state for review. | Operator-visible but still risky. | Add non-destructive failed-state/remediation path; keep deletes behind explicit admin action. | Failed cleanup event, no default destructive delete, remediation idempotency. | Partially fixed old issue. |
| 6 | High | Historical raw report bytes | `reportArtifact.storageUrl`; `helpers/reportArtifactStorage.ts`; old rows | New uploads are references; old inline base64 remains compatible and unmigrated. | DB backups/dumps may still include raw report PDFs, increasing privacy and restore blast radius. | Limited beta if historical exposure is inventoried. | Add non-destructive inventory and migration/remediation plan, not silent migration. | Compatibility, owner/admin access, dump privacy docs. | Old unresolved residual. |
| 7 | High | Bureau communication storage | `endpoints/evidence/bureau-communication_POST.ts:288` | Route stores `input.fileDataBase64` directly in `storageUrl`. | Evidence communication PDFs/images can still land as DB base64. | Bounded by upload limits but not storage-clean. | Move bureau attachments to existing storage adapter with old-record compatibility. | Oversize/malformed/MIME, get/list privacy, owner/admin enforcement. | Newly confirmed residual. |
| 8 | High | Response operations maturity | `docs/response-processing-production-ops-runbook.md`; `scripts/operator-regression-dashboard.ts` | Dashboard lists live scheduler, external alerts, purge/archive, backfill as future work. | Strong queue semantics still lack production operating evidence and alerting. | Beta with manual operator monitoring. | Close one response ops proof at a time without changing queue semantics. | `response:soak-check`, dashboard, remediation, scheduler/alert dry-run. | Old unresolved issue. |
| 9 | High | Observability/alerting | `helpers/productionObservabilityMetrics.ts`; dashboard | Internal thresholds exist; no external alert delivery evidence. | Failures may remain dashboard-only and missed out of band. | Manual dashboard checks required. | Add external alert dry-run/mock or accepted exclusion; define release evidence. | Dashboard tests, alert dry-run tests, no PII payload assertions. | Partially fixed old issue. |
| 10 | High | Migration governance | `helpers/*Schema*`; `scripts/check-migrations.mjs`; `migrations/0000-runtime-schema-inventory.md` | Checker reports runtime ensure functions remain; deploy recommendation is non-blocking. | Runtime DDL/ensure behavior can hide schema drift and rollback risk. | Acceptable for limited beta with careful deploys. | Convert runtime inventory into reviewed migration ledger and stable drift gate. | Checker, deploy tests, no DDL in checker. | Old unresolved issue. |
| 11 | High | Production deployment parity | `.github/workflows/deploy-production.yml`; `.github/workflows/deploy-staging.yml` | Production has read-only denial probes; staging has deeper synthetic response auth smokes and optional ingest worker pass. | Production deploy evidence is shallower than staging and has no worker path. | Beta if production not promoted. | Add production-safe non-mutating probes only; keep seeded smokes staging-only. | Workflow unit tests, production-readiness gate tests. | Partially fixed old issue. |
| 12 | Medium | OCR route-local validation shape | `endpoints/ocr/extract_POST.schema.ts`; `endpoints/ocr/extract_POST.ts` | Schema has `bytesBase64: z.string()` while handler manually enforces 15 MB. | Direct API shape is less uniform than shared validation, increasing bypass/regression risk. | Low volume beta acceptable. | Align OCR route with shared upload validation without changing OCR output. | Oversize, malformed, MIME, valid PDF, OCR output stable. | Old residual. |
| 13 | Medium | Parser-test list sensitive field | `endpoints/parser-test-case/list_GET.schema.ts`; `endpoints/parser-test-case/list_GET.ts:94` | Bounded admin list still returns `rawExtractedText`. | Admin-only, but large/sensitive text in list responses is not scale-clean. | Admin-only beta acceptable. | Move raw text to get/export/detail-only admin route. | UI compatibility, list metadata-only, admin auth. | Newly confirmed residual. |
| 14 | Medium | Consumer signature list sensitive field | `endpoints/consumer-signature/list_GET.ts:27` | Bounded list returns `signatureData` for wizard compatibility. | Signature image data in list responses increases payload/privacy risk. | Limited beta acceptable with owner auth. | Add metadata list plus get-by-id signature data path. | Delivery wizard compatibility, owner filtering. | Newly confirmed residual. |
| 15 | Medium | Hidden-risk list semantics | `docs/production-at-scale-execution-tracker.md` list inventory | Tracker says `hidden-risk/list` still computes aggregate/stale suppression over full matching set. | Scaling this endpoint requires UX/query redesign, not a blind limit. | Beta acceptable. | Separate pagination/aggregate design task. | Endpoint contract and dashboard UI tests. | Old residual. |
| 16 | Medium | DB pool pressure evidence | `helpers/runtimeTuningConfig.ts`; dashboard DB signal | Config is env-driven; dashboard showed local active connections 3/config max 3. | No target-environment sizing evidence under load. | Beta with conservative cohort. | Run staging load and document pool max/latency/connection observations. | Load harness, dashboard, DB metrics. | Partially fixed old issue. |
| 17 | Medium | Rate limiter write pressure | `helpers/rateLimiter.tsx` | Rate limiting exists but DB pressure under hostile traffic is not evidenced in load runs. | Attack traffic can amplify DB writes/locks. | Cohort/monitoring only. | Add non-mutating stress proof or bounded metrics. | Rate-limit API tests, dashboard pressure metrics. | Old risk. |
| 18 | Medium | Runtime-size gates | `scripts/runtime-size-report.mjs`; build output | Report shows main JS 3.12 MiB raw and CSS 673.8 KiB raw; thresholds are recommendations only. | Large bundles degrade production UX and are not gated. | Beta acceptable. | Add warning-only CI artifact, then decide thresholds. | Build, report, script tests. | Newly measured risk. |
| 19 | Medium | Heavy PDF/OCR dependencies | `Dockerfile`; `package.json`; runtime-size report | `pdfjs-dist` 34.58 MiB, `pdf-parse` 27.03 MiB, `pdfmake` 12.94 MiB; Docker includes Poppler/Tesseract. | Runtime image and cold-start/build risks remain unbounded by policy. | Beta acceptable with fixed image. | Document pinned runtime package baselines and test gates for changes. | Runtime-size report, OCR deterministic tests. | Old risk. |
| 20 | Medium | Production-safe privacy probe depth | `scripts/production-readiness-gate.mjs` | Probes are unauthenticated/invalid-session only, no seeded owner-denial in production. | They do not prove cross-tenant denial with real owned records. | Acceptable because production mutation is avoided. | Keep production read-only; add staging/local seeded owner-denial evidence. | Privacy matrix, route auth contract, staging smoke. | Partially fixed issue. |
| 21 | Medium | Ingest observability release gating | `scripts/operator-regression-dashboard.ts`; `helpers/productionObservabilityMetrics.ts` | Dashboard is manual/script-visible; not a hard release gate. | Regressions can ship if dashboard is not run. | Requires operator discipline. | Add release evidence capture, not hard fail until stable. | Dashboard tests, staged release docs. | New operations risk. |
| 22 | Medium | Retention archive/restore proof | `helpers/dataRetention.tsx`; retention endpoints | Preview/apply guard exists, but physical purge/archive/restore lifecycle proof remains incomplete. | Destructive retention may be safe by confirmation but not fully recoverable/proven. | Beta with no automated apply unless approved. | Add retention evidence runbook and archive/restore checks. | Retention tests, audit log assertions. | Partially fixed issue. |
| 23 | Medium | Public routes inventory risk | `tests/contracts/route-auth-classification.spec.ts` | Some public legacy admin letter-template routes are public but expected to return 410 reset messages. | Public endpoints require ongoing tests so retired handlers cannot revive. | Acceptable because contract checks 410 reset marker. | Keep contract strict and fail on changed source. | Route auth contract. | Old risk controlled by tests. |
| 24 | Low | Documentation drift | `docs/production-at-scale-execution-tracker.md`; old maximum audit | Tracker before this audit still referenced older audit commit `18c7e187...`; final verification was at `e7ff406...`. | Operators could read stale "current audit" data. | Low if current report supersedes. | Keep tracker/audit dates aligned after each scoped task. | Docs diff, `git diff --check`. | Newly found doc drift. |
| 25 | Low | Dashboard default SKIP semantics | `scripts/operator-regression-dashboard.ts:490` and later | Dashboard includes many available checks as SKIP by default. | A PASS dashboard can coexist with checks not run in that invocation. | Acceptable if final verification runs explicit commands. | Label release evidence with exact commands, not dashboard status alone. | Dashboard unit tests, release checklist. | Newly confirmed evidence limitation. |

## D. Modification Anomaly Report

- No critical unauthorized runtime modification was found in the recent commit chain. The recent commits are mostly scoped to the production-scale workstreams they name.
- Documentation drift was found: before this audit, `docs/production-at-scale-maximum-audit.md` still described an older audited commit and the pre-implementation highest-risk blocker, while current code has queue/storage/cache/cron/retention work in place. This report supersedes that stale document.
- `docs/final-production-at-scale-verification.md` audits commit `e7ff406ebc86b852cf63b17845daecd854176f55`, but current `HEAD` is `6fb3b063622fdaf236b97bb6aac0f9a999b5bd88` after staging ingest worker orchestration.
- The staging ingest worker orchestration in `.github/workflows/deploy-staging.yml` is intentionally opt-in. That prevents accidental daemon behavior, but it also explains why queued uploads can appear stuck if operators do not run the worker.
- The response soak check emits many PostgreSQL "already exists" schema notices during runtime ensure paths. This does not fail tests, but it reinforces that migration governance remains partial.
- Several tests are meaningful and direct, but some operator-dashboard proof rows are SKIP by default. Treat the explicit command suite, not a dashboard PASS alone, as release evidence.
- Runtime-size reporting is non-blocking by design. The report measures risk; it does not prevent a large bundle or dependency drift.
- Production workflow privacy probes are safe and read-only, but they intentionally do not create production fixtures and therefore do not prove owner-denial for real tenant records.

## E. Readiness Scorecard

| Category | Status | Evidence | Required next action | Blocks |
| --- | --- | --- | --- | --- |
| Load/concurrency | Partial | `pnpm run baseline:production-scale-local -- --dry-run` passed; no measured non-dry-run capacity. | Collect repeated local/staging load evidence. | scale |
| Upload/file boundaries | Partial | Shared limits and API tests pass; OCR route-local shape and DB-base64 residuals remain. | Close OCR/schema and storage residuals. | production |
| Ingest/OCR/parser | Partial | Queue, worker, endpoint cutover, deterministic report pass. | Prove staging runtime worker operation and later production activation. | production |
| Violation/evidence/regulation correctness | Pass | Golden path and deterministic report pass with violation search preserved. | Broaden anonymized fixtures. | none |
| Packet lifecycle/PDF | Partial | Cache/events exist; cache misses synchronous. | Queue cache-miss rendering or collect capacity evidence. | scale |
| Response processing | Partial | Soak check and queue/lifecycle protections pass. | Live scheduler, external alert, purge/archive, production backfill evidence. | production |
| Database/indexing/pool/migrations | Partial | Env-driven pool and migration checker exist. | Migration hardening and load-based pool evidence. | scale |
| Storage/retention/privacy | Partial | New report storage references and retention apply guards exist. | Historical raw-data plan, bureau storage move, restore proof. | production |
| Auth/tenant isolation | Pass | Route contract covers 283 endpoints; support/privacy tests pass. | Add recurring staging owner-denial smokes. | none |
| Cron/retention/scheduled jobs | Partial | Bearer-only cron and retention confirmation exist. | Scheduled run evidence and retention archive proof. | scale |
| Observability/operator dashboard | Partial | Sanitized thresholds show ingest/OCR/PDF/storage/auth/DB. | External alerting or formal exclusion plus release evidence capture. | production |
| Deployment/rollback | Partial | Staging and production workflows build and probe; production worker absent. | Record rollback proof and worker deployment plan. | production |
| Disaster recovery | Fail | Runbook/template/checker only. | Complete a human-observed restore drill. | production |
| Tests/regression protection | Pass | Required local suite passed. | Keep exact command suite for future runtime changes. | none |
| Frontend operational UX | Pass | UI readiness/limit work already landed; build passed. | Keep text aligned to actual backend enforcement. | none |
| Dependency/build/runtime | Partial | Runtime-size report passed; large assets/deps remain non-blocking. | Decide warning/hard thresholds after baselines. | scale |
| Documentation/runbooks | Partial | Runbooks and tracker exist; this report updates max audit. | Keep tracker current after every task. | production |

## F. Endpoint Auth Classification Appendix

Complete every-endpoint classification is in `docs/production-at-scale-endpoint-auth-appendix.md`, generated from the executable contract in `tests/contracts/route-auth-classification.spec.ts` at commit `6fb3b063622fdaf236b97bb6aac0f9a999b5bd88`.

Summary:

| Category | Count | Evidence |
| --- | ---: | --- |
| Public | 23 | Public auth/reset/OAuth/login/register and intentionally public anonymous/planner/PDF/retired letter-template routes. Public admin letter-template routes are expected to return reset/410 behavior by contract. |
| Session-authenticated | 132 | User-facing case, evidence, ingest, OCR, packet, report artifact, response, support-ticket, subscription, and profile routes. |
| Admin-only | 122 | Admin, audit, migration metadata, parser, regulation, scanning, version, response queue, and governance routes. |
| Cron-token authenticated | 3 | `endpoints/clock/scan_POST.ts`, `endpoints/regulation-registry/scheduled-scan_POST.ts`, `endpoints/retention/auto-purge_POST.ts`. |
| Webhook-signature authenticated | 3 | `endpoints/webhook/postgrid_POST.ts`, `endpoints/webhook/stripe_POST.ts`, `endpoints/webhook/tracking_POST.ts`. |
| Intentionally test/local-only | 0 | None. |
| Unsafe/unclassified | 0 | `pnpm run test:contracts` asserts classified endpoints exactly match discovered endpoint handlers and server registrations. |

## G. High-Growth Table And DB Risk Appendix

| Risk | Evidence | Impact | Required action |
| --- | --- | --- | --- |
| Raw blobs in DB backups | Old `reportArtifact.storageUrl` inline base64 remains compatible; `endpoints/evidence/bureau-communication_POST.ts:288` stores file base64 in `storageUrl`. | Larger DB dumps and sensitive backup blast radius. | Inventory historical rows and move bureau communication storage to object/local adapter with compatibility. |
| Parser raw text in list | `endpoints/parser-test-case/list_GET.schema.ts` includes `rawExtractedText`; `list_GET.ts:94` returns it. | Admin list payload growth and raw-text exposure risk. | Move raw text to detail/export route. |
| Signature data in list | `endpoints/consumer-signature/list_GET.ts:27` selects `signatureData`. | Large/sensitive payload in list response. | Metadata list plus get-by-id for signature data. |
| Runtime schema ensure | `pnpm run check:migrations` lists 13 runtime ensure sources and two bootstrap scripts. | Drift can be masked at runtime and rollback governance is weak. | Migrate toward reviewed ledger and deploy drift reporting. |
| Session/rate limiter writes | Session touch throttling is fixed; rate limiter DB pressure under hostile traffic is not load-proven. | DB write amplification under attack. | Add rate-limit pressure evidence in load harness/dashboard. |
| List endpoint exceptions | Tracker notes `hidden-risk/list` still needs separate pagination/UX design. | Aggregate semantics may scan too much under growth. | Separate query/UX redesign task. |
| Retention destructive deletes | `helpers/dataRetention.tsx` deletes many tables during apply; endpoints now require preview/confirmation. | Confirmation protects accidental deletion but not restore proof. | Add retention archive/restore evidence and runbook proof. |
| DB pool sizing | `CRP_DB_POOL_MAX` exists; dashboard local run showed configured pool max 3. | Production capacity unknown. | Measure pool pressure under staging load before broad production. |

## H. Test Coverage Gap Appendix

| Proposed test/evidence | Area | Risk covered | Exact files/routes/functions | Priority | Blocks |
| --- | --- | --- | --- | --- | --- |
| Filled restore drill evidence validator | Disaster recovery | Proves human-observed restore artifact is complete and sanitized. | `docs/restore-drill-evidence-template.md`; `scripts/staging-backup-restore-checklist.mjs` | Critical | production |
| Staging ingest worker operating evidence | Ingest runtime | Prevents queued uploads from sitting indefinitely. | `.github/workflows/deploy-staging.yml`; `scripts/ingest-processing-worker.ts` | Critical | production |
| Production-scoped worker activation tests | Ingest runtime | Ensures production activation is bounded and not accidental. | Future production workflow/compose/service | High | production |
| Packet PDF cache-miss load test | Packet PDF | Proves synchronous miss behavior is safe or needs queueing. | `helpers/packetPdfCache.ts`; packet routes | High | scale |
| Bureau communication storage reference tests | Storage/privacy | Moves base64 DB storage to object/local reference. | `endpoints/evidence/bureau-communication_POST.ts` | High | production |
| OCR shared upload validation test | Upload/OCR | Aligns route-local schema with shared limits. | `endpoints/ocr/extract_POST.schema.ts`; `endpoints/ocr/extract_POST.ts` | Medium | production |
| Parser-test metadata-list test | Admin/parser | Ensures admin lists do not return raw extracted text. | `endpoints/parser-test-case/list_GET.ts` | Medium | scale |
| Consumer-signature metadata-list test | Privacy/packet send | Ensures signature data is not returned in list. | `endpoints/consumer-signature/list_GET.ts` | Medium | scale |
| Rate-limit pressure/load evidence | Auth/DB | Measures DB write pressure under abusive traffic. | `helpers/rateLimiter.tsx` | Medium | scale |
| External alert dry-run/mock proof | Observability | Confirms critical failures can leave dashboard-only visibility. | `scripts/operator-regression-dashboard.ts`; future alert helper | High | production |
| Production rollback proof | Deployment | Confirms rollback SHA path works with health probes. | `.github/workflows/deploy-production.yml` | High | production |
| Migration drift CI artifact | DB/migrations | Ensures schema drift is reported in release evidence. | `scripts/check-migrations.mjs` | Medium | scale |

## I. Production Promotion Checklist

### Must Pass Before Limited Beta

- Keep classification at limited beta ready with strict constraints.
- Pass `pnpm run typecheck`, `pnpm run build`, `pnpm run test:contracts`, `pnpm run test:api`, `pnpm run test:golden-path`, `pnpm run test:regression-dashboard`, `pnpm run test:deterministic-ingestion-report`, `pnpm run response:soak-check`, `pnpm run operator:dashboard`, and `git diff --check`.
- Confirm an operator-run ingest worker procedure exists for any environment where ingest endpoint cutover is active.
- Confirm upload size and MIME limits are visible to users and enforced server-side.
- Confirm docs do not claim broad-production or production-at-scale readiness.

### Must Pass Before Broader Production

- Complete and validate human-observed restore drill evidence.
- Record staging ingest worker runtime evidence and queue-depth recovery evidence.
- Close bureau communication DB-base64 storage or document accepted residual risk.
- Close response operations gaps for scheduler evidence, external alert boundary, purge/archive readiness, and historical backfill plan.
- Prove production deployment rollback path and production-safe privacy probes for the target SHA.
- Record pool, storage, packet PDF, and dashboard metrics under bounded staging load.

### Must Pass Before Production At Scale

- Provide repeated measured load/concurrency evidence for target traffic levels.
- Replace synchronous packet PDF cache-miss bottleneck or prove the cache-miss envelope.
- Complete migration governance beyond runtime ensure and non-blocking inventory.
- Enforce or formally waive runtime-size/dependency thresholds.
- Prove storage lifecycle, retention, archive, backup, restore, and sensitive dump cleanup.
- Add external alert delivery or a formally accepted operator-monitoring exclusion.
- Keep deterministic parser, canonical extraction, violation search, evidence binding, and packet readiness regression suites green.

## J. Recommended Codex Task Sequence

### Phase 1: Limited Beta Blockers

| Task | Blocker addressed | Allowed scope | Forbidden scope | Tests required | Success criteria |
| --- | --- | --- | --- | --- | --- |
| Record staging ingest worker evidence | Queued uploads can stall without worker execution. | Docs/evidence plus bounded staging workflow run output. | Endpoint cutover, parser/OCR changes, production worker activation. | `ingest:worker` dry-run/apply evidence, dashboard, API ingest tests. | No queued/stale jobs after bounded run; production unchanged. |
| Validate filled restore drill evidence | DR proof incomplete. | Docs/checker validation of a human-filled evidence artifact. | Real restore by Codex, production mutation, secrets/dumps. | `check:restore-drill-evidence`, docs secret scan. | Signed evidence proves RPO/RTO and post-restore checks. |
| Document response operations residuals | Response ops not fully production-operational. | Runbook/evidence only. | Queue semantics, live scheduler enablement. | `response:soak-check`, `operator:dashboard`. | Remaining ops gaps are explicit and owner-assigned. |

### Phase 2: Broader Production Blockers

| Task | Blocker addressed | Allowed scope | Forbidden scope | Tests required | Success criteria |
| --- | --- | --- | --- | --- | --- |
| Move bureau communication files to storage adapter | DB-base64 storage residual. | Bureau communication storage/write/read compatibility. | Parser, packet, response lifecycle, unrelated storage changes. | Evidence privacy API, storage tests, owner/admin denial. | New files use references; old base64 records readable. |
| Align OCR upload schema | Route-local base64 shape. | OCR schema/validation only. | OCR output changes. | OCR upload-limit tests, deterministic OCR readiness. | Shared strict validation without OCR behavior change. |
| Add production-safe alert dry-run proof | Dashboard-only critical signals. | Sanitized metrics/alert mock docs/tests. | External provider live delivery unless separately approved. | Dashboard/alert tests, no PII assertions. | Critical signals have tested dry-run/exclusion evidence. |

### Phase 3: Production-Scale Hardening

| Task | Blocker addressed | Allowed scope | Forbidden scope | Tests required | Success criteria |
| --- | --- | --- | --- | --- | --- |
| Packet PDF async render plan/implementation | Synchronous cache misses. | Packet PDF render queue/cache miss handling. | Packet wording/readiness/violation/evidence changes. | Packet lifecycle, PDF cache, golden path, non-owner denial. | Cache misses no longer block request path or are load-proven. |
| Migration governance cutover | Runtime ensure strategy. | Migration ledger/checker/gate design. | Ad hoc DDL or generated type churn without approval. | Migration checker, deploy unit tests, no mutation checker. | Runtime ensure drift is governed and release-visible. |
| Load/capacity evidence run | Missing scale proof. | Local/staging harness and evidence docs. | Production mutation, external provider calls. | Harness, dashboard, DB/pool metrics, golden path. | Measured capacity report with thresholds. |

### Phase 4: Operational Maturity

| Task | Blocker addressed | Allowed scope | Forbidden scope | Tests required | Success criteria |
| --- | --- | --- | --- | --- | --- |
| Runtime-size threshold policy | Non-blocking bundle/dependency risk. | Reporting/CI artifacts and docs. | Dependency upgrades, chunking, runtime behavior. | Build, runtime-size report, script tests. | Accepted thresholds or documented waiver. |
| Storage/retention archive proof | Retention/restore lifecycle. | Runbooks, audit events, archive evidence. | Retention window changes unless separately approved. | Retention tests, audit evidence, restore validation. | Apply path is auditable and recoverability is proven. |
| Production promotion evidence pack | Final release governance. | Docs/checklists/command outputs. | Runtime fixes. | Full verification suite. | A single evidence packet supports promotion decision. |

## K. Final Conclusion

CreditRegulatorPro is **not production-at-scale ready** at commit `6fb3b063622fdaf236b97bb6aac0f9a999b5bd88`.

The single highest-risk blocker is the absence of complete operational proof across queued ingest execution and disaster recovery: the application can enqueue report processing, but staging worker execution is currently opt-in and production worker activation is deferred, while no human-observed restore drill proves recovery from failure. These are runtime operation and recovery blockers, not parser or packet correctness blockers.

The safest next Codex implementation prompt is: **record staging ingest worker execution evidence and queue-drain proof without changing endpoints, parser/OCR, storage, packet PDF, DB pool, retention, or production deployment behavior**.

Do not work next on production activation, packet PDF queueing, broad migration cutover, or dependency/chunking refactors until staging worker evidence and restore evidence are current and accepted.
