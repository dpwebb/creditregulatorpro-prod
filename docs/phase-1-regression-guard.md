# Phase 1 Regression Guard

Verification date: 2026-05-20

This guard verifies that the Phase 1 protections described in `docs/production-at-scale-maximum-audit.md` remain green before any production-scale architecture work begins.

## Repository State

| Field | Value |
| --- | --- |
| Branch | `staging` |
| Commit audited | `12f8b15c53cd3f9a2ab2a8bfca797ef06eb22211` |
| Working tree before checks | Clean |
| Working tree after checks | Clean |
| Readiness classification | Limited beta ready with strict constraints |
| Broad-production ready | No |
| Production-at-scale ready | No |

## Commands Run

| Command | Status | Evidence |
| --- | --- | --- |
| `git status --short` | PASS | No output; working tree clean. |
| `pnpm run typecheck` | PASS | `tsc --noEmit` completed successfully. |
| `pnpm run build` | PASS | Vite production build completed successfully. Existing large main chunk remains a scale-hardening item, not a Phase 1 regression. |
| `pnpm run test:contracts` | PASS | 2 test files passed, 9 tests passed. |
| `pnpm run test:api` | PASS | 25 test files passed, 221 tests passed. |
| `pnpm run test:golden-path` | PASS | Upload, parse, canonical map, anomaly detect, violation detect, evidence bind, packet generate, and PDF download all passed. |
| `pnpm run test:regression-dashboard` | PASS | Human-readable golden path dashboard result was `PASS`. |
| `pnpm run test:deterministic-ingestion-report` | PASS | 11 fixtures passed; replay stable; required evidence coverage 100%; `violationSearchPreserved: true`. |
| `pnpm run response:soak-check` | PASS | 3 cycles; duplicate collapse, retry backlog, dead letter, stale running, overlap, replay dry-run, retention preview, drift detection, and cleanup complete. Idempotent schema notices were emitted for existing tables/indexes/columns. |
| `pnpm run operator:dashboard` | PASS | Dashboard generated for branch `staging`, commit `12f8b15c53cd3f9a2ab2a8bfca797ef06eb22211`; working tree clean; limited beta operator policy exists. |
| `pnpm exec vitest run --config vitest.config.ts tests/unit/deploy-production-workflow.spec.ts tests/unit/operator-regression-dashboard.spec.ts tests/unit/production-readiness-report.spec.ts` | PASS | 3 test files passed, 20 tests passed. |
| `git diff --check` | PASS | No whitespace errors. |

No required command was unavailable or unsafe.

## Phase 1 Items Verified

| Phase 1 item | Status | Evidence |
| --- | --- | --- |
| Authenticated report ingest upload limits | PASS | `helpers/uploadPayloadValidation.ts`, `endpoints/ingest/report_POST.ts`, and API coverage reject oversized, malformed, and unsupported upload inputs. |
| Anonymous ingest upload limits | PASS | `endpoints/ingest/anonymous-report_POST.ts` applies raw body and decoded-byte guards before rate limiting or preview extraction. |
| Evidence attachment upload limits | PASS | `endpoints/evidence-attachment/upload_POST.ts` uses the shared 10 MiB limit and MIME/base64 validation with API coverage. |
| Bureau communication upload limits | PASS | `endpoints/evidence/bureau-communication_POST.ts` uses the shared 10 MiB limit and MIME/base64 validation with API coverage. |
| Clock scan canonical status, batch limit, and bearer auth | PASS | `helpers/clockScanConfig.ts` keeps `generated` and limit `100`; `endpoints/clock/scan_POST.ts` requires bearer authorization; API coverage passes. |
| Packet list pagination defaults/max | PASS | `endpoints/packet/list_GET.schema.ts` defaults to 50 and rejects limits above 100; API coverage passes. |
| Report-artifact list pagination defaults/max | PASS | `endpoints/report-artifact/list_GET.schema.ts` defaults to 50 and rejects limits above 100; API coverage passes. |
| Production workflow post-deploy checks | PASS | `.github/workflows/deploy-production.yml` runs `pnpm run check`, verifies selected SHA, preserves remote build, and checks root, `/login`, and unauthenticated `/_api/auth/session`; targeted deploy workflow unit coverage passed. |
| Route-wide auth classification | PASS | `tests/contracts/route-auth-classification.spec.ts` remains green through `pnpm run test:contracts`. |
| Limited beta operator policy | PASS | `docs/limited-beta-operator-launch-policy.md` exists, remains limited-beta only, and is surfaced by `pnpm run operator:dashboard`. |

## Failures Or Regressions

No Phase 1 regression was found.

Open production-scale blockers remain unchanged:

- Report ingest/OCR/compliance remains request-bound.
- Raw report bytes remain stored through `reportArtifact.storageUrl`.
- Packet PDF generation remains synchronous.
- Ingest/PDF/storage/auth/DB observability remains incomplete.
- Restore/load proof remains incomplete.

## Scope Confirmation

Production-at-scale architecture work has not started in this task. No durable ingest queue, storage migration, packet PDF cache, DB pool/session throttling, migration ledger, observability expansion, retention apply guard, cron auth change, parser/OCR change, canonical extraction change, violation logic change, evidence-binding change, packet-readiness change, response lifecycle change, auth architecture change, storage architecture change, deployment architecture change, or ingest queue architecture change was implemented.
