# Investigative Function Audit - 2026-05-21

## Executive Result

**Overall status: BLOCKED**

The authenticated consumer credit-report upload-to-results path is **not proven**. The strongest dynamic proof run in this audit was a staging-host synthetic authenticated workflow smoke: it self-registered a consumer, logged in, uploaded a generated TransUnion PDF through `/_api/ingest/report`, invoked `/_api/ingest/process`, then requested `/_api/upload-results/get`. The upload/auth path executed, but `upload-results` returned 0 tradelines and the command failed with `Expected at least 2 synthetic tradelines, found 0`. Because the non-negotiable proof point failed, this audit cannot mark the platform ready even though local parser, route, status, packet PDF, and queue simulations passed.

Current repo: `C:\Users\webbd\Projects\creditregulatorpro-staging`

Branch: `staging`

Commit audited: `e685d871789f29a3978a23dfafc509ff1afef368`

Audit date: `2026-05-21`

## Primary Proof

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

## What Previous Audits Likely Missed

Previous readiness work heavily proved deterministic parser behavior, endpoint contracts, owner checks, mocked lifecycle behavior, and local/simulated worker gates. Those checks are valuable, but they did not require a synthetic logged-in consumer to pass through the deployed staging auth/session/upload/process/retrieve path and prove usable `upload-results`. The current `production-scale:certify` gate also omits `pnpm run smoke:auth-workflow`, so a certification run can pass without proving the product's core consumer workflow.

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

## Verification Matrix

| Function | Role/state | Entry point | Expected behavior and persistence | Retrieval/display requirement | Existing tests found | Audit command/evidence | Result | Risk | Failure mode | Remediation task |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Public app health | anonymous | `/` | App serves shell | Browser/API reachable | deploy workflow probes | `curl -k -I` returned 200 | PASS | P3 | none | Keep health probes. |
| Registration | anonymous | `/_api/auth/register_with_password` | Creates user, password, account rows, session | User can login/session | auth workflow smoke spec | staging smoke created synthetic user 129 | PASS | P1 | not independently isolated from later failure | Keep synthetic cleanup mandatory. |
| Login/session | consumer | `/_api/auth/login_with_password`, `/_api/auth/session` | Session cookie resolves user role `user` | Auth-only routes accept same cookie | auth route tests, smoke harness | staging smoke progressed past login/session | PASS | P1 | none observed | Add session ID trace to smoke evidence without secrets. |
| Consumer upload artifact creation | authenticated consumer | `/_api/ingest/report` | Validates PDF, stores artifact owned by user | Artifact ID returned | `report-ingest-lifecycle-endpoint.spec.ts` | staging smoke got far enough to call process/results | PARTIAL | P0 | artifact ownership not directly evidenced in smoke output | Extend smoke to record artifact owner/status through safe endpoints. |
| Ingest process enqueue | authenticated consumer | `/_api/ingest/process` | Enqueues durable job; staging must not inline heavy work | User receives queued/processing/completed state | API lifecycle tests | staging smoke called process; local tests prove queued status shape | PARTIAL | P0 | process likely returned queued while results were fetched before completion, or worker did not process | Make smoke worker-aware and prove status reaches completed. |
| Worker lifecycle | worker/admin | `scripts/ingest-processing-worker.ts`, queue tables | Claim, heartbeat, process, retry/dead-letter | Status visible to user/admin | worker simulation, queue tests | `ingest:worker:simulated-proof` passed but is not staging proof | PARTIAL | P0 | staging auth smoke did not observe completed results | Add bounded staging queue-drain proof to certification gate. |
| Canonical extraction | system | `helpers/canonicalCreditReportExtractor.tsx` | Deterministic extraction, no AI fallback in product path | Canonical state stored on artifact | deterministic ingestion report | 11 fixtures passed | PASS | P1 | not proven for staging uploaded artifact | Tie staging smoke to canonical output evidence. |
| Parser rule application | admin/system | parser test/promote endpoints, canonical extractor | Regression-gated active rules | Provenance visible where supported | parser governance tests | existing scoped tests found; not rerun broadly | PARTIAL | P1 | not live-smoked | Add parser-rule provenance assertion to ingest audit fixture. |
| DocStrange/LLM fallback | system | deterministic extractor/fallback flags | No live provider calls in tests; deterministic path preserved | Fallback must not overwrite truth silently | deterministic tests | static inspection shows `allowAiFallback:false` in ingest | PASS | P2 | no live fallback tested by design | Keep provider calls disabled in certification. |
| Report storage | system | `helpers/ingestArtifactCreator.tsx`, `helpers/reportArtifactStorage.ts` | Store PDF reference, not raw DB bytes | `reportArtifact` and storage reference retrievable | storage durability tests | not rerun full durability here | PARTIAL | P1 | staging artifact storage not independently verified in failed smoke | Include artifact storage reference in auth smoke evidence. |
| Tradeline persistence | system | `helpers/ingestTradelinePersistence` | Persist tradeline rows linked to artifact/user | `upload-results` returns count/findings | golden path, API upload-results tests | staging smoke got 0 tradelines | FAIL | P0 | no usable results after authenticated upload | Diagnose worker completion and artifact/tradeline link creation on staging. |
| Violation scanning | system | `helpers/complianceScanner.tsx` | Scan persisted tradelines; preserve manual findings | Findings retrievable and packet-ready if applicable | compliance/persistence tests | local golden path violation check passed | PARTIAL | P1 | cannot prove staging scan because tradelines missing | Re-run after upload-to-tradeline is fixed. |
| Evidence enrichment | system/admin | evidence endpoints/helpers | Evidence links and hash ledger | Evidence retrievable by owner/admin | evidence API tests | scoped existing tests passed previously; not direct staged | PARTIAL | P2 | no staging evidence proof for uploaded artifact | Add evidence-link assertion to smoke after findings exist. |
| Regulation/reference linking | system/admin | regulation registry, violation evidence | Findings include references | Consumer/admin sees references as references, not legal conclusions | deterministic/golden tests | golden path violation evidence passed | PASS | P2 | not staging-live | Keep in parser/violation regression gate. |
| Upload-results retrieval | authenticated owner/admin | `/_api/upload-results/get`, `/upload-results/:artifactId` | Owner gets results; non-owner denied; admin per intended scope | UI shows status/results/actionable failure | API tests, UI status tests | staging owner got 0 tradelines after upload | FAIL | P0 | result surface was empty for synthetic authenticated user | Block release until smoke proves nonzero or valid no-result/manual-review state. |
| UI upload status clarity | authenticated consumer | `/upload` | Queued/processing/stalled/completed are clear | No indefinite 99%/queued confusion | `upload-processing-status-ui.spec.tsx` | unit UI status tests passed | PARTIAL | P1 | component passes, but deployed UI not browser-smoked in auth flow | Add automated Playwright/HTTP UI smoke for synthetic user state. |
| Auth boundary regression | owner, non-owner, admin | report/upload/packet endpoints | Owner scoped, non-owner denied, admin intentional | Wrong owner cannot see data | route auth and API lifecycle tests | local scoped tests passed; staging smoke did not create second user | PARTIAL | P1 | not dynamically proven on staging for this artifact | Extend auth smoke with second synthetic user denial. |
| Packet recommendation/readiness | authenticated owner | `/_api/packet/recommend`, `validate-readiness` | Eligible findings become packet candidates | Warnings/blockers shown | packet lifecycle endpoint tests | staging smoke did not reach finding candidate due no tradelines | BLOCKED | P1 | upstream results missing | Re-test after P0 upload results fix. |
| Packet build/create/PDF | authenticated owner/admin | packet endpoints/PDF | Create persisted packet, PDF downloadable | PDF bytes returned to owner | packet lifecycle and PDF proof tests | local proof passed; staging smoke blocked upstream | PARTIAL | P1 | no staging user packet proof | Re-run auth smoke after results/finding fix. |
| Packet lifecycle | owner/admin | packet list/get/update/status | Scope enforced; lifecycle preserved | User sees own packets only | packet tests | not directly staged | PARTIAL | P2 | not live-smoked | Add owner/non-owner packet smoke. |
| Admin dashboards | admin | `/admin-*`, admin endpoints | Admin-only metrics and queues visible | Operator can see queue/status | admin endpoint/unit tests | static inventory only in this audit | PARTIAL | P2 | not dynamically role-smoked | Add synthetic admin dashboard smoke with no PII. |
| Admin violation correction | admin | correction endpoints/manager | Transactional finalization/training/audit | Operator-visible status | correction tests | static inventory only in this audit | PARTIAL | P2 | no live admin correction smoke | Add synthetic correction finalization smoke. |
| Admin correction canonicalization | admin/system | `helpers/violationCorrectionManager.tsx` | Only explicit correction-as-truth behavior | Audit metadata retained | correction tests | not rerun here | PARTIAL | P2 | no staging proof | Keep behind admin test data only. |
| Parser-test persistence | admin | parser-test-case endpoints | Persist cases, promote only gated rules | Provenance available | parser unit/API tests | static inventory only | PARTIAL | P2 | no live admin smoke | Add non-mutating parser-test smoke. |
| Response document processing | user/admin | responses endpoints/workers | Capture/process response metadata append-only | Admin/user surfaces show outcome | response soak and docs | response soak passed locally | PASS | P2 | not related to failed credit upload | Keep as separate gate. |
| Dead-letter/retry/stale jobs | worker/admin | queue service/admin queue | Stale/dead-letter visible and retryable | User/admin sees safe state | API lifecycle tests | local tests passed; staging proof absent | PARTIAL | P1 | current staging failure may be worker/stale-related | Include queue/job state in auth smoke evidence. |
| Deployment/staging assumptions | workflow | GitHub Actions, compose, worker scripts | Staging has worker path and post-deploy checks | Evidence should include target SHA and auth workflow | workflow tests, certification | current cert omits auth smoke; staging smoke failed | FAIL | P1 | readiness gates can miss core user failure | Add auth workflow as required certification/staging deploy gate. |

## Critical Failures

### P0 - Authenticated Upload-To-Results Failed On Staging

The deployed staging app accepted the synthetic authenticated upload path but did not produce usable `upload-results`. The user-facing retrieval surface returned 0 tradelines for a synthetic report fixture that local deterministic tests parse as 2 tradelines.

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

Root-cause hypotheses:

- Staging worker path did not process the job before result retrieval.
- The auth smoke assumes synchronous completion while `process_POST` now returns queued status in staging/production.
- The job may be queued/stalled/dead-lettered without the smoke proving a visible user/admin state.
- Artifact-to-tradeline persistence or artifact owner links may not be complete on staging for this path.

### P1 - Certification Gate Does Not Prove The Core Consumer Workflow

`production-scale:certify` currently aggregates contracts, API tests, deterministic ingestion, response soak, packet PDF proof, migration governance, evidence ledger, storage durability, worker simulation, rollback simulations, and `pnpm run check`. It does not include `pnpm run smoke:auth-workflow`, so it can produce a green local certification without proving a real authenticated consumer can upload and retrieve results.

Implicated path: `scripts/production-scale-certification.mjs`.

### P1 - Existing Auth Smoke Is Not Worker-Aware Enough

The auth workflow smoke calls `/_api/ingest/process` and then immediately asks `/_api/upload-results/get`. Under the current staging/production queue boundary, process may correctly return a queued worker-required state. The smoke should poll `/_api/ingest/status` until `completed`, `failed`, `manual_review_required`, `stalled_no_worker_heartbeat`, or timeout, then verify either usable results or an explicit actionable failure. It should also fail immediately if the process response is queued but no worker completion is observed within the bounded window.

Implicated path: `scripts/staging-auth-workflow-smoke.ts`.

## Lower-Risk Findings

- **P2:** `check:migrations` exits successfully but prints `CERTIFYING:false` because 18 warning-only runtime ensure inventory items remain. This is visible governance debt, not the immediate upload blocker.
- **P2:** UI component tests prove queued/stale/failure copy, but this audit did not run a browser UI smoke with a synthetic authenticated user. API success must not be conflated with UI success.
- **P2:** Admin correction, evidence, regulation, parser-test, and response-document surfaces have local tests, but no single staging function smoke covers those admin role paths end to end.

## Remediation Prompts

1. **Fix authenticated staging upload-to-results worker completion**

   ```text
   You are Codex in Credit Regulator Pro. Fix the staging authenticated consumer upload-to-results path without rewriting ingestion. Use a synthetic auth smoke that registers a user, uploads a generated PDF, enqueues processing, polls /_api/ingest/status until terminal state, verifies worker heartbeat/job state, verifies tradelines/canonical/finding/result rows for the same owner, verifies non-owner denial, and cleans up. Patch only the bounded worker/orchestration/result-link defect found. Do not weaken deterministic parsing or ownership checks. Run the smoke against staging and local mocked tests. Commit and push.
   ```

2. **Make auth workflow smoke worker-aware and certification-required**

   ```text
   Update scripts/staging-auth-workflow-smoke.ts so it treats queued process output as non-terminal, polls /_api/ingest/status with a bounded timeout, fails on stalled/no-worker/manual-review unless explicitly expected, and verifies upload-results only after completed status. Add it as a required gate in production-scale certification or staging deploy evidence. Use synthetic users only and cleanup. Do not require manual interaction or live external providers.
   ```

3. **Add owner-bound result evidence to the smoke**

   ```text
   Extend the authenticated workflow smoke to create a second synthetic user, prove the owner can retrieve upload-results and packets, prove the second user receives 403/404 as intended, and prove admin access only where intended. Record artifactId, status, queue job status, tradeline count, finding count, and packet/PDF proof in machine-readable evidence without secrets or PII.
   ```

4. **Add browser-level synthetic upload status smoke**

   ```text
   Add an automated Playwright smoke for /upload using a synthetic authenticated session. It must verify that queued, processing, stalled/no-worker, failed/manual-review, and completed states render clear next actions, and that completed upload navigates to /upload-results/:artifactId. No manual browser testing and no real PII.
   ```

## Gaps Not Fully Tested

- Live browser UI was not exercised because the audit prioritized non-interactive API/runtime proof and the strongest API smoke already failed.
- Admin dashboards/correction/parser-test surfaces were inventoried and mapped to existing tests, but not staged with a synthetic admin in this run.
- The failed staging auth smoke deleted its synthetic user as designed, so post-failure direct DB inspection of that artifact was not available from the command output.
- No live external provider calls or live deploys were run.

## Verdict

**BLOCKED.** The platform cannot be considered production ready while the authenticated consumer credit-report upload-to-results path fails executable staging proof. Local deterministic and mocked tests are green, but they do not satisfy the primary non-negotiable proof point.
