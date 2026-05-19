# Production Scale Readiness Audit

Audit date: 2026-05-19

Audited repository state: `06861e9 Scope Playwright apt frontend in staging smokes`

Scope inspected: code, routes, helper services, deployment workflows, Docker image, operator scripts, tests, response-processing queue/lifecycle tooling, ingestion/OCR, packet generation, auth/tenant boundaries, observability, rollback, and backup/restore posture.

This audit is documentation-only. It does not change runtime behavior, parser output, violation search, evidence binding, packet readiness, response lifecycle protections, or deploy smokes.

## A. Executive Verdict

**Verdict: Limited beta ready with blockers.**

The response-processing subsystem is comparatively strong: manual/admin intake, deterministic classification, replay/backfill, DB-backed queueing, remediation, bounded orchestration, retention marking, drift detection, and soak checks are implemented with append-only events and privacy guardrails in `helpers/responseDocumentSchema.ts`, `helpers/responseProcessingQueueService.ts`, `helpers/responseWorkerOrchestrationService.ts`, `helpers/responseProcessingLifecycleService.ts`, and related tests.

The project is **not production-at-scale ready**. The highest-risk paths are still the older report ingestion, OCR/PDF parsing, report artifact storage, packet PDF generation, production deployment verification, and operational disaster-recovery proof. Several high-cost flows remain synchronous and request-bound. Large base64 payload handling is not consistently enforced on the server. Raw uploaded report PDFs are stored directly in the database-backed `reportArtifact.storageUrl` path. Production deploy checks are materially thinner than staging checks.

Limited beta should not proceed until the Phase 1 blockers below are fixed or explicitly constrained by operator policy, traffic limits, and rollback gates.

## Audit Method

Inspected representative files and functions:

- Ingestion/OCR: `endpoints/ingest/report_POST.ts`, `endpoints/ingest/process_POST.ts`, `endpoints/ingest/anonymous-report_POST.ts`, `helpers/schemas.tsx`, `helpers/ingestReportHandler.tsx`, `helpers/ingestCorePipeline.tsx`, `helpers/ingestArtifactCreator.tsx`, `helpers/ingestCleanup.tsx`, `helpers/canonicalCreditReportExtractor.tsx`, `helpers/pdfTextExtractor.tsx`, `helpers/deterministicOcr.ts`, `endpoints/ocr/extract_POST.ts`.
- Packet generation: `endpoints/packet/build_POST.ts`, `endpoints/packet/create_POST.ts`, `endpoints/packet/list_GET.ts`, `endpoints/packet/list_GET.schema.ts`, `endpoints/packet/pdf_GET.ts`, `helpers/disputePacketService.ts`, `helpers/packetPdfContent.ts`.
- Auth and tenant isolation: `helpers/getServerUserSession.tsx`, `helpers/getSetServerSession.tsx`, `helpers/accessControl.ts`, `endpoints/report-artifact/*`, `endpoints/evidence/*`, `endpoints/packet/*`, `endpoints/responses/*`.
- Response operations: `helpers/responseDocumentSchema.ts`, `helpers/responseProcessingQueueService.ts`, `helpers/responseWorkerOrchestrationService.ts`, `helpers/responseProcessingLifecycleService.ts`, `helpers/responseProcessingMetrics.ts`, `scripts/response-processing-worker.ts`, `scripts/response-processing-lifecycle.ts`, `scripts/response-processing-soak-check.ts`.
- Deployment/ops: `.github/workflows/deploy-staging.yml`, `.github/workflows/deploy-production.yml`, `Dockerfile`, `scripts/promote-production.mjs`, `scripts/production-readiness-gate.mjs`, `scripts/check-staging-gate.mjs`, `scripts/commit-push-staging.mjs`, `scripts/staging-backup-restore-checklist.mjs`, `scripts/staging-observability-check.mjs`, `scripts/staging-scale-baseline.mjs`, `scripts/operator-regression-dashboard.ts`.
- Tests: `tests/api/report-ingest-lifecycle-endpoint.spec.ts`, `tests/api/packet-lifecycle-endpoint.spec.ts`, `tests/api/evidence-privacy-endpoint.spec.ts`, `tests/api/auth-session-lifecycle-endpoint.spec.ts`, `tests/api/response-processing-queue.spec.ts`, `tests/api/response-processing-queue-remediation-endpoint.spec.ts`, `tests/api/response-worker-orchestration.spec.ts`, `tests/api/response-processing-lifecycle.spec.ts`, `tests/unit/response-classification-engine.spec.ts`, `tests/unit/credit-report-pdf-eligibility.spec.ts`, `tests/unit/deterministic-ocr-readiness.spec.ts`, `tests/unit/dispute-packet-pdf.spec.ts`, `tests/contracts/route-endpoint-surface.spec.ts`.

## B. Top Blockers

### 1. Unbounded server-side base64 upload contracts

- Severity: **Critical**
- Implementation status: **Implemented 2026-05-19**. Shared validation now lives in `helpers/uploadPayloadValidation.ts` and is wired into `helpers/schemas.tsx`, `endpoints/ingest/anonymous-report_POST.schema.ts`, `endpoints/evidence-attachment/upload_POST.schema.ts`, and `endpoints/evidence/bureau-communication_POST.schema.ts`. Evidence and bureau endpoints now use the same decoded-byte calculation before storage/hash work. Regression evidence: `tests/api/report-ingest-lifecycle-endpoint.spec.ts`, `tests/api/evidence-privacy-endpoint.spec.ts`, and `tests/api/critical-schema.spec.ts`.
- Affected area: File/PDF/OCR, load, database growth
- Original finding files/routes/functions:
  - `helpers/schemas.tsx` - `UploadReportInput` accepts `fileName: z.string()`, `mimeType: z.string()`, `bytesBase64: z.string()` with no server-side size, MIME enum, or filename bounds.
  - `endpoints/ingest/report_POST.ts` - `handle()` reads the full body with `await request.text()` before validation.
  - `endpoints/ingest/anonymous-report_POST.schema.ts` and `endpoints/ingest/anonymous-report_POST.ts` - public anonymous preview accepts `bytesBase64` without server-side size bounds.
  - `endpoints/evidence-attachment/upload_POST.schema.ts` - `fileDataBase64: z.string()` is unbounded.
  - `endpoints/evidence/bureau-communication_POST.schema.ts` - `fileDataBase64` is `.min(1)` but unbounded.
- Why it matters: client pages enforce some limits (`pages/upload.tsx` uses 15 MB; `pages/try-upload.tsx` passes 20 MB to `FileDropzone`), but API callers can bypass the client. Large JSON/base64 requests can exhaust memory before Zod validation, trigger expensive hashing/PDF parsing/OCR, or grow local/database storage unexpectedly.
- Recommended fix: add shared server-side decoded-byte limits and MIME enums before expensive parsing; reject oversized request bodies early; bound filenames and optional text fields; add tests that direct API calls above the limit fail before `handleIngestSubmit`, `extractCanonicalCreditReport`, storage writes, or OCR.
- Blocks: **Production and beta** unless beta traffic is tightly controlled and the endpoint is additionally protected upstream.

### 2. Report ingestion/OCR/compliance pipeline remains synchronous and request-bound

- Severity: **Critical**
- Affected area: Load/concurrency, OCR, parser, violation scanning
- Files/routes/functions:
  - `endpoints/ingest/process_POST.ts` - `handle()` starts an SSE stream and calls `handleIngestProcess()` inside the request.
  - `helpers/ingestReportHandler.tsx` - `handleIngestProcess()` loads `reportArtifact.storageUrl`, calls `runIngestCorePipeline()`, and performs cleanup on failure.
  - `helpers/ingestCorePipeline.tsx` - `runIngestCorePipeline()` performs canonical extraction, comprehensive storage, tradeline persistence, compliance scanning, evidence binding, and packet impact in one request path; `COMPLIANCE_SCAN_CONCURRENCY = 4` only bounds per-artifact compliance workers.
  - `helpers/canonicalCreditReportExtractor.tsx` - `extractCanonicalCreditReport()` is deterministic and disables canonical AI fallback, but still performs high-cost PDF extraction/parsing inline.
  - `helpers/deterministicOcr.ts` - `runDeterministicOcr()` shells out to `pdftoppm` and `tesseract` with command timeouts, but the ingest request still owns the work.
- Why it matters: concurrent uploads multiply CPU, OCR, PDF parse, DB write, and compliance scanning cost. A worker crash or request timeout can leave partial state that depends on best-effort cleanup. The response-processing queue is durable, but main report ingestion is not yet queued, lease-protected, dead-lettered, or retry-safe.
- Recommended fix: add an ingest-specific DB-backed job layer modeled after `helpers/responseProcessingQueueService.ts`; make upload submit only persist bounded artifact metadata; process extraction/OCR/compliance in bounded workers with idempotency, leases, retries, dead letters, and operator remediation.
- Blocks: **Production and scale**. It also blocks beta if more than low controlled traffic is expected.

### 3. Raw report PDF bytes are stored directly in `reportArtifact.storageUrl`

- Severity: **High**
- Affected area: Database growth, backup/restore, privacy, retention
- Files/routes/functions:
  - `helpers/ingestArtifactCreator.tsx` - `createReportArtifact()` writes `storageUrl: input.bytesBase64` and sets `expiresAt` one year out.
  - `helpers/ingestReportHandler.tsx` - `handleIngestProcess()` reads `artifact.storageUrl` back as `bytesBase64`.
  - `endpoints/report-artifact/get_GET.ts` - owner/admin retrieval selects and returns `storageUrl`.
  - `helpers/gcsStorage.ts` and `helpers/documentStorage.ts` - local file storage exists for some evidence/packet paths, but report artifact creation still stores report bytes inline.
- Why it matters: report uploads can dominate table size, backups, restores, query I/O, and response payloads. This also raises the blast radius for DB exports and local refreshes. `expiresAt` exists, but there is no proven production purge/archive workflow for report artifacts equivalent to the response lifecycle dry-run/mark-only tooling.
- Recommended fix: move report PDFs to encrypted object/file storage with DB metadata and hashes only; keep owner checks on retrieval; add retention preview and purge workflow for report artifacts; make local refresh handling explicit for large blobs; keep parser replay hashes and evidence provenance.
- Blocks: **Scale and broader production**. For beta, cap upload count and file size until storage is moved.

### 4. Packet PDF generation and some packet lists are not scale-bounded enough

- Severity: **High**
- Affected area: Packet generation, PDF, load
- Files/routes/functions:
  - `endpoints/packet/pdf_GET.ts` - `handle()` generates `generatePacketContentPdfBase64()` synchronously on download whenever `packet.content` exists, then records download status.
  - `endpoints/packet/send-first-class_POST.ts` and `endpoints/packet/send-registered_POST.ts` - send flows also call `generatePacketContentPdfBase64()` synchronously.
  - `endpoints/packet/list_GET.schema.ts` - `limit` has `.min(1).optional()` with no maximum or default.
  - `endpoints/packet/list_GET.ts` - applies `.limit()` only when provided.
  - `helpers/disputePacketService.ts` - candidate generation is better bounded with default 50 and max 100 in `getDisputePacketCandidates()`.
- Why it matters: repeated downloads and send attempts can rebuild PDFs under user request latency. Unbounded list queries can become expensive as packet history grows, especially for admins.
- Recommended fix: cache generated packet PDFs or move rendering to a bounded packet job queue; add max/default pagination to packet list; add replay-safe invalidation when packet content changes; add tests for repeated PDF requests, admin list limit defaults, and non-owner PDF denial under load.
- Blocks: **Scale and broader production**. Not a beta blocker if traffic and packet count are low.

### 5. Clock scan has a status-case mismatch and unbounded full-table behavior

- Severity: **High**
- Affected area: Workflow deadlines, operational correctness, deploy readiness
- Files/routes/functions:
  - `endpoints/clock/scan_POST.ts` - queries `.where("status", "=", "GENERATED")` and scans all matching rows.
  - `helpers/disputePacketService.ts` - `createDisputePacketRecord()` inserts packet status `"generated"` and processing status `"completed"`.
  - `endpoints/packet/pdf_GET.ts` - download logic explicitly accepts both `"generated"` and `"GENERATED"` when updating status.
  - `helpers/cronSecret.tsx` - derives HMAC cron token from `JWT_SECRET`.
- Why it matters: new generated packets may be lowercase and therefore skipped by the silence-window scan. The endpoint also supports `?token=` query authentication and scans all generated packets without a batch limit, making it a poor scale primitive.
- Recommended fix: canonicalize packet statuses, update `clock/scan_POST.ts` to cover the canonical value, add an index/batch window, remove query-token use in favor of bearer-only secrets, and add a regression test that a newly created packet can be picked up by the clock scanner.
- Blocks: **Production** if response clocks/silence-window handling are part of the launch scope.

### 6. Production deployment workflow is thinner than staging

- Severity: **High**
- Affected area: Deployment, rollback, smoke confidence
- Files/routes/functions:
  - `.github/workflows/deploy-staging.yml` - runs `pnpm run check`, deploys, waits for `/login`, and scope-gates autonomous response-auth smokes.
  - `.github/workflows/deploy-production.yml` - check job runs only `pnpm run build`; deploy job does not run post-deploy health checks or response-auth smokes.
  - `scripts/promote-production.mjs` - safer path runs `scripts/check-staging-gate.mjs` and `pnpm run check` before pushing staging to production, unless `--skip-staging-gate` is used.
  - `scripts/production-readiness-gate.mjs` - refuses production hosts and verifies staging deploy/local checks, not production post-deploy health.
- Why it matters: the normal promotion script is protective, but the production GitHub workflow itself has less regression and post-deploy verification than staging. A manual production workflow dispatch with `rollback_sha` gets build-only preflight and no automated production login/session health assertion.
- Recommended fix: bring production workflow closer to staging while preserving production safety: run `pnpm run check` or a documented production-safe subset, add post-deploy root/login/auth-session denial checks, verify deployed SHA, and document when response-auth smokes are intentionally staging-only.
- Blocks: **Production** until operator policy requires the promotion gate and production post-deploy health is added.

### 7. Database pool and session writes are fragile for concurrency

- Severity: **Medium**
- Affected area: Database readiness, auth latency, connection pressure
- Files/routes/functions:
  - `helpers/db.tsx` - global Kysely `postgres()` pool uses `max: 3` and `idle_timeout: 10`.
  - `helpers/getServerUserSession.tsx` - every authenticated request updates `sessions.lastAccessed`; expired-session cleanup is probabilistic with `Math.random() < CleanupProbability`.
  - `helpers/rateLimiter.tsx` - every rate-limited action upserts `rate_limit_entry`; cleanup is also probabilistic.
- Why it matters: with synchronous ingestion, SSE, packet PDF rendering, and admin dashboards sharing a three-connection pool, request queues can form quickly. Per-request session writes add write amplification to all authenticated traffic.
- Recommended fix: make pool size environment-configurable with production defaults; reduce session write frequency or batch it; add DB wait/latency metrics; index hot session and rate-limit lookups; load test concurrent authenticated routes.
- Blocks: **Scale**, not necessarily limited beta if traffic is constrained.

### 8. Migration strategy is mixed between generated schema, runtime ensure functions, and scripts

- Severity: **Medium**
- Affected area: Database migration safety, rollback, local refresh
- Files/routes/functions:
  - `helpers/responseDocumentSchema.ts` - response schema uses advisory lock and additive `create table if not exists`, `alter table`, and indexes. This path is race-aware.
  - `scripts/bootstrap-local-app-fixtures.ts` and `scripts/bootstrap-local-auth-schema.ts` - local bootstrap DDL for many core tables and indexes.
  - `helpers/regulationRegistrySchema.ts`, `helpers/regulationRuntimeBridgeMappingService.ts`, `helpers/violationCorrectionSchema.tsx`, `helpers/outcomeTrackingSchema.ts` - additional runtime `ensure*Schema` patterns.
  - `endpoints/migration/*` - product migration endpoints exist, but this audit did not find a single forward-only DB migration runner covering all production schema changes.
- Why it matters: response tables are robustly bootstrapped, but the wider schema lacks a single auditable migration ledger and preflight. Rollback is mostly code rollback; additive tables may remain. Schema drift between staging and production can hide until runtime.
- Recommended fix: define a production migration convention with ordered forward migrations, idempotent preflight checks, and rollback notes; require migrations in deploy/promotion gate; document lazy schema creation that intentionally remains runtime-owned.
- Blocks: **Broader production and scale**.

### 9. Ingest failure cleanup is destructive and best-effort

- Severity: **Medium**
- Affected area: Data integrity, auditability, operator remediation
- Files/routes/functions:
  - `helpers/ingestCleanup.tsx` - `cleanupFailedIngest()` and `cleanupArtifactOnly()` delete related rows in many tables and catch/log cleanup failures without rethrowing.
  - `helpers/ingestReportHandler.tsx` - on pipeline failure, deletes selected `evidenceEvent` rows by description and calls cleanup.
- Why it matters: a failure in cleanup can leave partial rows while the original request reports failure. Unlike response processing, ingest cleanup does not have an append-only lifecycle event model or operator remediation queue.
- Recommended fix: make ingest failure state explicit; add append-only ingest lifecycle events; avoid deleting audit history; surface partial cleanup failures on operator dashboard; add tests for cleanup failure paths.
- Blocks: **Scale and operational confidence**. For beta, monitor manually.

### 10. Observability is strong for response jobs but incomplete for core ingest/PDF/storage

- Severity: **Medium**
- Affected area: Observability and operations
- Files/routes/functions:
  - `helpers/responseProcessingMetrics.ts`, `helpers/responseProcessingQueueService.ts`, `helpers/responseProcessingLifecycleService.ts`, `scripts/operator-regression-dashboard.ts` - response queue, lifecycle, drift, and internal alert visibility exist.
  - `scripts/staging-observability-check.mjs` - checks bounded log categories for HTTP 5xx, parser/OCR, packet, and background errors, but only when explicitly gated by `CRP_STAGING_OBSERVABILITY_CHECK=true`.
  - `helpers/pdfTextExtractor.tsx` logs parser/OCR messages with `console.log`/`console.error`.
  - `helpers/ingestCorePipeline.tsx` emits stage progress and warnings but no durable ingest failure metric table.
- Why it matters: production operators can see response queue health, but not enough durable metrics for ingestion queue depth because ingestion is not queued, parser uncertainty rate, OCR duration/page count, packet PDF failure rate, storage write/read failure rate, or DB pool saturation.
- Recommended fix: add structured, sanitized metrics for ingest/OCR/PDF/storage/auth failures; include them in operator dashboard; add thresholds and internal alerts before external delivery.
- Blocks: **Broader production and scale**.

## C. Readiness Scorecard

| Category | Status | Evidence | Required next action |
| --- | --- | --- | --- |
| Load/concurrency | Fail | High-cost upload/process path is synchronous in `endpoints/ingest/process_POST.ts` -> `helpers/ingestReportHandler.tsx` -> `helpers/ingestCorePipeline.tsx`. Response queue is durable, but main ingest/PDF paths are not. | Add ingest/PDF job queues with idempotency, leases, bounded retries, dead letters, and dashboard metrics. |
| Database | Partial | Response tables have advisory-lock additive DDL and indexes in `helpers/responseDocumentSchema.ts`; core local bootstrap has indexes in `scripts/bootstrap-local-app-fixtures.ts`; global pool is `max: 3` in `helpers/db.tsx`; raw PDFs are stored in `reportArtifact.storageUrl`. | Add forward migration runner, tune pool, add hot-query indexes after query plan review, move large blobs out of DB. |
| File/PDF/OCR | Fail | `endpoints/ocr/extract_POST.ts` enforces 15 MB, but `helpers/schemas.tsx`, `anonymous-report_POST.schema.ts`, and evidence upload schemas do not. OCR is deterministic and bounded per command in `helpers/deterministicOcr.ts`, but not queued. | Add server-side file limits everywhere, queue OCR, track page/time metrics, object-store PDFs, add malformed/large PDF tests. |
| Auth/tenant isolation | Partial | Many critical routes call `getServerUserSession()`. Ownership is enforced in packet, evidence, artifact, and response routes (`helpers/accessControl.ts`, `helpers/disputePacketService.ts`, `helpers/responseDocumentService.ts`). Tests cover non-owner denial in `tests/api/*`. Cron endpoints use derived secrets and some support query tokens. | Expand route-surface auth audit to every endpoint, remove query-token cron auth, add public/cron endpoint inventory tests. |
| Observability | Partial | Operator dashboard and response metrics include queue/dead-letter/stale/drift/soak status. `scripts/staging-observability-check.mjs` analyzes bounded staging logs. | Add durable ingest/PDF/storage/auth metrics and alert surfacing; run observability gate in release evidence, not only opt-in. |
| Deployment/rollback | Partial | Staging workflow runs `pnpm run check`, deploy health, and scoped response-auth smokes. `scripts/promote-production.mjs` gates promotion. Production workflow runs build-only preflight and no post-deploy health checks. Rollback SHA input exists. | Add production post-deploy checks and stronger workflow preflight; require recorded rollback SHA and latest staging deploy match. |
| Disaster recovery | Partial | `scripts/refresh-local-from-staging.mjs` supports guarded local restore. `scripts/staging-backup-restore-checklist.mjs` verifies checklist safety but does not run dump/restore unless explicitly gated. | Run and record human-observed restore drill; define production backup RPO/RTO, restore owner, and sensitive dump retention procedure. |
| Test coverage | Partial | Golden path, API, contracts, response queue/remediation/orchestration/lifecycle, packet lifecycle, evidence privacy, auth lifecycle, OCR readiness, and classifier tests exist. Missing scale/concurrency coverage for ingest, large PDFs, packet PDF repeated downloads, route-wide tenant isolation, and DB pool pressure. | Add focused tests listed below before broad feature work. |
| Operator/admin tooling | Partial | Response operations have queue inspection/remediation, lifecycle dry-run, drift checks, soak checks, and internal alert surfacing. Ingest/PDF/storage do not have comparable operator remediation. | Extend operator tooling to ingest/PDF/storage lifecycle and failures. |

## Detailed Area Findings

### 1. Load and Concurrency Readiness

High-cost paths identified:

- Report upload submit: `endpoints/ingest/report_POST.ts` parses full JSON body and calls `handleIngestSubmit()` synchronously.
- Report processing: `endpoints/ingest/process_POST.ts` holds an SSE request while `handleIngestProcess()` calls `runIngestCorePipeline()`.
- PDF parsing/OCR: `helpers/pdfTextExtractor.tsx` uses `pdf-parse`; `helpers/deterministicOcr.ts` shells out to `pdftoppm` and `tesseract`.
- Canonical extraction: `helpers/canonicalCreditReportExtractor.tsx` calls deterministic parse with `allowAiFallback: false` for canonical ingest.
- Violation/compliance scan: `helpers/ingestCorePipeline.tsx` scans tradelines with `COMPLIANCE_SCAN_CONCURRENCY = 4`.
- Packet preview/create: `helpers/disputePacketService.ts` validates readiness and inserts packet/finding/evidence/audit rows in transactions.
- Packet PDF/download/send: `endpoints/packet/pdf_GET.ts`, `endpoints/packet/send-first-class_POST.ts`, and `endpoints/packet/send-registered_POST.ts` render PDFs synchronously.
- Admin correction/training: `endpoints/admin/violation-correction/*`, `helpers/violationCorrectionSchema.tsx`, and parser-test routes are protected by tests but not load-hardened.
- Response processing: `helpers/responseProcessingQueueService.ts`, `helpers/responseWorkerOrchestrationService.ts`, and `helpers/responseProcessingLifecycleService.ts` are durable, bounded, and operator-visible.

Current bounded/idempotent coverage:

- Response jobs are DB-backed, row-lock claimed, idempotent for active duplicate keys, retry/dead-letter deterministic, and append-only via `response_processing_job_event`.
- Response worker and orchestration scripts are bounded and non-daemon by default.
- Replay apply requires actor and confirmation.
- Manual/admin response capture remains synchronous but small and sanitized.

Current gaps:

- Main ingest does not use durable queue/backpressure/dead-letter semantics.
- OCR and PDF parsing are bounded by command timeouts but not by queue-wide concurrency.
- Packet PDF generation can be repeated synchronously.
- Upload schema limits are inconsistent and partly client-only.
- Clock scan is unbounded and status-case fragile.

### 2. Database Readiness

Hot/growing tables likely to grow quickly:

- `report_artifact`: stores uploaded report metadata and raw base64 report content via `storage_url`.
- `tradeline`, `tradeline_snapshot`, `tradeline_artifact_presence`, `tradeline_payment_history`, `tradeline_payment_history_detail`: grow per report and account.
- `pass_extraction`, `violation_correction`, `violation_correction_evidence`, `violation_regulation_reference`, `violation_training_example`: grow with parser/admin review workflows.
- `packet`, `dispute_packet_findings`, `evidence_event`, `packet_compliance_audit`, `packet_impact_assessment`: grow with packet lifecycle.
- `evidence_attachment`: grows with uploaded supporting documents.
- `bureau_response_event`, `response_processing_event`, `response_admin_review_event`: grow with response capture/replay/review.
- `response_processing_job`, `response_processing_job_event`, `response_worker_orchestration_run`, `response_worker_orchestration_event`, `response_processing_lifecycle_event`: grow with response queue operations and lifecycle reporting.
- `audit_log`, `error_log`, `sessions`, `rate_limit_entry`, `login_attempts`: operational growth tables.

Positive evidence:

- Response schema has many targeted indexes in `helpers/responseDocumentSchema.ts`, including response user/packet/finding/outcome filters, processing event status/classification/manual-review filters, queue status/run-after, active idempotency, orchestration lock/status, and lifecycle cleanup indexes.
- Local bootstrap has indexes for report artifacts, tradelines, packets, dispute findings, and violation corrections in `scripts/bootstrap-local-app-fixtures.ts`.
- Critical response queue claiming uses `for update skip locked` in `helpers/responseProcessingQueueService.ts`.

Risks:

- `helpers/db.tsx` uses a fixed pool `max: 3`; no environment-controlled production pool tuning was found.
- Several list endpoints use optional limits without defaults or maximums, including `endpoints/packet/list_GET.schema.ts` and `endpoints/report-artifact/list_GET.schema.ts`.
- Core schema migration is split across generated types, local bootstrap scripts, and runtime `ensure*Schema` functions.
- Raw PDF blobs in `report_artifact.storage_url` will make backup/restore and query I/O expensive.
- Per-request session update in `helpers/getServerUserSession.tsx` writes `sessions.lastAccessed` on every authenticated request.

### 3. File/PDF/OCR Readiness

Positive evidence:

- Canonical credit report extraction is deterministic-first and canonical AI fallback is disabled in `helpers/canonicalCreditReportExtractor.tsx`.
- `endpoints/ocr/extract_POST.ts` enforces a 15 MB decoded PDF limit and uses `allowAiFallback: false`.
- `helpers/creditReportPdfEligibility.ts` fails closed on unsupported/scanned PDFs unless deterministic OCR is explicitly available.
- `helpers/deterministicOcr.ts` requires `CRP_DETERMINISTIC_OCR_ENABLED=true`, `tesseract`, and `pdftoppm`, and cleans temp workspaces in `finally`.
- Docker image installs `apt-utils`, `poppler-utils`, `tesseract-ocr`, and `tesseract-ocr-eng` in `Dockerfile`.
- OCR/PDF tests exist in `tests/unit/credit-report-pdf-eligibility.spec.ts`, `tests/unit/deterministic-ocr-readiness.spec.ts`, `tests/unit/ocr-evidence-coordinates.spec.ts`, and `tests/unit/pdfjs-evidence-coordinates.spec.ts`.

Risks:

- Authenticated and anonymous report upload schemas lack server-side byte caps.
- Evidence attachment and bureau communication uploads lack server-side byte caps. Bureau communication stores file base64 directly in `evidenceAttachment.storageUrl` in `endpoints/evidence/bureau-communication_POST.ts`.
- `helpers/pdfTextExtractor.tsx` logs parser/OCR steps via console, not a durable metric model.
- Packet PDFs are generated synchronously.
- Report artifact retention is not proven as a production purge/archive flow.

### 4. Auth and Tenant Isolation

Positive evidence:

- `helpers/getServerUserSession.tsx` verifies session cookies through server state.
- `helpers/getSetServerSession.tsx` uses JWT-backed session cookies with HttpOnly, Secure, and SameSite Lax attributes.
- Packet preview/create readiness verifies ownership and single-owner packet construction in `helpers/disputePacketService.ts`.
- `endpoints/packet/pdf_GET.ts`, `endpoints/packet/get_GET.ts`, `endpoints/packet/list_GET.ts`, and send/update routes check user ownership or admin role.
- `endpoints/report-artifact/get_GET.ts`, list/update/delete routes scope by owner for non-admins.
- `endpoints/evidence/*` routes enforce owner/admin checks and tests verify non-owner denial.
- `helpers/responseDocumentService.ts` blocks support role for response records, filters non-admins by `userId`, validates related packet/finding/outcome/tradeline ownership, and requires admin confirmations for admin review.
- `endpoints/responses/queue_GET.ts` and `endpoints/responses/queue-remediation_POST.ts` are admin-only.
- Tests cover many boundaries: `tests/api/auth-session-lifecycle-endpoint.spec.ts`, `tests/api/evidence-privacy-endpoint.spec.ts`, `tests/api/packet-lifecycle-endpoint.spec.ts`, `tests/api/packet-delivery-status-endpoint.spec.ts`, `tests/api/report-ingest-lifecycle-endpoint.spec.ts`, `tests/api/response-document-endpoint.spec.ts`, `tests/api/response-processing-queue-remediation-endpoint.spec.ts`.

Risks:

- Some operational endpoints use non-session cron tokens and accept query tokens: `endpoints/clock/scan_POST.ts` and `endpoints/retention/auto-purge_POST.ts`.
- `endpoints/retention/auto-purge_POST.ts` still allows a legacy token derived from the first 32 characters of `JWT_SECRET`.
- There is no route-wide generated assertion that every non-public endpoint uses either session auth, admin auth, webhook signature, or explicit cron-token auth.
- `server.ts` generated endpoint wrappers often return `"Error loading endpoint code " + e.message`, which is acceptable for module load errors but should be reviewed for production sanitization consistency.

### 5. Observability and Operations

Can operators currently see:

| Signal | Current state |
| --- | --- |
| Response queue depth | Yes, via `helpers/responseProcessingMetrics.ts`, `helpers/responseProcessingQueueService.ts`, `scripts/operator-regression-dashboard.ts`. |
| Response retry backlog/dead letters/stale jobs | Yes, response-specific dashboard and lifecycle metrics exist. |
| Response drift and soak status | Yes, `helpers/responseProcessingLifecycleService.ts` and `scripts/response-processing-soak-check.ts`. |
| Parser/OCR failures | Partially, via logs and `scripts/staging-observability-check.mjs`; no durable parser/OCR metrics table. |
| Ingestion failures | Partially, via artifact processing status and logs; no durable queued failure/remediation model. |
| Packet build/PDF failures | Partially, via tests and logs; no packet PDF failure metrics/dead-letter table. |
| Auth failures | Partially, login attempts and auth tests exist; no operator dashboard trend was identified. |
| Storage failures | Partial console/log visibility only. |
| DB pool pressure | Not surfaced. |
| Backup/restore status | Checklist gate exists; human restore drill remains future work. |

Alert gaps:

- External alert delivery is intentionally deferred.
- Internal alert surfacing is response-focused, not ingest/PDF/storage-focused.
- `scripts/staging-observability-check.mjs` is opt-in with `CRP_STAGING_OBSERVABILITY_CHECK=true`.

### 6. Deployment, Rollback, and Disaster Recovery

Positive evidence:

- `.github/workflows/deploy-staging.yml` runs `pnpm run check`, builds, deploys, verifies `/login`, and scope-gates autonomous response-auth smokes.
- Staging response-auth smokes bootstrap a synthetic admin, verify login/session/admin role, run outcome/response/admin-review UI/backend smokes, and neutralize the synthetic admin.
- `scripts/promote-production.mjs` requires branch `staging`, clean working tree, upstream sync, staging validation gate, `pnpm run check`, and fast-forward or explicit non-fast-forward promotion.
- `scripts/production-readiness-gate.mjs` validates staging, local checks, latest staging deploy SHA, public checks, and protected unauthenticated endpoints.
- `.github/workflows/deploy-staging.yml` and `.github/workflows/deploy-production.yml` support `rollback_sha` inputs.
- `scripts/refresh-local-from-staging.mjs` has local-only restore guards, dry-run, volatile cleanup, and dump handling warnings.
- `scripts/staging-backup-restore-checklist.mjs` verifies restore-drill checklist safety without dumping/restoring by default.

Risks:

- Production workflow check job runs `pnpm run build` only, not `pnpm run check`.
- Production workflow does not run post-deploy health probes.
- Production workflow does not run response-auth smokes or an explicit production-safe equivalent.
- Backup/restore checklist is not the same as a completed restore drill.
- Rollback is code-level; additive schema tables may remain, and no reversible migration ledger was identified.
- Environment validation is distributed across helpers; no central startup env validation schema was found for critical runtime variables.

### 7. Test Coverage and Regression Protection

Strong existing coverage:

- Golden path: `pnpm run test:golden-path`.
- Ingest lifecycle: `tests/api/report-ingest-lifecycle-endpoint.spec.ts`.
- Packet lifecycle/PDF ownership: `tests/api/packet-lifecycle-endpoint.spec.ts`, `tests/unit/dispute-packet-pdf.spec.ts`.
- Packet delivery/status: `tests/api/packet-delivery-status-endpoint.spec.ts`.
- Evidence privacy/ownership: `tests/api/evidence-privacy-endpoint.spec.ts`.
- Auth/session lifecycle: `tests/api/auth-session-lifecycle-endpoint.spec.ts`.
- Route endpoint surface: `tests/contracts/route-endpoint-surface.spec.ts`.
- Deterministic OCR/PDF eligibility: `tests/unit/credit-report-pdf-eligibility.spec.ts`, `tests/unit/deterministic-ocr-readiness.spec.ts`.
- Response classifier hostile/ambiguous coverage: `tests/unit/response-classification-engine.spec.ts`.
- Response queue/remediation/orchestration/lifecycle: `tests/api/response-processing-queue.spec.ts`, `tests/api/response-processing-queue-remediation-endpoint.spec.ts`, `tests/api/response-worker-orchestration.spec.ts`, `tests/api/response-processing-lifecycle.spec.ts`.
- Operator dashboard: `tests/unit/operator-regression-dashboard.spec.ts`.
- Staging deploy workflow: `tests/unit/deploy-staging-workflow.spec.ts`.

Highest-value missing tests to add first:

1. Direct API upload limit tests for authenticated ingest, anonymous ingest, evidence attachment, and bureau communication, proving oversized base64 is rejected before parse/storage.
2. Clock scan regression test proving lowercase `"generated"` packet status is scanned or status is canonicalized.
3. Packet list default/max limit test for `endpoints/packet/list_GET.schema.ts` and handler.
4. Concurrent ingest/process smoke with synthetic PDFs proving idempotency or explicit duplicate rejection.
5. Repeated packet PDF download test proving render caching or bounded behavior once implemented.
6. Route-wide auth classification test: every endpoint must declare public, session, admin, webhook-signature, or cron-token auth.
7. Production workflow test ensuring `.github/workflows/deploy-production.yml` runs the required preflight and post-deploy health checks once added.
8. Restore-drill evidence test or checklist artifact requiring date, operator, source SHA, target DB guard, and post-restore golden path result.

## D. Production Promotion Checklist

Use this before any staging-to-production promotion.

### Code and source-of-truth checks

- [ ] `git status --short` is clean.
- [ ] Current branch is `staging`.
- [ ] Local `HEAD` matches `origin/staging`.
- [ ] Latest staging deploy SHA matches local `HEAD`.
- [ ] Promotion diff contains no `.env`, secrets, raw PDFs, raw extracted text, tokens, keys, session cookies, or production path edits.
- [ ] Rollback SHA for current production is recorded.

### Required local checks

- [ ] `pnpm run typecheck`
- [ ] `pnpm run build`
- [ ] `pnpm run test:golden-path`
- [ ] `pnpm run test:regression-dashboard`
- [ ] `pnpm run test:deterministic-ingestion-report`
- [ ] `pnpm run test:contracts`
- [ ] `pnpm run test:api`
- [ ] `pnpm run check`
- [ ] `git diff --check`

### Response operations checks

- [ ] `pnpm run response:worker -- --dry-run`
- [ ] `pnpm run response:worker-orchestrate -- --dry-run`
- [ ] `pnpm run response:replay -- --dry-run`
- [ ] `pnpm run response:lifecycle -- --dry-run`
- [ ] `pnpm run response:queue-load-check`
- [ ] `pnpm run response:orchestration-check`
- [ ] `pnpm run response:soak-check`
- [ ] `pnpm run operator:dashboard`

### Staging and deployment checks

- [ ] Staging deploy workflow passed.
- [ ] Response-auth smokes ran for runtime/backend/workflow changes or skipped only for docs/readiness/operator-dashboard-only changes.
- [ ] `pnpm run readiness:production` passes against staging.
- [ ] If enabled, `CRP_STAGING_OBSERVABILITY_CHECK=true pnpm run check:staging-observability` passes.
- [ ] If enabled, `CRP_STAGING_BACKUP_RESTORE_CHECK=true pnpm run check:staging-backup-restore` passes.
- [ ] If enabled, `CRP_STAGING_SCALE_BASELINE=true pnpm run baseline:staging-scale` passes.

### Manual release review

- [ ] Top blockers in this audit are resolved, explicitly accepted for limited beta, or mitigated by traffic gates.
- [ ] Upload size limits are enforced server-side before beta.
- [ ] Clock scan status-case mismatch is fixed or clock workflow is removed from launch scope.
- [ ] Production deploy workflow has post-deploy health checks or operator performs equivalent checks immediately after deploy.
- [ ] Restore drill evidence is recorded if broader production is being considered.
- [ ] Operator dashboard shows no critical response queue/drift alerts.
- [ ] Known deferred items are recorded: live mailbox integration, external alert delivery, generalized ingest queue, production restore drill, production load tests.

## E. Recommended Implementation Plan

### Phase 1: Must fix before limited beta

1. [x] Add server-side upload byte limits and MIME validation for `UploadReportInput`, anonymous upload, evidence attachment, and bureau communication. Implemented in `helpers/uploadPayloadValidation.ts` with route/schema coverage in `tests/api/report-ingest-lifecycle-endpoint.spec.ts` and `tests/api/evidence-privacy-endpoint.spec.ts`.
2. Fix `clock/scan_POST.ts` to use the canonical packet status and add a regression test.
3. Add default/max pagination to packet and report-artifact list endpoints.
4. Add production workflow post-deploy root/login/auth-session health checks.
5. Add route-wide auth classification test for public/session/admin/webhook/cron endpoints.
6. Add operator launch policy limiting beta concurrency, upload size, packet volume, and response-worker operations until ingest queue exists.

### Phase 2: Must fix before broader production

1. Build a durable ingest/OCR/compliance job queue modeled on response queue semantics.
2. Move report PDF bytes out of `reportArtifact.storageUrl` into encrypted object/file storage with hash-only DB metadata.
3. Add ingest lifecycle events, dead letters, operator remediation, and dashboard alerts.
4. Add packet PDF caching or queued rendering with idempotent invalidation.
5. Run a human-observed staging-to-local restore drill and record evidence.
6. Make DB pool configuration environment-driven and add DB latency/pool metrics.

### Phase 3: Scale hardening

1. Add production-scale synthetic load coverage for concurrent authenticated uploads, OCR fallback, packet builds, packet PDFs, response queue operations, and dashboard reads.
2. Add durable parser/OCR/packet/storage metrics with internal alert thresholds.
3. Add hot-query index review using production-like data volumes.
4. Add retention preview and purge/archive policy for report artifacts and evidence attachments.
5. Add production-safe observability gate for parser/OCR/PDF/storage/auth spikes.
6. Add restore RPO/RTO documentation and periodic restore-drill cadence.

### Phase 4: Operational polish

1. Add external alert delivery after internal signals are stable.
2. Add scheduled worker activation only after bounded orchestration has sustained evidence.
3. Expand anonymized real-world hostile/broken PDF and response fixture corpus.
4. Clean up PDF.js warning debt if evidence-coordinate assertions begin failing.
5. Plan React Router future-flag migration separately from compliance hardening.
6. Add formal rule/version approval and rollback workflow for broader governance.

## Final Classification

CreditRegulatorPro has a strong deterministic compliance core and a notably hardened response-processing subsystem, but it is not production-at-scale ready. The next safest work is not live mailbox integration or broader feature expansion; it is upload bounding, ingest/PDF queueing, storage lifecycle hardening, production deploy verification, and restore/load proof.
