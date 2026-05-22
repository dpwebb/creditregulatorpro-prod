# Latest Production-Scale Evidence

Generated at: 2026-05-22T17:45:48.452Z
Current branch: `staging`
Current commit hash: `b0c8de12b0d85ef47789ad35c7182ff1b6db4ca7`
Working tree clean when generated: no
Audit file used: `docs/production-at-scale-maximum-audit.md`
Audit date from file: 2026-05-20
All 25 blockers represented: yes
Any checks skipped: yes (55 dashboard SKIP row(s))
Dashboard exact commands recorded: yes
Ingest worker boundary static proof: passed

## Required Warnings

- SIMULATED evidence is not production proof.
- Dashboard PASS alone is not sufficient release evidence.
- Dashboard SKIP rows are not treated as PASS.
- Release evidence must record exact commands, not dashboard headline status alone.
- Machine-attested proof commands fail closed when runtime inputs are missing.
- This report does not claim production-at-scale readiness.
- Production mutation, real consumer PII, production database dumps, live provider delivery, and credentials are forbidden for this framework.

## Registry Summary

- Registry path: `docs/production-scale/blocker-registry.json`
- Expected blockers: 25
- Actual blockers: 25
- Registry validation: passed
- Status counts: partial=13, simulated-proof-only=4, fixed=8

## Automated Local Evidence

- #1 Disaster recovery (Critical; partial)
  Proof required: Non-interactive sanitized restore machine proof with isolated target, RPO/RTO, post-restore checks, cleanup, and rollback verification.
  Allowed commands: `pnpm run restore:drill:simulated`, `pnpm run restore:evidence:template`, `pnpm run restore:machine-proof`, `pnpm run restore:machine-proof:validate`, `pnpm run test:golden-path`, `pnpm run operator:dashboard`, `pnpm run response:soak-check`
  Next action: Provide CRP_RESTORE_MACHINE_ATTESTATION_JSON from a safe isolated restore target and rerun restore:machine-proof.
- #2 Production ingest runtime (Critical; partial)
  Proof required: Non-interactive sanitized production worker runtime machine proof with bounded queue processing, queue depth before/after, liveness, counts, cleanup, and stop/rollback verification.
  Allowed commands: `pnpm run ingest:worker:simulated-proof`, `pnpm run ingest:worker:staging-evidence`, `pnpm run production-worker:activation-plan`, `pnpm run production-worker:activation-evidence`, `pnpm run production-worker:runtime-proof`, `pnpm run production-worker:runtime-proof-template`, `pnpm run production-worker:readiness-evidence`, `pnpm run ingest:worker -- --dry-run --max-jobs 1 --concurrency 1`, `pnpm run staging:ingest-worker -- --dry-run`, `pnpm exec vitest run --config vitest.config.ts tests/unit/ingest-processing-worker-script.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/deploy-production-workflow.spec.ts`, `pnpm run operator:dashboard`, `pnpm run test:api`, `pnpm run production-worker:machine-proof`, `pnpm run production-worker:machine-proof:validate`
  Next action: Provide CRP_PRODUCTION_WORKER_MACHINE_ATTESTATION_JSON from a bounded safe canary/runtime proof and rerun production-worker:machine-proof.
- #3 Load/concurrency proof (High; simulated-proof-only)
  Proof required: Accepted release-blocking measured local or staging-safe load evidence with synthetic fixtures, throughput, latency, queue depth, packet PDF cache, DB pool, rate limiter, dashboard references, and zero provider calls.
  Allowed commands: `pnpm run baseline:production-scale-local -- --simulated`, `pnpm run baseline:production-scale-local -- --dry-run`, `pnpm run baseline:production-scale-measured -- --local`, `pnpm run operator:dashboard`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-scale-harness.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-scale-measured.spec.ts`
  Next action: Run the bounded measured local or staging-safe baseline with synthetic fixtures and release-blocking thresholds; keep production load forbidden.
- #4 Packet PDF scaling (High; fixed)
  Proof required: Automated proof that packet PDF cache misses are bounded by a synchronous envelope with duplicate collapse, timeout, overload failure evidence, send-route provider-free failure, cache hit behavior, invalidation behavior, and non-owner denial.
  Allowed commands: `pnpm run packet-pdf:cache-miss-proof`, `pnpm run baseline:production-scale-local -- --simulated`, `pnpm exec vitest run --config vitest.config.ts tests/unit/packet-pdf-cache.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/api/packet-lifecycle-endpoint.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/api/packet-delivery-status-endpoint.spec.ts`, `pnpm run test:golden-path`, `pnpm run operator:dashboard`
  Next action: Keep the bounded synchronous envelope evidence current; collect staged target-environment capacity evidence before making any production-at-scale claim.
- #5 Ingest cleanup/data safety (High; fixed)
  Proof required: Automated proof that default failed-ingest cleanup is non-destructive, marks remediation-required state, preserves artifacts/tradelines/evidence, and keeps any retained destructive path explicitly confirmed and production-refusing.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/unit/ingest-cleanup-lifecycle.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/api/ingest-processing-lifecycle-remediation-endpoint.spec.ts`, `pnpm run operator:dashboard`
  Next action: Keep the retained destructive helper classified as guarded residual risk: it is not default, requires explicit confirmation, records lifecycle evidence, and refuses production-like environments.
- #6 Historical raw report bytes (High; partial)
  Proof required: Non-interactive sanitized raw report byte remediation machine proof with reliable DB connectivity, sanitized inventory, remediation policy verification, and no raw bytes or PII.
  Allowed commands: `pnpm run storage:raw-report-inventory`, `pnpm run storage:raw-report-remediation-plan`, `pnpm run storage:raw-report-remediation-acceptance`, `pnpm run storage:raw-report-machine-inventory`, `pnpm run storage:raw-report-machine-remediation-proof`, `pnpm run storage:raw-report-machine-proof:validate`, `pnpm exec vitest run --config vitest.config.ts tests/unit/storage-raw-report-inventory.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/storage-raw-report-remediation-plan.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/report-artifact-storage.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/evidence-attachment-storage.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/api/evidence-privacy-endpoint.spec.ts`, `pnpm run test:api`, `pnpm run operator:dashboard`
  Next action: Provide reliable sanitized DB inventory and remediation attestation JSON inputs, then rerun the raw report machine proof commands.
- #7 Bureau communication storage (High; fixed)
  Proof required: Automated storage adapter proof for new bureau attachments plus compatibility proof for old inline records.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/unit/evidence-attachment-storage.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/api/evidence-privacy-endpoint.spec.ts`, `pnpm run test:api`, `pnpm run typecheck`
  Next action: Keep list endpoints metadata-only and handle any legacy inline rows through an approved historical remediation plan.
- #8 Response operations maturity (High; partial)
  Proof required: Machine-readable evidence for disabled live scheduler, backfill readiness, purge/archive readiness, dashboard/soak references, automated fallback controls, and unresolved alerting risk without enabling live operations.
  Allowed commands: `pnpm run alerts:dry-run`, `pnpm run response-ops:readiness-evidence`, `pnpm run response:ops-readiness-evidence`, `pnpm run response:soak-check`, `pnpm run response:orchestration-check`, `pnpm run response:worker-orchestrate -- --dry-run`, `pnpm run response:lifecycle -- --dry-run`, `pnpm run response:replay -- --dry-run`, `pnpm run operator:dashboard`, `pnpm exec vitest run --config vitest.config.ts tests/unit/alerts-dry-run.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/response-ops-readiness-evidence.spec.ts`
  Next action: Keep live scheduler default-off and use response ops readiness evidence to govern scheduler, backfill, purge/archive, dashboard, soak, and automated fallback controls without mutating production.
- #9 Observability/alerting (High; simulated-proof-only)
  Proof required: Non-interactive sanitized alerting machine proof with live synthetic delivery or an explicitly certifying formal exclusion allowed by repo policy.
  Allowed commands: `pnpm run alerts:dry-run`, `pnpm run alerts:exclusion:validate`, `pnpm run alerting:machine-proof`, `pnpm run alerting:machine-proof:validate`, `pnpm run response-ops:readiness-evidence`, `pnpm run response:ops-readiness-evidence`, `pnpm run operator:dashboard`, `pnpm run response:orchestration-check`, `pnpm exec vitest run --config vitest.config.ts tests/unit/alerts-dry-run.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/response-ops-readiness-evidence.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/operator-regression-dashboard.spec.ts`, `pnpm run alerts:machine-proof`, `pnpm run alerts:machine-proof:validate`
  Next action: Provide CRP_ALERTING_MACHINE_ATTESTATION_JSON for live delivery or an approved certifying exclusion and rerun alerts:machine-proof.
- #10 Migration governance (High; partial)
  Proof required: Non-interactive migration governance machine proof showing no active temporary allowlist residuals, no expired allowlist, exact residual classifications, and no release-blocking findings.
  Allowed commands: `pnpm run check:migrations`, `pnpm run migrations:evidence`, `pnpm run migrations:gate`, `pnpm exec vitest run --config vitest.config.ts tests/unit/migration-checker.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/migration-gate.spec.ts`, `pnpm run typecheck`, `pnpm run migrations:machine-proof`, `pnpm run migrations:machine-proof:validate`
  Next action: Run migrations:machine-proof and migrations:machine-proof:validate; temporary allowlist residuals cannot certify.
- #11 Production deployment parity (High; partial)
  Proof required: Workflow unit tests, current read-only production-safe probe evidence, rollback SHA and post-rollback health-check evidence, local/staging synthetic owner-denial evidence, and default-off production worker path evidence. Static proof is not runtime production proof.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/unit/production-readiness-gate.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/deploy-production-workflow.spec.ts`, `pnpm run production-worker:activation-plan`, `pnpm run production-worker:activation-evidence`, `pnpm run production-worker:runtime-proof`, `pnpm run production-worker:readiness-evidence`, `pnpm run production-deployment-parity:evidence`, `pnpm run test:contracts`, `pnpm run production-safe-probes:evidence`, `pnpm run staging-owner-denial-smoke:evidence`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-deployment-parity-evidence.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/staging-owner-denial-smoke.spec.ts`
  Next action: Keep production probes read-only, keep seeded privacy smokes local/staging-only, and keep rollback evidence tied to rollback_sha plus post-rollback health checks before calling deployment parity complete.
- #12 OCR route-local validation shape (Medium; fixed)
  Proof required: OCR shared upload-validation proof plus valid-fixture output-stability evidence.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/api/ocr-extract-upload-limit-endpoint.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/deterministic-ocr-readiness.spec.ts`, `pnpm run test:deterministic-ingestion-report`, `pnpm run typecheck`
  Next action: Keep OCR validation aligned with shared upload boundaries and preserve valid PDF extraction output in regression tests.
- #13 Parser-test list sensitive field (Medium; fixed)
  Proof required: Metadata-only parser-test list proof plus admin-only raw text detail/export proof.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/unit/parser-test-cases-list-navigation.spec.tsx`, `pnpm run test:api`, `pnpm run typecheck`, `pnpm run sensitive-list-endpoints:evidence`, `pnpm exec vitest run --config vitest.config.ts tests/api/sensitive-list-endpoints.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/sensitive-list-endpoints-evidence.spec.ts`, `pnpm run test:contracts`, `pnpm run test:golden-path`, `pnpm run test:deterministic-ingestion-report`
  Next action: Keep parser-test list metadata-only; use admin-only get/export paths for raw extracted text workflows and keep UI detail hydration covered by tests.
- #14 Consumer signature list sensitive field (Medium; fixed)
  Proof required: Metadata-only consumer-signature list proof plus owner/admin get-by-id signature data proof.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/api/high-growth-list-limits.spec.ts`, `pnpm run test:api`, `pnpm run typecheck`, `pnpm run sensitive-list-endpoints:evidence`, `pnpm exec vitest run --config vitest.config.ts tests/api/sensitive-list-endpoints.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/sensitive-list-endpoints-evidence.spec.ts`, `pnpm run test:contracts`
  Next action: Keep signature list metadata-only; use owner/admin get-by-id detail when signature image data is required.
- #15 Hidden-risk list semantics (Medium; partial)
  Proof required: Design/evidence artifact for hidden-risk aggregate and stale-suppression semantics; full bounded pagination remains a separate UI/query task.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/api/high-growth-list-limits.spec.ts`, `pnpm run test:api`, `pnpm run typecheck`, `pnpm run sensitive-list-endpoints:evidence`, `pnpm exec vitest run --config vitest.config.ts tests/api/sensitive-list-endpoints.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/sensitive-list-endpoints-evidence.spec.ts`
  Next action: Split hidden-risk aggregate counts from paginated rows in a separate design task; do not apply a blind limit that changes aggregate semantics.
- #16 DB pool pressure evidence (Medium; simulated-proof-only)
  Proof required: Accepted release-blocking measured local or staging-safe evidence must record DB pool configured max, observed active/borrowed signal or explicit unavailable reason, latency, queue depth, dashboard references, and zero production DB targeting.
  Allowed commands: `pnpm run baseline:production-scale-local -- --simulated`, `pnpm run baseline:production-scale-measured -- --local`, `pnpm exec vitest run --config vitest.config.ts tests/unit/runtime-tuning-config.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-scale-measured.spec.ts`, `pnpm run baseline:production-scale-local -- --dry-run`, `pnpm run operator:dashboard`
  Next action: Run bounded measured local or staging-safe load and record sanitized DB pool configured/observed signals or an explicit unavailable reason.
- #17 Rate limiter write pressure (Medium; simulated-proof-only)
  Proof required: Accepted release-blocking measured local or staging-safe evidence must record bounded synthetic rate limiter accepted/rejected counts, write-pressure events, latency, zero real identifiers, and zero production mutation.
  Allowed commands: `pnpm run baseline:production-scale-local -- --simulated`, `pnpm run baseline:production-scale-measured -- --local`, `pnpm exec vitest run --config vitest.config.ts tests/unit/rate-limiter-simulated-pressure.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-scale-measured.spec.ts`, `pnpm run baseline:production-scale-local -- --dry-run`, `pnpm run operator:dashboard`, `pnpm run test:api`
  Next action: Run bounded measured local or staging-safe rate-limit pressure using synthetic identifiers only; do not send production hostile traffic.
- #18 Runtime-size gates (Medium; partial)
  Proof required: Runtime-size report plus accepted policy acceptance evidence. Warning-only closure must be an explicit formal waiver with governed WARN/WAIVED rows; release-blocking closure must have no exceeded thresholds.
  Allowed commands: `pnpm run build`, `pnpm run report:runtime-size`, `pnpm run check:runtime-size`, `pnpm run runtime-size:policy-acceptance`, `pnpm exec vitest run --config vitest.config.ts tests/unit/runtime-size-report-script.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/runtime-size-policy-acceptance.spec.ts`
  Next action: Keep the warning-only waiver evidence current, and only enable a release-blocking gate through a later reviewed threshold-policy change.
- #19 Heavy PDF/OCR dependencies (Medium; partial)
  Proof required: Policy-bound WARN/WAIVED baseline for heavy PDF/OCR dependencies plus OCR deterministic regression proof for any future dependency or Docker package change.
  Allowed commands: `pnpm run report:runtime-size`, `pnpm run check:runtime-size`, `pnpm exec vitest run --config vitest.config.ts tests/unit/runtime-size-report-script.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/deterministic-ocr-readiness.spec.ts`
  Next action: Keep heavy PDF/OCR dependency size warnings visible; defer dependency isolation or replacement until a separately tested OCR/PDF/parser task.
- #20 Production-safe privacy probe depth (Medium; partial)
  Proof required: Current local/staging synthetic owner-denial proof plus explicit read-only production probe limits. Synthetic owner-denial is not production mutation proof and unauthenticated probes alone are insufficient.
  Allowed commands: `pnpm run test:contracts`, `pnpm exec vitest run --config vitest.config.ts tests/api/support-role-privacy-matrix.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-readiness-gate.spec.ts`, `pnpm run production-deployment-parity:evidence`, `pnpm run production-safe-probes:evidence`, `pnpm run staging-owner-denial-smoke:evidence`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-deployment-parity-evidence.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/staging-owner-denial-smoke.spec.ts`
  Next action: Run read-only production-safe probes, local/staging synthetic owner-denial smoke, and production deployment parity evidence; do not create production fixtures for deeper owner-denial proof.
- #21 Ingest observability release gating (Medium; fixed)
  Proof required: Release evidence capture records exact commands, production worker readiness evidence, dashboard skips, and explicit dashboard-PASS limitations.
  Allowed commands: `pnpm run production-scale:evidence`, `pnpm run production-deployment-parity:evidence`, `pnpm run production-worker:runtime-proof`, `pnpm run production-worker:readiness-evidence`, `pnpm run production-worker:activation-evidence`, `pnpm run response:ops-readiness-evidence`, `pnpm run response-ops:readiness-evidence`, `pnpm run alerts:exclusion:validate`, `pnpm run alerts:dry-run`, `pnpm run runtime-size:policy-acceptance`, `pnpm run production-scale:promotion-pack`, `pnpm run operator:dashboard`, `pnpm exec vitest run --config vitest.config.ts tests/unit/operator-regression-dashboard.spec.ts`
  Next action: Keep exact release evidence commands visible in production-scale evidence, production deployment parity evidence, production worker readiness evidence, response ops readiness evidence, alert exclusion validation, promotion pack output, and operator dashboard semantics; dashboard PASS alone is not release evidence.
- #22 Retention archive/restore proof (Medium; partial)
  Proof required: Non-interactive sanitized retention archive/restore machine proof with safe archive candidate, archive metadata verification, isolated restore target, restore integrity, cleanup, rollback notes, and target destruction.
  Allowed commands: `pnpm run retention:archive-restore:simulated`, `pnpm run retention:archive-restore-machine-proof`, `pnpm run retention:archive-restore-machine-proof:validate`, `pnpm exec vitest run --config vitest.config.ts tests/api/retention-apply-guard-endpoint.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/retention-archive-restore-simulated.spec.ts`, `pnpm run operator:dashboard`
  Next action: Provide CRP_RETENTION_ARCHIVE_RESTORE_MACHINE_ATTESTATION_JSON with CRP_RETENTION_ARCHIVE_RESTORE_ARCHIVE_ACCESS, CRP_RETENTION_ARCHIVE_RESTORE_ISOLATED_TARGET, and CRP_RETENTION_ARCHIVE_RESTORE_SAFE_CANDIDATE attested fields, then rerun retention:archive-restore-machine-proof.
- #23 Public routes inventory risk (Medium; partial)
  Proof required: Executable route auth contract proof that public legacy handlers remain classified, retired public routes stay reset/410, and public inventory changes require explicit test updates.
  Allowed commands: `pnpm run test:contracts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/public-static-dev-assets.spec.ts`, `pnpm run production-safe-probes:evidence`
  Next action: Keep route auth contract strict, pin the public inventory, and fail on retired public route revival or unclassified endpoint drift.
- #24 Documentation drift (Low; partial)
  Proof required: Promotion pack and registry evidence must detect stale audit/tracker commit references and keep blocker data aligned with the controlling audit before promotion.
  Allowed commands: `pnpm run production-scale:evidence`, `pnpm run production-scale:promotion-pack`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-promotion-pack.spec.ts`, `git diff --check`
  Next action: Run the promotion pack after each scoped blocker task, use its stale-reference findings, and align tracker/audit/evidence references before any promotion decision.
- #25 Dashboard default SKIP semantics (Low; fixed)
  Proof required: Dashboard and promotion-pack reports distinguish PASS, FAIL, SKIP, SIMULATED, and MACHINE_REQUIRED while recording exact commands, skipped checks, and dashboard PASS limitation.
  Allowed commands: `pnpm run production-scale:promotion-pack`, `pnpm run production-scale:evidence`, `pnpm run operator:dashboard`, `pnpm run alerts:dry-run`, `pnpm exec vitest run --config vitest.config.ts tests/unit/operator-regression-dashboard.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/alerts-dry-run.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-promotion-pack.spec.ts`
  Next action: Keep release evidence labeled by exact commands and visible SKIP/SIMULATED/MACHINE_REQUIRED rows, not dashboard headline status; promotion pack validation must fail if SKIP is treated as PASS.

## Simulated Evidence

SIMULATED: Local or staging-safe simulated evidence is separated here and is never rendered as production proof.

- SIMULATED - #1 Disaster recovery (Critical; partial)
  Proof required: Non-interactive sanitized restore machine proof with isolated target, RPO/RTO, post-restore checks, cleanup, and rollback verification.
  Allowed commands: `pnpm run restore:drill:simulated`, `pnpm run restore:evidence:template`, `pnpm run restore:machine-proof`, `pnpm run restore:machine-proof:validate`, `pnpm run test:golden-path`, `pnpm run operator:dashboard`, `pnpm run response:soak-check`
  Next action: Provide CRP_RESTORE_MACHINE_ATTESTATION_JSON from a safe isolated restore target and rerun restore:machine-proof.
- SIMULATED - #2 Production ingest runtime (Critical; partial)
  Proof required: Non-interactive sanitized production worker runtime machine proof with bounded queue processing, queue depth before/after, liveness, counts, cleanup, and stop/rollback verification.
  Allowed commands: `pnpm run ingest:worker:simulated-proof`, `pnpm run ingest:worker:staging-evidence`, `pnpm run production-worker:activation-plan`, `pnpm run production-worker:activation-evidence`, `pnpm run production-worker:runtime-proof`, `pnpm run production-worker:runtime-proof-template`, `pnpm run production-worker:readiness-evidence`, `pnpm run ingest:worker -- --dry-run --max-jobs 1 --concurrency 1`, `pnpm run staging:ingest-worker -- --dry-run`, `pnpm exec vitest run --config vitest.config.ts tests/unit/ingest-processing-worker-script.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/deploy-production-workflow.spec.ts`, `pnpm run operator:dashboard`, `pnpm run test:api`, `pnpm run production-worker:machine-proof`, `pnpm run production-worker:machine-proof:validate`
  Next action: Provide CRP_PRODUCTION_WORKER_MACHINE_ATTESTATION_JSON from a bounded safe canary/runtime proof and rerun production-worker:machine-proof.
- SIMULATED - #3 Load/concurrency proof (High; simulated-proof-only)
  Proof required: Accepted release-blocking measured local or staging-safe load evidence with synthetic fixtures, throughput, latency, queue depth, packet PDF cache, DB pool, rate limiter, dashboard references, and zero provider calls.
  Allowed commands: `pnpm run baseline:production-scale-local -- --simulated`, `pnpm run baseline:production-scale-local -- --dry-run`, `pnpm run baseline:production-scale-measured -- --local`, `pnpm run operator:dashboard`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-scale-harness.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-scale-measured.spec.ts`
  Next action: Run the bounded measured local or staging-safe baseline with synthetic fixtures and release-blocking thresholds; keep production load forbidden.
- SIMULATED - #4 Packet PDF scaling (High; fixed)
  Proof required: Automated proof that packet PDF cache misses are bounded by a synchronous envelope with duplicate collapse, timeout, overload failure evidence, send-route provider-free failure, cache hit behavior, invalidation behavior, and non-owner denial.
  Allowed commands: `pnpm run packet-pdf:cache-miss-proof`, `pnpm run baseline:production-scale-local -- --simulated`, `pnpm exec vitest run --config vitest.config.ts tests/unit/packet-pdf-cache.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/api/packet-lifecycle-endpoint.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/api/packet-delivery-status-endpoint.spec.ts`, `pnpm run test:golden-path`, `pnpm run operator:dashboard`
  Next action: Keep the bounded synchronous envelope evidence current; collect staged target-environment capacity evidence before making any production-at-scale claim.
- SIMULATED - #8 Response operations maturity (High; partial)
  Proof required: Machine-readable evidence for disabled live scheduler, backfill readiness, purge/archive readiness, dashboard/soak references, automated fallback controls, and unresolved alerting risk without enabling live operations.
  Allowed commands: `pnpm run alerts:dry-run`, `pnpm run response-ops:readiness-evidence`, `pnpm run response:ops-readiness-evidence`, `pnpm run response:soak-check`, `pnpm run response:orchestration-check`, `pnpm run response:worker-orchestrate -- --dry-run`, `pnpm run response:lifecycle -- --dry-run`, `pnpm run response:replay -- --dry-run`, `pnpm run operator:dashboard`, `pnpm exec vitest run --config vitest.config.ts tests/unit/alerts-dry-run.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/response-ops-readiness-evidence.spec.ts`
  Next action: Keep live scheduler default-off and use response ops readiness evidence to govern scheduler, backfill, purge/archive, dashboard, soak, and automated fallback controls without mutating production.
- SIMULATED - #9 Observability/alerting (High; simulated-proof-only)
  Proof required: Non-interactive sanitized alerting machine proof with live synthetic delivery or an explicitly certifying formal exclusion allowed by repo policy.
  Allowed commands: `pnpm run alerts:dry-run`, `pnpm run alerts:exclusion:validate`, `pnpm run alerting:machine-proof`, `pnpm run alerting:machine-proof:validate`, `pnpm run response-ops:readiness-evidence`, `pnpm run response:ops-readiness-evidence`, `pnpm run operator:dashboard`, `pnpm run response:orchestration-check`, `pnpm exec vitest run --config vitest.config.ts tests/unit/alerts-dry-run.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/response-ops-readiness-evidence.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/operator-regression-dashboard.spec.ts`, `pnpm run alerts:machine-proof`, `pnpm run alerts:machine-proof:validate`
  Next action: Provide CRP_ALERTING_MACHINE_ATTESTATION_JSON for live delivery or an approved certifying exclusion and rerun alerts:machine-proof.
- SIMULATED - #16 DB pool pressure evidence (Medium; simulated-proof-only)
  Proof required: Accepted release-blocking measured local or staging-safe evidence must record DB pool configured max, observed active/borrowed signal or explicit unavailable reason, latency, queue depth, dashboard references, and zero production DB targeting.
  Allowed commands: `pnpm run baseline:production-scale-local -- --simulated`, `pnpm run baseline:production-scale-measured -- --local`, `pnpm exec vitest run --config vitest.config.ts tests/unit/runtime-tuning-config.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-scale-measured.spec.ts`, `pnpm run baseline:production-scale-local -- --dry-run`, `pnpm run operator:dashboard`
  Next action: Run bounded measured local or staging-safe load and record sanitized DB pool configured/observed signals or an explicit unavailable reason.
- SIMULATED - #17 Rate limiter write pressure (Medium; simulated-proof-only)
  Proof required: Accepted release-blocking measured local or staging-safe evidence must record bounded synthetic rate limiter accepted/rejected counts, write-pressure events, latency, zero real identifiers, and zero production mutation.
  Allowed commands: `pnpm run baseline:production-scale-local -- --simulated`, `pnpm run baseline:production-scale-measured -- --local`, `pnpm exec vitest run --config vitest.config.ts tests/unit/rate-limiter-simulated-pressure.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-scale-measured.spec.ts`, `pnpm run baseline:production-scale-local -- --dry-run`, `pnpm run operator:dashboard`, `pnpm run test:api`
  Next action: Run bounded measured local or staging-safe rate-limit pressure using synthetic identifiers only; do not send production hostile traffic.
- SIMULATED - #22 Retention archive/restore proof (Medium; partial)
  Proof required: Non-interactive sanitized retention archive/restore machine proof with safe archive candidate, archive metadata verification, isolated restore target, restore integrity, cleanup, rollback notes, and target destruction.
  Allowed commands: `pnpm run retention:archive-restore:simulated`, `pnpm run retention:archive-restore-machine-proof`, `pnpm run retention:archive-restore-machine-proof:validate`, `pnpm exec vitest run --config vitest.config.ts tests/api/retention-apply-guard-endpoint.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/retention-archive-restore-simulated.spec.ts`, `pnpm run operator:dashboard`
  Next action: Provide CRP_RETENTION_ARCHIVE_RESTORE_MACHINE_ATTESTATION_JSON with CRP_RETENTION_ARCHIVE_RESTORE_ARCHIVE_ACCESS, CRP_RETENTION_ARCHIVE_RESTORE_ISOLATED_TARGET, and CRP_RETENTION_ARCHIVE_RESTORE_SAFE_CANDIDATE attested fields, then rerun retention:archive-restore-machine-proof.

## Staging Evidence

- #2 Production ingest runtime (Critical; partial)
  Proof required: Non-interactive sanitized production worker runtime machine proof with bounded queue processing, queue depth before/after, liveness, counts, cleanup, and stop/rollback verification.
  Allowed commands: `pnpm run ingest:worker:simulated-proof`, `pnpm run ingest:worker:staging-evidence`, `pnpm run production-worker:activation-plan`, `pnpm run production-worker:activation-evidence`, `pnpm run production-worker:runtime-proof`, `pnpm run production-worker:runtime-proof-template`, `pnpm run production-worker:readiness-evidence`, `pnpm run ingest:worker -- --dry-run --max-jobs 1 --concurrency 1`, `pnpm run staging:ingest-worker -- --dry-run`, `pnpm exec vitest run --config vitest.config.ts tests/unit/ingest-processing-worker-script.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/deploy-production-workflow.spec.ts`, `pnpm run operator:dashboard`, `pnpm run test:api`, `pnpm run production-worker:machine-proof`, `pnpm run production-worker:machine-proof:validate`
  Next action: Provide CRP_PRODUCTION_WORKER_MACHINE_ATTESTATION_JSON from a bounded safe canary/runtime proof and rerun production-worker:machine-proof.
- #3 Load/concurrency proof (High; simulated-proof-only)
  Proof required: Accepted release-blocking measured local or staging-safe load evidence with synthetic fixtures, throughput, latency, queue depth, packet PDF cache, DB pool, rate limiter, dashboard references, and zero provider calls.
  Allowed commands: `pnpm run baseline:production-scale-local -- --simulated`, `pnpm run baseline:production-scale-local -- --dry-run`, `pnpm run baseline:production-scale-measured -- --local`, `pnpm run operator:dashboard`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-scale-harness.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-scale-measured.spec.ts`
  Next action: Run the bounded measured local or staging-safe baseline with synthetic fixtures and release-blocking thresholds; keep production load forbidden.
- #4 Packet PDF scaling (High; fixed)
  Proof required: Automated proof that packet PDF cache misses are bounded by a synchronous envelope with duplicate collapse, timeout, overload failure evidence, send-route provider-free failure, cache hit behavior, invalidation behavior, and non-owner denial.
  Allowed commands: `pnpm run packet-pdf:cache-miss-proof`, `pnpm run baseline:production-scale-local -- --simulated`, `pnpm exec vitest run --config vitest.config.ts tests/unit/packet-pdf-cache.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/api/packet-lifecycle-endpoint.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/api/packet-delivery-status-endpoint.spec.ts`, `pnpm run test:golden-path`, `pnpm run operator:dashboard`
  Next action: Keep the bounded synchronous envelope evidence current; collect staged target-environment capacity evidence before making any production-at-scale claim.
- #6 Historical raw report bytes (High; partial)
  Proof required: Non-interactive sanitized raw report byte remediation machine proof with reliable DB connectivity, sanitized inventory, remediation policy verification, and no raw bytes or PII.
  Allowed commands: `pnpm run storage:raw-report-inventory`, `pnpm run storage:raw-report-remediation-plan`, `pnpm run storage:raw-report-remediation-acceptance`, `pnpm run storage:raw-report-machine-inventory`, `pnpm run storage:raw-report-machine-remediation-proof`, `pnpm run storage:raw-report-machine-proof:validate`, `pnpm exec vitest run --config vitest.config.ts tests/unit/storage-raw-report-inventory.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/storage-raw-report-remediation-plan.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/report-artifact-storage.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/evidence-attachment-storage.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/api/evidence-privacy-endpoint.spec.ts`, `pnpm run test:api`, `pnpm run operator:dashboard`
  Next action: Provide reliable sanitized DB inventory and remediation attestation JSON inputs, then rerun the raw report machine proof commands.
- #8 Response operations maturity (High; partial)
  Proof required: Machine-readable evidence for disabled live scheduler, backfill readiness, purge/archive readiness, dashboard/soak references, automated fallback controls, and unresolved alerting risk without enabling live operations.
  Allowed commands: `pnpm run alerts:dry-run`, `pnpm run response-ops:readiness-evidence`, `pnpm run response:ops-readiness-evidence`, `pnpm run response:soak-check`, `pnpm run response:orchestration-check`, `pnpm run response:worker-orchestrate -- --dry-run`, `pnpm run response:lifecycle -- --dry-run`, `pnpm run response:replay -- --dry-run`, `pnpm run operator:dashboard`, `pnpm exec vitest run --config vitest.config.ts tests/unit/alerts-dry-run.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/response-ops-readiness-evidence.spec.ts`
  Next action: Keep live scheduler default-off and use response ops readiness evidence to govern scheduler, backfill, purge/archive, dashboard, soak, and automated fallback controls without mutating production.
- #16 DB pool pressure evidence (Medium; simulated-proof-only)
  Proof required: Accepted release-blocking measured local or staging-safe evidence must record DB pool configured max, observed active/borrowed signal or explicit unavailable reason, latency, queue depth, dashboard references, and zero production DB targeting.
  Allowed commands: `pnpm run baseline:production-scale-local -- --simulated`, `pnpm run baseline:production-scale-measured -- --local`, `pnpm exec vitest run --config vitest.config.ts tests/unit/runtime-tuning-config.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-scale-measured.spec.ts`, `pnpm run baseline:production-scale-local -- --dry-run`, `pnpm run operator:dashboard`
  Next action: Run bounded measured local or staging-safe load and record sanitized DB pool configured/observed signals or an explicit unavailable reason.
- #17 Rate limiter write pressure (Medium; simulated-proof-only)
  Proof required: Accepted release-blocking measured local or staging-safe evidence must record bounded synthetic rate limiter accepted/rejected counts, write-pressure events, latency, zero real identifiers, and zero production mutation.
  Allowed commands: `pnpm run baseline:production-scale-local -- --simulated`, `pnpm run baseline:production-scale-measured -- --local`, `pnpm exec vitest run --config vitest.config.ts tests/unit/rate-limiter-simulated-pressure.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-scale-measured.spec.ts`, `pnpm run baseline:production-scale-local -- --dry-run`, `pnpm run operator:dashboard`, `pnpm run test:api`
  Next action: Run bounded measured local or staging-safe rate-limit pressure using synthetic identifiers only; do not send production hostile traffic.
- #20 Production-safe privacy probe depth (Medium; partial)
  Proof required: Current local/staging synthetic owner-denial proof plus explicit read-only production probe limits. Synthetic owner-denial is not production mutation proof and unauthenticated probes alone are insufficient.
  Allowed commands: `pnpm run test:contracts`, `pnpm exec vitest run --config vitest.config.ts tests/api/support-role-privacy-matrix.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-readiness-gate.spec.ts`, `pnpm run production-deployment-parity:evidence`, `pnpm run production-safe-probes:evidence`, `pnpm run staging-owner-denial-smoke:evidence`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-deployment-parity-evidence.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/staging-owner-denial-smoke.spec.ts`
  Next action: Run read-only production-safe probes, local/staging synthetic owner-denial smoke, and production deployment parity evidence; do not create production fixtures for deeper owner-denial proof.
- #21 Ingest observability release gating (Medium; fixed)
  Proof required: Release evidence capture records exact commands, production worker readiness evidence, dashboard skips, and explicit dashboard-PASS limitations.
  Allowed commands: `pnpm run production-scale:evidence`, `pnpm run production-deployment-parity:evidence`, `pnpm run production-worker:runtime-proof`, `pnpm run production-worker:readiness-evidence`, `pnpm run production-worker:activation-evidence`, `pnpm run response:ops-readiness-evidence`, `pnpm run response-ops:readiness-evidence`, `pnpm run alerts:exclusion:validate`, `pnpm run alerts:dry-run`, `pnpm run runtime-size:policy-acceptance`, `pnpm run production-scale:promotion-pack`, `pnpm run operator:dashboard`, `pnpm exec vitest run --config vitest.config.ts tests/unit/operator-regression-dashboard.spec.ts`
  Next action: Keep exact release evidence commands visible in production-scale evidence, production deployment parity evidence, production worker readiness evidence, response ops readiness evidence, alert exclusion validation, promotion pack output, and operator dashboard semantics; dashboard PASS alone is not release evidence.

## Read-Only Production Evidence

No read-only production command is executed by this report. Production certification requires non-interactive, machine-attested, sanitized, fresh proof.

- #11 Production deployment parity (High; partial)
  Proof required: Workflow unit tests, current read-only production-safe probe evidence, rollback SHA and post-rollback health-check evidence, local/staging synthetic owner-denial evidence, and default-off production worker path evidence. Static proof is not runtime production proof.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/unit/production-readiness-gate.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/deploy-production-workflow.spec.ts`, `pnpm run production-worker:activation-plan`, `pnpm run production-worker:activation-evidence`, `pnpm run production-worker:runtime-proof`, `pnpm run production-worker:readiness-evidence`, `pnpm run production-deployment-parity:evidence`, `pnpm run test:contracts`, `pnpm run production-safe-probes:evidence`, `pnpm run staging-owner-denial-smoke:evidence`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-deployment-parity-evidence.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/staging-owner-denial-smoke.spec.ts`
  Next action: Keep production probes read-only, keep seeded privacy smokes local/staging-only, and keep rollback evidence tied to rollback_sha plus post-rollback health checks before calling deployment parity complete.
- #20 Production-safe privacy probe depth (Medium; partial)
  Proof required: Current local/staging synthetic owner-denial proof plus explicit read-only production probe limits. Synthetic owner-denial is not production mutation proof and unauthenticated probes alone are insufficient.
  Allowed commands: `pnpm run test:contracts`, `pnpm exec vitest run --config vitest.config.ts tests/api/support-role-privacy-matrix.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-readiness-gate.spec.ts`, `pnpm run production-deployment-parity:evidence`, `pnpm run production-safe-probes:evidence`, `pnpm run staging-owner-denial-smoke:evidence`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-deployment-parity-evidence.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/staging-owner-denial-smoke.spec.ts`
  Next action: Run read-only production-safe probes, local/staging synthetic owner-denial smoke, and production deployment parity evidence; do not create production fixtures for deeper owner-denial proof.

## Machine-Attested Production Proof Requirements

- #1 Disaster recovery (Critical; partial)
  Proof required: Non-interactive sanitized restore machine proof with isolated target, RPO/RTO, post-restore checks, cleanup, and rollback verification.
  Allowed commands: `pnpm run restore:drill:simulated`, `pnpm run restore:evidence:template`, `pnpm run restore:machine-proof`, `pnpm run restore:machine-proof:validate`, `pnpm run test:golden-path`, `pnpm run operator:dashboard`, `pnpm run response:soak-check`
  Next action: Provide CRP_RESTORE_MACHINE_ATTESTATION_JSON from a safe isolated restore target and rerun restore:machine-proof.
- #2 Production ingest runtime (Critical; partial)
  Proof required: Non-interactive sanitized production worker runtime machine proof with bounded queue processing, queue depth before/after, liveness, counts, cleanup, and stop/rollback verification.
  Allowed commands: `pnpm run ingest:worker:simulated-proof`, `pnpm run ingest:worker:staging-evidence`, `pnpm run production-worker:activation-plan`, `pnpm run production-worker:activation-evidence`, `pnpm run production-worker:runtime-proof`, `pnpm run production-worker:runtime-proof-template`, `pnpm run production-worker:readiness-evidence`, `pnpm run ingest:worker -- --dry-run --max-jobs 1 --concurrency 1`, `pnpm run staging:ingest-worker -- --dry-run`, `pnpm exec vitest run --config vitest.config.ts tests/unit/ingest-processing-worker-script.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/deploy-production-workflow.spec.ts`, `pnpm run operator:dashboard`, `pnpm run test:api`, `pnpm run production-worker:machine-proof`, `pnpm run production-worker:machine-proof:validate`
  Next action: Provide CRP_PRODUCTION_WORKER_MACHINE_ATTESTATION_JSON from a bounded safe canary/runtime proof and rerun production-worker:machine-proof.
- #6 Historical raw report bytes (High; partial)
  Proof required: Non-interactive sanitized raw report byte remediation machine proof with reliable DB connectivity, sanitized inventory, remediation policy verification, and no raw bytes or PII.
  Allowed commands: `pnpm run storage:raw-report-inventory`, `pnpm run storage:raw-report-remediation-plan`, `pnpm run storage:raw-report-remediation-acceptance`, `pnpm run storage:raw-report-machine-inventory`, `pnpm run storage:raw-report-machine-remediation-proof`, `pnpm run storage:raw-report-machine-proof:validate`, `pnpm exec vitest run --config vitest.config.ts tests/unit/storage-raw-report-inventory.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/storage-raw-report-remediation-plan.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/report-artifact-storage.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/evidence-attachment-storage.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/api/evidence-privacy-endpoint.spec.ts`, `pnpm run test:api`, `pnpm run operator:dashboard`
  Next action: Provide reliable sanitized DB inventory and remediation attestation JSON inputs, then rerun the raw report machine proof commands.
- #9 Observability/alerting (High; simulated-proof-only)
  Proof required: Non-interactive sanitized alerting machine proof with live synthetic delivery or an explicitly certifying formal exclusion allowed by repo policy.
  Allowed commands: `pnpm run alerts:dry-run`, `pnpm run alerts:exclusion:validate`, `pnpm run alerting:machine-proof`, `pnpm run alerting:machine-proof:validate`, `pnpm run response-ops:readiness-evidence`, `pnpm run response:ops-readiness-evidence`, `pnpm run operator:dashboard`, `pnpm run response:orchestration-check`, `pnpm exec vitest run --config vitest.config.ts tests/unit/alerts-dry-run.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/response-ops-readiness-evidence.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/operator-regression-dashboard.spec.ts`, `pnpm run alerts:machine-proof`, `pnpm run alerts:machine-proof:validate`
  Next action: Provide CRP_ALERTING_MACHINE_ATTESTATION_JSON for live delivery or an approved certifying exclusion and rerun alerts:machine-proof.
- #10 Migration governance (High; partial)
  Proof required: Non-interactive migration governance machine proof showing no active temporary allowlist residuals, no expired allowlist, exact residual classifications, and no release-blocking findings.
  Allowed commands: `pnpm run check:migrations`, `pnpm run migrations:evidence`, `pnpm run migrations:gate`, `pnpm exec vitest run --config vitest.config.ts tests/unit/migration-checker.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/migration-gate.spec.ts`, `pnpm run typecheck`, `pnpm run migrations:machine-proof`, `pnpm run migrations:machine-proof:validate`
  Next action: Run migrations:machine-proof and migrations:machine-proof:validate; temporary allowlist residuals cannot certify.
- #22 Retention archive/restore proof (Medium; partial)
  Proof required: Non-interactive sanitized retention archive/restore machine proof with safe archive candidate, archive metadata verification, isolated restore target, restore integrity, cleanup, rollback notes, and target destruction.
  Allowed commands: `pnpm run retention:archive-restore:simulated`, `pnpm run retention:archive-restore-machine-proof`, `pnpm run retention:archive-restore-machine-proof:validate`, `pnpm exec vitest run --config vitest.config.ts tests/api/retention-apply-guard-endpoint.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/retention-archive-restore-simulated.spec.ts`, `pnpm run operator:dashboard`
  Next action: Provide CRP_RETENTION_ARCHIVE_RESTORE_MACHINE_ATTESTATION_JSON with CRP_RETENTION_ARCHIVE_RESTORE_ARCHIVE_ACCESS, CRP_RETENTION_ARCHIVE_RESTORE_ISOLATED_TARGET, and CRP_RETENTION_ARCHIVE_RESTORE_SAFE_CANDIDATE attested fields, then rerun retention:archive-restore-machine-proof.

## Machine-Attested Proof Commands

- L10-P1-002: `pnpm run restore:machine-proof` -> `docs/production-scale/evidence/latest-restore-machine-proof.json` (present)
- L10-P1-003: `pnpm run production-worker:machine-proof` -> `docs/production-scale/evidence/latest-production-worker-machine-proof.json` (present)
- L10-P1-004: `pnpm run storage:raw-report-machine-remediation-proof` -> `docs/production-scale/evidence/latest-storage-raw-report-machine-proof.json` (present)
- L10-P1-005: `pnpm run alerts:machine-proof` -> `docs/production-scale/evidence/latest-alerting-machine-proof.json` (present)
- L10-P1-006: `pnpm run migrations:machine-proof` -> `docs/production-scale/evidence/latest-migration-machine-proof.json` (present)
- retention-archive-restore: `pnpm run retention:archive-restore-machine-proof` -> `docs/production-scale/evidence/latest-retention-archive-restore-machine-proof.json` (present)

## Machine Proof Summary

- Path: `docs/production-scale/evidence/latest-machine-proof-summary.json` (present)
- Readable: yes
- allMachineProofsCertifying: false
- CERTIFYING: false
- Human interaction required: no
- Stale proof count: 0
- Simulated-only proof count: 0
- Missing runtime inputs: CRP_RESTORE_MACHINE_ATTESTATION_JSON, CRP_RESTORE_MACHINE_BACKUP_SOURCE, CRP_RESTORE_MACHINE_ISOLATED_TARGET, CRP_RESTORE_MACHINE_SAFE_FIXTURE, CRP_PRODUCTION_WORKER_MACHINE_ATTESTATION_JSON, CRP_PRODUCTION_WORKER_QUEUE_ACCESS, CRP_PRODUCTION_WORKER_LIVENESS_ACCESS, CRP_PRODUCTION_WORKER_CANARY_JOB_ACCESS, CRP_PRODUCTION_WORKER_STOP_ROLLBACK_ACCESS, CRP_RAW_REPORT_MACHINE_REMEDIATION_ATTESTATION_JSON, CRP_ALERTING_MACHINE_ATTESTATION_JSON, CRP_RETENTION_ARCHIVE_RESTORE_MACHINE_ATTESTATION_JSON, CRP_RETENTION_ARCHIVE_RESTORE_ARCHIVE_ACCESS, CRP_RETENTION_ARCHIVE_RESTORE_ISOLATED_TARGET, CRP_RETENTION_ARCHIVE_RESTORE_SAFE_CANDIDATE

## Waived Blockers

- None.

## Unresolved Blockers

- #1 Disaster recovery (Critical; partial)
  Proof required: Non-interactive sanitized restore machine proof with isolated target, RPO/RTO, post-restore checks, cleanup, and rollback verification.
  Allowed commands: `pnpm run restore:drill:simulated`, `pnpm run restore:evidence:template`, `pnpm run restore:machine-proof`, `pnpm run restore:machine-proof:validate`, `pnpm run test:golden-path`, `pnpm run operator:dashboard`, `pnpm run response:soak-check`
  Next action: Provide CRP_RESTORE_MACHINE_ATTESTATION_JSON from a safe isolated restore target and rerun restore:machine-proof.
- #2 Production ingest runtime (Critical; partial)
  Proof required: Non-interactive sanitized production worker runtime machine proof with bounded queue processing, queue depth before/after, liveness, counts, cleanup, and stop/rollback verification.
  Allowed commands: `pnpm run ingest:worker:simulated-proof`, `pnpm run ingest:worker:staging-evidence`, `pnpm run production-worker:activation-plan`, `pnpm run production-worker:activation-evidence`, `pnpm run production-worker:runtime-proof`, `pnpm run production-worker:runtime-proof-template`, `pnpm run production-worker:readiness-evidence`, `pnpm run ingest:worker -- --dry-run --max-jobs 1 --concurrency 1`, `pnpm run staging:ingest-worker -- --dry-run`, `pnpm exec vitest run --config vitest.config.ts tests/unit/ingest-processing-worker-script.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/deploy-production-workflow.spec.ts`, `pnpm run operator:dashboard`, `pnpm run test:api`, `pnpm run production-worker:machine-proof`, `pnpm run production-worker:machine-proof:validate`
  Next action: Provide CRP_PRODUCTION_WORKER_MACHINE_ATTESTATION_JSON from a bounded safe canary/runtime proof and rerun production-worker:machine-proof.
- #3 Load/concurrency proof (High; simulated-proof-only)
  Proof required: Accepted release-blocking measured local or staging-safe load evidence with synthetic fixtures, throughput, latency, queue depth, packet PDF cache, DB pool, rate limiter, dashboard references, and zero provider calls.
  Allowed commands: `pnpm run baseline:production-scale-local -- --simulated`, `pnpm run baseline:production-scale-local -- --dry-run`, `pnpm run baseline:production-scale-measured -- --local`, `pnpm run operator:dashboard`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-scale-harness.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-scale-measured.spec.ts`
  Next action: Run the bounded measured local or staging-safe baseline with synthetic fixtures and release-blocking thresholds; keep production load forbidden.
- #6 Historical raw report bytes (High; partial)
  Proof required: Non-interactive sanitized raw report byte remediation machine proof with reliable DB connectivity, sanitized inventory, remediation policy verification, and no raw bytes or PII.
  Allowed commands: `pnpm run storage:raw-report-inventory`, `pnpm run storage:raw-report-remediation-plan`, `pnpm run storage:raw-report-remediation-acceptance`, `pnpm run storage:raw-report-machine-inventory`, `pnpm run storage:raw-report-machine-remediation-proof`, `pnpm run storage:raw-report-machine-proof:validate`, `pnpm exec vitest run --config vitest.config.ts tests/unit/storage-raw-report-inventory.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/storage-raw-report-remediation-plan.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/report-artifact-storage.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/evidence-attachment-storage.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/api/evidence-privacy-endpoint.spec.ts`, `pnpm run test:api`, `pnpm run operator:dashboard`
  Next action: Provide reliable sanitized DB inventory and remediation attestation JSON inputs, then rerun the raw report machine proof commands.
- #8 Response operations maturity (High; partial)
  Proof required: Machine-readable evidence for disabled live scheduler, backfill readiness, purge/archive readiness, dashboard/soak references, automated fallback controls, and unresolved alerting risk without enabling live operations.
  Allowed commands: `pnpm run alerts:dry-run`, `pnpm run response-ops:readiness-evidence`, `pnpm run response:ops-readiness-evidence`, `pnpm run response:soak-check`, `pnpm run response:orchestration-check`, `pnpm run response:worker-orchestrate -- --dry-run`, `pnpm run response:lifecycle -- --dry-run`, `pnpm run response:replay -- --dry-run`, `pnpm run operator:dashboard`, `pnpm exec vitest run --config vitest.config.ts tests/unit/alerts-dry-run.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/response-ops-readiness-evidence.spec.ts`
  Next action: Keep live scheduler default-off and use response ops readiness evidence to govern scheduler, backfill, purge/archive, dashboard, soak, and automated fallback controls without mutating production.
- #9 Observability/alerting (High; simulated-proof-only)
  Proof required: Non-interactive sanitized alerting machine proof with live synthetic delivery or an explicitly certifying formal exclusion allowed by repo policy.
  Allowed commands: `pnpm run alerts:dry-run`, `pnpm run alerts:exclusion:validate`, `pnpm run alerting:machine-proof`, `pnpm run alerting:machine-proof:validate`, `pnpm run response-ops:readiness-evidence`, `pnpm run response:ops-readiness-evidence`, `pnpm run operator:dashboard`, `pnpm run response:orchestration-check`, `pnpm exec vitest run --config vitest.config.ts tests/unit/alerts-dry-run.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/response-ops-readiness-evidence.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/operator-regression-dashboard.spec.ts`, `pnpm run alerts:machine-proof`, `pnpm run alerts:machine-proof:validate`
  Next action: Provide CRP_ALERTING_MACHINE_ATTESTATION_JSON for live delivery or an approved certifying exclusion and rerun alerts:machine-proof.
- #10 Migration governance (High; partial)
  Proof required: Non-interactive migration governance machine proof showing no active temporary allowlist residuals, no expired allowlist, exact residual classifications, and no release-blocking findings.
  Allowed commands: `pnpm run check:migrations`, `pnpm run migrations:evidence`, `pnpm run migrations:gate`, `pnpm exec vitest run --config vitest.config.ts tests/unit/migration-checker.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/migration-gate.spec.ts`, `pnpm run typecheck`, `pnpm run migrations:machine-proof`, `pnpm run migrations:machine-proof:validate`
  Next action: Run migrations:machine-proof and migrations:machine-proof:validate; temporary allowlist residuals cannot certify.
- #11 Production deployment parity (High; partial)
  Proof required: Workflow unit tests, current read-only production-safe probe evidence, rollback SHA and post-rollback health-check evidence, local/staging synthetic owner-denial evidence, and default-off production worker path evidence. Static proof is not runtime production proof.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/unit/production-readiness-gate.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/deploy-production-workflow.spec.ts`, `pnpm run production-worker:activation-plan`, `pnpm run production-worker:activation-evidence`, `pnpm run production-worker:runtime-proof`, `pnpm run production-worker:readiness-evidence`, `pnpm run production-deployment-parity:evidence`, `pnpm run test:contracts`, `pnpm run production-safe-probes:evidence`, `pnpm run staging-owner-denial-smoke:evidence`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-deployment-parity-evidence.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/staging-owner-denial-smoke.spec.ts`
  Next action: Keep production probes read-only, keep seeded privacy smokes local/staging-only, and keep rollback evidence tied to rollback_sha plus post-rollback health checks before calling deployment parity complete.
- #15 Hidden-risk list semantics (Medium; partial)
  Proof required: Design/evidence artifact for hidden-risk aggregate and stale-suppression semantics; full bounded pagination remains a separate UI/query task.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/api/high-growth-list-limits.spec.ts`, `pnpm run test:api`, `pnpm run typecheck`, `pnpm run sensitive-list-endpoints:evidence`, `pnpm exec vitest run --config vitest.config.ts tests/api/sensitive-list-endpoints.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/sensitive-list-endpoints-evidence.spec.ts`
  Next action: Split hidden-risk aggregate counts from paginated rows in a separate design task; do not apply a blind limit that changes aggregate semantics.
- #16 DB pool pressure evidence (Medium; simulated-proof-only)
  Proof required: Accepted release-blocking measured local or staging-safe evidence must record DB pool configured max, observed active/borrowed signal or explicit unavailable reason, latency, queue depth, dashboard references, and zero production DB targeting.
  Allowed commands: `pnpm run baseline:production-scale-local -- --simulated`, `pnpm run baseline:production-scale-measured -- --local`, `pnpm exec vitest run --config vitest.config.ts tests/unit/runtime-tuning-config.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-scale-measured.spec.ts`, `pnpm run baseline:production-scale-local -- --dry-run`, `pnpm run operator:dashboard`
  Next action: Run bounded measured local or staging-safe load and record sanitized DB pool configured/observed signals or an explicit unavailable reason.
- #17 Rate limiter write pressure (Medium; simulated-proof-only)
  Proof required: Accepted release-blocking measured local or staging-safe evidence must record bounded synthetic rate limiter accepted/rejected counts, write-pressure events, latency, zero real identifiers, and zero production mutation.
  Allowed commands: `pnpm run baseline:production-scale-local -- --simulated`, `pnpm run baseline:production-scale-measured -- --local`, `pnpm exec vitest run --config vitest.config.ts tests/unit/rate-limiter-simulated-pressure.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-scale-measured.spec.ts`, `pnpm run baseline:production-scale-local -- --dry-run`, `pnpm run operator:dashboard`, `pnpm run test:api`
  Next action: Run bounded measured local or staging-safe rate-limit pressure using synthetic identifiers only; do not send production hostile traffic.
- #18 Runtime-size gates (Medium; partial)
  Proof required: Runtime-size report plus accepted policy acceptance evidence. Warning-only closure must be an explicit formal waiver with governed WARN/WAIVED rows; release-blocking closure must have no exceeded thresholds.
  Allowed commands: `pnpm run build`, `pnpm run report:runtime-size`, `pnpm run check:runtime-size`, `pnpm run runtime-size:policy-acceptance`, `pnpm exec vitest run --config vitest.config.ts tests/unit/runtime-size-report-script.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/runtime-size-policy-acceptance.spec.ts`
  Next action: Keep the warning-only waiver evidence current, and only enable a release-blocking gate through a later reviewed threshold-policy change.
- #19 Heavy PDF/OCR dependencies (Medium; partial)
  Proof required: Policy-bound WARN/WAIVED baseline for heavy PDF/OCR dependencies plus OCR deterministic regression proof for any future dependency or Docker package change.
  Allowed commands: `pnpm run report:runtime-size`, `pnpm run check:runtime-size`, `pnpm exec vitest run --config vitest.config.ts tests/unit/runtime-size-report-script.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/deterministic-ocr-readiness.spec.ts`
  Next action: Keep heavy PDF/OCR dependency size warnings visible; defer dependency isolation or replacement until a separately tested OCR/PDF/parser task.
- #20 Production-safe privacy probe depth (Medium; partial)
  Proof required: Current local/staging synthetic owner-denial proof plus explicit read-only production probe limits. Synthetic owner-denial is not production mutation proof and unauthenticated probes alone are insufficient.
  Allowed commands: `pnpm run test:contracts`, `pnpm exec vitest run --config vitest.config.ts tests/api/support-role-privacy-matrix.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-readiness-gate.spec.ts`, `pnpm run production-deployment-parity:evidence`, `pnpm run production-safe-probes:evidence`, `pnpm run staging-owner-denial-smoke:evidence`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-deployment-parity-evidence.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/staging-owner-denial-smoke.spec.ts`
  Next action: Run read-only production-safe probes, local/staging synthetic owner-denial smoke, and production deployment parity evidence; do not create production fixtures for deeper owner-denial proof.
- #22 Retention archive/restore proof (Medium; partial)
  Proof required: Non-interactive sanitized retention archive/restore machine proof with safe archive candidate, archive metadata verification, isolated restore target, restore integrity, cleanup, rollback notes, and target destruction.
  Allowed commands: `pnpm run retention:archive-restore:simulated`, `pnpm run retention:archive-restore-machine-proof`, `pnpm run retention:archive-restore-machine-proof:validate`, `pnpm exec vitest run --config vitest.config.ts tests/api/retention-apply-guard-endpoint.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/retention-archive-restore-simulated.spec.ts`, `pnpm run operator:dashboard`
  Next action: Provide CRP_RETENTION_ARCHIVE_RESTORE_MACHINE_ATTESTATION_JSON with CRP_RETENTION_ARCHIVE_RESTORE_ARCHIVE_ACCESS, CRP_RETENTION_ARCHIVE_RESTORE_ISOLATED_TARGET, and CRP_RETENTION_ARCHIVE_RESTORE_SAFE_CANDIDATE attested fields, then rerun retention:archive-restore-machine-proof.
- #23 Public routes inventory risk (Medium; partial)
  Proof required: Executable route auth contract proof that public legacy handlers remain classified, retired public routes stay reset/410, and public inventory changes require explicit test updates.
  Allowed commands: `pnpm run test:contracts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/public-static-dev-assets.spec.ts`, `pnpm run production-safe-probes:evidence`
  Next action: Keep route auth contract strict, pin the public inventory, and fail on retired public route revival or unclassified endpoint drift.
- #24 Documentation drift (Low; partial)
  Proof required: Promotion pack and registry evidence must detect stale audit/tracker commit references and keep blocker data aligned with the controlling audit before promotion.
  Allowed commands: `pnpm run production-scale:evidence`, `pnpm run production-scale:promotion-pack`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-promotion-pack.spec.ts`, `git diff --check`
  Next action: Run the promotion pack after each scoped blocker task, use its stale-reference findings, and align tracker/audit/evidence references before any promotion decision.

