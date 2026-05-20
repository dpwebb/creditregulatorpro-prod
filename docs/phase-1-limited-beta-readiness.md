# Phase 1 Limited Beta Readiness Verification

Verification date: 2026-05-19

## Executive Verdict

**Verdict: Limited beta ready with strict constraints.**

The six Phase 1 blockers from `docs/production-scale-readiness-audit.md` have code, test, workflow, or operator-policy evidence in the current repository. This verdict allows only a controlled limited beta under `docs/limited-beta-operator-launch-policy.md`.

This is not a production-at-scale readiness claim. Later production-scale tasks have moved report processing behind the ingest queue and moved new report PDF uploads to file-backed storage references, but historical inline records remain compatible, packet PDF generation remains synchronous, ingest/PDF/storage observability is incomplete, and restore/load proof remains incomplete.

## Phase 1 Completion Table

| # | Phase 1 item | Status | Verification evidence |
| --- | --- | --- | --- |
| 1 | Server-side upload byte limits and MIME validation | Complete | `helpers/uploadPayloadValidation.ts`, `helpers/schemas.tsx`, upload endpoint schemas/handlers, upload API tests |
| 2 | Canonical bounded `clock/scan_POST.ts` status handling | Complete | `helpers/clockScanConfig.ts`, `endpoints/clock/scan_POST.ts`, `helpers/cronClockScan.tsx`, `tests/api/clock-scan-endpoint.spec.ts` |
| 3 | Packet and report-artifact list pagination defaults/maxes | Complete | `endpoints/packet/list_GET.schema.ts`, `endpoints/packet/list_GET.ts`, `endpoints/report-artifact/list_GET.schema.ts`, `endpoints/report-artifact/list_GET.ts`, API pagination tests |
| 4 | Production preflight and post-deploy health checks | Complete | `.github/workflows/deploy-production.yml`, `tests/unit/deploy-production-workflow.spec.ts` |
| 5 | Route-wide auth classification contract | Complete | `tests/contracts/route-auth-classification.spec.ts`, `tests/contracts/route-endpoint-surface.spec.ts` |
| 6 | Limited beta operator launch policy | Complete | `docs/limited-beta-operator-launch-policy.md`, `scripts/operator-regression-dashboard.ts`, `scripts/production-readiness-report.ts`, related unit tests |

## Evidence By Phase 1 Item

### 1. Upload Bounds And MIME Validation

`helpers/uploadPayloadValidation.ts` defines shared limits and validation helpers:

- Authenticated report uploads: 15 MiB decoded bytes.
- Anonymous report uploads: 20 MiB decoded bytes.
- Evidence attachments: 10 MiB decoded bytes.
- Bureau communications: 10 MiB decoded bytes.
- File names: 180 characters.
- Descriptions: 1000 characters.
- Credit report MIME allowlist: `application/pdf`.
- Evidence/bureau MIME allowlist: `application/pdf`, `image/png`, `image/jpeg`, `image/jpg`.

`helpers/schemas.tsx` applies those constraints to `UploadReportInput`. `endpoints/ingest/report_POST.ts`, `endpoints/ingest/anonymous-report_POST.ts`, `endpoints/evidence-attachment/upload_POST.ts`, and `endpoints/evidence/bureau-communication_POST.ts` reject oversized raw request bodies before downstream submit, parse, ownership, storage, hashing, OCR, or transaction work where the route structure allows it.

Test evidence:

- `tests/api/report-ingest-lifecycle-endpoint.spec.ts` verifies oversized authenticated upload rejection before `handleIngestSubmit`, oversized/malformed anonymous upload rejection before `extractCanonicalCreditReport`, raw body guards, valid current-size paths, and scanned-PDF fail-closed behavior.
- `tests/api/evidence-privacy-endpoint.spec.ts` verifies oversized/malformed/invalid-MIME evidence attachment and bureau communication rejection before storage/hash/transaction work, plus valid bounded bureau communication persistence through the existing evidence path.
- `tests/api/critical-schema.spec.ts` covers upload schema constraints.
- `tests/api/ocr-extract-upload-limit-endpoint.spec.ts` verifies the existing OCR endpoint 15 MiB limit is not weakened.

### 2. Clock Scan Status And Bound

`helpers/clockScanConfig.ts` sets canonical packet status to lowercase `"generated"` and `CLOCK_SCAN_BATCH_LIMIT` to 100. `endpoints/clock/scan_POST.ts` uses those constants, orders by packet id, applies the 100-row limit, and requires bearer-token cron authorization. `helpers/cronClockScan.tsx` uses the same canonical status and batch limit. `helpers/disputePacketService.ts` creates dispute packet records with status `"generated"`.

Test evidence:

- `tests/api/clock-scan-endpoint.spec.ts` verifies lowercase generated packet pickup, bounded scan limit, bearer-token authorization, and query-token rejection.
- Existing packet creation/PDF behavior remains covered by `tests/api/packet-lifecycle-endpoint.spec.ts`.

### 3. Packet And Report-Artifact Pagination

`endpoints/packet/list_GET.schema.ts` and `endpoints/report-artifact/list_GET.schema.ts` define default limit 50 and max limit 100. Both handlers parse the validated schema and always apply `.limit(validatedInput.limit)`. Excessive values are rejected by schema validation rather than capped.

Test evidence:

- `tests/api/packet-delivery-status-endpoint.spec.ts` verifies packet list default limits, explicit safe limits, excessive limit rejection, and preserved owner/admin scoping.
- `tests/api/report-ingest-lifecycle-endpoint.spec.ts` verifies report-artifact list default limits, explicit safe limits, excessive limit rejection, and preserved owner/admin scoping.

### 4. Production Deploy Verification

`.github/workflows/deploy-production.yml` now runs `pnpm run check` in the production check job, preserves remote `pnpm run build`, verifies the selected checkout SHA before container build, preserves `rollback_sha`, and performs post-deploy health checks for:

- `/` root route.
- `/login`.
- unauthenticated `/_api/auth/session` denial with 401 or 403.

The production workflow does not run staging-only synthetic admin response-auth smokes.

Test evidence:

- `tests/unit/deploy-production-workflow.spec.ts` verifies preflight, rollback SHA behavior, selected checkout SHA verification, root/login/auth-session post-deploy checks, and absence of staging-only synthetic admin smoke steps.

### 5. Route-Wide Auth Classification

`tests/contracts/route-auth-classification.spec.ts` classifies 281 endpoint handlers exactly once across these categories:

- public
- session-authenticated
- admin-only
- cron-token authenticated
- webhook-signature authenticated
- intentionally test/local-only

The contract cross-checks endpoint files against generated `server.ts` API routes, asserts representative public/user/admin/cron/webhook endpoints, and requires guard patterns for all protected endpoint classifications.

`tests/contracts/route-endpoint-surface.spec.ts` continues to verify the generated route and endpoint surface.

### 6. Limited Beta Operator Policy

`docs/limited-beta-operator-launch-policy.md` exists and explicitly constrains limited beta operation until Phase 2 scale work is done. `scripts/operator-regression-dashboard.ts` and `scripts/production-readiness-report.ts` now surface the policy as a required operator artifact, with coverage in `tests/unit/operator-regression-dashboard.spec.ts` and `tests/unit/production-readiness-report.spec.ts`.

Accepted limited beta limits:

- Maximum 5 total beta participants.
- Maximum 3 concurrent active users.
- Maximum 1 concurrent report upload/process operation.
- Maximum 25 total report uploads per day.
- Maximum 5 report uploads per user per day.
- Maximum 15 MiB decoded authenticated report upload.
- Maximum 20 MiB decoded anonymous report upload if anonymous beta is enabled.
- Maximum 10 MiB decoded evidence/bureau upload.
- Maximum 25 packet creations per day.
- Maximum 50 packet PDF download/send operations per day.
- OCR/scanned PDFs only when deterministic OCR is enabled, dependencies are available, and operator review is available; otherwise reject or hold.
- Response-worker dry-run before and after beta windows and after failed response events.
- Response-worker/replay/lifecycle apply or non-dry use only in supervised windows, capped at 10 jobs or records.

## Verification Commands Run

All commands below passed on 2026-05-19:

| Command | Result |
| --- | --- |
| `pnpm run typecheck` | PASS |
| `pnpm run build` | PASS |
| `pnpm run test:contracts` | PASS, 2 files / 9 tests |
| `pnpm run test:api` | PASS, 25 files / 221 tests |
| `pnpm run test:golden-path` | PASS |
| `pnpm run test:regression-dashboard` | PASS |
| `pnpm run test:deterministic-ingestion-report` | PASS, 11 fixtures, replay stable, `violationSearchPreserved: true` |
| `pnpm run response:soak-check` | PASS, 3 cycles, duplicate collapse/retry/dead-letter/stale/overlap/replay/retention/drift observed, cleanup complete |
| `git diff --check` | PASS |

## Preserved Systems

This verification pass did not implement runtime behavior changes. The Phase 1 evidence and verification commands preserve:

- Deterministic parsing and canonical replay behavior.
- Violation extraction/search behavior.
- Evidence binding.
- Packet readiness gating.
- Existing packet PDF generation behavior, except Phase 1 bounded list and deployment verification changes already completed before this pass.
- Response-processing lifecycle protections.
- Existing auth and ownership behavior.
- Existing deployment safety behavior, except the completed Phase 1 production workflow verification hardening.

## Remaining Phase 2 Blockers

These blockers remain before broader production or production-at-scale readiness:

1. Build a durable ingest/OCR/compliance job queue with leases, retries, dead letters, idempotency, and operator remediation.
2. Complete storage lifecycle/growth/restore controls for new file-backed report PDFs and historical inline compatibility.
3. Replace destructive ingest cleanup with non-destructive lifecycle state where feasible.
4. Add packet PDF caching or queued rendering with idempotent invalidation.
5. Run and record a human-observed restore drill.
6. Make DB pool configuration environment-driven and add DB latency/pool metrics.

Additional scale blockers remain: production-scale smoke/load coverage, durable ingest/PDF/storage/auth metrics, report artifact retention/purge proof, external alert delivery or formal acceptance of its absence, and broader real-world fixture coverage.

## Final Readiness Statement

CreditRegulatorPro is **limited beta ready with strict constraints** if operators enforce `docs/limited-beta-operator-launch-policy.md` and rollback gates. CreditRegulatorPro is **not broad-production ready** and **not production-at-scale ready**, and this verification does not claim general or scale production readiness.
