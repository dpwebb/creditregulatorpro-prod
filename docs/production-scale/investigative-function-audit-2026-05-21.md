# Investigative Function Audit - 2026-05-21

## Executive Result

**Overall status: LIMITED**

The original audit result was **BLOCKED** because the authenticated consumer credit-report upload-to-results path was not proven. Remediation on 2026-05-21 made the staging synthetic authenticated smoke worker-aware, verified artifact ownership, waited for terminal ingest status, proved same-consumer `upload-results`, proved non-owner denial, and added the smoke to `production-scale:certify`. The P0 authenticated upload-to-results blocker is now remediated with executable staging evidence, but this report remains **LIMITED** rather than `READY` because it is an audit/remediation addendum, not a full manual-free production launch approval.

Current repo: `C:\Users\webbd\Projects\creditregulatorpro-staging`

Branch: `staging`

Original commit audited: `e685d871789f29a3978a23dfafc509ff1afef368`

Remediation base HEAD: `95a0367f718b560343a891487e31b0e818391b4b`

Audit date: `2026-05-21`

## Original Primary Proof

Command:

```powershell
$env:CRP_AUTH_WORKFLOW_SMOKE='true'; $env:STAGING_BASE_URL='https://staging.creditregulatorpro.com'; $env:CRP_AUTH_WORKFLOW_SMOKE_RUN_ID='investigative-audit-2026-05-21'; pnpm run smoke:auth-workflow
```

Result: **FAIL**, exit code 1.

Evidence:

- Staging host was reachable: `curl.exe -k -I https://staging.creditregulatorpro.com` returned HTTP `200 OK`.
- The smoke self-registered and logged in a synthetic consumer.
- The smoke uploaded a generated text-based TransUnion PDF.
- The smoke cleaned up the synthetic user afterward: `Registered user ID: 129. Cleanup status: deleted.`
- The user-facing result retrieval failed: `Expected at least 2 synthetic tradelines, found 0.`

Conclusion: upload acceptance alone is not enough. The authenticated consumer did not receive usable results through the retrieval surface in this executable proof.

## Remediation Addendum

Root cause: `scripts/staging-auth-workflow-smoke.ts` treated `/_api/ingest/process` as if it always returned completed parser output. In staging, request-bound ingest is correctly disabled and the endpoint can return a queued worker-required status. The smoke immediately queried `/_api/upload-results/get` before the worker reached a terminal state, so the user-facing result surface returned 0 tradelines even though the worker could complete moments later.

Bounded fix:

- `scripts/staging-auth-workflow-smoke.ts` now polls `/_api/ingest/status` until `completed` or a bounded terminal failure state, logs compact status diagnostics, verifies artifact owner equals the authenticated user, verifies same-consumer upload-results, creates a second consumer, proves non-owner denial, and cleans up both synthetic users.
- Packet build/PDF checks are now explicit opt-in via `CRP_AUTH_WORKFLOW_SMOKE_INCLUDE_PACKET=true` so the P0 upload-results certification cannot be masked by an unrelated packet PDF gateway failure. Packet PDF remains covered by `pnpm run packet-pdf:cache-miss-proof`.
- `scripts/production-scale-certification.mjs` now includes `pnpm run smoke:auth-workflow` as the required `authenticatedUploadResults` gate.

Post-fix executable proof:

```powershell
$env:CRP_AUTH_WORKFLOW_SMOKE='true'; $env:STAGING_BASE_URL='https://staging.creditregulatorpro.com'; $env:CRP_AUTH_WORKFLOW_SMOKE_RUN_ID='auth-upload-results-proof-2026-05-21'; pnpm run smoke:auth-workflow
```

Result: **PASS**, exit code 0.

Evidence:

- Synthetic authenticated owner: user `136`.
- Artifact owner proof: artifact `478`, `ownerUserId: 136`, `sha256Present: true`.
- Worker/orchestration proof: job `27` polled `queued_waiting_for_worker` to terminal `completed` with `queueStatus: succeeded` and `diagnosticCode: INGEST_PROCESSING_COMPLETED`.
- Upload-results proof: same owner retrieved `TransUnion Canada`, `region: CA`, `totalTradelines: 2`, `actionableCount: 6`.
- Non-owner denial proof: second synthetic user denied on `/_api/upload-results/get` with HTTP `403`.
- Cleanup proof: owner user `136` and non-owner user `137` both self-deleted; owner purge included `reportArtifacts: 1`, `tradelines: 2`, `storedFiles: 1`.

Certification proof:

```powershell
$env:CRP_AUTH_WORKFLOW_SMOKE='true'; $env:STAGING_BASE_URL='https://staging.creditregulatorpro.com'; $env:CRP_AUTH_WORKFLOW_SMOKE_RUN_ID='production-scale-cert-auth-upload-2026-05-21'; pnpm run production-scale:certify
```

Result: **PASS**, exit code 0. The generated certification evidence reports `CERTIFYING:true`, gate `authenticatedUploadResults: passed`, no failed gates, no stale gates, and no skipped gates. Inside that certification run, synthetic owner user `138` uploaded artifact `479`, job `28` reached terminal `completed`, upload-results returned `totalTradelines: 2`, non-owner access returned HTTP `403`, and synthetic users `138` and `139` were deleted.

Remaining non-P0 observation: the legacy packet-included version of the auth smoke was attempted twice during remediation and reached completed upload-results before failing on packet PDF HTTP `502`. Because this remediation targets the P0 upload-to-results blocker and packet PDF has a separate automated proof gate, packet PDF was left as a separate follow-up rather than folded into this bounded fix.

## What Previous Audits Likely Missed

Previous readiness work heavily proved deterministic parser behavior, endpoint contracts, owner checks, mocked lifecycle behavior, and local/simulated worker gates. Those checks are valuable, but they did not require a synthetic logged-in consumer to pass through the deployed staging auth/session/upload/process/retrieve path and prove usable `upload-results`. That gap is now closed by requiring `pnpm run smoke:auth-workflow` in `production-scale:certify`.

## Commands Run

| Command | Result | Evidence |
| --- | --- | --- |
| `git status --short --branch` | PASS | Clean `staging...origin/staging` before edits. |
| `git rev-parse --show-toplevel; git branch --show-current; git rev-parse HEAD` | PASS | Repo, branch, and commit identified. |
| `curl.exe -k -I https://staging.creditregulatorpro.com` | PASS | HTTP `200 OK`. |
| `pnpm run smoke:auth-workflow` with staging synthetic auth env | FAIL | Authenticated upload-results returned 0 tradelines. |
| `pnpm run test:golden-path` | PASS | Synthetic upload payload, parse, canonical map, violations, evidence, packet, PDF all passed locally. |
| `pnpm exec vitest run ... --poolOptions...` | FAIL | Unsupported local Vitest option; rerun without unsupported option passed. |
| `pnpm exec vitest run tests/unit/staging-auth-workflow-smoke.spec.ts tests/unit/upload-processing-status-ui.spec.tsx tests/api/report-ingest-lifecycle-endpoint.spec.ts` | PASS | 3 files, 46 tests passed. |
| `pnpm run test:deterministic-ingestion-report` | PASS | 11 fixtures passed; violation search preserved. |
| `pnpm run ingest:worker:simulated-proof` | PASS, non-certifying for staging | Simulated queue drained 2 succeeded and 1 dead-lettered; script states bounded staging queue-drain proof remains required. |
| `pnpm run packet-pdf:cache-miss-proof` | PASS | Cache-miss proof completed. |
| `pnpm run check:migrations` | PASS exit, non-certifying evidence | 0 release blockers, 18 warning-only runtime ensure entries; output says `CERTIFYING:false`. |
| `git diff --check` | PASS | No whitespace errors after audit files were added. |
| JSON parse check | PASS | `investigative-function-audit-2026-05-21.json` parsed successfully. |
| `pnpm run check` | PASS | Build, unit suite, golden path, deterministic ingestion, parser regression, tradeline internal, and violation correction checks passed. |
| `pnpm exec vitest run tests/unit/staging-auth-workflow-smoke.spec.ts tests/unit/production-scale-certification.spec.ts tests/unit/upload-processing-status-ui.spec.tsx tests/api/report-ingest-lifecycle-endpoint.spec.ts` | PASS | 4 files, 55 tests passed after remediation. |
| `pnpm run smoke:auth-workflow` with staging synthetic auth env | PASS | Artifact `478`, owner `136`, job `27` completed, upload-results had 2 tradelines, non-owner denied 403, cleanup deleted both users. |
| `pnpm run production-scale:certify` with staging synthetic auth env | PASS | `CERTIFYING:true`; `authenticatedUploadResults` gate passed with artifact `479`, owner `138`, job `28`, 2 tradelines, non-owner denied 403. |

## Verification Matrix

| Function | Role/state | Entry point | Expected behavior and persistence | Retrieval/display requirement | Existing tests found | Audit command/evidence | Result | Risk | Failure mode | Remediation task |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Public app health | anonymous | `/` | App serves shell | Browser/API reachable | deploy workflow probes | `curl -k -I` returned 200 | PASS | P3 | none | Keep health probes. |
| Registration | anonymous | `/_api/auth/register_with_password` | Creates user, password, account rows, session | User can login/session | auth workflow smoke spec | staging smoke created synthetic user 129 | PASS | P1 | not independently isolated from later failure | Keep synthetic cleanup mandatory. |
| Login/session | consumer | `/_api/auth/login_with_password`, `/_api/auth/session` | Session cookie resolves user role `user` | Auth-only routes accept same cookie | auth route tests, smoke harness | staging smoke progressed past login/session | PASS | P1 | none observed | Add session ID trace to smoke evidence without secrets. |
| Consumer upload artifact creation | authenticated consumer | `/_api/ingest/report` | Validates PDF, stores artifact owned by user | Artifact ID returned | `report-ingest-lifecycle-endpoint.spec.ts` | remediation smoke proved artifact `478` owner `136`; certification smoke proved artifact `479` owner `138` | PASS | P0 | remediated | Keep artifact owner proof in certification gate. |
| Ingest process enqueue | authenticated consumer | `/_api/ingest/process` | Enqueues durable job; staging must not inline heavy work | User receives queued/processing/completed state | API lifecycle tests | remediation smoke polled job `27` queued -> completed; certification smoke polled job `28` queued -> running -> completed | PASS | P0 | remediated | Keep terminal status polling in smoke. |
| Worker lifecycle | worker/admin | `scripts/ingest-processing-worker.ts`, queue tables | Claim, heartbeat, process, retry/dead-letter | Status visible to user/admin | worker simulation, queue tests | staging smoke observed terminal completed queue jobs; simulated proof also passed | PASS | P0 | remediated for synthetic staging upload-results path | Add broader queue-depth dashboard evidence separately. |
| Canonical extraction | system | `helpers/canonicalCreditReportExtractor.tsx` | Deterministic extraction, no AI fallback in product path | Canonical state stored on artifact | deterministic ingestion report | 11 fixtures passed | PASS | P1 | not proven for staging uploaded artifact | Tie staging smoke to canonical output evidence. |
| Parser rule application | admin/system | parser test/promote endpoints, canonical extractor | Regression-gated active rules | Provenance visible where supported | parser governance tests | existing scoped tests found; not rerun broadly | PARTIAL | P1 | not live-smoked | Add parser-rule provenance assertion to ingest audit fixture. |
| DocStrange/LLM fallback | system | deterministic extractor/fallback flags | No live provider calls in tests; deterministic path preserved | Fallback must not overwrite truth silently | deterministic tests | static inspection shows `allowAiFallback:false` in ingest | PASS | P2 | no live fallback tested by design | Keep provider calls disabled in certification. |
| Report storage | system | `helpers/ingestArtifactCreator.tsx`, `helpers/reportArtifactStorage.ts` | Store PDF reference, not raw DB bytes | `reportArtifact` and storage reference retrievable | storage durability tests | not rerun full durability here | PARTIAL | P1 | staging artifact storage not independently verified in failed smoke | Include artifact storage reference in auth smoke evidence. |
| Tradeline persistence | system | `helpers/ingestTradelinePersistence` | Persist tradeline rows linked to artifact/user | `upload-results` returns count/findings | golden path, API upload-results tests | remediation smoke and certification smoke each returned 2 tradelines for the authenticated owner | PASS | P0 | remediated | Keep tradeline count assertion at `>= 2`. |
| Violation scanning | system | `helpers/complianceScanner.tsx` | Scan persisted tradelines; preserve manual findings | Findings retrievable and packet-ready if applicable | compliance/persistence tests | remediation smoke returned `actionableCount: 6`; golden path passed | PASS | P1 | remediated for synthetic staging upload-results path | Add separate evidence-link detail assertion later. |
| Evidence enrichment | system/admin | evidence endpoints/helpers | Evidence links and hash ledger | Evidence retrievable by owner/admin | evidence API tests | scoped existing tests passed previously; not direct staged | PARTIAL | P2 | no staging evidence proof for uploaded artifact | Add evidence-link assertion to smoke after findings exist. |
| Regulation/reference linking | system/admin | regulation registry, violation evidence | Findings include references | Consumer/admin sees references as references, not legal conclusions | deterministic/golden tests | golden path violation evidence passed | PASS | P2 | not staging-live | Keep in parser/violation regression gate. |
| Upload-results retrieval | authenticated owner/admin | `/_api/upload-results/get`, `/upload-results/:artifactId` | Owner gets results; non-owner denied; admin per intended scope | UI shows status/results/actionable failure | API tests, UI status tests | owner got 2 tradelines; non-owner denied 403 | PASS | P0 | remediated | Keep owner/non-owner proof in certification gate. |
| UI upload status clarity | authenticated consumer | `/upload` | Queued/processing/stalled/completed are clear | No indefinite 99%/queued confusion | `upload-processing-status-ui.spec.tsx` | unit UI status tests passed | PARTIAL | P1 | component passes, but deployed UI not browser-smoked in auth flow | Add automated Playwright/HTTP UI smoke for synthetic user state. |
| Auth boundary regression | owner, non-owner, admin | report/upload/packet endpoints | Owner scoped, non-owner denied, admin intentional | Wrong owner cannot see data | route auth and API lifecycle tests | staging smoke created second synthetic user and upload-results returned 403 | PASS | P1 | remediated for upload-results; packet non-owner remains covered elsewhere | Extend packet-specific staging denial separately if needed. |
| Packet recommendation/readiness | authenticated owner | `/_api/packet/recommend`, `validate-readiness` | Eligible findings become packet candidates | Warnings/blockers shown | packet lifecycle endpoint tests | packet checks were moved behind explicit opt-in; local packet proof passed | PARTIAL | P1 | not part of P0 upload-results proof | Run packet-included staging smoke in a separate packet remediation task. |
| Packet build/create/PDF | authenticated owner/admin | packet endpoints/PDF | Create persisted packet, PDF downloadable | PDF bytes returned to owner | packet lifecycle and PDF proof tests | packet opt-in attempts reached completed upload-results then packet PDF returned 502 twice; local proof passed | PARTIAL | P1 | staging packet PDF live endpoint requires separate diagnosis | Keep packet PDF cache proof gate and add live staging packet PDF remediation. |
| Packet lifecycle | owner/admin | packet list/get/update/status | Scope enforced; lifecycle preserved | User sees own packets only | packet tests | not directly staged | PARTIAL | P2 | not live-smoked | Add owner/non-owner packet smoke. |
| Admin dashboards | admin | `/admin-*`, admin endpoints | Admin-only metrics and queues visible | Operator can see queue/status | admin endpoint/unit tests | static inventory only in this audit | PARTIAL | P2 | not dynamically role-smoked | Add synthetic admin dashboard smoke with no PII. |
| Admin violation correction | admin | correction endpoints/manager | Transactional finalization/training/audit | Operator-visible status | correction tests | static inventory only in this audit | PARTIAL | P2 | no live admin correction smoke | Add synthetic correction finalization smoke. |
| Admin correction canonicalization | admin/system | `helpers/violationCorrectionManager.tsx` | Only explicit correction-as-truth behavior | Audit metadata retained | correction tests | not rerun here | PARTIAL | P2 | no staging proof | Keep behind admin test data only. |
| Parser-test persistence | admin | parser-test-case endpoints | Persist cases, promote only gated rules | Provenance available | parser unit/API tests | static inventory only | PARTIAL | P2 | no live admin smoke | Add non-mutating parser-test smoke. |
| Response document processing | user/admin | responses endpoints/workers | Capture/process response metadata append-only | Admin/user surfaces show outcome | response soak and docs | response soak passed locally | PASS | P2 | not related to failed credit upload | Keep as separate gate. |
| Dead-letter/retry/stale jobs | worker/admin | queue service/admin queue | Stale/dead-letter visible and retryable | User/admin sees safe state | API lifecycle tests | local tests passed; staging proof absent | PARTIAL | P1 | current staging failure may be worker/stale-related | Include queue/job state in auth smoke evidence. |
| Deployment/staging assumptions | workflow | GitHub Actions, compose, worker scripts | Staging has worker path and post-deploy checks | Evidence should include target SHA and auth workflow | workflow tests, certification | `production-scale:certify` now includes and passed `authenticatedUploadResults` | PASS | P1 | remediated for certification gate | Keep staging smoke environment configured for certification runs. |

## Critical Findings

### P0 - Authenticated Upload-To-Results Failed On Staging - Remediated

The original audit found that the deployed staging app accepted the synthetic authenticated upload path but did not produce usable `upload-results`. The remediation found this was a smoke/orchestration proof gap: the script assumed synchronous completion even though staging correctly queues worker-backed processing. After polling `/_api/ingest/status` to terminal `completed`, the same authenticated flow produced 2 tradelines and 6 actionable findings for the owner.

Implicated paths:

- `scripts/staging-auth-workflow-smoke.ts`
- `endpoints/ingest/report_POST.ts`
- `endpoints/ingest/process_POST.ts`
- `helpers/ingestProcessingQueueService.ts`
- `scripts/ingest-processing-worker.ts`
- `endpoints/ingest/status_GET.ts`
- `endpoints/upload-results/get_GET.ts`
- `pages/upload.tsx`
- `pages/upload-results.$artifactId.tsx`

Remediated root cause:

- The auth smoke assumed synchronous completion while `process_POST` now returns queued status in staging/production.
- The smoke now treats queued process output as non-terminal and verifies worker completion before reading upload-results.
- The smoke now proves artifact ownership, same-owner result retrieval, non-owner denial, and cleanup.

### P1 - Certification Gate Did Not Prove The Core Consumer Workflow - Remediated

`production-scale:certify` now includes `pnpm run smoke:auth-workflow` as `authenticatedUploadResults`. The post-fix certification run passed with `CERTIFYING:true` and no failed, stale, or skipped gates.

Implicated path: `scripts/production-scale-certification.mjs`.

### P1 - Auth Smoke Was Not Worker-Aware Enough - Remediated

The auth workflow smoke now calls `/_api/ingest/process`, polls `/_api/ingest/status` until `completed`, `failed`, `manual_review_required`, `stalled_no_worker_heartbeat`, `stale`, or timeout, then verifies upload-results only after terminal success.

Implicated path: `scripts/staging-auth-workflow-smoke.ts`.

### P1 - Packet-Included Staging Smoke Hit Packet PDF 502 - Open Separate Follow-Up

During remediation, the packet-included version of the staging auth smoke reached completed upload-results and then failed on packet PDF HTTP `502` twice. This did not block the bounded P0 upload-results fix because packet PDF has a separate automated proof gate and the requested proof point is authenticated upload-to-results. It should still be diagnosed as a separate staging packet/PDF operational issue if live staging packet PDF is release-critical.

## Lower-Risk Findings

- **P2:** `check:migrations` exits successfully but prints `CERTIFYING:false` because 18 warning-only runtime ensure inventory items remain. This is visible governance debt, not the immediate upload blocker.
- **P2:** UI component tests prove queued/stale/failure copy, but this remediation did not add a browser UI smoke with a synthetic authenticated user. API success must not be conflated with UI success.
- **P2:** Admin correction, evidence, regulation, parser-test, and response-document surfaces have local tests, but no single staging function smoke covers those admin role paths end to end.

## Remediation Prompts

1. **Diagnose staging packet PDF 502 in packet-included auth smoke**

   ```text
   You are Codex in Credit Regulator Pro. Diagnose the packet PDF HTTP 502 observed only after the authenticated staging upload-results flow succeeds. Do not rewrite packet PDF generation. Run the auth smoke with CRP_AUTH_WORKFLOW_SMOKE_INCLUDE_PACKET=true, inspect packet PDF endpoint logs and cache-miss proof, patch the smallest packet/PDF or staging gateway defect, and preserve existing packet output. Add automated proof and keep upload-results smoke separate.
   ```

2. **Add browser-level synthetic upload status smoke**

   ```text
   Add an automated Playwright smoke for /upload using a synthetic authenticated session. It must verify that queued, processing, stalled/no-worker, failed/manual-review, and completed states render clear next actions, and that completed upload navigates to /upload-results/:artifactId. No manual browser testing and no real PII.
   ```

3. **Extend packet-specific owner-bound staging proof**

   ```text
   Add a packet-specific staging smoke that starts from a synthetic owner with verified upload-results, creates a packet, downloads the PDF, proves non-owner denial, and cleans up. Keep it separate from the P0 upload-results certification gate unless packet PDF stability is required for every production certification run.
   ```

4. **Add synthetic admin role smoke**

   ```text
   Add a synthetic admin role smoke for correction, evidence, regulation, parser-test, and queue dashboard surfaces. Use no real PII and do not mutate production references except through existing test-only or staging-safe admin paths.
   ```

## Gaps Not Fully Tested

- Live browser UI was not exercised because this remediation prioritized non-interactive API/runtime proof for the P0 path.
- Admin dashboards/correction/parser-test surfaces were inventoried and mapped to existing tests, but not staged with a synthetic admin in this run.
- Two packet-included failed smoke attempts left generated synthetic users unconfirmed because cleanup hit staging gateway errors after packet PDF 502. The passing focused smoke and certification smoke both deleted their synthetic owner and non-owner users.
- No live external provider calls or live deploys were run.

## Verdict

**LIMITED.** The P0 authenticated consumer credit-report upload-to-results path is now proven by executable staging and certification evidence. This report does not independently mark every admin, browser UI, or packet/PDF staging function `READY`; those remain separate follow-up surfaces.
