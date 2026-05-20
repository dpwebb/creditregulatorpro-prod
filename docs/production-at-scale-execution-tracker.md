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

The maximum audit identified the highest-risk unresolved blocker as the request-bound ingest/OCR/compliance pipeline combined with raw report bytes stored in `reportArtifact.storageUrl`. Queue schema/service, bounded worker processing, authenticated process endpoint cutover, ingest lifecycle/operator remediation visibility, and new-upload raw report PDF file storage are now complete. Historical inline report records remain readable and are not destructively migrated. Destructive cleanup replacement and remaining production-scale blockers are still unresolved.

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
- Packet PDF rendering and mail send remain synchronous.
- Packet PDF failure observability is weak.
- Database pool is fixed at `max: 3`.
- Auth session handling writes on every authenticated request.
- Mixed migration and runtime schema ensure strategy remains.
- Ingest cleanup is destructive and best-effort.
- Retention auto-purge performs destructive deletes.
- Query-token cron authentication remains outside clock scan.
- Report artifact list is bounded but still returns large/sensitive columns.
- Additional list endpoints remain unbounded.
- Ingest/PDF/storage/auth/DB observability remains incomplete.
- Disaster recovery proof is incomplete.
- Production-scale load and concurrency tests are missing.
- Bureau communication attachments are stored as base64 in database fields.
- Support role boundaries are not a first-class route classification.
- Response processing is strong but not fully production-operational.
- Production deployment lacks deep production-safe privacy smokes.
- Frontend bundle size and heavy PDF/OCR dependencies are not performance-gated.
- Readiness documentation must remain aligned to the maximum audit after each blocker phase.

## Consecutive Codex Task Sequence

Do not combine tasks. Each numbered row is a separate Codex task with its own impact analysis, tests, and commit. Do not start a later task until the prior task is complete, intentionally blocked, or explicitly superseded by a new maximum audit.

| # | Workstream | Status | Evidence | Tests required per task |
| --- | --- | --- | --- | --- |
| 1 | Documentation/readiness alignment | Complete | Maximum audit exists; current tracker created; older readiness docs now defer to `docs/production-at-scale-maximum-audit.md`. | `git diff --check`; existing docs/check script if present. |
| 2 | Phase 1 regression guard | Complete | `docs/phase-1-regression-guard.md` records all required guard commands passing at commit `6ac420ef5893a06bc224759a17a10a0e497f6d5c`; no production-scale architecture work started. | `pnpm run typecheck`; `pnpm run build`; `pnpm run test:contracts`; `pnpm run test:api`; `pnpm run test:golden-path`; `pnpm run test:regression-dashboard`; `pnpm run test:deterministic-ingestion-report`; `pnpm run response:soak-check`; `pnpm run operator:dashboard`; `git diff --check`. |
| 3 | Durable ingest/OCR/compliance queue schema/service | Complete | `helpers/ingestProcessingQueueSchema.ts` and `helpers/ingestProcessingQueueService.ts` add DB-backed ingest jobs/events with idempotent schema ensure, active idempotency collapse, `FOR UPDATE SKIP LOCKED` leasing, lease extension, retry/dead-letter transitions, sanitized payloads, and no endpoint cutover; `tests/api/ingest-processing-queue.spec.ts` and `tests/unit/ingest-processing-queue-boundary.spec.ts` cover queue behavior and deterministic-output guardrails. | Queue idempotency tests; lease/claim/extension tests; duplicate submission tests; retry-through-max/dead-letter tests; deterministic output regression. |
| 4 | Bounded ingest worker | Complete | `scripts/ingest-processing-worker.ts` and `ingest:worker` add bounded dry-run-by-default worker processing for queued ingest jobs only. The worker claims jobs with leases, calls the existing `executeIngestPipeline` path with sanitized progress handling, records append-only queue events, marks success/retry/dead-letter, and leaves ingest endpoint behavior unchanged; `tests/api/ingest-processing-worker.spec.ts`, `tests/unit/ingest-processing-worker-script.spec.ts`, and `tests/unit/ingest-processing-queue-boundary.spec.ts` cover worker behavior and endpoint isolation. | Worker dry-run no-mutation test; apply claim/process test; retry/dead-letter test; max-jobs/concurrency tests; sensitive log exclusion test; deterministic output regression; golden path. |
| 5 | Ingest endpoint cutover | Complete | `endpoints/ingest/process_POST.ts` now validates ownership, enqueues or attaches to a durable ingest job with endpoint-scoped idempotency, emits queued/running/retry/dead-letter SSE status events, and no longer calls `handleIngestProcess` or `executeIngestPipeline`; upload submission remains unchanged and worker execution remains required for deterministic processing. | Direct API enqueue tests; process/status compatibility tests; duplicate submission tests; existing upload limit tests; deterministic ingestion report. |
| 6 | Ingest lifecycle/operator remediation | Complete | `helpers/ingestCleanup.tsx` records cleanup attempted/failed queue events for related jobs; `helpers/ingestProcessingQueueService.ts` exposes cleanup/remediation metrics and admin-only remediation primitives; `endpoints/admin/ingest-queue_GET.ts` and `endpoints/admin/ingest-queue-remediation_POST.ts` add bounded operator visibility and retry/review/cancel controls; `scripts/operator-regression-dashboard.ts` surfaces ingest dead-letter, stale-running, retry backlog, cleanup-failure, and remediation counts; `docs/operator-ingest-remediation.md` documents current cleanup paths and operator procedure. | Failed cleanup event tests; remediation visibility tests; no silent partial deletion tests; dashboard surfacing tests. |
| 7 | Raw report PDF object-storage migration | Complete | `helpers/reportArtifactStorage.ts` stores new report PDFs as `local:report-artifacts/<user-id>/<uuid>-<sha256-prefix>-<filename>` references through the existing local/object-storage fallback; `helpers/ingestArtifactCreator.tsx`, `endpoints/review/approve_POST.ts`, and report-artifact create/update write new PDF bytes outside the DB; `helpers/ingestReportHandler.tsx`, `scripts/ingest-processing-worker.ts`, source-text backfill, and report-artifact get resolve both new references and old inline base64; report-artifact list omits `storageUrl`; `docs/report-artifact-storage.md` documents the format and old-record compatibility. | Storage reference tests; old-record read compatibility tests; non-owner denial tests; local fallback tests; migration compatibility tests. |
| 8 | Remaining upload/base64 boundary hardening | In progress | Report-artifact create/update, review approval, consumer identification upload, parser lab, parser-test create/import, and admin mock lifecycle upload now use strict decoded-byte validation, MIME allowlists, raw request-size guards, and bounded filenames/import counts; review approval and parser/admin tooling authenticate before body parsing. Route inventory evidence: authenticated/anonymous ingest use `UploadReportInput`, evidence attachment and bureau communication use shared upload helpers, report-artifact create/update and review approval use shared storage/base64 validation, and parser/admin tooling now uses `PARSER_LAB_UPLOAD_MAX_BYTES`, `PARSER_TEST_CASE_UPLOAD_MAX_BYTES`, `PARSER_TEST_CASE_IMPORT_MAX_FILES`, and `ADMIN_MOCK_LIFECYCLE_UPLOAD_MAX_BYTES`. The workstream is not marked complete because `endpoints/ocr/extract_POST.schema.ts` still has a route-local `bytesBase64` schema and bureau communication DB-base64 storage remains a separate unresolved blocker. | Oversize/malformed/MIME tests for each route; raw body guard tests; downstream-not-called tests where practical; valid current path regression. |
| 9 | Report-artifact metadata-only list | Not started | Blocker 12 remains partially open: report-artifact list now omits `storageUrl`, but it can still return `data` and has not been completed as a dedicated metadata-only-list task. | List excludes raw storage/data tests; get remains owner/admin only tests; non-owner denial tests; pagination tests. |
| 10 | Packet PDF cache/events | Not started | Blockers 4 and 5: PDF rendering/send remains synchronous and weakly observed. | First render stores cache; repeated download uses cache; stale cache invalidation; render failure event; dashboard failure surfacing; non-owner denial. |
| 11 | Cron bearer-only auth | Not started | Blocker 11: retention and scheduled scan still accept query tokens. | Bearer accepted; query token rejected; missing/invalid token rejected; workflow/gate unit tests if deploy scripts change. |
| 12 | Retention two-step apply guard | Not started | Blocker 10: retention auto-purge performs destructive deletes. | Preview does not delete; apply requires explicit body and bearer token; audit/purge event tests; rollback/restore guard review. |
| 13 | DB pool config and session-touch throttling | Not started | Blockers 6 and 7: fixed DB pool and per-request session writes remain. | DB config parsing tests; startup validation tests; session accepted without fresh touch write; stale touch write; expiration behavior unchanged; DB pressure smoke. |
| 14 | Migration ledger/checker | Not started | Blocker 8: mixed migration and runtime schema ensure strategy remains. | Migration inventory test; unapplied migration checker; deploy gate unit test; local/staging/prod drift dry-run. |
| 15 | Observability expansion | Not started | Blocker 14: ingest/PDF/storage/auth/DB metrics are incomplete. | Metric recorded on success/failure; threshold dashboard rows; storage growth dashboard; ingest failure dashboard; no raw sensitive payload exposure. |
| 16 | Additional list endpoint limits | Not started | Blocker 13: high-growth list endpoints remain unbounded. | Omitted limit defaults; excessive limit rejected or capped by route policy; ownership filters preserved; representative evidence and metro2 list tests first. |
| 17 | Support-role and production-safe privacy smokes | Not started | Blockers 21 and 23: support boundaries and production-safe privacy probes need stronger proof. | Support-role privacy matrix; unauthenticated/invalid-session protected-route denial; production-safe read-only smoke/gate unit tests. |
| 18 | Load/concurrency harness | Not started | Blocker 16: no production-scale load/concurrency proof exists. | Local-only upload/process/PDF concurrency harness; DB pool latency report; failure-mode evidence; no production mutation. |
| 19 | Restore drill evidence | Not started | Blocker 15: no completed human-observed restore drill evidence was found. | Restore checklist; date/operator/source SHA evidence; golden path after restore; RPO/RTO artifact review. |
| 20 | Response operations completion | Not started | Blocker 22: response processing is strong but not fully production-operational. | Soak checks; alert delivery simulation or accepted exclusion; scheduler bounded-run test; lifecycle apply confirmation; dashboard evidence. |
| 21 | Frontend/operator UX alignment | Not started | Readiness constraints are policy-heavy and not fully surfaced in product/operator UX. | UI unit tests; relevant API checks; operator dashboard checks; no parser/packet business logic changes. |
| 22 | Dependency/runtime report | Not started | Blocker 24: bundle size and heavy PDF/OCR dependencies are not performance-gated. | Build; bundle/runtime report generated; container dependency inventory; non-blocking threshold evidence unless a later task makes it blocking. |
| 23 | Final production-at-scale verification | Not started | Final verification is blocked until all prior blockers are complete with evidence. | `pnpm run typecheck`; `pnpm run build`; `pnpm run test:contracts`; `pnpm run test:api`; `pnpm run test:golden-path`; `pnpm run test:regression-dashboard`; deterministic ingestion report; response soak; operator dashboard; load/concurrency report; restore drill evidence; production-safe privacy smokes. |

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
