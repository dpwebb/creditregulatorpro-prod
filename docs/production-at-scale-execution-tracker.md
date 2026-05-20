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

The highest-risk unresolved blocker is the request-bound ingest/OCR/compliance pipeline combined with raw report bytes stored in `reportArtifact.storageUrl`.

## Status Values

Use only these status values in the execution table:

- Not started
- In progress
- Complete
- Blocked

## Unresolved Blockers

- Durable ingest/OCR/compliance queue is missing.
- Raw report PDFs are stored in `reportArtifact.storageUrl`.
- Legacy and admin base64 surfaces remain insufficiently bounded.
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
- Admin parser-test imports can store and process large PDFs.
- Review approval route parses body before auth.
- Consumer identification upload is partially bounded but lacks raw body and strict base64 validation.
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
| 2 | Phase 1 regression guard | Complete | `docs/phase-1-regression-guard.md` records all required guard commands passing at commit `12f8b15c53cd3f9a2ab2a8bfca797ef06eb22211`; no production-scale architecture work started. | `pnpm run typecheck`; `pnpm run build`; `pnpm run test:contracts`; `pnpm run test:api`; `pnpm run test:golden-path`; `pnpm run test:regression-dashboard`; `pnpm run test:deterministic-ingestion-report`; `pnpm run response:soak-check`; `pnpm run operator:dashboard`; `git diff --check`. |
| 3 | Durable ingest/OCR/compliance queue schema/service | Not started | Blocker 1: request-bound ingest/OCR/compliance pipeline remains. | Queue idempotency tests; lease/claim tests; duplicate submission tests; retry/dead-letter tests; deterministic output regression. |
| 4 | Bounded ingest worker | Not started | Blocker 1: no bounded worker owns parsing/OCR/compliance execution. | Worker concurrency limit tests; lease expiry/reclaim tests; retry/dead-letter tests; no parser truth change regression; golden path. |
| 5 | Ingest endpoint cutover | Not started | Upload/process endpoints still run expensive work in request/SSE paths. | Direct API enqueue tests; process/status compatibility tests; duplicate submission tests; existing upload limit tests; deterministic ingestion report. |
| 6 | Ingest lifecycle/operator remediation | Not started | Blocker 9: ingest cleanup is destructive and best-effort. | Failed cleanup event tests; remediation visibility tests; no silent partial deletion tests; dashboard surfacing tests. |
| 7 | Raw report PDF object-storage migration | Not started | Blocker 2: raw report bytes remain in `reportArtifact.storageUrl`. | Storage reference tests; old-record read compatibility tests; non-owner denial tests; local fallback tests; migration compatibility tests. |
| 8 | Remaining upload/base64 boundary hardening | Not started | Blockers 3, 17, 18, 19, and 20 remain outside the Phase 1 upload boundary. | Oversize/malformed/MIME tests for each route; raw body guard tests; downstream-not-called tests where practical; valid current path regression. |
| 9 | Report-artifact metadata-only list | Not started | Blocker 12: report-artifact list remains bounded by count but can return large/sensitive fields. | List excludes raw storage/data tests; get remains owner/admin only tests; non-owner denial tests; pagination tests. |
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
