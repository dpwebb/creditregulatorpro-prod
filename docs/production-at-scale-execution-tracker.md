# Production At Scale Execution Tracker

Updated: 2026-05-20

This tracker is documentation and scope control only. It does not authorize runtime implementation work.

## Current Audit Source

| Field | Value |
| --- | --- |
| Controlling audit | `docs/production-at-scale-maximum-audit.md` |
| Audit date | 2026-05-19 |
| Current audited commit from maximum audit | `18c7e187c52a27b34eb41e3811a7d1527f7f1166` |
| Current branch when tracker was created | `staging` |
| Current working commit before tracker changes | `ae6e20a586d025c6487aaca7f5113ef7ef5e76e2` |
| Current readiness classification | Limited beta ready with strict constraints |

## Readiness Statement

CreditRegulatorPro is limited beta only under strict constraints. It is not broad-production ready. It is not production-at-scale ready.

The maximum audit identified the highest-risk unresolved blocker as the request-bound ingest/OCR/compliance pipeline combined with raw report bytes stored in `reportArtifact.storageUrl`. Queue schema/service, bounded worker processing, authenticated process endpoint cutover, staging worker/orchestration path, ingest lifecycle/operator remediation visibility, and new-upload raw report PDF file storage are now complete. Historical inline report records remain readable and are not destructively migrated. Destructive cleanup replacement and remaining production-scale blockers are still unresolved.

## Status Values

Use only these status values in the execution table:

- Not started
- In progress
- Complete
- Blocked

## Unresolved Blockers

- Historical report PDF records may still contain inline base64 in `reportArtifact.storageUrl`; compatibility is preserved and no destructive migration has been performed.
- Ingest cleanup remains destructive and best-effort; lifecycle/remediation visibility exists, but cleanup has not been replaced with non-destructive lifecycle state.
- Parser/admin upload surfaces are now bounded with strict decoded-byte validation, MIME checks, filename bounds, raw request-size guards, and parser-test import count limits. The broader upload/base64 workstream remains open because `endpoints/ocr/extract_POST.schema.ts` still uses a route-local base64 shape and bureau communication attachment storage remains a separate DB-base64 storage blocker.
- Packet PDF cache misses still render in the request path, but repeated downloads/sends now reuse a content-addressed cache and render attempt/success/failure events are surfaced.
- Database pool max/idle timeout are environment-configurable and session `lastAccessed` writes are throttled; production observability now surfaces DB config plus read-only latency/connection proxies.
- Migration policy, root ledger inventory, and non-mutating checker now exist; runtime ensure functions remain in place until a future audited migration cutover.
- Ingest cleanup is destructive and best-effort.
- Retention auto-purge now defaults to preview and destructive apply requires explicit confirmation with append-only audit evidence; broader retention purge/archive/restore proof remains unresolved.
- Scheduled scan and retention cron routes now require bearer-only derived cron tokens; query-token and legacy JWT substring fallbacks were removed.
- High-growth list endpoints now have explicit default/max bounds. `parser-test-case/list` is metadata-only and moves `rawExtractedText` to admin-only detail/export paths. `consumer-signature/list` is metadata-only and moves `signatureData` to owner/admin detail access. Remaining inventory note: `hidden-risk/list` still computes aggregate/stale-suppression semantics over the full matching risk set and should get a separate pagination/UX split before it is treated as production-scale.
- Ingest/PDF/storage/auth/DB observability is now surfaced through sanitized dashboard metrics and thresholds; external alert delivery remains future work.
- Disaster recovery proof is incomplete. A human-observed restore drill runbook, evidence template, and non-mutating evidence-field validator now exist, but no completed restore evidence has been recorded.
- A local/staging-safe production-scale load/concurrency dry-run harness now exists and refuses production mutation. Repeated operator-run local/staging capacity evidence still needs to be collected before any production-at-scale claim.
- Bureau communication attachments are stored as base64 in database fields.
- Support role boundaries are now first-class in route/auth and API privacy tests for report artifacts, packets/PDFs, evidence, response documents, and support tickets.
- Response processing is strong and now has a production-operations runbook plus dry-run/dashboard proof rows, but it is not fully production-operational until live scheduler evidence, external alert delivery or accepted exclusion, physical purge/archive policy, historical production backfill evidence, and repeated production-scale operating evidence are complete.
- Frontend/operator UX now surfaces server upload limits, limited-beta constraints, queued ingest states, and packet PDF render/cache failure boundaries. It remains informational and does not add runtime capacity throttling or production-at-scale readiness.
- Production deployment and the staging readiness gate now include production-safe unauthenticated and invalid-session read-only privacy denial probes. Seeded owner-denial checks remain staging/local-only because they require controlled fixture data.
- Runtime-size reporting now tracks frontend bundle assets, gzip/brotli sizes, direct dependency installed sizes, PDF/OCR dependency inventory, and Docker OCR/runtime packages. Thresholds remain non-blocking; hard performance gates, chunking work, or dependency isolation remain future work before any production-at-scale claim.
- Readiness documentation must remain aligned to the maximum audit after each blocker phase.

## Consecutive Codex Task Sequence

Do not combine tasks. Each numbered row is a separate Codex task with its own impact analysis, tests, and commit. Do not start a later task until the prior task is complete, intentionally blocked, or explicitly superseded by a new maximum audit.

| # | Workstream | Status | Evidence | Tests required per task |
| --- | --- | --- | --- | --- |
| 1 | Documentation/readiness alignment | Complete | Maximum audit exists; current tracker created; older readiness docs now defer to `docs/production-at-scale-maximum-audit.md`. | `git diff --check`; existing docs/check script if present. |
| 2 | Phase 1 regression guard | Complete | `docs/phase-1-regression-guard.md` records all required guard commands passing at commit `6ac420ef5893a06bc224759a17a10a0e497f6d5c`; no production-scale architecture work started. | `pnpm run typecheck`; `pnpm run build`; `pnpm run test:contracts`; `pnpm run test:api`; `pnpm run test:golden-path`; `pnpm run test:regression-dashboard`; `pnpm run test:deterministic-ingestion-report`; `pnpm run response:soak-check`; `pnpm run operator:dashboard`; `git diff --check`. |
| 3 | Durable ingest/OCR/compliance queue schema/service | Complete | `helpers/ingestProcessingQueueSchema.ts` and `helpers/ingestProcessingQueueService.ts` add DB-backed ingest jobs/events with idempotent schema ensure, active idempotency collapse, `FOR UPDATE SKIP LOCKED` leasing, lease extension, retry/dead-letter transitions, sanitized payloads, and no endpoint cutover; `tests/api/ingest-processing-queue.spec.ts` and `tests/unit/ingest-processing-queue-boundary.spec.ts` cover queue behavior and deterministic-output guardrails. | Queue idempotency tests; lease/claim/extension tests; duplicate submission tests; retry-through-max/dead-letter tests; deterministic output regression. |
| 4 | Bounded ingest worker | Complete | `scripts/ingest-processing-worker.ts` and `ingest:worker` add bounded dry-run-by-default worker processing for queued ingest jobs only. The worker claims jobs with leases, calls the existing `executeIngestPipeline` path with sanitized progress handling, records append-only queue events, marks success/retry/dead-letter, and leaves ingest endpoint behavior unchanged; `tests/api/ingest-processing-worker.spec.ts`, `tests/unit/ingest-processing-worker-script.spec.ts`, and `tests/unit/ingest-processing-queue-boundary.spec.ts` cover worker behavior and endpoint isolation. | Worker dry-run no-mutation test; apply claim/process test; retry/dead-letter test; max-jobs/concurrency tests; sensitive log exclusion test; deterministic output regression; golden path. |
| 5 | Ingest endpoint cutover | Complete | `endpoints/ingest/process_POST.ts` now validates ownership, enqueues or attaches to a durable ingest job with endpoint-scoped idempotency, emits queued/running/retry/dead-letter SSE status events, and no longer calls `handleIngestProcess` or `executeIngestPipeline`; upload submission remains unchanged and worker execution remains required for deterministic processing. Staging worker/orchestration path added through `scripts/staging-ingest-worker-orchestrator.mjs`, `staging:ingest-worker`, and an opt-in manual staging deploy input; production activation remains deferred. | Direct API enqueue tests; process/status compatibility tests; duplicate submission tests; existing upload limit tests; deterministic ingestion report. |
| 6 | Ingest lifecycle/operator remediation | Complete | `helpers/ingestCleanup.tsx` records cleanup attempted/failed queue events for related jobs; `helpers/ingestProcessingQueueService.ts` exposes cleanup/remediation metrics and admin-only remediation primitives; `endpoints/admin/ingest-queue_GET.ts` and `endpoints/admin/ingest-queue-remediation_POST.ts` add bounded operator visibility and retry/review/cancel controls; `scripts/operator-regression-dashboard.ts` surfaces ingest dead-letter, stale-running, retry backlog, cleanup-failure, and remediation counts; `docs/operator-ingest-remediation.md` documents current cleanup paths and operator procedure. | Failed cleanup event tests; remediation visibility tests; no silent partial deletion tests; dashboard surfacing tests. |
| 7 | Raw report PDF object-storage migration | Complete | `helpers/reportArtifactStorage.ts` stores new report PDFs as `local:report-artifacts/<user-id>/<uuid>-<sha256-prefix>-<filename>` references through the existing local/object-storage fallback; `helpers/ingestArtifactCreator.tsx`, `endpoints/review/approve_POST.ts`, and report-artifact create/update write new PDF bytes outside the DB; `helpers/ingestReportHandler.tsx`, `scripts/ingest-processing-worker.ts`, source-text backfill, and report-artifact get resolve both new references and old inline base64; report-artifact list omits `storageUrl`; `docs/report-artifact-storage.md` documents the format and old-record compatibility. | Storage reference tests; old-record read compatibility tests; non-owner denial tests; local fallback tests; migration compatibility tests. |
| 8 | Remaining upload/base64 boundary hardening | In progress | Report-artifact create/update, review approval, consumer identification upload, parser lab, parser-test create/import, and admin mock lifecycle upload now use strict decoded-byte validation, MIME allowlists, raw request-size guards, and bounded filenames/import counts; review approval and parser/admin tooling authenticate before body parsing. Route inventory evidence: authenticated/anonymous ingest use `UploadReportInput`, evidence attachment and bureau communication use shared upload helpers, report-artifact create/update and review approval use shared storage/base64 validation, and parser/admin tooling now uses `PARSER_LAB_UPLOAD_MAX_BYTES`, `PARSER_TEST_CASE_UPLOAD_MAX_BYTES`, `PARSER_TEST_CASE_IMPORT_MAX_FILES`, and `ADMIN_MOCK_LIFECYCLE_UPLOAD_MAX_BYTES`. The workstream is not marked complete because `endpoints/ocr/extract_POST.schema.ts` still has a route-local `bytesBase64` schema and bureau communication DB-base64 storage remains a separate unresolved blocker. | Oversize/malformed/MIME tests for each route; raw body guard tests; downstream-not-called tests where practical; valid current path regression. |
| 9 | Report-artifact metadata-only list | Complete | `endpoints/report-artifact/list_GET.ts` no longer selects or returns `reportArtifact.storageUrl` or full `reportArtifact.data`; list rows return bounded metadata only, coerce `linkedAccountCount`, and mask `tradelineAccountNumber`. `helpers/infractionQueries.tsx` and `pages/upload-review.$artifactId.tsx` were adjusted so review UI uses linked tradeline metadata instead of parsed artifact-list payloads. API tests prove storage/data exclusion, metadata preservation, user scoping, get-by-id owner/admin enforcement, and old-record get compatibility. | `pnpm run typecheck`; `pnpm run build`; relevant report-artifact API tests; `pnpm run test:api`; `git diff --check`. |
| 10 | Packet PDF cache/events | Complete | `helpers/packetPdfCache.ts` stores packet PDFs through existing document storage at `packet-pdfs/<user-id>/<packet-id>/<purpose>-<sha256>.pdf`, keyed by cache version, render purpose, packet ID, render user ID, and route-mutated packet content. `endpoints/packet/pdf_GET.ts`, `send-first-class_POST.ts`, and `send-registered_POST.ts` reuse valid cache entries; cache misses record `PACKET_PDF_RENDER_ATTEMPT`, `PACKET_PDF_RENDER_SUCCEEDED`, and `PACKET_PDF_RENDER_FAILED` evidence events. `scripts/operator-regression-dashboard.ts` surfaces packet PDF render health. `docs/packet-pdf-cache.md` documents storage and invalidation. Cache misses still render synchronously; no async render queue was added. | First render stores cache; repeated download uses cache; stale cache invalidation; render failure event; dashboard failure surfacing; non-owner denial. |
| 11 | Cron bearer-only auth | Complete | `endpoints/regulation-registry/scheduled-scan_POST.ts` and `endpoints/retention/auto-purge_POST.ts` now reject `?token=` and require bearer-only HMAC-derived cron tokens. Retention legacy `JWT_SECRET.substring(0, 32)` support was removed. `tests/api/cron-auth-endpoint.spec.ts` covers bearer acceptance, query rejection, missing-token rejection, and legacy-token rejection; `tests/contracts/route-auth-classification.spec.ts` keeps cron routes classified and bearer-only. No workflow/script caller using query tokens was found. | Bearer accepted; query token rejected; missing/invalid token rejected; workflow/gate unit tests if deploy scripts change. |
| 12 | Retention two-step apply guard | Complete | `endpoints/retention/auto-purge_POST.ts` and `endpoints/admin/retention_POST.ts` now default to `previewRetention()` and call `enforceRetention(true)` only when `mode: "apply"` or legacy `confirmDelete: true` is paired with confirmation `APPLY_RETENTION_PURGE`; cron apply remains bearer-only and admin apply remains admin-session-only. Apply records append-only audit evidence with explicit-confirmation metadata. The one-year retention window and deletion target list in `helpers/dataRetention.tsx` were not changed. | `pnpm exec vitest run tests/api/cron-auth-endpoint.spec.ts`; `pnpm exec vitest run tests/api/retention-apply-guard-endpoint.spec.ts`; `pnpm run test:api`; `pnpm run typecheck`; `pnpm run build`; `pnpm run operator:dashboard`; `git diff --check`. |
| 13 | DB pool config and session-touch throttling | Complete | `helpers/runtimeTuningConfig.ts` parses `CRP_DB_POOL_MAX`, `CRP_DB_IDLE_TIMEOUT_SECONDS`, and `CRP_SESSION_TOUCH_INTERVAL_SECONDS` with safe defaults and sanitized warnings for invalid values. `helpers/db.tsx` uses the parsed DB pool config. `helpers/getServerUserSession.tsx` preserves auth lookup, roles, cookie/session return shape, and cleanup behavior while writing `sessions.lastAccessed` only when the stored timestamp is stale by the configured interval. DB pressure metrics remain part of the later observability workstream. | `pnpm exec vitest run tests/unit/runtime-tuning-config.spec.ts tests/unit/session-touch-throttle.spec.ts`; `pnpm exec vitest run tests/api/auth-session-lifecycle-endpoint.spec.ts`; `pnpm run test:api`; `pnpm run typecheck`; `pnpm run build`; `git diff --check`. |
| 14 | Migration ledger/checker | Complete | `docs/database-migration-policy.md` establishes the root `migrations/` ledger convention and keeps runtime ensure functions active until a later audited cutover. `migrations/0000-runtime-schema-inventory.md` inventories bootstrap DDL, runtime ensure functions, and migration metadata endpoints. `scripts/check-migrations.mjs` and `check:migrations` provide a non-mutating static report for runtime ensure functions, ledger entries, unknown/unledgered schema mutation points, and non-blocking deploy-gate recommendation. Production deploy behavior was not changed. | `pnpm run check:migrations`; migration checker unit tests; production readiness/deploy unit tests; `pnpm run typecheck`; `pnpm run build`; `git diff --check`. |
| 15 | Observability expansion | Complete | `helpers/productionObservabilityMetrics.ts` aggregates sanitized ingest, OCR/parser, packet PDF, storage, auth/rate-limit, and DB config/pool signals with `OK`/`Warning`/`Critical` thresholds. `helpers/packetPdfCache.ts` records `PACKET_PDF_CACHE_HIT` events in addition to render attempts/success/failure. `helpers/documentStorage.ts` and `helpers/gcsStorage.ts` record sanitized storage read/write/delete failure metrics through `auditLog` with object-reference hashes only. `scripts/ingest-processing-worker.ts` adds sanitized duration/page-count/parser-summary fields to ingest job result summaries. `scripts/operator-regression-dashboard.ts` adds the `Production Observability` category. `docs/production-observability-metrics.md` documents signals, sensitivity boundaries, and thresholds. | Metric/dashboard unit tests; packet PDF cache tests; `pnpm run test:regression-dashboard`; `pnpm run operator:dashboard`; `pnpm run typecheck`; `pnpm run build`; relevant API tests; `git diff --check`. |
| 16 | Additional list endpoint limits | Complete | High-growth list routes now apply default/max bounds while preserving existing ownership/admin filters and sorting. Changed routes: bankruptcy, consumer-signature, creditor-validation, discrimination, evidence, evidence-attachment, fraud-freeze, metro2-validation-log, obligation-instance, parser-known-entity, parser-mapping, parser-test-case, regulatory-notification, regulatory-update, scanning-rule, tradeline, and version. Default is 50 and max is 100 except tradeline max 250 to preserve existing lifecycle script compatibility. Oversized limits are rejected by schema validation. | `pnpm exec vitest run tests/api/high-growth-list-limits.spec.ts tests/api/evidence-privacy-endpoint.spec.ts`; `pnpm run test:api`; `pnpm run typecheck`; `pnpm run build`; `git diff --check`. |
| 17 | Support-role and production-safe privacy smokes | Complete | `tests/api/support-role-privacy-matrix.spec.ts` proves support is non-admin for report artifacts, packets/PDFs, evidence, and response documents, and proves support-ticket access is limited to assigned or open unassigned tickets. `tests/contracts/route-auth-classification.spec.ts` now treats support-role privacy boundaries as a first-class route contract. `scripts/production-readiness-gate.mjs` and `.github/workflows/deploy-production.yml` include production-safe unauthenticated and invalid-session read-only denial probes for auth session, report-artifact list, packet list, evidence list, response-document list, and support-ticket list without requiring production fixture data. | `pnpm exec vitest run --config vitest.config.ts tests/api/support-role-privacy-matrix.spec.ts tests/unit/production-readiness-gate.spec.ts tests/unit/deploy-production-workflow.spec.ts tests/contracts/route-auth-classification.spec.ts`; `pnpm run test:contracts`; privacy/auth API tests; `pnpm run test:api`; `pnpm run typecheck`; `pnpm run build`; `git diff --check`. |
| 18 | Load/concurrency harness | Complete | `scripts/production-scale-harness.mjs` and `baseline:production-scale-local` add a dry-run, non-mutating load/concurrency evidence harness that allows local/staging targets, refuses production and unknown hosts, rejects mutation execution flags, reports upload/process enqueue, ingest worker, OCR fallback, packet build/PDF cache, response queue, dashboard latency, DB pool config, and failure/dead-letter domains, and proves its internal concurrency cap. `docs/production-scale-load-harness.md` documents the safety gates and production-mutation refusal. | Harness production-host refusal tests; dry-run default tests; bounded concurrency tests; required-section report tests; package-script test; no-external-provider-call test; `pnpm run baseline:production-scale-local -- --dry-run`; `pnpm run typecheck`; `pnpm run build`; `git diff --check`. |
| 19 | Restore drill evidence | In progress | `docs/disaster-recovery-restore-drill-runbook.md` defines the human-observed restore process and stop conditions. `docs/restore-drill-evidence-template.md` requires date, operator, source environment/SHA, sanitized backup identifier, target guard, RPO/RTO, actual duration, post-restore checks, golden path, auth/session, packet PDF, response queue/dashboard, dump cleanup, and signoff. `scripts/staging-backup-restore-checklist.mjs` and `check:restore-drill-evidence` validate required evidence fields and secret-safety without dumping, restoring, or claiming completion. No restore drill has been performed or completed. | Evidence template field tests; missing-field rejection test; non-mutating checklist test; docs secret-pattern scan; `pnpm run check:restore-drill-evidence`; `git diff --check`; typecheck if scripts change. |
| 20 | Response operations completion | In progress | `docs/response-processing-production-ops-runbook.md` documents scheduler/live daemon activation conditions, external alert delivery dry-run/mock boundary, purge/archive readiness, historical backfill plan, replay/lifecycle apply confirmation, remediation actions, evidence template, and stop conditions. `scripts/operator-regression-dashboard.ts` now surfaces explicit proof rows for scheduler activation, alert dry-run boundary, purge/archive readiness, historical backfill planning, and remediation controls. The workstream remains open because live scheduler evidence, real external alert delivery or a formally accepted exclusion, physical purge/archive policy, historical production backfill execution, and repeated production-scale operating evidence are not complete. | Soak checks; alert delivery simulation or accepted exclusion; scheduler bounded-run test; lifecycle apply confirmation; dashboard evidence. |
| 21 | Frontend/operator UX alignment | Complete | Upload, anonymous upload, evidence attachment, bureau communication, packet, packet PDF, and admin/operator surfaces now display server-aligned limits, limited-beta constraints, queued/running/retry/dead-letter/failure state language, packet readiness/PDF cache boundaries, and read-only ingest queue visibility without claiming runtime throttling or production-at-scale readiness. | `tests/unit/frontend-production-readiness-ux.spec.ts`; `tests/unit/response-document-ui.spec.tsx`; typecheck; build; no parser/packet business logic changes. |
| 22 | Dependency/runtime report | Complete | `scripts/runtime-size-report.mjs` and `report:runtime-size` generate a non-blocking report for frontend build assets with gzip/brotli sizes, installed direct dependency sizes, PDF/OCR package usage, and Docker OCR/runtime packages. Current evidence is documented in `docs/runtime-size-and-dependency-report.md`; largest findings are `dist/_assets/index-DdbjxR56.js` at 3.12 MiB raw/875.8 KiB gzip, `dist/_assets/index-KZnEr7HZ.css` at 673.8 KiB raw/101.4 KiB gzip, `pdfjs-dist` at 34.58 MiB, `pdf-parse` at 27.03 MiB, and `pdfmake` at 12.94 MiB. Thresholds are recommendations only and do not fail builds. | `pnpm run build`; `pnpm run report:runtime-size`; `pnpm exec vitest run --config vitest.config.ts tests/unit/runtime-size-report-script.spec.ts`; `git diff --check`. |
| 23 | Final production-at-scale verification | Complete | `docs/final-production-at-scale-verification.md` records the final conservative verdict for commit `e7ff406ebc86b852cf63b17845daecd854176f55`: limited beta ready with strict constraints, not broad-production ready, and not production-at-scale ready. All required local verification commands passed after an initial transient `operator:dashboard` process exit was rerun successfully; remaining blockers include no completed restore drill evidence, incomplete response production-operations proof, dry-run-only load evidence, non-blocking runtime-size thresholds, and documented upload/storage residual risks. | `pnpm run typecheck`; `pnpm run build`; `pnpm run test:contracts`; `pnpm run test:api`; `pnpm run test:golden-path`; `pnpm run test:regression-dashboard`; `pnpm run test:deterministic-ingestion-report`; `pnpm run response:soak-check`; `pnpm run operator:dashboard`; `pnpm run check:migrations`; `pnpm run check:restore-drill-evidence`; `pnpm run baseline:production-scale-local -- --dry-run`; `pnpm run report:runtime-size`; `git diff --check`. |

## List Endpoint Inventory

Inventory date: 2026-05-20.

Bounded in the additional list endpoint limits task:

- `endpoints/bankruptcy/list_GET.ts` - default 50, max 100, owner/admin filter preserved, created-desc sorting preserved through endpoint ordering.
- `endpoints/consumer-signature/list_GET.ts` - default 50, max 100, user-owner filter preserved, created-desc sorting preserved. The response is metadata-only and omits `signatureData`; `endpoints/consumer-signature/get_GET.ts` provides owner/admin detail access when signature image data is required.
- `endpoints/creditor-validation/list_GET.ts` - default 50, max 100, owner/admin `tradeline.userId` filtering preserved, detected/created-desc sorting preserved.
- `endpoints/discrimination/list_GET.ts` - default 50, max 100, user-owned tradeline filter preserved, reported/created-desc sorting applied for stable bounded pages.
- `endpoints/evidence/list_GET.ts` - default 50, max 100, packet owner filtering preserved, id-desc sorting preserved.
- `endpoints/evidence-attachment/list_GET.ts` - default 50, max 100, packet/obligation owner checks and admin bypass preserved; `helpers/evidenceManager.tsx` applies the bound.
- `endpoints/fraud-freeze/list_GET.ts` - default 50, max 100, current-user/admin target-user filter preserved, request-date-desc sorting preserved.
- `endpoints/metro2-validation-log/list_GET.ts` - default 50, max 100, existing auth/filter behavior preserved, validated-date-desc sorting preserved.
- `endpoints/obligation-instance/list_GET.ts` - default 50, max 100, owner/admin filtering preserved, created-desc sorting preserved.
- `endpoints/parser-known-entity/list_GET.ts` - default 50, max 100, admin-only guard preserved, created-desc sorting preserved.
- `endpoints/parser-mapping/list_GET.ts` - default 50, max 100, admin-only guard preserved, priority-desc sorting preserved.
- `endpoints/parser-test-case/list_GET.ts` - default 50, max 100, admin-only guard preserved, updated-desc sorting preserved; activated parser-rule candidates are limited to the returned page's test case IDs. The response is metadata-only and omits `rawExtractedText`; `endpoints/parser-test-case/get_GET.ts` and `export_POST.ts` provide admin-only raw text access for detail/export workflows.
- `endpoints/regulatory-notification/list_GET.ts` - default 50, max 100, admin-only guard preserved, created-desc sorting preserved.
- `endpoints/regulatory-update/list_GET.ts` - default 50, max 100, admin-only guard preserved, detected-desc sorting preserved.
- `endpoints/scanning-rule/list_GET.ts` - default 50, max 100, admin-only guard preserved, created-desc sorting preserved.
- `endpoints/tradeline/list_GET.ts` - default 50, max 250, owner/admin filtering preserved, created-desc sorting preserved. The max remains 250 because the local lifecycle script already requests `limit=250`.
- `endpoints/version/list_GET.ts` - default 50, max 100, admin-only guard preserved, created-desc sorting preserved.

Already bounded before this task:

- `endpoints/packet/list_GET.ts`, `endpoints/report-artifact/list_GET.ts`, `endpoints/support-ticket/list_GET.ts`, `endpoints/admin/mock-lifecycle/list_GET.ts`, `endpoints/licensed-agency/list_GET.ts`, and `endpoints/regulation-registry/runtime-bridge/list_GET.ts`.
- `endpoints/outcomes/list_GET.ts` and `endpoints/responses/list_GET.ts` are bounded through their service-layer list options.

Inventoried but not changed in this task:

- Static/reference or low-growth lists: `bureau`, `bureau-detection-config`, `feature-flag`, `migration`, `obligation`, `enforcement-mechanism`, `regulation-registry`, `regulation-registry/reconciliation-candidates`, and `statute`.
- `endpoints/hidden-risk/list_GET.ts` remains a separate pagination/UX task because it currently returns aggregate counts and stale-suppressed risk rows from a full matching set; force-limiting it here would change dashboard semantics.

## Support Privacy And Production-Safe Smoke Inventory

Inventory date: 2026-05-20.

Production-safe read-only probes:

- `/_api/auth/session`
- `/_api/report-artifact/list?limit=1`
- `/_api/packet/list?limit=1`
- `/_api/evidence/list?limit=1`
- `/_api/responses/list?limit=1`
- `/_api/support-ticket/list?limit=1`

These probes run without credentials and with an intentionally invalid `floot_built_app_session` cookie. They are expected to return `401` or `403`, do not create synthetic users, and do not require production test data.

Staging/local-only privacy checks:

- Ordinary non-owner denial and support-role access matrix tests that need seeded report artifacts, packets, evidence, response documents, or support tickets remain in local/staging API tests.
- Support ticket positive access checks for assigned or open unassigned tickets remain local/staging-only because production may not contain safe fixture tickets.
- Admin positive access checks remain local/staging-only unless an existing production-safe read-only admin session is explicitly provided by an operator-run procedure.

## Production Scale Load Harness Inventory

Inventory date: 2026-05-20.

Harness:

- `scripts/production-scale-harness.mjs`
- `pnpm run baseline:production-scale-local -- --dry-run`

Safety behavior:

- Dry-run and non-mutating by default.
- Local targets and `https://staging.creditregulatorpro.com` are allowed.
- Production hosts are refused.
- Unknown hosts fail closed.
- `--apply`, `--execute`, and `--run` are rejected.
- External provider calls are denied and not made.
- The harness reports zero runtime mutation requests, zero external provider calls, no raw report bytes sent, and no raw extracted text stored.

Reported evidence domains:

- Concurrent authenticated upload/process enqueue behavior.
- Ingest worker bounded concurrency.
- OCR fallback path.
- Packet creation/build under bounded load.
- Packet PDF cache repeated download behavior.
- Response queue operations.
- Operator dashboard read latency.
- DB pool config visibility.
- Failure/dead-letter behavior.

This is local/staging-safe harness evidence. It does not authorize production mutation and does not claim production-at-scale readiness.

## Staging Ingest Worker Orchestration

Inventory date: 2026-05-20.

Staging worker/orchestration path added:

- Script: `scripts/staging-ingest-worker-orchestrator.mjs`.
- Package command: `pnpm run staging:ingest-worker -- --dry-run` for preview.
- Bounded apply command: `pnpm run staging:ingest-worker -- --apply --max-jobs 5 --concurrency 1 --worker-id staging-ingest-manual`.
- Manual deploy option: `.github/workflows/deploy-staging.yml` input `run_ingest_worker=true` runs one bounded apply pass after staging health and response-auth smokes.
- Runtime target: existing `creditregulatorpro-staging` app container.
- Guard: `CRP_ENV=staging` is injected and verified before the worker runs; the wrapper rejects production-looking container names.
- Safety: max jobs default 5, max allowed 10, concurrency fixed at 1, no public port, no Traefik route, and no production activation.
- Runbook: `docs/staging-ingest-worker-operation.md`.

This is staging-only operational wiring. It does not mark production ingest runtime ready.

## Non-Regression Guardrails

- Preserve deterministic parsing, canonical extraction, violation detection, evidence binding, regulation references, packet readiness, packet PDF content, response-processing lifecycle protections, auth/session behavior, ownership checks, cron behavior, deployment workflows, package scripts, and tests unless the active task explicitly owns that surface.
- Do not introduce AI logic into deterministic systems.
- Do not change consumer-facing legal conclusions or wording unless the active task explicitly owns the wording and the audit supports the change.
- Do not alter schemas, migrations, parser truth, regulation mappings, violation rules, evidence binding, seeded reference data, or packet truth without explicit approval, tests, and an audit/review trail.
- Use minimal diffs and avoid unrelated refactors.
- Keep old data readable when migrating storage or lifecycle behavior.

## Stop Conditions

Stop and report before implementation if any of these occur:

- `docs/production-at-scale-maximum-audit.md` is missing or exists only as a PDF.
- Uncommitted runtime code changes are present before a task starts.
- A task would modify runtime code outside its assigned workstream.
- A task would touch `.env`, `.env.*`, deployment secrets, credentials, production paths, package scripts, or deployment workflows without explicit authorization.
- Required audit verdicts or blocker facts cannot be confirmed from the maximum audit.
- The requested change requires broad architectural modification beyond the active workstream.
- A proposed implementation would silently change canonical truth, parser mappings, regulation mappings, violation logic, evidence binding, packet truth, seeded reference data, or schema behavior.
- Required checks fail and the blocker is not fully understood.

## Build-Protection Rule

Never commit a task that fails required typecheck/build/tests unless the final response clearly says no commit was made and explains the blocker.
