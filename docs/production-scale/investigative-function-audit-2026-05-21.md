# Investigative Function Audit - 2026-05-21

## Executive Result

**Overall status: LIMITED**

Authenticated consumer credit-report upload-to-results is proven on live staging for the audited runtime commit `eb2d9dd598450d2c26631bd77fe781fd509a5b6f`. The current proof registered and logged in synthetic consumer users, uploaded generated credit-report PDFs through the real staging auth/API path, verified report artifact ownership, observed worker-backed ingest jobs reach terminal `completed`, retrieved same-owner `upload-results` with 2 synthetic tradelines and 6 actionable findings, verified non-owner denial with HTTP `403`, then proved packet readiness/create/PDF retrieval with HTTP `200` `application/pdf` and non-owner packet PDF denial. The result remains **LIMITED**, not `READY`, because this audit did not fully live-browser-smoke every frontend page and did not run a synthetic admin role through every admin-only correction/evidence/regulation function.

This audit distinguishes API/runtime success from UI success. The deployed staging API/runtime path is proven for authenticated upload-to-results and packet PDF. Frontend display behavior is partially proven by existing component/unit tests and route inventory, but not by a full deployed browser automation run in this audit.

Repository: `C:\Users\webbd\Projects\creditregulatorpro-staging`

Branch: `staging`

Audited runtime commit: `eb2d9dd598450d2c26631bd77fe781fd509a5b6f`

Audit date: `2026-05-21`

## Primary Proof Point

Authenticated upload-to-results is **proven**.

Live staging proof command:

```powershell
$env:STAGING_BASE_URL='https://staging.creditregulatorpro.com'; $env:CRP_AUTH_WORKFLOW_SMOKE='true'; $env:CRP_AUTH_WORKFLOW_SMOKE_RUN_ID='investigative-function-audit-rerun-2026-05-21'; pnpm run smoke:auth-workflow
```

Result: **PASS**, exit code `0`.

Evidence:

- Synthetic owner user: `156`.
- Artifact: `494`, `ownerUserId: 156`, `organizationId: null`, `sha256Present: true`.
- Ingest job: `35`, polled from `queued_waiting_for_worker` to terminal `completed`.
- Queue result: `queueStatus: succeeded`, `processingStatus: completed`, `diagnosticCode: INGEST_PROCESSING_COMPLETED`.
- Upload-results: `bureauName: TransUnion Canada`, `region: CA`, `platformScope: Canadian Credit Bureau Compliance`, `totalTradelines: 2`, `actionableCount: 6`.
- Non-owner retrieval: denied with HTTP `403`.
- Cleanup: owner user `156` and non-owner user `157` deleted; purge reported 1 report artifact, 2 tradelines, and 1 stored file.

Packet-included live staging proof command:

```powershell
$env:STAGING_BASE_URL='https://staging.creditregulatorpro.com'; $env:CRP_AUTH_WORKFLOW_SMOKE_RUN_ID='investigative-function-audit-packet-2026-05-21'; pnpm run smoke:auth-workflow:packet
```

Result: **PASS**, exit code `0`.

Evidence:

- Synthetic owner user: `158`.
- Artifact: `495`, `ownerUserId: 158`, `sha256Present: true`.
- Ingest job: `36`, polled through `queued_waiting_for_worker`, `processing`, and terminal `completed`.
- Upload-results: `totalTradelines: 2`, `actionableCount: 6`.
- Selected finding: `4946`, tradeline `561`, issue type `Balance Calculation Violation`.
- Packet readiness: `packetReady: true`, `eligibleFindingIds: [4946]`, no blockers.
- Packet create/build: packet `144`, status `generated`, selected issue preserved.
- Packet PDF: HTTP `200`, content type `application/pdf`, `pdfByteLength: 7307`, `%PDF` header proof true.
- Non-owner upload-results and packet PDF retrieval: denied with HTTP `403`.
- Cleanup: owner user `158` and non-owner user `159` deleted.

Certification proof:

```powershell
$env:STAGING_BASE_URL='https://staging.creditregulatorpro.com'; $env:CRP_AUTH_WORKFLOW_SMOKE='true'; $env:CRP_AUTH_WORKFLOW_SMOKE_RUN_ID='investigative-function-audit-certify-2026-05-21'; pnpm run production-scale:certify
```

Result: **PASS**, exit code `0`; `docs/production-scale/evidence/latest-production-scale-certification.json` reported `CERTIFYING:true` for target SHA `eb2d9dd598450d2c26631bd77fe781fd509a5b6f`.

Certification evidence included:

- `authenticatedUploadResults`: owner user `160`, artifact `497`, job `38`, terminal `completed`, 2 tradelines, 6 actionable findings, non-owner `403`.
- `authenticatedPacketPdf`: owner user `162`, artifact `498`, job `39`, selected finding `4981`, packet `145`, PDF HTTP `200`, `application/pdf`, 7297 bytes, `%PDF` header proof, non-owner packet PDF `403`.

## Function Inventory Summary

Inventory source paths inspected:

- Server and route registration: `server.ts`, `endpoints/**`.
- Auth/session: `endpoints/auth/**`, `helpers/getServerUserSession`, `helpers/ingestSessionResolver`.
- Upload/ingest: `endpoints/ingest/report_POST.ts`, `endpoints/ingest/process_POST.ts`, `endpoints/ingest/status_GET.ts`, `helpers/ingestReportHandler`, `helpers/ingestCorePipeline.tsx`, `helpers/comprehensiveReportStorage.tsx`, `helpers/ingestProcessingQueueService.ts`, `scripts/ingest-processing-worker.ts`.
- Retrieval/display: `endpoints/upload-results/get_GET.ts`, `pages/upload.tsx`, `pages/upload-results.$artifactId.tsx`, `tests/unit/upload-processing-status-ui.spec.tsx`.
- Parser/canonical: `helpers/canonicalCreditReportExtractor.tsx`, `helpers/parserExtractionRules.tsx`, parser test-case endpoints.
- Compliance/evidence/regulation: `helpers/complianceScanner.tsx`, `endpoints/evidence/**`, `helpers/hashChain.tsx`, `endpoints/regulation-registry/**`.
- Packet: `endpoints/packet/**`, `helpers/disputePacketService.ts`, `helpers/packetPdfCache.ts`, `helpers/disputePacketPdf.ts`, packet lifecycle tests and packet PDF proof script.
- Admin: `endpoints/admin/**`, `endpoints/admin/violation-correction/**`, `helpers/violationCorrectionManager.tsx`.
- Response documents: `endpoints/responses/**`, response worker/orchestration scripts and tests.
- Readiness/deploy/certification: `scripts/production-scale-certification.mjs`, deploy/static evidence scripts, production-scale evidence docs.

## Verification Matrix

| Function | Role/state required | Entry point | Expected behavior | Persistence side effects | Retrieval/display behavior | Existing tests found | Audit command/evidence | Result | Risk | Failure mode | Recommended remediation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Public landing/health | Anonymous | `/`, static app shell | App reachable over HTTPS | None | HTTP 200/app shell | Deploy health checks | Staging smoke reached host; cert gates ran against staging | PASS | P3 | None observed | Keep deploy health probes. |
| Registration | Anonymous | `/_api/auth/register_with_password` | Create synthetic consumer | `users`, auth/password/session/account rows | Session usable after login | Auth smoke specs | Live smokes registered users `156`, `158`, `160`, `162` | PASS | P1 | None observed | Keep synthetic cleanup assertions. |
| Login/session | Consumer | `/_api/auth/login_with_password`, `/_api/auth/session` | Resolve logged-in user and role | Session row/cookie | Auth-only endpoints accept same cookie | Auth/session API tests | Live smokes used same session through upload/results/packet | PASS | P1 | None observed | Add non-secret session proof to future evidence. |
| Consumer credit report upload | Consumer | `/_api/ingest/report` | Accept generated PDF | Report artifact row and stored file reference | Artifact ID returned | API lifecycle tests | Artifact `494` owner `156`; artifact `495` owner `158` | PASS | P0 | None observed | Keep owner proof mandatory. |
| Credit report artifact ownership | Consumer/admin | `/_api/report-artifact/get` | Owner gets own artifact; wrong owner denied downstream | Artifact `userId` and storage digest retained | Upload-results/packet use artifact owner | Report artifact tests | `ownerUserId` matched session user in live smokes | PASS | P0 | None observed | Assert ownership before result retrieval. |
| Ingest process endpoint | Consumer | `/_api/ingest/process` | Enqueue durable job; staging does not silently inline heavy work | Ingest job row/events; artifact status updates | Process response exposes queued/worker status | Ingest lifecycle tests | Job `35` and `36` observed through status endpoint | PASS | P0 | None observed | Keep bounded terminal polling. |
| Worker/queue lifecycle | Worker/system | `scripts/ingest-processing-worker.ts`, queue service | Claim, heartbeat, process, succeed/fail/dead-letter | Queue status/events and worker liveness | User/admin can see status | Worker simulation and API tests | Live jobs reached `completed`; simulated proof drained synthetic queue | PASS | P1 | Staging worker liveness proven only through active jobs, not standalone dashboard | Add live queue liveness snapshot evidence. |
| Ingest status endpoint | Consumer | `/_api/ingest/status` | Owner-scoped terminal/non-terminal state | Read-only | Prevent indefinite queued/99 percent confusion | Status UI/unit/API tests | Polled queued/processing/completed states on live staging | PASS | P0 | None observed | Keep stale/no-worker terminal failures loud. |
| Canonical extraction | System | `helpers/canonicalCreditReportExtractor.tsx` | Deterministic canonical output | Canonical/replay payload on artifact | Downstream tradelines/results reflect canonical state | Golden path, deterministic report | 11 fixtures passed; live upload produced tradelines | PASS | P1 | Live smoke does not expose full canonical JSON detail | Add canonical field snapshot to smoke evidence. |
| Deterministic extraction path | System | Parser helpers | No live provider calls required | Extracted structured fields | Fixture expected fields present | Golden/deterministic tests | `pnpm run test:golden-path`, `pnpm run test:deterministic-ingestion-report` passed | PASS | P1 | None observed | Keep provider-free certification. |
| DocStrange/LLM fallback | System | Extractor fallback controls | Fallback must be bounded and non-live in tests | None in this audit | Must not overwrite deterministic truth | Legacy AI isolation tests | Certification uses deterministic tests only; no live provider calls | PARTIAL | P2 | Fallback not live-tested by design | Keep disabled unless explicit automated mock coverage is added. |
| Parser-rule application | Admin/system | Parser mapping/test-case endpoints | Regression-gated promotion | Parser rule metadata/provenance | Canonical extraction should show supported provenance | Parser governance tests | Scoped tests not individually rerun outside certification/unit suite | PARTIAL | P2 | No live admin parser promotion smoke | Add synthetic non-production parser promotion smoke. |
| Parser-test persistence | Admin | `endpoints/parser-test-case/**` | Persist/adjudicate cases | Parser test rows/training archive | Admin page reads cases | Parser unit/API tests | Route inventory plus unit suite in `pnpm run check` | PARTIAL | P2 | No deployed admin UI smoke | Add admin parser-test E2E smoke. |
| Report storage | System | Storage helpers/artifact creator | Durable artifact reference and digest | Stored file and `reportArtifact` metadata | Owner can process/retrieve results | Storage durability tests | Live smokes proved `sha256Present`; cert storage durability passed | PASS | P1 | Raw storage backend not manually inspected | Keep storage contract gate. |
| Tradeline/account persistence | System | Ingest persistence helpers | Persist tradelines under owner/artifact | `tradeline` rows and artifact links | Upload-results returns expected count | Golden/API tests | Live smokes returned 2 tradelines | PASS | P0 | None observed | Keep `>=2` synthetic tradeline assertion. |
| Violation scanning | System | `helpers/complianceScanner.tsx` | Scan persisted tradelines | Finding rows linked to tradelines | Findings/actionable counts visible | Compliance/golden tests | Live smokes returned 6 actionable findings | PASS | P1 | Evidence-link details not checked live | Add rule/evidence/regulation detail assertion. |
| Evidence enrichment | Consumer/admin/system | `endpoints/evidence/**`, hash chain helpers | Append-only evidence and owner scope | Evidence events and hash chain | Evidence retrievable per role/scope | Evidence ledger tests | Certification evidence ledger gate passed | PASS | P2 | Not live-attached to staging upload artifact | Add live finding evidence-link assertion. |
| Regulation/reference linking | Admin/system | Regulation registry endpoints/helpers | Findings carry references without overclaiming legal conclusions | Registry/mapping rows | Consumer/admin surfaces show references | Regulation tests/golden path | Golden path passed violation reference checks | PASS | P2 | Not live-admin-smoked | Add synthetic regulation registry admin smoke. |
| Readiness validation | Consumer/admin | `/_api/packet/validate-readiness` | Eligible findings pass; blockers explicit | Read-only | User sees blockers/warnings | Packet readiness tests | Live readiness selected finding `4946`; cert selected `4981` | PASS | P1 | None observed for eligible path | Add negative live readiness fixture later. |
| Packet build/create | Consumer/admin | `/_api/packet/build`, `/_api/packet/create` | Build/create owner packet from eligible finding | Packet rows/finding links/evidence events | Owner can retrieve packet | Packet lifecycle tests | Packet `144` and `145` created as generated | PASS | P1 | None observed | Keep packet smoke in certification. |
| Packet PDF retrieval | Consumer/admin | `/_api/packet/pdf` | Owner gets non-empty PDF; non-owner denied | PDF cache/storage when applicable | HTTP `application/pdf`, `%PDF` | Packet PDF tests/cache proof | Live PDF HTTP 200, 7307/7297 bytes; non-owner 403 | PASS | P1 | Previous 502 remediated | Keep corrupt image validation and live proof. |
| Packet lifecycle/list | Consumer/admin | `/_api/packet/list`, get/update/status | Owner/org scope and lifecycle changes | Packet status/delivery rows | User sees own packets only | Packet scope/lifecycle tests | Certification unit/API gates passed | PASS | P2 | No separate live list UI smoke | Add packet list browser/API smoke. |
| Consumer result display pages | Consumer | `/upload`, `/upload-results/:artifactId` | Clear status/results/actionable failure | Read-only | No blank/queued forever UI | Upload status UI unit tests | Unit tests passed; live API result proven | PARTIAL | P2 | No live browser UI automation in this audit | Add Playwright synthetic upload-results display smoke. |
| Admin dashboards | Admin | `/admin-*`, admin endpoints | Admin-only visibility and queue/status surfaces | Read-only or audited writes | Admin sees operator state | Admin endpoint/unit/e2e tests | Scoped endpoint tests passed for reset/correction; no full live admin session | PARTIAL | P2 | No deployed admin role E2E proof | Add synthetic admin dashboard smoke. |
| Admin reset user | Admin | `/_api/admin/reset-user` | Admin can reset user data with audit | Cascade cleanup/audit | Admin receives counts | `admin-reset-user-endpoint.spec.ts` | Scoped Vitest passed | PASS | P2 | Not live-admin-smoked | Add staging admin reset smoke using synthetic user only. |
| Admin violation correction | Admin | `endpoints/admin/violation-correction/**`, manager | Transactional correction/training/audit | Correction, training, audit rows | Admin sees status | Correction endpoint/unit tests | Scoped Vitest and `pnpm run check` correction regressions passed | PASS | P2 | Not live-admin-smoked | Add synthetic correction finalization smoke. |
| Admin correction truth/canonicalization | Admin/system | `helpers/violationCorrectionManager.tsx` | Correction-as-truth only where explicit | Audit/training metadata | Downstream canonicalization consistent | Correction truth tests | `pnpm run check` passed violation correction regression | PARTIAL | P2 | No live staging correction-as-truth proof | Add fixture-only staging admin correction smoke. |
| Response-document processing | Consumer/admin/system | `endpoints/responses/**`, response worker scripts | Capture/process responses, retry/dead-letter/stale states | Response event/job rows | Admin/user status surfaces | Response API/soak tests | Response soak passed with duplicate/retry/dead-letter/stale observations | PASS | P2 | No live mailbox/provider integration by design | Keep no-live-provider constraint. |
| Dead-letter/retry/stale job handling | Worker/admin | Queue services/admin queue endpoints | Stale/dead-letter visible and actionable | Job state/events | User/admin safe terminal states | Queue tests and soak scripts | Response soak and ingest worker simulated proof passed | PASS | P1 | Ingest dead-letter not live-smoked on staging | Add live-safe synthetic stale job read-only check. |
| Health endpoints/deploy assumptions | Operator | Workflows, compose, certification scripts | Staging/prod deploy gates prove target SHA and smokes | Evidence docs | Operators see certifying/non-certifying status | Workflow/static tests | `production-scale:certify` passed with current target SHA | PASS | P1 | None observed | Keep exact SHA action evidence. |
| Production-scale certification | CI/operator | `pnpm run production-scale:certify` | Fails if any required gate fails/stale/skipped | Evidence markdown/JSON | `CERTIFYING:true/false` unambiguous | Certification tests | Certification passed with no failed/stale/skipped gates | PASS | P1 | None observed | Keep auth upload and packet gates mandatory. |
| Migration governance | CI/operator | `pnpm run check:migrations`, `migrations:gate` | Unauthorized runtime ensure paths release-visible | Evidence docs | Promotion gate status visible | Migration checker tests | `check:migrations` passed with 0 release blockers and 18 warning-only entries | PARTIAL | P2 | Warning-only residual runtime ensure entries remain | Continue converting runtime ensure paths to additive migrations. |
| Public/support/subscription/ancillary flows | Mixed | Support, subscription, lead, legal authority endpoints | Role-scoped ancillary behavior | Various rows | UI/API per function | Route contracts/API tests | Covered by contracts/API/check, not individually live-smoked | PARTIAL | P3 | Not core-audited live | Add scoped smoke only for release-critical ancillary flows. |

## Commands Run

| Command | Result | Summary |
| --- | --- | --- |
| `git status --short --branch` | PASS | Branch `staging...origin/staging`; unrelated untracked `docs/IMG_1433.jpeg` was not staged. |
| `git rev-parse --show-toplevel; git branch --show-current; git rev-parse HEAD; git remote -v` | PASS | Repo, branch, remote, and audited HEAD identified. |
| Route/helper/script/test inventory reads | PASS | Inspected package scripts, endpoints, server route registration, ingest/status/results/packet/admin/response paths, and existing audit docs. |
| `pnpm run smoke:auth-workflow` with staging auth env | PASS | Artifact `494`, owner `156`, job `35` completed, 2 tradelines, 6 actionable findings, non-owner `403`. |
| `pnpm run smoke:auth-workflow:packet` with staging env | PASS | Finding `4946`, packet `144`, PDF HTTP `200`, `application/pdf`, 7307 bytes, non-owner PDF `403`. |
| `pnpm exec vitest run --config vitest.config.ts tests/unit/staging-auth-workflow-smoke.spec.ts tests/unit/production-scale-certification.spec.ts tests/unit/upload-processing-status-ui.spec.tsx tests/api/report-ingest-lifecycle-endpoint.spec.ts tests/api/packet-lifecycle-endpoint.spec.ts tests/api/admin-reset-user-endpoint.spec.ts tests/api/admin-violation-correction-endpoint.spec.ts tests/api/response-document-endpoint.spec.ts` | PASS | 8 files, 102 tests passed. |
| `pnpm run test:golden-path` | PASS | Upload, parse, canonical map, anomaly detect, violation detect, evidence bind, packet generate, PDF download all passed. |
| `pnpm run test:deterministic-ingestion-report` | PASS | 11 fixtures passed; replay stable; violation search preserved. |
| `pnpm run ingest:worker:simulated-proof` | PASS | Synthetic queue drained: 2 succeeded, 1 dead-lettered; non-certifying by design. |
| `pnpm run packet-pdf:cache-miss-proof` | PASS | Packet PDF cache-miss evidence regenerated. |
| `pnpm run response:soak-check` | PASS | Duplicate collapse, retry backlog, dead-letter, stale-running, replay dry run, retention preview, cleanup all observed. |
| `pnpm run check:migrations` | PASS/PARTIAL | Exit 0, 0 release blockers; evidence says `CERTIFYING:false` for warning-only runtime ensure residuals. |
| `pnpm run production-scale:certify` with staging auth env | PASS | `CERTIFYING:true`; includes authenticated upload-results and packet PDF gates. |

## Tests Added Or Reused

No new tests were added in this audit pass. The audit reused and dynamically executed existing staging smokes, scoped Vitest suites, golden path, deterministic ingestion, worker simulation, response soak, packet PDF proof, migration governance, and production-scale certification.

## Failures Found

No open P0 or P1 failure was reproduced in this audit pass.

Historical failures that remain documented because previous audits missed them:

- P0 historical: authenticated upload-to-results originally returned 0 tradelines because the smoke read results before worker completion. Remediated by worker-aware terminal status polling and certification inclusion.
- P1 historical: packet PDF live staging returned HTTP `502` on corrupt synthetic ID image attachment. Remediated by readable image validation/fallback and packet smoke certification inclusion.

Current residual gaps:

- P2: Deployed browser UI is not fully smoke-tested for the upload and upload-results display path. API/runtime proof is strong, and unit UI tests pass, but the actual browser display path was not run with a synthetic authenticated user in this audit.
- P2: Live admin role workflows for parser-test persistence, regulation registry, evidence management, violation correction finalization, and reset-user were not all exercised through deployed admin UI/API with a synthetic admin. Scoped endpoint/unit tests passed.
- P2: Migration governance still reports warning-only runtime ensure sources. The hard gate has zero release blockers, but residual runtime ensure entries remain release-visible.
- P3: Ancillary non-core surfaces such as support tickets, subscriptions, lead reminders, and some analytics views were inventoried and covered by route/API/build suites, but not individually live-smoked.

## Root-Cause Hypotheses For Residual Gaps

- Browser UI gap: the current certification path is API/script-first. It proves auth cookies, endpoints, persistence, queue status, upload-results data, and packet PDF bytes, but it does not render the deployed React pages in a browser.
- Admin live gap: current admin coverage is mostly API/unit/script coverage. A synthetic admin setup path exists in tests, but this audit did not use a live staging admin credential or create one.
- Migration warning gap: runtime ensure helpers are intentionally still present for compatibility. The governance checker reports them as known warning-only sources until each is converted into an additive reviewed migration.

## Files And Code Paths Implicated

Core verified paths:

- `scripts/staging-auth-workflow-smoke.ts`
- `scripts/staging-auth-packet-workflow-smoke.ts`
- `scripts/production-scale-certification.mjs`
- `endpoints/auth/register_with_password_POST.ts`
- `endpoints/auth/login_with_password_POST.ts`
- `endpoints/auth/session_GET.ts`
- `endpoints/ingest/report_POST.ts`
- `endpoints/ingest/process_POST.ts`
- `endpoints/ingest/status_GET.ts`
- `endpoints/report-artifact/get_GET.ts`
- `endpoints/upload-results/get_GET.ts`
- `helpers/ingestProcessingQueueService.ts`
- `helpers/ingestCorePipeline.tsx`
- `helpers/complianceScanner.tsx`
- `endpoints/packet/recommend_GET.ts`
- `endpoints/packet/validate-readiness_POST.ts`
- `endpoints/packet/build_POST.ts`
- `endpoints/packet/create_POST.ts`
- `endpoints/packet/pdf_GET.ts`
- `helpers/disputePacketService.ts`
- `helpers/packetPdfCache.ts`

Partially verified or future-work paths:

- `pages/upload.tsx`
- `pages/upload-results.$artifactId.tsx`
- `pages/packets.tsx`
- `pages/admin-*`
- `endpoints/admin/**`
- `endpoints/parser-test-case/**`
- `endpoints/regulation-registry/**`
- `endpoints/evidence/**`
- `helpers/violationCorrectionManager.tsx`
- Runtime schema ensure helpers listed by `pnpm run check:migrations`.

## Specific Remediation Prompts

1. Add an authenticated Playwright staging smoke for `/upload` and `/upload-results/:artifactId` that reuses the synthetic auth workflow, verifies the same artifact/status/result data in the rendered browser UI, and fails on blank, queued forever, 99 percent, or generic failure displays.
2. Add a synthetic staging admin smoke that creates or uses a safe admin test identity, then verifies admin reset-user, violation correction detail/finalization dry run, evidence list, regulation registry list, and parser-test list without mutating real user data.
3. Extend the live staging auth smoke to record a compact canonical field snapshot and at least one violation evidence/regulation reference for the selected synthetic finding.
4. Continue migration governance hardening by converting the remaining warning-only runtime ensure sources into additive reviewed migrations, one helper family at a time.

## Gaps Not Tested And Why

- Manual browser testing was intentionally not used. The request requires automated evidence only.
- Live external provider calls were intentionally not used. The audit relied on deterministic fixtures, staging API smokes, local tests, dry runs, and simulations.
- Real consumer PII was intentionally not used. The staging smokes generated synthetic users and PDFs and cleaned them up.
- Full admin UI browser coverage was not run because this pass did not create or use a live staging admin browser session.
- Production deploy/rollback was not live-tested because the request forbids live deploy testing; static workflow checks and simulations are used instead.

## What Previous Audits Likely Missed

Previous audits over-weighted route presence, parser/unit success, and local/simulated proofs. The missed failure was that a logged-in consumer could upload a report but receive no usable results because the proof path did not wait for the real staging worker boundary and did not verify same-owner `upload-results`. The next missed failure was similar: upload-results passed, but the live packet PDF path failed on the deployed render route while local/cache proof still passed. The current audit treats those as baseline risks and therefore requires live staging synthetic authenticated evidence for both upload-results and packet PDF.
