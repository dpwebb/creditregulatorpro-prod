# Production At Scale Maximum Readiness Audit

Audit date: 2026-05-19

## A. Executive Verdict

| Field | Value |
| --- | --- |
| Current branch | `staging` |
| Current commit audited | `18c7e187c52a27b34eb41e3811a7d1527f7f1166` |
| Previous audit baseline compared | `06861e9` |
| Final readiness classification | Limited beta ready with strict constraints |
| Safe for limited beta? | Conditional, only under `docs/limited-beta-operator-launch-policy.md` |
| Safe for broad production? | No |
| Safe for production at scale? | No |

CreditRegulatorPro has materially improved since the prior baseline: the six Phase 1 blockers are backed by code and tests, and the verification suite passes locally. The current state is suitable for a tightly controlled limited beta under the operator policy, but it is not production-at-scale ready. The highest-risk unresolved issue remains the request-bound ingest/OCR/compliance pipeline combined with raw report bytes stored in `reportArtifact.storageUrl`; this creates resource exhaustion, database growth, recovery, privacy, and operator-remediation risk under realistic production traffic.

No production-at-scale claim is supported by the current code, tests, workflows, or runbooks.

## B. Delta From Previous Audit

| Previous blocker | Current status | Evidence | Files/tests | Remaining risk | Next action |
| --- | --- | --- | --- | --- | --- |
| Unbounded server-side base64 upload contracts for Phase 1 routes | Fixed for the named Phase 1 routes | Shared decoded-byte validator, raw request guards where endpoint structure allows, MIME allowlists, malformed base64 rejection | `helpers/uploadPayloadValidation.ts`, `endpoints/ingest/report_POST.ts`, `endpoints/ingest/anonymous-report_POST.ts`, `endpoints/evidence-attachment/upload_POST.ts`, `endpoints/evidence/bureau-communication_POST.ts`, `tests/api/report-ingest-lifecycle-endpoint.spec.ts`, `tests/api/evidence-privacy-endpoint.spec.ts`, `tests/api/ocr-extract-upload-limit-endpoint.spec.ts`, `tests/api/critical-schema.spec.ts` | Other base64/storage routes remain outside the Phase 1 fix | Add upload validation to legacy/admin/review/parser-test/report-artifact mutation routes |
| Synchronous report ingestion/OCR/compliance pipeline | Unchanged | Ingest still calls parsing/OCR/compliance inside request/SSE paths | `endpoints/ingest/report_POST.ts`, `endpoints/ingest/process_POST.ts`, `helpers/ingestReportHandler.tsx`, `helpers/ingestCorePipeline.tsx`, `helpers/pdfTextExtractor.tsx`, `helpers/deterministicOcr.ts` | Critical scale and retry risk | Build durable ingest/OCR/compliance queue with leases, idempotency, dead letters, and operator remediation |
| Raw uploaded report PDFs stored in `reportArtifact.storageUrl` | Unchanged | Report upload and review approval still insert base64 into `storageUrl`; list/get can return it | `helpers/ingestArtifactCreator.tsx`, `endpoints/review/approve_POST.ts`, `endpoints/report-artifact/get_GET.ts`, `endpoints/report-artifact/list_GET.ts` | Critical database growth, dump, privacy, restore blast radius | Move raw report bytes to bounded object storage with metadata-only database references |
| Synchronous packet PDF generation | Unchanged | PDF endpoint and mail send routes generate PDFs in request path | `endpoints/packet/pdf_GET.ts`, `endpoints/packet/send-first-class_POST.ts`, `endpoints/packet/send-registered_POST.ts`, `helpers/packetPdfContent.ts` | High CPU/memory latency and repeated-render risk | Queue or cache packet PDF rendering with invalidation and failure metrics |
| Packet/report-artifact list scale-bounding | Fixed for targeted routes | Default/max limits added and tested | `endpoints/packet/list_GET.schema.ts`, `endpoints/packet/list_GET.ts`, `endpoints/report-artifact/list_GET.schema.ts`, `endpoints/report-artifact/list_GET.ts`, `tests/api/packet-delivery-status-endpoint.spec.ts`, `tests/api/report-ingest-lifecycle-endpoint.spec.ts` | Report-artifact list still selects large/sensitive columns; other list routes remain unbounded | Remove large blobs from list responses and audit remaining list routes |
| Clock scan status mismatch and unbounded scan | Fixed | Canonical lowercase `generated`, batch limit 100, bearer auth, query token rejected | `helpers/clockScanConfig.ts`, `endpoints/clock/scan_POST.ts`, `helpers/cronClockScan.tsx`, `tests/api/clock-scan-endpoint.spec.ts` | Other cron routes still allow query tokens | Remove query-token cron auth from retention and regulation scheduled scan |
| Production deployment weaker than staging | Partially fixed | Production workflow now runs `pnpm run check`, preserves build, adds root/login/auth-session checks, verifies SHA | `.github/workflows/deploy-production.yml`, `tests/unit/deploy-production-workflow.spec.ts` | Production still avoids deeper synthetic auth smokes by design; broad production needs stronger post-deploy evidence | Add production-safe owner-denial and read-only auth smokes without synthetic admin mutation |
| Fragile DB pool/session-write behavior under concurrency | Unchanged | Fixed pool max 3 and session `lastAccessed` write on each authenticated request remain | `helpers/db.tsx`, `helpers/getServerUserSession.tsx`, `helpers/rateLimiter.tsx` | High scale risk and missing pool-pressure visibility | Make pool settings environment-driven and add DB latency/pool metrics |
| Mixed migration strategy | Unchanged | Bootstrap scripts, runtime ensure functions, and endpoint-created schema coexist | `scripts/bootstrap-local-app-fixtures.ts`, `scripts/bootstrap-local-auth-schema.ts`, `helpers/consumerIdentification.ts`, response schema ensure paths, `endpoints/migration/*` | Schema drift and rollback uncertainty | Establish a single additive migration ledger and deploy gate |
| Destructive/best-effort ingest cleanup | Unchanged | Cleanup deletes many related tables in best-effort order with partial-failure logging | `helpers/ingestCleanup.tsx` | Data-loss and partial-state remediation risk | Replace destructive cleanup with lifecycle state, remediation queue, and audit trail |
| Incomplete observability for ingest/PDF/storage/auth/DB pressure | Partially fixed for response processing only | Response metrics and dashboard are strong; ingest/PDF/storage/DB remain weak | `helpers/responseProcessingMetrics.ts`, `scripts/operator-regression-dashboard.ts`, `scripts/staging-observability-check.mjs`, ingest/PDF/storage helpers | High operator blind spot for production traffic | Add durable ingest/PDF/storage/auth/DB metrics and release gates |
| Incomplete disaster-recovery proof | Unchanged | Checklist exists; no completed restore drill evidence or RPO/RTO proof | `scripts/staging-backup-restore-checklist.mjs`, `scripts/refresh-local-from-staging.mjs` | Critical broad-production blocker | Run and document a human-observed restore drill with golden-path validation |
| Missing route-wide auth classification | Fixed | Contract classifies every endpoint and validates guard patterns | `tests/contracts/route-auth-classification.spec.ts` | Pattern tests do not prove every ownership boundary | Add per-domain privacy tests for remaining high-value routes |

## C. Top 25 Production-At-Scale Blockers

### 1. Durable ingest/OCR/compliance queue is missing

- Severity: Critical
- Area: Load/concurrency, ingest/OCR/parser, compliance
- Affected files/routes/functions: `endpoints/ingest/report_POST.ts`, `endpoints/ingest/process_POST.ts`, `helpers/ingestReportHandler.tsx`, `helpers/ingestCorePipeline.tsx`, `helpers/pdfTextExtractor.tsx`, `helpers/deterministicOcr.ts`, `helpers/complianceScanner.tsx`
- Evidence: Authenticated upload calls `handleIngestSubmit`; process endpoint runs `handleIngestProcess`; `helpers/ingestCorePipeline.tsx` calls `extractCanonicalCreditReport`, persists artifacts/tradelines, and loops `scanAndPersistViolations` in the request-bound flow.
- Why it matters: Large or repeated uploads tie expensive PDF parsing, OCR, deterministic extraction, compliance scans, and writes to HTTP request capacity.
- Production impact: Retry storms and concurrent users can exhaust CPU, DB connections, and request workers without leases, idempotent job state, or dead letters.
- Beta impact: Acceptable only with one concurrent report upload/process operation and daily limits from the beta policy.
- Recommended fix: Add a durable ingest job table/queue with idempotency keys, status lifecycle, lease/claim semantics, retry/dead-letter handling, and operator remediation.
- Smallest safe Codex task: Add ingest job schema/service and move only report processing execution behind a bounded worker, preserving parser output.
- Tests required: Direct API enqueue test, worker claim/lease tests, duplicate submission test, dead-letter test, deterministic output regression.
- Type: Old unresolved issue.

### 2. Raw report PDFs are stored in `reportArtifact.storageUrl`

- Severity: Critical
- Area: Storage, privacy, database, disaster recovery
- Affected files/routes/functions: `helpers/ingestArtifactCreator.tsx`, `endpoints/review/approve_POST.ts`, `endpoints/report-artifact/create_POST.ts`, `endpoints/report-artifact/update_POST.ts`, `endpoints/report-artifact/get_GET.ts`, `endpoints/report-artifact/list_GET.ts`
- Evidence: `createReportArtifact` inserts `storageUrl: input.bytesBase64`; `review/approve_POST.ts` inserts `storageUrl: input.bytesBase64`; report artifact get/list routes select and return `storageUrl`.
- Why it matters: Credit report PDFs can be large and sensitive. Keeping them in database text columns inflates backups, query responses, local refreshes, and restore scope.
- Production impact: Database bloat, slow backups/restores, sensitive dump exposure, and large response payloads.
- Beta impact: Manageable only under strict upload and volume caps.
- Recommended fix: Store raw report files in object storage with encrypted metadata references and short-lived access paths.
- Smallest safe Codex task: Introduce report artifact storage adapter for new uploads only, leaving old records readable.
- Tests required: Upload storage reference test, non-owner download denial, local fallback test, migration compatibility test.
- Type: Old unresolved issue.

### 3. Legacy and admin base64 surfaces remain insufficiently bounded

- Severity: Critical
- Area: Upload/file boundaries, admin safety, storage
- Affected files/routes/functions: `endpoints/report-artifact/create_POST.schema.ts`, `endpoints/report-artifact/update_POST.schema.ts`, `endpoints/review/approve_POST.schema.ts`, `endpoints/review/approve_POST.ts`, `endpoints/parser-test-case/create_POST.schema.ts`, `endpoints/parser-test-case/import_POST.schema.ts`, `endpoints/parser-lab/run_POST.schema.ts`, `endpoints/admin/mock-lifecycle/run_POST.schema.ts`
- Evidence: These schemas still accept strings such as `storageUrl`, `bytesBase64`, or `pdfBase64` without the Phase 1 shared upload helper. `review/approve_POST.ts` parses JSON before session auth and stores `input.bytesBase64`.
- Why it matters: Direct API callers or admin tools can still submit huge base64 payloads that bypass the new Phase 1 upload contracts.
- Production impact: Resource exhaustion, database growth, large JSON parsing, and unsafe admin import behavior.
- Beta impact: Admin/operator discipline can reduce risk but does not eliminate direct API risk.
- Recommended fix: Apply shared decoded-byte, MIME, filename, and raw body guards to all base64 routes, with admin-specific limits.
- Smallest safe Codex task: Bound report-artifact create/update, review approve, parser-test-case create/import, parser-lab run, and mock-lifecycle run without changing parsing behavior.
- Tests required: Oversize/malformed direct API tests for each route and downstream-not-called spies where practical.
- Type: Old unresolved issue exposed by Phase 1 scope limits.

### 4. Packet PDF rendering and mail send remain synchronous

- Severity: High
- Area: Packet lifecycle/PDF, external provider operations
- Affected files/routes/functions: `endpoints/packet/pdf_GET.ts`, `endpoints/packet/send-first-class_POST.ts`, `endpoints/packet/send-registered_POST.ts`, `helpers/packetPdfContent.ts`
- Evidence: `packet/pdf_GET.ts` calls `generatePacketContentPdfBase64` and returns bytes in the request path. Send routes generate the PDF before calling PostGrid.
- Why it matters: Repeated downloads or send attempts can repeatedly render PDFs and block request workers.
- Production impact: CPU/memory spikes, latency, and provider-side partial failure risk.
- Beta impact: Manageable with packet PDF download/send caps.
- Recommended fix: Cache or queue packet PDFs with status, invalidation, and render failure events.
- Smallest safe Codex task: Add cached PDF persistence for generated packet content while preserving existing download bytes.
- Tests required: First render stores cache, repeated download uses cache, non-owner denial, stale cache invalidation.
- Type: Old unresolved issue.

### 5. Packet PDF failure observability is weak

- Severity: High
- Area: Observability/operator readiness, packet PDF
- Affected files/routes/functions: `endpoints/packet/pdf_GET.ts`, `endpoints/packet/send-first-class_POST.ts`, `endpoints/packet/send-registered_POST.ts`, `scripts/operator-regression-dashboard.ts`
- Evidence: Packet PDF generation failures are handled in-route or logged, but there is no durable packet PDF failure metric, retry queue, or dashboard threshold.
- Why it matters: Operators cannot detect PDF render spikes or repeated user failures without reading logs.
- Production impact: Silent user-facing PDF failures during traffic spikes.
- Beta impact: Requires manual dashboard and support review after packet failures.
- Recommended fix: Add durable packet PDF render events and dashboard checks.
- Smallest safe Codex task: Record packet PDF render attempt/failure events without changing PDF content.
- Tests required: Render failure event test, dashboard failure surfacing test.
- Type: Old unresolved issue.

### 6. Database pool is fixed at `max: 3`

- Severity: High
- Area: Database readiness, concurrency
- Affected files/routes/functions: `helpers/db.tsx`
- Evidence: `postgres(process.env.FLOOT_DATABASE_URL, { prepare: false, idle_timeout: 10, max: 3 })`.
- Why it matters: A hard-coded pool cannot be tuned per local, staging, or production workload.
- Production impact: Requests can queue or fail under concurrent uploads, sessions, packet work, and admin/dashboard traffic.
- Beta impact: Acceptable only with strict concurrency caps.
- Recommended fix: Make pool size and timeouts environment-driven with safe defaults and metrics.
- Smallest safe Codex task: Add env-driven DB pool config and startup validation without changing queries.
- Tests required: Config parsing unit test and smoke check.
- Type: Old unresolved issue.

### 7. Auth session handling writes on every authenticated request

- Severity: High
- Area: Database readiness, auth/session
- Affected files/routes/functions: `helpers/getServerUserSession.tsx`
- Evidence: Every successful session lookup updates `sessions.lastAccessed`; 2 percent of calls can also delete expired sessions.
- Why it matters: Session-authenticated API traffic amplifies writes and competes with ingest and packet operations.
- Production impact: DB write pressure and lock/contention risk.
- Beta impact: Manageable under low user counts.
- Recommended fix: Throttle session `lastAccessed` writes or move session touch to a bounded store.
- Smallest safe Codex task: Update `lastAccessed` only when stale by a configured interval.
- Tests required: Session accepted without write when fresh, write when stale, expiration unchanged.
- Type: Old unresolved issue.

### 8. Mixed migration and runtime schema ensure strategy remains

- Severity: High
- Area: Database migrations, deployment/rollback
- Affected files/routes/functions: `scripts/bootstrap-local-app-fixtures.ts`, `scripts/bootstrap-local-auth-schema.ts`, `helpers/consumerIdentification.ts`, response schema ensure helpers, `endpoints/migration/*`
- Evidence: Bootstrap scripts, runtime `create table if not exists`, and product migration endpoints coexist. Response soak output includes idempotent schema notices.
- Why it matters: Production schema drift is hard to audit and roll back.
- Production impact: Deploys can pass while schema differs between local, staging, and production.
- Beta impact: Low if staging is the only source of truth and operator changes are controlled.
- Recommended fix: Adopt one additive migration ledger and block deploy when migrations are unapplied.
- Smallest safe Codex task: Inventory runtime schema ensures and create a migration policy doc plus non-mutating checker.
- Tests required: Migration inventory test and deploy gate unit test.
- Type: Old unresolved issue.

### 9. Ingest cleanup is destructive and best-effort

- Severity: High
- Area: Data safety, ingest lifecycle
- Affected files/routes/functions: `helpers/ingestCleanup.tsx`
- Evidence: Cleanup deletes many dependent records in try/catch blocks and logs failures without an append-only lifecycle/remediation record.
- Why it matters: Partial cleanup can leave inconsistent state or delete data needed for audit/remediation.
- Production impact: Data-loss and support escalation risk after failed ingests.
- Beta impact: Requires manual review after failed ingest/packet events.
- Recommended fix: Replace destructive cleanup with lifecycle markers and remediation jobs.
- Smallest safe Codex task: Add ingest lifecycle events and failed-cleanup surfacing without changing parser behavior.
- Tests required: Failed cleanup records event, no silent partial deletion, remediation dashboard test.
- Type: Old unresolved issue.

### 10. Retention auto-purge performs destructive deletes

- Severity: High
- Area: Storage/retention/privacy, cron
- Affected files/routes/functions: `helpers/dataRetention.tsx`, `endpoints/retention/auto-purge_POST.ts`
- Evidence: `auto-purge_POST.ts` calls `enforceRetention(true)`. `enforceRetention` deletes records from pass extraction, evidence, packets, report artifacts, tradelines, and related tables.
- Why it matters: Destructive purge needs preview, authorization hardening, production runbook, and restore proof before broad production.
- Production impact: Accidental or abused purge can delete critical user and evidence data.
- Beta impact: Must be operator-supervised and avoid unsafe cron exposure.
- Recommended fix: Make production purge two-step with signed preview, apply confirmation, and append-only purge events.
- Smallest safe Codex task: Add dry-run-first retention apply guard and tests.
- Tests required: Preview does not delete, apply requires explicit body and bearer token, audit event test.
- Type: Old unresolved issue.

### 11. Query-token cron authentication remains outside clock scan

- Severity: High
- Area: Cron/auth
- Affected files/routes/functions: `endpoints/regulation-registry/scheduled-scan_POST.ts`, `endpoints/retention/auto-purge_POST.ts`
- Evidence: Both routes derive a cron secret but still accept `token` query parameter; retention also accepts a legacy `JWT_SECRET.substring(0, 32)` token.
- Why it matters: Query tokens are likely to appear in logs, browser history, proxies, and monitoring systems.
- Production impact: Cron abuse can trigger scans or destructive retention work.
- Beta impact: Requires strict secret handling and low exposure.
- Recommended fix: Move all cron routes to bearer-only derived tokens and remove legacy token support after deploy coordination.
- Smallest safe Codex task: Remove query-token support from scheduled scan and retention with deprecation note if needed.
- Tests required: Bearer accepted, query token rejected, missing token rejected.
- Type: Old unresolved issue partially fixed for clock scan.

### 12. Report artifact list is bounded but still returns large/sensitive columns

- Severity: High
- Area: API response size, privacy, storage
- Affected files/routes/functions: `endpoints/report-artifact/list_GET.ts`, `endpoints/report-artifact/get_GET.ts`
- Evidence: List route now limits to 50/100 but selects `storageUrl` and `data`; get route returns `storageUrl`.
- Why it matters: Bounded lists can still return up to 100 raw base64 report blobs plus parsed data.
- Production impact: Large responses and sensitive report exposure to owner/admin paths.
- Beta impact: Limited by user and upload volume caps.
- Recommended fix: Make list metadata-only and move raw report retrieval behind a dedicated audited download path.
- Smallest safe Codex task: Remove `storageUrl` from list output while preserving get behavior.
- Tests required: List excludes raw storage, get remains owner/admin only, non-owner denied.
- Type: Regression risk from partial Phase 1 fix scope, not a new regression.

### 13. Additional list endpoints remain unbounded

- Severity: Medium
- Area: Database/query limits
- Affected files/routes/functions: `endpoints/evidence-attachment/list_GET.ts`, `endpoints/metro2-validation-log/list_GET.ts`, `endpoints/parser-known-entity/list_GET.ts`, `endpoints/parser-mapping/list_GET.ts`, `endpoints/regulatory-update/list_GET.ts`, `endpoints/version/list_GET.ts`, and other reference/admin list routes
- Evidence: A scan of `endpoints/**/list_GET.ts` shows many routes without endpoint-level `.limit`; some helpers apply limits, but others do not.
- Why it matters: High-cardinality tables can grow quickly under ingest, parser lab, regulatory updates, evidence, and admin operations.
- Production impact: Slow list queries and large responses.
- Beta impact: Acceptable under low volume but should be addressed before broad production.
- Recommended fix: Add default/max limits route by route, prioritizing high-growth tables.
- Smallest safe Codex task: Bound evidence attachment and metro2 validation log lists first.
- Tests required: Omitted limit defaults, excessive limit rejected/capped, ownership preserved.
- Type: Old unresolved issue.

### 14. Ingest/PDF/storage/auth/DB observability remains incomplete

- Severity: High
- Area: Observability/operator readiness
- Affected files/routes/functions: `helpers/ingestCorePipeline.tsx`, `helpers/pdfTextExtractor.tsx`, `helpers/gcsStorage.ts`, `helpers/documentStorage.ts`, `helpers/db.tsx`, `scripts/operator-regression-dashboard.ts`
- Evidence: Response processing has metrics; ingest, OCR, packet PDF, storage, auth failures, and DB pool pressure lack comparable durable metrics and thresholds.
- Why it matters: Operators cannot see resource exhaustion or storage growth until users report failures or logs are inspected.
- Production impact: Silent degradations and slow incident response.
- Beta impact: Requires daily operator review and immediate review after failed ingest/packet/response events.
- Recommended fix: Add durable metrics/events for each high-risk path and dashboard thresholds.
- Smallest safe Codex task: Add ingest/PDF/storage metric events and dashboard rows without changing behavior.
- Tests required: Metric recorded on success/failure and dashboard surfaces thresholds.
- Type: Old unresolved issue.

### 15. Disaster recovery proof is incomplete

- Severity: Critical
- Area: Disaster recovery, storage, operations
- Affected files/routes/functions: `scripts/staging-backup-restore-checklist.mjs`, `scripts/refresh-local-from-staging.mjs`, docs/runbooks
- Evidence: The checklist verifies safety anchors and explicitly states it does not dump or restore data. No completed human restore drill artifact with date/operator/source SHA was found.
- Why it matters: Backups are not proven until restored and validated.
- Production impact: Failure to recover from data loss or deployment rollback.
- Beta impact: A known accepted risk only if beta users and data volume remain small.
- Recommended fix: Run and document a staging-to-local restore drill plus golden-path validation and RPO/RTO.
- Smallest safe Codex task: Create a restore drill evidence template and runbook, then execute outside Codex with operator signoff.
- Tests required: Checklist test, golden path after restore, evidence artifact review.
- Type: Old unresolved issue.

### 16. Production-scale load and concurrency tests are missing

- Severity: High
- Area: Tests/regression protection, load/concurrency
- Affected files/routes/functions: `package.json`, `scripts/staging-scale-baseline.mjs`, API tests
- Evidence: Unit/API/golden/soak checks pass, but no repeated concurrent report upload/OCR/PDF/storage/DB pool pressure suite exists.
- Why it matters: Passing deterministic and API tests does not prove traffic tolerance.
- Production impact: Unknown capacity and failure modes.
- Beta impact: Operator policy caps are necessary.
- Recommended fix: Add staged load tests that do not mutate production and can run against local/staging fixtures.
- Smallest safe Codex task: Add local-only upload/process/PDF concurrency harness.
- Tests required: Concurrent upload rejection/queue behavior, DB pool latency, PDF render pressure.
- Type: Old unresolved issue.

### 17. Admin parser-test imports can store and process large PDFs

- Severity: High
- Area: Admin tooling, parser lab, storage
- Affected files/routes/functions: `endpoints/parser-test-case/create_POST.ts`, `endpoints/parser-test-case/import_POST.ts`, `endpoints/parser-lab/run_POST.ts`
- Evidence: Schemas accept `pdfBase64` or `bytesBase64` strings with no shared decoded-byte checks; create/import can store `pdfBase64` and create materialized report artifacts.
- Why it matters: Admin-only routes still need bounds because admin mistakes and compromised admin sessions are production risks.
- Production impact: DB growth and expensive parser execution.
- Beta impact: Operator discipline only.
- Recommended fix: Reuse upload helper with admin-specific PDF limits and import count limits.
- Smallest safe Codex task: Add decoded-byte, count, and malformed base64 tests to parser-test routes.
- Tests required: Oversize admin import rejected, valid fixture still passes, parser output unchanged.
- Type: Old unresolved issue.

### 18. Review approval route parses body before auth

- Severity: High
- Area: Auth/resource exhaustion, legacy ingest
- Affected files/routes/functions: `endpoints/review/approve_POST.ts`, `endpoints/review/approve_POST.schema.ts`
- Evidence: The handler does `JSON.parse(await request.text())` and schema parsing before `getServerUserSession(request)`.
- Why it matters: Unauthenticated callers can force JSON parse/schema work on large payloads before auth rejection.
- Production impact: CPU/memory pressure and bypass of upload validation.
- Beta impact: Low if route is not used, but direct API exposure remains.
- Recommended fix: Authenticate and raw-size guard before reading/parsing body.
- Smallest safe Codex task: Move session guard before body parse and add upload bounds without changing approval persistence.
- Tests required: Unauthenticated large body rejected before schema work, authenticated valid approval unchanged.
- Type: Old unresolved issue.

### 19. Consumer identification upload is partially bounded but lacks raw body and strict base64 validation

- Severity: Medium
- Area: Upload/file boundaries, identity storage
- Affected files/routes/functions: `endpoints/user/identification_POST.schema.ts`, `endpoints/user/identification_POST.ts`, `helpers/consumerIdentification.ts`
- Evidence: Helper enforces MIME set and 8 MB decoded size, but schema file does not bound filename length, there is no raw body guard, and `Buffer.from(base64, "base64")` is lenient for malformed payloads.
- Why it matters: Identification images are sensitive and can still consume request parsing resources before helper validation.
- Production impact: Resource exhaustion and storage-path edge cases.
- Beta impact: Moderate under low volume.
- Recommended fix: Apply shared upload helper with strict base64 and filename bounds.
- Smallest safe Codex task: Update schema/handler validation only, preserving storage behavior.
- Tests required: Oversize, malformed base64, invalid MIME, valid PNG/JPEG.
- Type: Old unresolved issue.

### 20. Bureau communication attachments are stored as base64 in database fields

- Severity: Medium
- Area: Storage, evidence, privacy
- Affected files/routes/functions: `endpoints/evidence/bureau-communication_POST.ts`, `endpoints/evidence/bureau-communication_POST.schema.ts`
- Evidence: The Phase 1 route is bounded to 10 MB and MIME-checked, but it inserts `storageUrl: input.fileDataBase64`.
- Why it matters: Bounded base64 still grows database size and backup sensitivity.
- Production impact: Storage growth and privacy blast radius.
- Beta impact: Acceptable with evidence upload volume caps.
- Recommended fix: Move bureau communication files to the same storage helper path used for evidence attachments.
- Smallest safe Codex task: Store new bureau communication attachments through `uploadFile`, leaving old records readable.
- Tests required: Storage reference created, non-owner denied, valid image/PDF behavior unchanged.
- Type: Old unresolved issue.

### 21. Support role boundaries are not a first-class route classification

- Severity: Medium
- Area: Auth/tenant isolation/admin boundary
- Affected files/routes/functions: `tests/contracts/route-auth-classification.spec.ts`, support-ticket/report/packet/admin routes
- Evidence: Contract categories are public, session, admin, cron, webhook, and test/local. There is no support-only category even though support behavior exists in service-level checks.
- Why it matters: Support access often needs separate proof from ordinary user and full admin access.
- Production impact: Missing explicit support boundary coverage can hide overbroad support capabilities.
- Beta impact: Low if support accounts are tightly controlled.
- Recommended fix: Add support-only/support-capable classification or targeted support-role privacy tests.
- Smallest safe Codex task: Add support-role matrix tests for reports, packets, evidence, and tickets.
- Tests required: Support can only access intended data, non-owner ordinary users denied.
- Type: Newly discovered coverage gap.

### 22. Response processing is strong but not fully production-operational

- Severity: Medium
- Area: Response processing, operator readiness
- Affected files/routes/functions: `helpers/responseProcessingQueueService.ts`, `helpers/responseWorkerOrchestrationService.ts`, `helpers/responseProcessingLifecycleService.ts`, `helpers/responseProcessingMetrics.ts`, `scripts/response-processing-soak-check.ts`
- Evidence: Soak check passed with duplicate collapse, retries, dead letters, stale job observation, replay dry run, retention preview, drift detection, and no raw response text logged. Dashboard still lists external alert delivery, live scheduled daemon operation, physical purge/archival, and historical backfill as open gaps.
- Why it matters: The subsystem is comparatively mature but still requires production operations proof.
- Production impact: Operator blind spots and manual process risk.
- Beta impact: Acceptable with supervised apply mode and dry-run review.
- Recommended fix: Complete live scheduler, external alert delivery, purge/archive, and historical backfill runbooks.
- Smallest safe Codex task: Add production-safe external alert dry-run and dashboard evidence.
- Tests required: Alert delivery simulation, scheduler bounded-run test, lifecycle apply confirmation.
- Type: Old unresolved issue.

### 23. Production deployment lacks deep production-safe privacy smokes

- Severity: Medium
- Area: Deployment/rollback, auth/tenant isolation
- Affected files/routes/functions: `.github/workflows/deploy-production.yml`, `scripts/production-readiness-gate.mjs`, `tests/unit/deploy-production-workflow.spec.ts`
- Evidence: Production now checks `/`, `/login`, and unauthenticated `/_api/auth/session`, and verifies SHA. It intentionally does not run staging synthetic-admin response-auth smokes in production.
- Why it matters: Public route checks and unauthenticated denial do not prove owner-bound reads after deploy.
- Production impact: Auth regressions could ship if not caught by tests before deploy.
- Beta impact: Mitigated by CI and staging smokes.
- Recommended fix: Add production-safe read-only privacy checks that do not require synthetic admin mutation.
- Smallest safe Codex task: Add a protected-route denial matrix for unauthenticated and invalid-session probes.
- Tests required: Workflow unit tests and staging/production gate tests.
- Type: Partially fixed previous issue.

### 24. Frontend bundle size and heavy PDF/OCR dependencies are not performance-gated

- Severity: Medium
- Area: Dependency/build/runtime, frontend operational UX
- Affected files/routes/functions: `package.json`, Vite build output, PDF/OCR helpers
- Evidence: Build passed but emitted a main JS chunk around 3.26 MB uncompressed and 894 KB gzip. Dependencies include `pdfjs-dist`, `pdf-parse`, `pdfmake`, OCR image tooling, and large UI libraries.
- Why it matters: Large client bundles and server-side PDF/OCR dependencies increase cold-start, runtime, and deploy risk.
- Production impact: Slower app load and heavier runtime images.
- Beta impact: Low to moderate.
- Recommended fix: Add bundle analysis, chunking policy, and runtime dependency inventory.
- Smallest safe Codex task: Add non-blocking bundle size report and document current thresholds.
- Tests required: Build still passes and size report is generated.
- Type: Newly discovered scale hardening gap.

### 25. Readiness documentation contains stale or over-optimistic statements

- Severity: Medium
- Area: Documentation/runbooks, operator posture
- Affected files/routes/functions: `docs/production-scale-readiness-audit.md`, `docs/production-readiness-checklist.md`, `docs/phase-1-limited-beta-readiness.md`
- Evidence: `docs/production-scale-readiness-audit.md` marks Phase 1 deploy hardening implemented but still contains stale bullets saying production check is build-only and lacks post-deploy checks. `docs/production-readiness-checklist.md` uses controlled-production language while this audit only supports limited beta with strict constraints.
- Why it matters: Operators may overestimate readiness and promote beyond the evidence.
- Production impact: Premature broad production launch.
- Beta impact: Confusion unless the beta policy remains authoritative.
- Recommended fix: Consolidate readiness docs after each blocker phase and remove stale statements.
- Smallest safe Codex task: Documentation-only cleanup aligning readiness wording to this audit.
- Tests required: Documentation link/checklist review and no runtime changes.
- Type: Modification anomaly.

## D. Modification Anomaly Report

| Anomaly | Evidence | Severity | Why it matters | Recommended next action |
| --- | --- | --- | --- | --- |
| Duplicate commit messages for upload bounding | `5c57c27 Bound server-side upload payloads` and `5496386 Bound server-side upload payloads` both exist between baseline and HEAD | Low | Makes audit trail harder to follow, although code changes are complementary | Use more specific commit messages for follow-up fixes |
| Phase 1 upload docs could be read too broadly | Phase 1 fixed the named routes, but many other base64/storage routes remain unbounded | High | Operators may assume all upload surfaces are bounded | Update docs to state Phase 1 scope precisely |
| Stale production workflow criticism remains in prior audit doc | `docs/production-scale-readiness-audit.md` both marks deploy hardening implemented and still says production is build-only/no post-deploy checks | Medium | Readiness docs conflict | Clean up stale bullets in documentation-only task |
| Report artifact pagination bounds results but still selects raw payload fields | `endpoints/report-artifact/list_GET.ts` applies limit but selects `storageUrl` and `data` | High | Bounded count is not bounded payload size | Make list metadata-only |
| Route auth classification uses an exact endpoint count | `tests/contracts/route-auth-classification.spec.ts` asserts length 281 | Low | It is fail-fast but creates maintenance churn when endpoints are added | Keep it, but document that updates are required for every endpoint |
| Public admin-named endpoints remain intentionally public inert handlers | Public map includes admin letter-template reset endpoints; tests require `RESET_MESSAGE` or `410` | Low | Names look risky even though handlers are inert | Keep tests and consider moving retired endpoints out of admin namespace |
| Evidence upload raw guard occurs after session/rate limit | `endpoints/evidence-attachment/upload_POST.ts` authenticates and rate-limits before reading and validating raw body | Medium | Oversize calls can still write session/rate-limit state, though storage is protected | Add pre-auth content-length guard where safe |
| Clock scan query-token risk fixed only for one cron route | `endpoints/clock/scan_POST.ts` rejects query tokens; retention/scheduled scan still accept them | High | Mixed cron auth posture remains | Remove query-token auth from all cron routes |
| Production readiness checklist remains more optimistic than maximum audit | `docs/production-readiness-checklist.md` includes controlled-production language | Medium | Can be misread as broad production approval | Align language with limited beta constraints |
| No evidence of unrelated runtime refactors in Phase 1 commits | `git diff --name-status 06861e9..HEAD` shows focused endpoint/helper/test/doc/workflow changes | Pass | Parser, violation, packet readiness, response lifecycle behavior were not broadly refactored | Preserve this discipline in Phase 2 |

## E. Readiness Scorecard

| Category | Status | Evidence | Required next action | Blocks |
| --- | --- | --- | --- | --- |
| Load/concurrency | Fail | Ingest/OCR/compliance and packet PDF generation are request-bound; DB pool fixed at 3 | Add durable queues, leases, and load tests | production, scale |
| Upload/file boundaries | Partial | Phase 1 routes bounded; legacy/admin/review/parser-test/report-artifact routes remain weak | Extend shared validation to all base64 surfaces | production, scale |
| Ingest/OCR/parser | Partial | Deterministic tests pass, but execution is synchronous and OCR is request-bound | Durable ingest/OCR queue and lifecycle events | production, scale |
| Violation/evidence/regulation correctness | Partial | Golden path and deterministic ingestion pass; admin correction tests pass | Keep truth-layer tests, add larger fixture set | scale |
| Packet lifecycle/PDF | Partial | Ownership and readiness tests pass; PDF render/send is synchronous | Queue/cache packet PDFs with metrics | production, scale |
| Response processing | Partial | Soak check passes; dashboard flags live scheduler, external alerts, purge/backfill gaps | Finish production operations proof | production |
| Database/indexing/pool/migrations | Fail | Fixed DB pool, mixed schema strategy, remaining unbounded lists | Env pool config, migration ledger, query limit audit | production, scale |
| Storage/retention/privacy | Fail | Raw report base64 in DB, destructive retention purge, no storage migration | Object storage, retention apply guard, restore proof | production, scale |
| Auth/tenant isolation | Partial | 281 endpoints classified; many privacy tests pass | Add support-role matrix and more route-level owner-denial tests | production |
| Cron/retention/scheduled jobs | Partial | Clock scan fixed; retention and scheduled scan still accept query tokens | Bearer-only cron auth and retention apply confirmation | production |
| Observability/operator dashboard | Partial | Response dashboard strong; ingest/PDF/storage/auth/DB metrics weak | Durable events/metrics and thresholds | production, scale |
| Deployment/rollback | Partial | Production workflow hardened; promotion gate strong for staging | Add production-safe read-only privacy probes | production |
| Disaster recovery | Fail | Checklist exists but no completed restore drill evidence | Human-observed restore drill with RPO/RTO | production, scale |
| Tests/regression protection | Partial | Strong API/contracts/golden/soak suite; no real load/restore/pool tests | Add concurrency/load/restore tests | production, scale |
| Frontend operational UX | Partial | Upload pages show client limits; beta constraints are policy-only | Surface operational failure states and align limits everywhere | production |
| Dependency/build/runtime | Partial | Build passes; large frontend chunk and heavy PDF/OCR dependencies remain | Bundle/runtime analysis and container dependency audit | scale |
| Documentation/runbooks | Partial | Beta policy exists; stale readiness statements remain | Align docs and add restore/incident evidence | production |

## F. Endpoint Auth Classification Appendix

Source of truth verified: `tests/contracts/route-auth-classification.spec.ts`.

The contract verifies all endpoint handler files against `server.ts`, rejects missing or duplicate classifications, and currently asserts 281 endpoint handlers. Categories used are `public`, `session-authenticated`, `admin-only`, `cron-token authenticated`, `webhook-signature authenticated`, and `intentionally test/local-only`. No unsafe/unclassified endpoint was found by the contract at HEAD.

### public (23)

- `endpoints/admin/letter-template/delete_POST.ts`
- `endpoints/admin/letter-template/history_GET.ts`
- `endpoints/admin/letter-template/humanize_POST.ts`
- `endpoints/admin/letter-template/rollback_POST.ts`
- `endpoints/admin/letter-template/seed_POST.ts`
- `endpoints/admin/letter-template_POST.ts`
- `endpoints/admin/letter-templates_GET.ts`
- `endpoints/auth/establish_session_POST.ts`
- `endpoints/auth/login_with_password_POST.ts`
- `endpoints/auth/logout_POST.ts`
- `endpoints/auth/oauth_authorize_GET.ts`
- `endpoints/auth/oauth_callback_GET.ts`
- `endpoints/auth/register_with_password_POST.ts`
- `endpoints/auth/request_password_reset_POST.ts`
- `endpoints/auth/reset_password_POST.ts`
- `endpoints/auth/verify_email_POST.ts`
- `endpoints/escalation/auto-trigger_POST.ts`
- `endpoints/escalation/scan_POST.ts`
- `endpoints/escalation/trigger_POST.ts`
- `endpoints/ingest/anonymous-report_POST.ts`
- `endpoints/lead/reminder_POST.ts`
- `endpoints/pdf/platform-functions_GET.ts`
- `endpoints/planner/select_POST.ts`

### session-authenticated (132)

- `endpoints/ai-assist/consumer-finding-explanation_POST.ts`
- `endpoints/auth/request_verification_email_POST.ts`
- `endpoints/auth/session_GET.ts`
- `endpoints/bankruptcy/create_POST.ts`
- `endpoints/bankruptcy/delete_POST.ts`
- `endpoints/bankruptcy/list_GET.ts`
- `endpoints/bankruptcy/update_POST.ts`
- `endpoints/bureau/dispute-contacts_GET.ts`
- `endpoints/bureau/list_GET.ts`
- `endpoints/calendar/check-deadlines_POST.ts`
- `endpoints/cases/patch_POST.ts`
- `endpoints/cases/review-data_GET.ts`
- `endpoints/cases/review_GET.ts`
- `endpoints/consumer-signature/list_GET.ts`
- `endpoints/creditor-validation/create_POST.ts`
- `endpoints/creditor-validation/delete_POST.ts`
- `endpoints/creditor-validation/dismiss_POST.ts`
- `endpoints/creditor-validation/list_GET.ts`
- `endpoints/creditor-validation/update_POST.ts`
- `endpoints/dashboard/stats_GET.ts`
- `endpoints/deadline/complete_POST.ts`
- `endpoints/deadline/create_POST.ts`
- `endpoints/deadline/delete_POST.ts`
- `endpoints/deadline/overdue_GET.ts`
- `endpoints/deadline/upcoming_GET.ts`
- `endpoints/deadline/update_POST.ts`
- `endpoints/discrimination/create_POST.ts`
- `endpoints/discrimination/delete_POST.ts`
- `endpoints/discrimination/list_GET.ts`
- `endpoints/discrimination/update_POST.ts`
- `endpoints/enforcement-mechanism/list_GET.ts`
- `endpoints/evidence-attachment/list_GET.ts`
- `endpoints/evidence-attachment/package_POST.ts`
- `endpoints/evidence-attachment/upload_POST.ts`
- `endpoints/evidence/bureau-communication_POST.ts`
- `endpoints/evidence/create_POST.ts`
- `endpoints/evidence/delete_POST.ts`
- `endpoints/evidence/list_GET.ts`
- `endpoints/evidence/update_POST.ts`
- `endpoints/feature-flag/list_GET.ts`
- `endpoints/fraud-freeze/cancel_POST.ts`
- `endpoints/fraud-freeze/create_POST.ts`
- `endpoints/fraud-freeze/list_GET.ts`
- `endpoints/fraud-freeze/request-thaw_POST.ts`
- `endpoints/fraud-freeze/update_POST.ts`
- `endpoints/hidden-risk/list_GET.ts`
- `endpoints/ingest/process_POST.ts`
- `endpoints/ingest/report_POST.ts`
- `endpoints/legal-authority/search_GET.ts`
- `endpoints/licensed-agency/ai-verify_POST.ts`
- `endpoints/licensed-agency/check_GET.ts`
- `endpoints/metro2-validation-log/list_GET.ts`
- `endpoints/obligation-instance/list_GET.ts`
- `endpoints/obligation-instance/record-response_POST.ts`
- `endpoints/obligation/list_GET.ts`
- `endpoints/ocr/extract_POST.ts`
- `endpoints/outcomes/compare_POST.ts`
- `endpoints/outcomes/get_GET.ts`
- `endpoints/outcomes/list_GET.ts`
- `endpoints/packet/build_POST.ts`
- `endpoints/packet/compliance-audit_GET.ts`
- `endpoints/packet/compliance-calendar_GET.ts`
- `endpoints/packet/create_POST.ts`
- `endpoints/packet/delete_POST.ts`
- `endpoints/packet/delivery_POST.ts`
- `endpoints/packet/get_GET.ts`
- `endpoints/packet/impact_GET.ts`
- `endpoints/packet/list_GET.ts`
- `endpoints/packet/pdf_GET.ts`
- `endpoints/packet/recommend_GET.ts`
- `endpoints/packet/save_POST.ts`
- `endpoints/packet/send-first-class_POST.ts`
- `endpoints/packet/send-registered_POST.ts`
- `endpoints/packet/update-status_POST.ts`
- `endpoints/packet/validate-readiness_POST.ts`
- `endpoints/pdf/analytics-report_POST.ts`
- `endpoints/pdf/knowledge-base_GET.ts`
- `endpoints/pdf/report_POST.ts`
- `endpoints/postal/transactions_GET.ts`
- `endpoints/regulatory-notification/dismiss-all_POST.ts`
- `endpoints/regulatory-notification/mark-read_POST.ts`
- `endpoints/regulatory-update/list_GET.ts`
- `endpoints/report-artifact/create_POST.ts`
- `endpoints/report-artifact/delete_POST.ts`
- `endpoints/report-artifact/get_GET.ts`
- `endpoints/report-artifact/list_GET.ts`
- `endpoints/report-artifact/update_POST.ts`
- `endpoints/responses/capture_POST.ts`
- `endpoints/responses/get_GET.ts`
- `endpoints/responses/list_GET.ts`
- `endpoints/responses/metrics_GET.ts`
- `endpoints/review/approve_POST.ts`
- `endpoints/review/reject_POST.ts`
- `endpoints/statute/filter-options_GET.ts`
- `endpoints/statute/history_GET.ts`
- `endpoints/statute/list_GET.ts`
- `endpoints/stripe/create-payment-intent_POST.ts`
- `endpoints/subscription/cancel_POST.ts`
- `endpoints/subscription/confirm-payment_POST.ts`
- `endpoints/subscription/create-checkout_POST.ts`
- `endpoints/subscription/status_GET.ts`
- `endpoints/subscription/update-plan_POST.ts`
- `endpoints/success/analytics_GET.ts`
- `endpoints/support-ticket/agents_GET.ts`
- `endpoints/support-ticket/create_POST.ts`
- `endpoints/support-ticket/get_GET.ts`
- `endpoints/support-ticket/list_GET.ts`
- `endpoints/support-ticket/reply_POST.ts`
- `endpoints/support-ticket/update_POST.ts`
- `endpoints/support/ai-chat_POST.ts`
- `endpoints/tradeline/change-timeline_GET.ts`
- `endpoints/tradeline/create_POST.ts`
- `endpoints/tradeline/delete_POST.ts`
- `endpoints/tradeline/detect-changes_POST.ts`
- `endpoints/tradeline/drift-logs_GET.ts`
- `endpoints/tradeline/gap-fill_POST.ts`
- `endpoints/tradeline/get_GET.ts`
- `endpoints/tradeline/list_GET.ts`
- `endpoints/tradeline/rescan-compliance_POST.ts`
- `endpoints/tradeline/rotation-history_GET.ts`
- `endpoints/upload-results/get_GET.ts`
- `endpoints/user/accept-terms_POST.ts`
- `endpoints/user/data-summary_GET.ts`
- `endpoints/user/delete-account_POST.ts`
- `endpoints/user/delete-data_POST.ts`
- `endpoints/user/identification/delete_POST.ts`
- `endpoints/user/identification/file_GET.ts`
- `endpoints/user/identification_GET.ts`
- `endpoints/user/identification_POST.ts`
- `endpoints/user/profile_GET.ts`
- `endpoints/user/profile_POST.ts`
- `endpoints/version/current_GET.ts`

### admin-only (120)

- `endpoints/admin/ai-assist/findings_GET.ts`
- `endpoints/admin/ai-assist/runs_GET.ts`
- `endpoints/admin/audit-logs_GET.ts`
- `endpoints/admin/backfill-compliance_POST.ts`
- `endpoints/admin/cleanup-stale-auth_POST.ts`
- `endpoints/admin/compliance-config_GET.ts`
- `endpoints/admin/compliance-config_POST.ts`
- `endpoints/admin/create-support-agent_POST.ts`
- `endpoints/admin/delete-user_POST.ts`
- `endpoints/admin/diagnostic/semantic-audit_POST.ts`
- `endpoints/admin/mock-lifecycle/list_GET.ts`
- `endpoints/admin/mock-lifecycle/report_GET.ts`
- `endpoints/admin/mock-lifecycle/run_POST.ts`
- `endpoints/admin/mock-lifecycle/status_GET.ts`
- `endpoints/admin/postal-revenue_GET.ts`
- `endpoints/admin/purge_POST.ts`
- `endpoints/admin/reset-user_POST.ts`
- `endpoints/admin/retention/stats_GET.ts`
- `endpoints/admin/retention_POST.ts`
- `endpoints/admin/seed_POST.ts`
- `endpoints/admin/settings_GET.ts`
- `endpoints/admin/settings_POST.ts`
- `endpoints/admin/user-detail_GET.ts`
- `endpoints/admin/users_GET.ts`
- `endpoints/admin/violation-correction/create_POST.ts`
- `endpoints/admin/violation-correction/detail_GET.ts`
- `endpoints/admin/violation-correction/evidence_POST.ts`
- `endpoints/admin/violation-correction/export_POST.ts`
- `endpoints/admin/violation-correction/finalize_POST.ts`
- `endpoints/admin/violation-correction/regulation-reference_POST.ts`
- `endpoints/admin/violation-correction/runs_GET.ts`
- `endpoints/admin/violation-correction/update_POST.ts`
- `endpoints/audit/log_GET.ts`
- `endpoints/bureau-detection-config/list_GET.ts`
- `endpoints/bureau-detection-config/update_POST.ts`
- `endpoints/bureau-detection-config/upsert_POST.ts`
- `endpoints/bureau/create_POST.ts`
- `endpoints/bureau/delete_POST.ts`
- `endpoints/enforcement-mechanism/create_POST.ts`
- `endpoints/enforcement-mechanism/delete_POST.ts`
- `endpoints/enforcement-mechanism/update_POST.ts`
- `endpoints/feature-flag/create_POST.ts`
- `endpoints/feature-flag/delete_POST.ts`
- `endpoints/feature-flag/update_POST.ts`
- `endpoints/lead/send-reminders_POST.ts`
- `endpoints/licensed-agency/import_POST.ts`
- `endpoints/licensed-agency/list_GET.ts`
- `endpoints/migration/create_POST.ts`
- `endpoints/migration/list_GET.ts`
- `endpoints/migration/update_POST.ts`
- `endpoints/obligation/create_POST.ts`
- `endpoints/obligation/delete_POST.ts`
- `endpoints/obligation/update_POST.ts`
- `endpoints/outcomes/admin-review_POST.ts`
- `endpoints/parser-known-entity/create_POST.ts`
- `endpoints/parser-known-entity/list_GET.ts`
- `endpoints/parser-lab/run_POST.ts`
- `endpoints/parser-mapping/create_POST.ts`
- `endpoints/parser-mapping/delete_POST.ts`
- `endpoints/parser-mapping/history_GET.ts`
- `endpoints/parser-mapping/list_GET.ts`
- `endpoints/parser-mapping/rollback_POST.ts`
- `endpoints/parser-mapping/test_POST.ts`
- `endpoints/parser-mapping/update_POST.ts`
- `endpoints/parser-test-case/adjudicate_POST.ts`
- `endpoints/parser-test-case/create_POST.ts`
- `endpoints/parser-test-case/delete_POST.ts`
- `endpoints/parser-test-case/export_POST.ts`
- `endpoints/parser-test-case/import_POST.ts`
- `endpoints/parser-test-case/list_GET.ts`
- `endpoints/parser-test-case/promote-rule_POST.ts`
- `endpoints/parser-test-case/run-all_POST.ts`
- `endpoints/parser-test-case/run_POST.ts`
- `endpoints/parser-test-case/update_POST.ts`
- `endpoints/pdf/admin-knowledge-base_GET.ts`
- `endpoints/regulation-registry/advisory-bridge/report_GET.ts`
- `endpoints/regulation-registry/candidates_GET.ts`
- `endpoints/regulation-registry/create-candidate_POST.ts`
- `endpoints/regulation-registry/deactivate_POST.ts`
- `endpoints/regulation-registry/list_GET.ts`
- `endpoints/regulation-registry/mapping_GET.ts`
- `endpoints/regulation-registry/mapping_POST.ts`
- `endpoints/regulation-registry/rebuild-index_POST.ts`
- `endpoints/regulation-registry/reconciliation-candidates/create_POST.ts`
- `endpoints/regulation-registry/reconciliation-candidates/list_GET.ts`
- `endpoints/regulation-registry/reconciliation-candidates/update-status_POST.ts`
- `endpoints/regulation-registry/restore_POST.ts`
- `endpoints/regulation-registry/review_POST.ts`
- `endpoints/regulation-registry/runtime-bridge/create_POST.ts`
- `endpoints/regulation-registry/runtime-bridge/list_GET.ts`
- `endpoints/regulation-registry/runtime-bridge/update-status_POST.ts`
- `endpoints/regulation-registry/scan_POST.ts`
- `endpoints/regulation-registry/shadow-bridge/report_GET.ts`
- `endpoints/regulatory-notification/list_GET.ts`
- `endpoints/regulatory-update/auto-escalate_POST.ts`
- `endpoints/regulatory-update/create_POST.ts`
- `endpoints/regulatory-update/delete_POST.ts`
- `endpoints/regulatory-update/rollback_POST.ts`
- `endpoints/regulatory-update/scan_POST.ts`
- `endpoints/regulatory-update/update_POST.ts`
- `endpoints/responses/admin-review_POST.ts`
- `endpoints/responses/queue-remediation_POST.ts`
- `endpoints/responses/queue_GET.ts`
- `endpoints/scanning-rule/delete_POST.ts`
- `endpoints/scanning-rule/generate-all_POST.ts`
- `endpoints/scanning-rule/generate_POST.ts`
- `endpoints/scanning-rule/list_GET.ts`
- `endpoints/scanning-rule/update_POST.ts`
- `endpoints/statute/create_POST.ts`
- `endpoints/statute/delete_POST.ts`
- `endpoints/statute/update_POST.ts`
- `endpoints/tradeline/backfill-source-text_POST.ts`
- `endpoints/version/change-summary_GET.ts`
- `endpoints/version/create_POST.ts`
- `endpoints/version/delete_POST.ts`
- `endpoints/version/generate-notes_POST.ts`
- `endpoints/version/list_GET.ts`
- `endpoints/version/snapshot_POST.ts`
- `endpoints/version/update_POST.ts`
- `endpoints/version/validate-publish_POST.ts`

### cron-token authenticated (3)

- `endpoints/clock/scan_POST.ts`
- `endpoints/regulation-registry/scheduled-scan_POST.ts`
- `endpoints/retention/auto-purge_POST.ts`

### webhook-signature authenticated (3)

- `endpoints/webhook/postgrid_POST.ts`
- `endpoints/webhook/stripe_POST.ts`
- `endpoints/webhook/tracking_POST.ts`

### intentionally test/local-only (0)

None.

### unsafe/unclassified

None found by `tests/contracts/route-auth-classification.spec.ts` at commit `18c7e187c52a27b34eb41e3811a7d1527f7f1166`.

## G. High-Growth Table And DB Risk Appendix

| Table or data set | Growth driver | Current risk | Evidence | Required action |
| --- | --- | --- | --- | --- |
| `reportArtifact` | Every report upload, parser-test materialization, review approval | Raw base64 in `storageUrl`, large `data`, long retention | `helpers/ingestArtifactCreator.tsx`, `endpoints/review/approve_POST.ts` | Move raw bytes out of DB and make list metadata-only |
| `tradeline` | Parsed report accounts | High insert/update volume during ingest | `helpers/ingestCorePipeline.tsx`, `endpoints/review/approve_POST.ts` | Queue ingest and verify indexes |
| `tradelinePaymentHistory` | Payment history per tradeline/month | Large child table tied to uploads | `helpers/dataRetention.tsx`, parser pipeline | Index and lifecycle audit |
| `obligationChallengeLog` | Compliance scans and obligations | Writes during ingest/compliance | `helpers/complianceScanner.tsx`, `helpers/ingestCleanup.tsx` | Durable lifecycle and cleanup events |
| `creditorObligationTest` | Violation/compliance detections | Grows with each scan | `helpers/complianceScanner.tsx`, packet readiness paths | Scan idempotency and query limits |
| `obligationInstance` | User obligations and responses | Grows with disputes and lifecycle events | `helpers/dataRetention.tsx` | Pagination and retention preview proof |
| `packet` | Packet create/build/download/send | Synchronous PDF pressure and status churn | `helpers/disputePacketService.ts`, `endpoints/packet/*` | PDF cache/queue and status index review |
| `packetComplianceAudit` | Packet readiness/compliance audits | Audit growth | `helpers/dataRetention.tsx` | Retention and query bound tests |
| `evidenceAttachment` | Evidence and bureau communications | Stores file references and some base64 | `endpoints/evidence-attachment/upload_POST.ts`, `endpoints/evidence/bureau-communication_POST.ts` | Move all files to object storage and bound list |
| `evidenceEvent` | Packet sent/download/evidence events | Append growth | `endpoints/packet/pdf_GET.ts`, send routes | Retention and audit query limits |
| `deadlineEvent` | Packet send deadlines | Scheduled follow-up growth | `endpoints/packet/send-first-class_POST.ts` | Index and retention tests |
| `auditLog` | Auth, upload, admin, purge events | Must grow append-only | `helpers/auditLogger` callers | Retention/search/export policy |
| `sessions` | Every login and authenticated request touches | Write amplification from `lastAccessed` | `helpers/getServerUserSession.tsx` | Throttle writes and add DB metrics |
| `rateLimitEntry` | Rate-limited endpoint calls | Write/delete amplification | `helpers/rateLimiter.tsx` | External or bounded rate limit store |
| `responseDocument` | Captured bureau responses | Sensitive document growth | `helpers/responseDocumentSchema.ts` | Continue lifecycle/purge work |
| `responseProcessingJob` | Response queue | Stronger lifecycle than ingest, but grows with captures | `helpers/responseProcessingQueueService.ts` | Live daemon and purge/archive proof |
| `responseProcessingEvent` | Queue/job events | Append growth | `helpers/responseProcessingQueueService.ts` | Retention and export policy |
| Parser-test tables | Admin parser lab and fixture import | Can store base64 PDFs | `endpoints/parser-test-case/create_POST.ts`, `endpoints/parser-test-case/import_POST.ts` | Size/count limits and storage policy |

## H. Test Coverage Gap Appendix

| Proposed test | Area | Risk covered | Files/routes/functions | Priority | Blocks |
| --- | --- | --- | --- | --- | --- |
| `ingest-job-queue-idempotency.spec.ts` | Ingest | Duplicate/retry storm safety | Future ingest queue service | Critical | production, scale |
| `ingest-concurrency-load.spec.ts` | Load | Concurrent upload/process behavior | `endpoints/ingest/*`, `helpers/ingestCorePipeline.tsx` | Critical | scale |
| `report-artifact-storage-contract.spec.ts` | Storage | Raw report bytes moved out of DB | `helpers/ingestArtifactCreator.tsx`, report artifact routes | Critical | production |
| `report-artifact-create-update-upload-bounds.spec.ts` | Upload | Direct artifact mutation bypass | `endpoints/report-artifact/create_POST.ts`, `update_POST.ts` | High | production |
| `review-approve-upload-bounds.spec.ts` | Upload/auth | Body parse before auth and oversized base64 | `endpoints/review/approve_POST.ts` | High | production |
| `parser-test-case-upload-bounds.spec.ts` | Admin upload | Large admin fixture/import payloads | Parser-test routes | High | production |
| `parser-lab-upload-bounds.spec.ts` | Admin parser | Large parser lab payloads | `endpoints/parser-lab/run_POST.ts` | High | production |
| `consumer-identification-upload-bounds.spec.ts` | Upload/privacy | Strict base64 and raw body guard | `endpoints/user/identification_POST.ts` | Medium | production |
| `packet-pdf-cache.spec.ts` | Packet PDF | Repeated render prevention | `endpoints/packet/pdf_GET.ts`, PDF storage | High | production |
| `packet-pdf-render-failure-metrics.spec.ts` | Observability | Durable PDF failures | Packet PDF routes/dashboard | High | production |
| `cron-query-token-rejection.spec.ts` | Cron auth | Query token leakage/abuse | Retention and scheduled scan routes | High | production |
| `retention-two-step-apply.spec.ts` | Retention | Destructive purge safety | `helpers/dataRetention.tsx`, `endpoints/retention/auto-purge_POST.ts` | High | production |
| `db-pool-config.spec.ts` | DB | Env-driven pool settings | `helpers/db.tsx` | Medium | production |
| `session-touch-throttle.spec.ts` | Auth/DB | Session write amplification | `helpers/getServerUserSession.tsx` | Medium | scale |
| `support-role-privacy-matrix.spec.ts` | Auth | Support boundary proof | Report, packet, evidence, ticket routes | High | production |
| `evidence-list-pagination.spec.ts` | DB/API | Unbounded evidence list | `endpoints/evidence-attachment/list_GET.ts` | Medium | production |
| `metro2-log-list-pagination.spec.ts` | DB/API | Unbounded validation logs | `endpoints/metro2-validation-log/list_GET.ts` | Medium | production |
| `restore-drill-evidence.spec.ts` | DR | Restore proof artifact | Restore docs/scripts | Critical | production |
| `production-safe-privacy-smoke.spec.ts` | Deployment | Post-deploy owner/auth denial | Production workflow/gate | High | production |
| `storage-growth-dashboard.spec.ts` | Observability | Storage growth visibility | Dashboard scripts/storage helpers | High | scale |
| `ingest-failure-dashboard.spec.ts` | Observability | Parser/OCR failure visibility | Ingest/OCR helpers/dashboard | High | production |
| `rate-limit-write-pressure.spec.ts` | DB/load | Rate limiter DB write pressure | `helpers/rateLimiter.tsx` | Medium | scale |
| `bundle-size-report.spec.ts` | Runtime | Frontend chunk growth | Build/report scripts | Low | scale |
| `object-storage-fallback-privacy.spec.ts` | Storage/privacy | Local/GCS storage access paths | `helpers/gcsStorage.ts`, `helpers/documentStorage.ts` | Medium | production |
| `operator-policy-acceptance.spec.ts` | Beta ops | Policy drift | `docs/limited-beta-operator-launch-policy.md`, dashboard | Medium | beta |

## I. Production Promotion Checklist

### Must pass before limited beta

- Phase 1 upload, clock scan, pagination, deploy workflow, route auth classification, and beta policy remain green.
- `pnpm run typecheck`, `pnpm run build`, `pnpm run test:contracts`, `pnpm run test:api`, `pnpm run test:golden-path`, `pnpm run test:regression-dashboard`, `pnpm run test:deterministic-ingestion-report`, `pnpm run response:soak-check`, and `pnpm run operator:dashboard` pass.
- Beta policy limits are accepted: maximum 5 beta/internal users, maximum 3 concurrent active users, 1 concurrent report upload/process operation, 25 daily report uploads total, 5 daily report uploads per user, authenticated report PDF 15 MB, anonymous report PDF 20 MB, evidence/bureau attachments 10 MB, 25 packet creations per day, 50 packet PDF download/send operations per day, operator-supervised response-worker apply.
- Operators monitor the dashboard daily and immediately after failed ingest, packet, or response events.
- No production-at-scale claim is made.

### Must pass before broader production

- Durable ingest/OCR/compliance queue implemented and tested.
- Raw report PDFs moved out of `reportArtifact.storageUrl` for new uploads.
- All base64 routes, not only Phase 1 upload routes, enforce decoded-byte, MIME, filename, malformed base64, and raw body guards.
- Packet PDF rendering is queued or cached with failure metrics.
- DB pool settings are environment-driven and pool/latency metrics exist.
- Query-token cron auth is removed or formally deprecated with compensating controls.
- Report artifact list is metadata-only.
- High-growth list endpoints have defaults/max limits.
- Production-safe privacy smokes exist.
- Human-observed restore drill is completed and recorded.

### Must pass before production at scale

- Ingest, OCR, compliance, packet PDF, storage, auth, DB pool, queue, dead-letter, and retry metrics are durable and thresholded.
- Disaster recovery has tested RPO/RTO and repeated restore validation.
- Load/concurrency suites prove target traffic capacity.
- Object storage lifecycle, retention, purge preview/apply, and sensitive dump controls are proven.
- Migration ledger and deploy gate remove local/staging/prod schema drift.
- Response subsystem has live scheduler, external alert delivery, purge/archive path, and historical backfill strategy.
- Operator runbooks cover incident stop conditions, rollback, storage growth, DB pressure, parser/OCR failure spikes, and unauthorized access signals.

## J. Recommended Codex Task Sequence

### Phase 1: limited beta blockers

| Task | Exact blocker addressed | Allowed scope | Forbidden scope | Tests required | Success criteria |
| --- | --- | --- | --- | --- | --- |
| Keep Phase 1 blocker tests green | Regressions in completed Phase 1 work | Existing upload/clock/pagination/deploy/auth/policy tests | New architecture | Current Phase 1 tests | Limited beta posture remains intact |
| Documentation alignment cleanup | Stale readiness statements | `docs/*readiness*`, no runtime files | Code or deploy changes | `git diff --check` | Docs consistently say limited beta only |

### Phase 2: broader production blockers

| Task | Exact blocker addressed | Allowed scope | Forbidden scope | Tests required | Success criteria |
| --- | --- | --- | --- | --- | --- |
| Add durable ingest/OCR/compliance queue | Critical request-bound ingest path | New queue schema/service, ingest endpoints, worker scripts | Parser truth, violation logic, packet readiness changes | Queue idempotency, retry, dead-letter, deterministic regression | Upload enqueues work and worker processes deterministically |
| Move raw report PDFs out of DB for new uploads | Raw `reportArtifact.storageUrl` base64 | Storage adapter, new upload write path, read compatibility | Destructive migration of existing data | Upload/read/non-owner/storage tests | New reports store references, old reports still readable |
| Bound remaining base64 surfaces | Legacy/admin upload bypass | Specific schemas/handlers listed in Blocker 3 | Parser/output changes | Oversize/malformed/MIME tests per route | Direct API bypasses rejected early |
| Cache or queue packet PDFs | Synchronous PDF render | Packet PDF storage/status/metrics | Packet wording/content rewrite | Cache/retry/non-owner tests | Repeated downloads avoid repeated render |
| Harden cron/retention auth | Query token cron risk | Cron handlers/tests | Global auth rewrite | Bearer accepted/query rejected tests | Cron routes use bearer-only derived tokens |

### Phase 3: production-scale hardening

| Task | Exact blocker addressed | Allowed scope | Forbidden scope | Tests required | Success criteria |
| --- | --- | --- | --- | --- | --- |
| DB pool and migration hardening | Fixed pool and schema drift | DB config, migration ledger/checker | Query rewrites unrelated to scale | Config and deploy gate tests | Production DB config is observable and migrations are deterministic |
| Observability expansion | Ingest/PDF/storage/auth/DB blind spots | Metrics/events/dashboard scripts | External services unless already configured | Dashboard and metric tests | Operators see thresholds before user reports |
| Load/concurrency harness | Unknown capacity | Local/staging-safe scripts | Production mutation | Concurrency/load reports | Capacity and failure mode evidence exists |
| Retention and purge safety | Destructive purge | Retention preview/apply events | Retention policy rewrite | Preview/apply/audit tests | Purge requires explicit safe confirmation and is auditable |

### Phase 4: operational maturity

| Task | Exact blocker addressed | Allowed scope | Forbidden scope | Tests required | Success criteria |
| --- | --- | --- | --- | --- | --- |
| Restore drill evidence | DR proof gap | Runbooks/docs/scripts | Production data mutation from Codex | Checklist and golden path after restore | RPO/RTO and restore date/operator/SHA are recorded |
| Response operations completion | Remaining response gaps | Scheduler/alerts/purge/backfill docs and scripts | Queue semantics rewrite | Soak, alert, lifecycle, dashboard tests | Response subsystem is production-operational |
| Frontend/operator UX alignment | Policy and failure visibility | UI copy/states and admin dashboard | Parser/packet business logic | UI/unit/API checks | Users/operators see accurate blocked/failure states |
| Dependency/runtime audit | Bundle/runtime drift | Reports, Docker/runtime docs | Dependency upgrades without task | Build and report tests | Runtime size and dependency risks are tracked |

## K. Final Conclusion

CreditRegulatorPro is not production-at-scale ready at commit `18c7e187c52a27b34eb41e3811a7d1527f7f1166`. It is limited beta ready with strict constraints because the six Phase 1 blockers are implemented and verified, but the broader architecture still depends on request-bound ingest/OCR/compliance work, database-stored raw reports, synchronous packet PDF rendering, incomplete observability, incomplete restore proof, and unresolved database/concurrency risks.

The single highest-risk blocker is the synchronous ingest/OCR/compliance pipeline combined with raw report PDFs stored in `reportArtifact.storageUrl`.

The safest next Codex implementation prompt is: "Implement a durable ingest/OCR/compliance job queue with idempotency, leases, retry/dead-letter handling, and operator remediation, preserving deterministic parser output and existing violation/packet behavior."

Do not work on object storage migration, packet PDF queueing, DB pool changes, or external alerting in the same task as the ingest queue. Those should remain separate narrow tasks with their own tests.

## Verification Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `git status --short` | Pass | Clean before audit work |
| `git branch --show-current` | Pass | `staging` |
| `git rev-parse HEAD` | Pass | `18c7e187c52a27b34eb41e3811a7d1527f7f1166` |
| `git log --oneline -20` | Pass | Phase 1 commits present after baseline |
| `git cat-file -e "06861e9^{commit}"` | Pass | Baseline exists locally |
| `git diff --name-status 06861e9..HEAD` | Pass | 32 changed files, focused on Phase 1 work/docs/tests/workflows |
| `git diff --stat 06861e9..HEAD` | Pass | 2497 insertions, 74 deletions |
| `pnpm run typecheck` | Pass | TypeScript no emit succeeded |
| `pnpm run build` | Pass | Vite build succeeded; large main chunk observed |
| `pnpm run test:contracts` | Pass | 2 files, 9 tests |
| `pnpm run test:api` | Pass | 25 files, 221 tests |
| `pnpm run test:golden-path` | Pass | Upload, parse, canonical map, anomaly detect, violation detect, evidence bind, packet generate, PDF download all PASS |
| `pnpm run test:regression-dashboard` | Pass | Human-readable golden path passed |
| `pnpm run test:deterministic-ingestion-report` | Pass | 11 fixtures, replay stable, required evidence coverage 100 percent, violation search preserved |
| `pnpm run response:soak-check` | Pass | Duplicate collapse, retries, dead letter, stale running, replay dry run, retention preview, drift detection verified |
| `pnpm run operator:dashboard` | Pass | Dashboard generated; several production-scale gaps intentionally remain open |
| `cat package.json` equivalent | Pass | `Get-Content -Raw package.json` used on Windows |
| List available pnpm scripts | Pass | Script names inspected from `package.json` |

No required verification command was unavailable. Exploratory commands with Unix heredoc or incorrect `.ts` extension paths were corrected and did not affect the verification result.

## Non-Regression Confirmation

This audit did not change runtime code. It found no evidence that recent Phase 1 work broadly refactored deterministic parsing, canonical extraction, violation search/extraction, evidence binding, packet readiness gating, packet PDF content behavior, response-processing lifecycle protections, deployment runtime behavior, or auth architecture.
