# Latest Production-Scale Evidence

Generated at: 2026-05-20T18:44:36.091Z
Current branch: `staging`
Current commit hash: `c6cc055d5b3c53049ed34b815a8c84a636c0068b`
Working tree clean when generated: no
Audit file used: `docs/production-at-scale-maximum-audit.md`
Audit date from file: 2026-05-20
All 25 blockers represented: yes
Any checks skipped: yes (54 dashboard SKIP row(s))
Dashboard exact commands recorded: yes

## Required Warnings

- SIMULATED evidence is not production proof.
- Dashboard PASS alone is not sufficient release evidence.
- Dashboard SKIP rows are not treated as PASS.
- Release evidence must record exact commands, not dashboard headline status alone.
- This report does not claim production-at-scale readiness.
- Production mutation, real consumer PII, production database dumps, live provider delivery, and credentials are forbidden for this framework.

## Registry Summary

- Registry path: `docs/production-scale/blocker-registry.json`
- Expected blockers: 25
- Actual blockers: 25
- Registry validation: passed
- Status counts: requires-human-proof=1, simulated-proof-only=5, partial=12, fixed=3, open=4

## Automated Local Evidence

- #1 Disaster recovery (Critical; requires-human-proof)
  Proof required: Human-observed restore drill evidence with sanitized RPO/RTO and post-restore checks.
  Allowed commands: `pnpm run restore:drill:simulated`, `pnpm run check:restore-drill-evidence`, `pnpm run test:golden-path`, `pnpm run operator:dashboard`, `pnpm run response:soak-check`
  Next action: Use simulated proof only for autonomous guard coverage; human operator still must perform a restore drill and provide sanitized signed evidence.
- #2 Production ingest runtime (Critical; simulated-proof-only)
  Proof required: SIMULATED worker queue-drain proof now exists; bounded staging-safe queue-depth evidence is still required before any production-scoped activation.
  Allowed commands: `pnpm run ingest:worker:simulated-proof`, `pnpm run ingest:worker -- --dry-run --max-jobs 1 --concurrency 1`, `pnpm run staging:ingest-worker -- --dry-run`, `pnpm run operator:dashboard`, `pnpm run test:api`
  Next action: Use SIMULATED proof only for autonomous queue-drain guard coverage; record bounded staging worker queue-depth recovery evidence without production activation.
- #3 Load/concurrency proof (High; simulated-proof-only)
  Proof required: SIMULATED local load evidence now exists; repeated measured local or staging load evidence with throughput, latency, queue, OCR, PDF, and DB observations is still required.
  Allowed commands: `pnpm run baseline:production-scale-local -- --simulated`, `pnpm run baseline:production-scale-local -- --dry-run`, `pnpm run operator:dashboard`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-scale-harness.spec.ts`
  Next action: Use SIMULATED output only as local capacity evidence; collect repeated bounded local or staging capacity evidence before any scale claim.
- #4 Packet PDF scaling (High; partial)
  Proof required: SIMULATED cache-miss timing evidence now exists, but staging-safe cache-miss envelope evidence or a bounded render queue is still required.
  Allowed commands: `pnpm run baseline:production-scale-local -- --simulated`, `pnpm exec vitest run --config vitest.config.ts tests/unit/packet-pdf-cache.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/api/packet-lifecycle-endpoint.spec.ts`, `pnpm run test:golden-path`, `pnpm run operator:dashboard`
  Next action: Use cache-miss timing as capacity evidence only; add a bounded render queue or staging-safe cache-miss envelope before calling this fixed.
- #5 Ingest cleanup/data safety (High; fixed)
  Proof required: Automated proof that default failed-ingest cleanup is non-destructive, marks remediation-required state, preserves artifacts/tradelines/evidence, and keeps any retained destructive path explicitly confirmed and production-refusing.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/unit/ingest-cleanup-lifecycle.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/api/ingest-processing-lifecycle-remediation-endpoint.spec.ts`, `pnpm run operator:dashboard`
  Next action: Keep the retained destructive helper classified as guarded residual risk: it is not default, requires explicit confirmation, records lifecycle evidence, and refuses production-like environments.
- #6 Historical raw report bytes (High; partial)
  Proof required: Non-destructive inventory and remediation plan for old inline rows while new rows stay reference-based.
  Allowed commands: `pnpm run storage:raw-report-inventory`, `pnpm exec vitest run --config vitest.config.ts tests/unit/storage-raw-report-inventory.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/api/evidence-privacy-endpoint.spec.ts`, `pnpm run test:api`, `pnpm run operator:dashboard`
  Next action: Use the sanitized inventory to create a reviewed remediation plan without moving data silently.
- #7 Bureau communication storage (High; fixed)
  Proof required: Automated storage adapter proof for new bureau attachments plus compatibility proof for old inline records.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/unit/evidence-attachment-storage.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/api/evidence-privacy-endpoint.spec.ts`, `pnpm run test:api`, `pnpm run typecheck`
  Next action: Keep list endpoints metadata-only and handle any legacy inline rows through an approved historical remediation plan.
- #8 Response operations maturity (High; partial)
  Proof required: Soak, scheduler boundary, SIMULATED alert dry-run, purge/archive, backfill, and remediation evidence. Live scheduler, purge/archive, and historical backfill remain unproven.
  Allowed commands: `pnpm run alerts:dry-run`, `pnpm run response:soak-check`, `pnpm run response:orchestration-check`, `pnpm run response:worker-orchestrate -- --dry-run`, `pnpm run response:lifecycle -- --dry-run`, `pnpm run response:replay -- --dry-run`, `pnpm run operator:dashboard`, `pnpm exec vitest run --config vitest.config.ts tests/unit/alerts-dry-run.spec.ts`
  Next action: Use SIMULATED alert dry-run only as response-ops evidence; live scheduler, purge/archive, and historical backfill still need bounded operator proof.
- #9 Observability/alerting (High; simulated-proof-only)
  Proof required: Sanitized dashboard metrics plus SIMULATED external alert dry-run/mock proof now exist; live external alert proof or accepted exclusion remains required for operations.
  Allowed commands: `pnpm run alerts:dry-run`, `pnpm run operator:dashboard`, `pnpm run response:orchestration-check`, `pnpm exec vitest run --config vitest.config.ts tests/unit/alerts-dry-run.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/operator-regression-dashboard.spec.ts`
  Next action: Keep live external alerting disabled unless separately configured and proven; use this dry-run plus an accepted exclusion if no provider is used.
- #10 Migration governance (High; partial)
  Proof required: Release-visible non-mutating migration governance and runtime ensure drift evidence now; reviewed additive ledger cutover and hard gate remain future work.
  Allowed commands: `pnpm run check:migrations`, `pnpm run migrations:evidence`, `pnpm exec vitest run --config vitest.config.ts tests/unit/migration-checker.spec.ts`, `pnpm run typecheck`
  Next action: Keep runtime ensure residuals release-visible and convert them to reviewed additive migration ledger entries one workstream at a time.
- #11 Production deployment parity (High; partial)
  Proof required: Workflow unit tests and human-observed read-only production evidence; seeded smokes stay local/staging.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/unit/production-readiness-gate.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/deploy-production-workflow.spec.ts`, `pnpm run test:contracts`
  Next action: Keep production probes read-only and run seeded privacy smokes only locally or in staging.
- #12 OCR route-local validation shape (Medium; fixed)
  Proof required: OCR shared upload-validation proof plus valid-fixture output-stability evidence.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/api/ocr-extract-upload-limit-endpoint.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/deterministic-ocr-readiness.spec.ts`, `pnpm run test:deterministic-ingestion-report`, `pnpm run typecheck`
  Next action: Keep OCR validation aligned with shared upload boundaries and preserve valid PDF extraction output in regression tests.
- #13 Parser-test list sensitive field (Medium; open)
  Proof required: Admin UI compatibility plus metadata-only list proof.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/unit/parser-test-cases-list-navigation.spec.tsx`, `pnpm run test:api`, `pnpm run typecheck`
  Next action: Move raw extracted text out of the list path in a separate admin/parser UI task.
- #14 Consumer signature list sensitive field (Medium; open)
  Proof required: Owner-filtered metadata list plus get-by-id signature-data proof.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/api/high-growth-list-limits.spec.ts`, `pnpm run test:api`, `pnpm run typecheck`
  Next action: Create metadata-list and get-by-id signature data split in a separate privacy/UI task.
- #15 Hidden-risk list semantics (Medium; open)
  Proof required: Endpoint contract and dashboard UI proof for pagination and aggregate semantics.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/api/high-growth-list-limits.spec.ts`, `pnpm run test:api`, `pnpm run typecheck`
  Next action: Split hidden-risk pagination and aggregate semantics in a separate design task.
- #16 DB pool pressure evidence (Medium; simulated-proof-only)
  Proof required: SIMULATED DB pool signal exists; staging-safe load evidence for pool max, latency, active connections, and dashboard observations is still required.
  Allowed commands: `pnpm run baseline:production-scale-local -- --simulated`, `pnpm exec vitest run --config vitest.config.ts tests/unit/runtime-tuning-config.spec.ts`, `pnpm run baseline:production-scale-local -- --dry-run`, `pnpm run operator:dashboard`
  Next action: Run bounded staging load and record sanitized real DB pool active/open/latency observations.
- #17 Rate limiter write pressure (Medium; simulated-proof-only)
  Proof required: SIMULATED rate-limit pressure proof exists; bounded staging-safe aggregate DB write metrics are still required.
  Allowed commands: `pnpm run baseline:production-scale-local -- --simulated`, `pnpm exec vitest run --config vitest.config.ts tests/unit/rate-limiter-simulated-pressure.spec.ts`, `pnpm run baseline:production-scale-local -- --dry-run`, `pnpm run operator:dashboard`, `pnpm run test:api`
  Next action: Collect bounded staging-safe aggregate rate-limit write-pressure signals without real abusive traffic.
- #18 Runtime-size gates (Medium; partial)
  Proof required: Runtime-size report plus accepted warning-only or hard-threshold policy.
  Allowed commands: `pnpm run build`, `pnpm run report:runtime-size`, `pnpm exec vitest run --config vitest.config.ts tests/unit/runtime-size-report-script.spec.ts`
  Next action: Capture warning-only runtime-size artifacts and decide thresholds separately.
- #19 Heavy PDF/OCR dependencies (Medium; partial)
  Proof required: Pinned package and Docker baseline evidence plus OCR deterministic regression proof for changes.
  Allowed commands: `pnpm run report:runtime-size`, `pnpm exec vitest run --config vitest.config.ts tests/unit/runtime-size-report-script.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/deterministic-ocr-readiness.spec.ts`
  Next action: Document package baselines and require OCR/parser regressions for future runtime package changes.
- #20 Production-safe privacy probe depth (Medium; partial)
  Proof required: Local/staging owner-denial proof plus human-observed read-only production probe evidence.
  Allowed commands: `pnpm run test:contracts`, `pnpm exec vitest run --config vitest.config.ts tests/api/support-role-privacy-matrix.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-readiness-gate.spec.ts`
  Next action: Keep production probes read-only and use synthetic local/staging fixtures for deeper owner denial.
- #21 Ingest observability release gating (Medium; partial)
  Proof required: Release evidence capture that records exact commands and dashboard skips.
  Allowed commands: `pnpm run production-scale:evidence`, `pnpm run operator:dashboard`, `pnpm exec vitest run --config vitest.config.ts tests/unit/operator-regression-dashboard.spec.ts`
  Next action: Use the evidence command to capture exact release evidence before deciding hard gates.
- #22 Retention archive/restore proof (Medium; partial)
  Proof required: Retention guard proof plus human-observed archive/restore lifecycle evidence.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/api/retention-apply-guard-endpoint.spec.ts`, `pnpm run check:restore-drill-evidence`, `pnpm run operator:dashboard`
  Next action: Add retention archive/restore evidence and keep destructive apply human-approved.
- #23 Public routes inventory risk (Medium; partial)
  Proof required: Executable route auth contract proof that public legacy handlers remain classified and fail closed.
  Allowed commands: `pnpm run test:contracts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/public-static-dev-assets.spec.ts`
  Next action: Keep route auth contract strict and fail on public handler drift.
- #24 Documentation drift (Low; open)
  Proof required: Docs diff and registry evidence that current blocker data matches the controlling audit.
  Allowed commands: `pnpm run production-scale:evidence`, `git diff --check`
  Next action: Run the evidence command after each scoped blocker task and keep docs aligned.
- #25 Dashboard default SKIP semantics (Low; partial)
  Proof required: Dashboard report must distinguish PASS, FAIL, SKIP, SIMULATED, and HUMAN_REQUIRED while recording exact commands, skipped checks, and dashboard PASS limitation.
  Allowed commands: `pnpm run production-scale:evidence`, `pnpm run operator:dashboard`, `pnpm run alerts:dry-run`, `pnpm exec vitest run --config vitest.config.ts tests/unit/operator-regression-dashboard.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/alerts-dry-run.spec.ts`
  Next action: Keep release evidence labeled by exact commands and visible SKIP/SIMULATED/HUMAN_REQUIRED rows, not dashboard headline status.

## Simulated Evidence

SIMULATED: Local or staging-safe simulated evidence is separated here and is never rendered as production proof.

- SIMULATED - #1 Disaster recovery (Critical; requires-human-proof)
  Proof required: Human-observed restore drill evidence with sanitized RPO/RTO and post-restore checks.
  Allowed commands: `pnpm run restore:drill:simulated`, `pnpm run check:restore-drill-evidence`, `pnpm run test:golden-path`, `pnpm run operator:dashboard`, `pnpm run response:soak-check`
  Next action: Use simulated proof only for autonomous guard coverage; human operator still must perform a restore drill and provide sanitized signed evidence.
- SIMULATED - #2 Production ingest runtime (Critical; simulated-proof-only)
  Proof required: SIMULATED worker queue-drain proof now exists; bounded staging-safe queue-depth evidence is still required before any production-scoped activation.
  Allowed commands: `pnpm run ingest:worker:simulated-proof`, `pnpm run ingest:worker -- --dry-run --max-jobs 1 --concurrency 1`, `pnpm run staging:ingest-worker -- --dry-run`, `pnpm run operator:dashboard`, `pnpm run test:api`
  Next action: Use SIMULATED proof only for autonomous queue-drain guard coverage; record bounded staging worker queue-depth recovery evidence without production activation.
- SIMULATED - #3 Load/concurrency proof (High; simulated-proof-only)
  Proof required: SIMULATED local load evidence now exists; repeated measured local or staging load evidence with throughput, latency, queue, OCR, PDF, and DB observations is still required.
  Allowed commands: `pnpm run baseline:production-scale-local -- --simulated`, `pnpm run baseline:production-scale-local -- --dry-run`, `pnpm run operator:dashboard`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-scale-harness.spec.ts`
  Next action: Use SIMULATED output only as local capacity evidence; collect repeated bounded local or staging capacity evidence before any scale claim.
- SIMULATED - #4 Packet PDF scaling (High; partial)
  Proof required: SIMULATED cache-miss timing evidence now exists, but staging-safe cache-miss envelope evidence or a bounded render queue is still required.
  Allowed commands: `pnpm run baseline:production-scale-local -- --simulated`, `pnpm exec vitest run --config vitest.config.ts tests/unit/packet-pdf-cache.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/api/packet-lifecycle-endpoint.spec.ts`, `pnpm run test:golden-path`, `pnpm run operator:dashboard`
  Next action: Use cache-miss timing as capacity evidence only; add a bounded render queue or staging-safe cache-miss envelope before calling this fixed.
- SIMULATED - #8 Response operations maturity (High; partial)
  Proof required: Soak, scheduler boundary, SIMULATED alert dry-run, purge/archive, backfill, and remediation evidence. Live scheduler, purge/archive, and historical backfill remain unproven.
  Allowed commands: `pnpm run alerts:dry-run`, `pnpm run response:soak-check`, `pnpm run response:orchestration-check`, `pnpm run response:worker-orchestrate -- --dry-run`, `pnpm run response:lifecycle -- --dry-run`, `pnpm run response:replay -- --dry-run`, `pnpm run operator:dashboard`, `pnpm exec vitest run --config vitest.config.ts tests/unit/alerts-dry-run.spec.ts`
  Next action: Use SIMULATED alert dry-run only as response-ops evidence; live scheduler, purge/archive, and historical backfill still need bounded operator proof.
- SIMULATED - #9 Observability/alerting (High; simulated-proof-only)
  Proof required: Sanitized dashboard metrics plus SIMULATED external alert dry-run/mock proof now exist; live external alert proof or accepted exclusion remains required for operations.
  Allowed commands: `pnpm run alerts:dry-run`, `pnpm run operator:dashboard`, `pnpm run response:orchestration-check`, `pnpm exec vitest run --config vitest.config.ts tests/unit/alerts-dry-run.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/operator-regression-dashboard.spec.ts`
  Next action: Keep live external alerting disabled unless separately configured and proven; use this dry-run plus an accepted exclusion if no provider is used.
- SIMULATED - #16 DB pool pressure evidence (Medium; simulated-proof-only)
  Proof required: SIMULATED DB pool signal exists; staging-safe load evidence for pool max, latency, active connections, and dashboard observations is still required.
  Allowed commands: `pnpm run baseline:production-scale-local -- --simulated`, `pnpm exec vitest run --config vitest.config.ts tests/unit/runtime-tuning-config.spec.ts`, `pnpm run baseline:production-scale-local -- --dry-run`, `pnpm run operator:dashboard`
  Next action: Run bounded staging load and record sanitized real DB pool active/open/latency observations.
- SIMULATED - #17 Rate limiter write pressure (Medium; simulated-proof-only)
  Proof required: SIMULATED rate-limit pressure proof exists; bounded staging-safe aggregate DB write metrics are still required.
  Allowed commands: `pnpm run baseline:production-scale-local -- --simulated`, `pnpm exec vitest run --config vitest.config.ts tests/unit/rate-limiter-simulated-pressure.spec.ts`, `pnpm run baseline:production-scale-local -- --dry-run`, `pnpm run operator:dashboard`, `pnpm run test:api`
  Next action: Collect bounded staging-safe aggregate rate-limit write-pressure signals without real abusive traffic.

## Staging Evidence

- #2 Production ingest runtime (Critical; simulated-proof-only)
  Proof required: SIMULATED worker queue-drain proof now exists; bounded staging-safe queue-depth evidence is still required before any production-scoped activation.
  Allowed commands: `pnpm run ingest:worker:simulated-proof`, `pnpm run ingest:worker -- --dry-run --max-jobs 1 --concurrency 1`, `pnpm run staging:ingest-worker -- --dry-run`, `pnpm run operator:dashboard`, `pnpm run test:api`
  Next action: Use SIMULATED proof only for autonomous queue-drain guard coverage; record bounded staging worker queue-depth recovery evidence without production activation.
- #3 Load/concurrency proof (High; simulated-proof-only)
  Proof required: SIMULATED local load evidence now exists; repeated measured local or staging load evidence with throughput, latency, queue, OCR, PDF, and DB observations is still required.
  Allowed commands: `pnpm run baseline:production-scale-local -- --simulated`, `pnpm run baseline:production-scale-local -- --dry-run`, `pnpm run operator:dashboard`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-scale-harness.spec.ts`
  Next action: Use SIMULATED output only as local capacity evidence; collect repeated bounded local or staging capacity evidence before any scale claim.
- #4 Packet PDF scaling (High; partial)
  Proof required: SIMULATED cache-miss timing evidence now exists, but staging-safe cache-miss envelope evidence or a bounded render queue is still required.
  Allowed commands: `pnpm run baseline:production-scale-local -- --simulated`, `pnpm exec vitest run --config vitest.config.ts tests/unit/packet-pdf-cache.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/api/packet-lifecycle-endpoint.spec.ts`, `pnpm run test:golden-path`, `pnpm run operator:dashboard`
  Next action: Use cache-miss timing as capacity evidence only; add a bounded render queue or staging-safe cache-miss envelope before calling this fixed.
- #6 Historical raw report bytes (High; partial)
  Proof required: Non-destructive inventory and remediation plan for old inline rows while new rows stay reference-based.
  Allowed commands: `pnpm run storage:raw-report-inventory`, `pnpm exec vitest run --config vitest.config.ts tests/unit/storage-raw-report-inventory.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/api/evidence-privacy-endpoint.spec.ts`, `pnpm run test:api`, `pnpm run operator:dashboard`
  Next action: Use the sanitized inventory to create a reviewed remediation plan without moving data silently.
- #8 Response operations maturity (High; partial)
  Proof required: Soak, scheduler boundary, SIMULATED alert dry-run, purge/archive, backfill, and remediation evidence. Live scheduler, purge/archive, and historical backfill remain unproven.
  Allowed commands: `pnpm run alerts:dry-run`, `pnpm run response:soak-check`, `pnpm run response:orchestration-check`, `pnpm run response:worker-orchestrate -- --dry-run`, `pnpm run response:lifecycle -- --dry-run`, `pnpm run response:replay -- --dry-run`, `pnpm run operator:dashboard`, `pnpm exec vitest run --config vitest.config.ts tests/unit/alerts-dry-run.spec.ts`
  Next action: Use SIMULATED alert dry-run only as response-ops evidence; live scheduler, purge/archive, and historical backfill still need bounded operator proof.
- #16 DB pool pressure evidence (Medium; simulated-proof-only)
  Proof required: SIMULATED DB pool signal exists; staging-safe load evidence for pool max, latency, active connections, and dashboard observations is still required.
  Allowed commands: `pnpm run baseline:production-scale-local -- --simulated`, `pnpm exec vitest run --config vitest.config.ts tests/unit/runtime-tuning-config.spec.ts`, `pnpm run baseline:production-scale-local -- --dry-run`, `pnpm run operator:dashboard`
  Next action: Run bounded staging load and record sanitized real DB pool active/open/latency observations.
- #17 Rate limiter write pressure (Medium; simulated-proof-only)
  Proof required: SIMULATED rate-limit pressure proof exists; bounded staging-safe aggregate DB write metrics are still required.
  Allowed commands: `pnpm run baseline:production-scale-local -- --simulated`, `pnpm exec vitest run --config vitest.config.ts tests/unit/rate-limiter-simulated-pressure.spec.ts`, `pnpm run baseline:production-scale-local -- --dry-run`, `pnpm run operator:dashboard`, `pnpm run test:api`
  Next action: Collect bounded staging-safe aggregate rate-limit write-pressure signals without real abusive traffic.
- #20 Production-safe privacy probe depth (Medium; partial)
  Proof required: Local/staging owner-denial proof plus human-observed read-only production probe evidence.
  Allowed commands: `pnpm run test:contracts`, `pnpm exec vitest run --config vitest.config.ts tests/api/support-role-privacy-matrix.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-readiness-gate.spec.ts`
  Next action: Keep production probes read-only and use synthetic local/staging fixtures for deeper owner denial.
- #21 Ingest observability release gating (Medium; partial)
  Proof required: Release evidence capture that records exact commands and dashboard skips.
  Allowed commands: `pnpm run production-scale:evidence`, `pnpm run operator:dashboard`, `pnpm exec vitest run --config vitest.config.ts tests/unit/operator-regression-dashboard.spec.ts`
  Next action: Use the evidence command to capture exact release evidence before deciding hard gates.

## Read-Only Production Evidence

No read-only production command is executed by this report. Any production evidence must be human-observed, sanitized, and non-mutating.

- #11 Production deployment parity (High; partial)
  Proof required: Workflow unit tests and human-observed read-only production evidence; seeded smokes stay local/staging.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/unit/production-readiness-gate.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/deploy-production-workflow.spec.ts`, `pnpm run test:contracts`
  Next action: Keep production probes read-only and run seeded privacy smokes only locally or in staging.
- #20 Production-safe privacy probe depth (Medium; partial)
  Proof required: Local/staging owner-denial proof plus human-observed read-only production probe evidence.
  Allowed commands: `pnpm run test:contracts`, `pnpm exec vitest run --config vitest.config.ts tests/api/support-role-privacy-matrix.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-readiness-gate.spec.ts`
  Next action: Keep production probes read-only and use synthetic local/staging fixtures for deeper owner denial.

## Human-Observed Evidence

- #1 Disaster recovery (Critical; requires-human-proof)
  Proof required: Human-observed restore drill evidence with sanitized RPO/RTO and post-restore checks.
  Allowed commands: `pnpm run restore:drill:simulated`, `pnpm run check:restore-drill-evidence`, `pnpm run test:golden-path`, `pnpm run operator:dashboard`, `pnpm run response:soak-check`
  Next action: Use simulated proof only for autonomous guard coverage; human operator still must perform a restore drill and provide sanitized signed evidence.
- #8 Response operations maturity (High; partial)
  Proof required: Soak, scheduler boundary, SIMULATED alert dry-run, purge/archive, backfill, and remediation evidence. Live scheduler, purge/archive, and historical backfill remain unproven.
  Allowed commands: `pnpm run alerts:dry-run`, `pnpm run response:soak-check`, `pnpm run response:orchestration-check`, `pnpm run response:worker-orchestrate -- --dry-run`, `pnpm run response:lifecycle -- --dry-run`, `pnpm run response:replay -- --dry-run`, `pnpm run operator:dashboard`, `pnpm exec vitest run --config vitest.config.ts tests/unit/alerts-dry-run.spec.ts`
  Next action: Use SIMULATED alert dry-run only as response-ops evidence; live scheduler, purge/archive, and historical backfill still need bounded operator proof.
- #9 Observability/alerting (High; simulated-proof-only)
  Proof required: Sanitized dashboard metrics plus SIMULATED external alert dry-run/mock proof now exist; live external alert proof or accepted exclusion remains required for operations.
  Allowed commands: `pnpm run alerts:dry-run`, `pnpm run operator:dashboard`, `pnpm run response:orchestration-check`, `pnpm exec vitest run --config vitest.config.ts tests/unit/alerts-dry-run.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/operator-regression-dashboard.spec.ts`
  Next action: Keep live external alerting disabled unless separately configured and proven; use this dry-run plus an accepted exclusion if no provider is used.
- #11 Production deployment parity (High; partial)
  Proof required: Workflow unit tests and human-observed read-only production evidence; seeded smokes stay local/staging.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/unit/production-readiness-gate.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/deploy-production-workflow.spec.ts`, `pnpm run test:contracts`
  Next action: Keep production probes read-only and run seeded privacy smokes only locally or in staging.
- #18 Runtime-size gates (Medium; partial)
  Proof required: Runtime-size report plus accepted warning-only or hard-threshold policy.
  Allowed commands: `pnpm run build`, `pnpm run report:runtime-size`, `pnpm exec vitest run --config vitest.config.ts tests/unit/runtime-size-report-script.spec.ts`
  Next action: Capture warning-only runtime-size artifacts and decide thresholds separately.
- #20 Production-safe privacy probe depth (Medium; partial)
  Proof required: Local/staging owner-denial proof plus human-observed read-only production probe evidence.
  Allowed commands: `pnpm run test:contracts`, `pnpm exec vitest run --config vitest.config.ts tests/api/support-role-privacy-matrix.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-readiness-gate.spec.ts`
  Next action: Keep production probes read-only and use synthetic local/staging fixtures for deeper owner denial.
- #22 Retention archive/restore proof (Medium; partial)
  Proof required: Retention guard proof plus human-observed archive/restore lifecycle evidence.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/api/retention-apply-guard-endpoint.spec.ts`, `pnpm run check:restore-drill-evidence`, `pnpm run operator:dashboard`
  Next action: Add retention archive/restore evidence and keep destructive apply human-approved.

## Waived Blockers

- None.

## Unresolved Blockers

- #1 Disaster recovery (Critical; requires-human-proof)
  Proof required: Human-observed restore drill evidence with sanitized RPO/RTO and post-restore checks.
  Allowed commands: `pnpm run restore:drill:simulated`, `pnpm run check:restore-drill-evidence`, `pnpm run test:golden-path`, `pnpm run operator:dashboard`, `pnpm run response:soak-check`
  Next action: Use simulated proof only for autonomous guard coverage; human operator still must perform a restore drill and provide sanitized signed evidence.
- #2 Production ingest runtime (Critical; simulated-proof-only)
  Proof required: SIMULATED worker queue-drain proof now exists; bounded staging-safe queue-depth evidence is still required before any production-scoped activation.
  Allowed commands: `pnpm run ingest:worker:simulated-proof`, `pnpm run ingest:worker -- --dry-run --max-jobs 1 --concurrency 1`, `pnpm run staging:ingest-worker -- --dry-run`, `pnpm run operator:dashboard`, `pnpm run test:api`
  Next action: Use SIMULATED proof only for autonomous queue-drain guard coverage; record bounded staging worker queue-depth recovery evidence without production activation.
- #3 Load/concurrency proof (High; simulated-proof-only)
  Proof required: SIMULATED local load evidence now exists; repeated measured local or staging load evidence with throughput, latency, queue, OCR, PDF, and DB observations is still required.
  Allowed commands: `pnpm run baseline:production-scale-local -- --simulated`, `pnpm run baseline:production-scale-local -- --dry-run`, `pnpm run operator:dashboard`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-scale-harness.spec.ts`
  Next action: Use SIMULATED output only as local capacity evidence; collect repeated bounded local or staging capacity evidence before any scale claim.
- #4 Packet PDF scaling (High; partial)
  Proof required: SIMULATED cache-miss timing evidence now exists, but staging-safe cache-miss envelope evidence or a bounded render queue is still required.
  Allowed commands: `pnpm run baseline:production-scale-local -- --simulated`, `pnpm exec vitest run --config vitest.config.ts tests/unit/packet-pdf-cache.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/api/packet-lifecycle-endpoint.spec.ts`, `pnpm run test:golden-path`, `pnpm run operator:dashboard`
  Next action: Use cache-miss timing as capacity evidence only; add a bounded render queue or staging-safe cache-miss envelope before calling this fixed.
- #6 Historical raw report bytes (High; partial)
  Proof required: Non-destructive inventory and remediation plan for old inline rows while new rows stay reference-based.
  Allowed commands: `pnpm run storage:raw-report-inventory`, `pnpm exec vitest run --config vitest.config.ts tests/unit/storage-raw-report-inventory.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/api/evidence-privacy-endpoint.spec.ts`, `pnpm run test:api`, `pnpm run operator:dashboard`
  Next action: Use the sanitized inventory to create a reviewed remediation plan without moving data silently.
- #8 Response operations maturity (High; partial)
  Proof required: Soak, scheduler boundary, SIMULATED alert dry-run, purge/archive, backfill, and remediation evidence. Live scheduler, purge/archive, and historical backfill remain unproven.
  Allowed commands: `pnpm run alerts:dry-run`, `pnpm run response:soak-check`, `pnpm run response:orchestration-check`, `pnpm run response:worker-orchestrate -- --dry-run`, `pnpm run response:lifecycle -- --dry-run`, `pnpm run response:replay -- --dry-run`, `pnpm run operator:dashboard`, `pnpm exec vitest run --config vitest.config.ts tests/unit/alerts-dry-run.spec.ts`
  Next action: Use SIMULATED alert dry-run only as response-ops evidence; live scheduler, purge/archive, and historical backfill still need bounded operator proof.
- #9 Observability/alerting (High; simulated-proof-only)
  Proof required: Sanitized dashboard metrics plus SIMULATED external alert dry-run/mock proof now exist; live external alert proof or accepted exclusion remains required for operations.
  Allowed commands: `pnpm run alerts:dry-run`, `pnpm run operator:dashboard`, `pnpm run response:orchestration-check`, `pnpm exec vitest run --config vitest.config.ts tests/unit/alerts-dry-run.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/operator-regression-dashboard.spec.ts`
  Next action: Keep live external alerting disabled unless separately configured and proven; use this dry-run plus an accepted exclusion if no provider is used.
- #10 Migration governance (High; partial)
  Proof required: Release-visible non-mutating migration governance and runtime ensure drift evidence now; reviewed additive ledger cutover and hard gate remain future work.
  Allowed commands: `pnpm run check:migrations`, `pnpm run migrations:evidence`, `pnpm exec vitest run --config vitest.config.ts tests/unit/migration-checker.spec.ts`, `pnpm run typecheck`
  Next action: Keep runtime ensure residuals release-visible and convert them to reviewed additive migration ledger entries one workstream at a time.
- #11 Production deployment parity (High; partial)
  Proof required: Workflow unit tests and human-observed read-only production evidence; seeded smokes stay local/staging.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/unit/production-readiness-gate.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/deploy-production-workflow.spec.ts`, `pnpm run test:contracts`
  Next action: Keep production probes read-only and run seeded privacy smokes only locally or in staging.
- #13 Parser-test list sensitive field (Medium; open)
  Proof required: Admin UI compatibility plus metadata-only list proof.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/unit/parser-test-cases-list-navigation.spec.tsx`, `pnpm run test:api`, `pnpm run typecheck`
  Next action: Move raw extracted text out of the list path in a separate admin/parser UI task.
- #14 Consumer signature list sensitive field (Medium; open)
  Proof required: Owner-filtered metadata list plus get-by-id signature-data proof.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/api/high-growth-list-limits.spec.ts`, `pnpm run test:api`, `pnpm run typecheck`
  Next action: Create metadata-list and get-by-id signature data split in a separate privacy/UI task.
- #15 Hidden-risk list semantics (Medium; open)
  Proof required: Endpoint contract and dashboard UI proof for pagination and aggregate semantics.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/api/high-growth-list-limits.spec.ts`, `pnpm run test:api`, `pnpm run typecheck`
  Next action: Split hidden-risk pagination and aggregate semantics in a separate design task.
- #16 DB pool pressure evidence (Medium; simulated-proof-only)
  Proof required: SIMULATED DB pool signal exists; staging-safe load evidence for pool max, latency, active connections, and dashboard observations is still required.
  Allowed commands: `pnpm run baseline:production-scale-local -- --simulated`, `pnpm exec vitest run --config vitest.config.ts tests/unit/runtime-tuning-config.spec.ts`, `pnpm run baseline:production-scale-local -- --dry-run`, `pnpm run operator:dashboard`
  Next action: Run bounded staging load and record sanitized real DB pool active/open/latency observations.
- #17 Rate limiter write pressure (Medium; simulated-proof-only)
  Proof required: SIMULATED rate-limit pressure proof exists; bounded staging-safe aggregate DB write metrics are still required.
  Allowed commands: `pnpm run baseline:production-scale-local -- --simulated`, `pnpm exec vitest run --config vitest.config.ts tests/unit/rate-limiter-simulated-pressure.spec.ts`, `pnpm run baseline:production-scale-local -- --dry-run`, `pnpm run operator:dashboard`, `pnpm run test:api`
  Next action: Collect bounded staging-safe aggregate rate-limit write-pressure signals without real abusive traffic.
- #18 Runtime-size gates (Medium; partial)
  Proof required: Runtime-size report plus accepted warning-only or hard-threshold policy.
  Allowed commands: `pnpm run build`, `pnpm run report:runtime-size`, `pnpm exec vitest run --config vitest.config.ts tests/unit/runtime-size-report-script.spec.ts`
  Next action: Capture warning-only runtime-size artifacts and decide thresholds separately.
- #19 Heavy PDF/OCR dependencies (Medium; partial)
  Proof required: Pinned package and Docker baseline evidence plus OCR deterministic regression proof for changes.
  Allowed commands: `pnpm run report:runtime-size`, `pnpm exec vitest run --config vitest.config.ts tests/unit/runtime-size-report-script.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/deterministic-ocr-readiness.spec.ts`
  Next action: Document package baselines and require OCR/parser regressions for future runtime package changes.
- #20 Production-safe privacy probe depth (Medium; partial)
  Proof required: Local/staging owner-denial proof plus human-observed read-only production probe evidence.
  Allowed commands: `pnpm run test:contracts`, `pnpm exec vitest run --config vitest.config.ts tests/api/support-role-privacy-matrix.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-readiness-gate.spec.ts`
  Next action: Keep production probes read-only and use synthetic local/staging fixtures for deeper owner denial.
- #21 Ingest observability release gating (Medium; partial)
  Proof required: Release evidence capture that records exact commands and dashboard skips.
  Allowed commands: `pnpm run production-scale:evidence`, `pnpm run operator:dashboard`, `pnpm exec vitest run --config vitest.config.ts tests/unit/operator-regression-dashboard.spec.ts`
  Next action: Use the evidence command to capture exact release evidence before deciding hard gates.
- #22 Retention archive/restore proof (Medium; partial)
  Proof required: Retention guard proof plus human-observed archive/restore lifecycle evidence.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/api/retention-apply-guard-endpoint.spec.ts`, `pnpm run check:restore-drill-evidence`, `pnpm run operator:dashboard`
  Next action: Add retention archive/restore evidence and keep destructive apply human-approved.
- #23 Public routes inventory risk (Medium; partial)
  Proof required: Executable route auth contract proof that public legacy handlers remain classified and fail closed.
  Allowed commands: `pnpm run test:contracts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/public-static-dev-assets.spec.ts`
  Next action: Keep route auth contract strict and fail on public handler drift.
- #24 Documentation drift (Low; open)
  Proof required: Docs diff and registry evidence that current blocker data matches the controlling audit.
  Allowed commands: `pnpm run production-scale:evidence`, `git diff --check`
  Next action: Run the evidence command after each scoped blocker task and keep docs aligned.
- #25 Dashboard default SKIP semantics (Low; partial)
  Proof required: Dashboard report must distinguish PASS, FAIL, SKIP, SIMULATED, and HUMAN_REQUIRED while recording exact commands, skipped checks, and dashboard PASS limitation.
  Allowed commands: `pnpm run production-scale:evidence`, `pnpm run operator:dashboard`, `pnpm run alerts:dry-run`, `pnpm exec vitest run --config vitest.config.ts tests/unit/operator-regression-dashboard.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/alerts-dry-run.spec.ts`
  Next action: Keep release evidence labeled by exact commands and visible SKIP/SIMULATED/HUMAN_REQUIRED rows, not dashboard headline status.

