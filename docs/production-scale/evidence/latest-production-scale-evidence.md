# Latest Production-Scale Evidence

Generated at: 2026-05-20T18:07:24.857Z
Current branch: `staging`
Current commit hash: `dce75c4dab378c7ca3c7f8230cfa7e6e24fd76a9`
Working tree clean when generated: no
Audit file used: `docs/production-at-scale-maximum-audit.md`
Audit date from file: 2026-05-20
All 25 blockers represented: yes
Any checks skipped: yes (58 dashboard SKIP row(s))

## Required Warnings

- SIMULATED evidence is not production proof.
- Dashboard PASS alone is not sufficient release evidence.
- Dashboard SKIP rows are not treated as PASS.
- This report does not claim production-at-scale readiness.
- Production mutation, real consumer PII, production database dumps, live provider delivery, and credentials are forbidden for this framework.

## Registry Summary

- Registry path: `docs/production-scale/blocker-registry.json`
- Expected blockers: 25
- Actual blockers: 25
- Registry validation: passed
- Status counts: requires-human-proof=1, simulated-proof-only=2, partial=13, fixed=1, open=8

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
  Proof required: Repeated measured local or staging load evidence with throughput, latency, queue, OCR, PDF, and DB observations.
  Allowed commands: `pnpm run baseline:production-scale-local -- --dry-run`, `pnpm run operator:dashboard`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-scale-harness.spec.ts`
  Next action: Collect bounded local or staging capacity evidence and label dry-run output SIMULATED.
- #4 Packet PDF scaling (High; partial)
  Proof required: Packet PDF cache proof plus staging-safe cache-miss envelope evidence or a bounded render queue.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/unit/packet-pdf-cache.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/api/packet-lifecycle-endpoint.spec.ts`, `pnpm run test:golden-path`, `pnpm run operator:dashboard`
  Next action: Prove cache-miss behavior under bounded synthetic load or add a separate render queue.
- #5 Ingest cleanup/data safety (High; fixed)
  Proof required: Automated proof that default failed-ingest cleanup is non-destructive, marks remediation-required state, preserves artifacts/tradelines/evidence, and keeps any retained destructive path explicitly confirmed and production-refusing.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/unit/ingest-cleanup-lifecycle.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/api/ingest-processing-lifecycle-remediation-endpoint.spec.ts`, `pnpm run operator:dashboard`
  Next action: Keep the retained destructive helper classified as guarded residual risk: it is not default, requires explicit confirmation, records lifecycle evidence, and refuses production-like environments.
- #6 Historical raw report bytes (High; partial)
  Proof required: Non-destructive inventory and remediation plan for old inline rows while new rows stay reference-based.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/api/evidence-privacy-endpoint.spec.ts`, `pnpm run test:api`, `pnpm run operator:dashboard`
  Next action: Create a sanitized inventory and reviewed remediation plan without moving data silently.
- #7 Bureau communication storage (High; open)
  Proof required: Storage adapter proof for new bureau attachments plus compatibility proof for old records.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/api/evidence-privacy-endpoint.spec.ts`, `pnpm run test:api`, `pnpm run typecheck`
  Next action: Move bureau attachments to the existing storage adapter in a separate task.
- #8 Response operations maturity (High; partial)
  Proof required: Soak, scheduler boundary, alert dry-run or exclusion, purge/archive, backfill, and remediation evidence.
  Allowed commands: `pnpm run response:soak-check`, `pnpm run response:orchestration-check`, `pnpm run response:worker-orchestrate -- --dry-run`, `pnpm run response:lifecycle -- --dry-run`, `pnpm run response:replay -- --dry-run`, `pnpm run operator:dashboard`
  Next action: Close one response-ops proof row at a time with deterministic synthetic or staging-safe evidence.
- #9 Observability/alerting (High; partial)
  Proof required: Sanitized dashboard metrics plus external alert dry-run/mock proof or accepted exclusion.
  Allowed commands: `pnpm run operator:dashboard`, `pnpm run response:orchestration-check`, `pnpm exec vitest run --config vitest.config.ts tests/unit/operator-regression-dashboard.spec.ts`
  Next action: Add a mock alert dry-run or document a formal operator-monitoring exclusion.
- #10 Migration governance (High; partial)
  Proof required: Non-mutating migration inventory evidence now; reviewed ledger and drift gate later.
  Allowed commands: `pnpm run check:migrations`, `pnpm exec vitest run --config vitest.config.ts tests/unit/migration-checker.spec.ts`, `pnpm run typecheck`
  Next action: Convert runtime schema inventory into reviewed migration governance in a separate task.
- #11 Production deployment parity (High; partial)
  Proof required: Workflow unit tests and human-observed read-only production evidence; seeded smokes stay local/staging.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/unit/production-readiness-gate.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/deploy-production-workflow.spec.ts`, `pnpm run test:contracts`
  Next action: Keep production probes read-only and run seeded privacy smokes only locally or in staging.
- #12 OCR route-local validation shape (Medium; open)
  Proof required: OCR upload-limit and output-stability tests after shared validation alignment.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/api/ocr-extract-upload-limit-endpoint.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/deterministic-ocr-readiness.spec.ts`, `pnpm run test:deterministic-ingestion-report`
  Next action: Align OCR validation in a separate bounded route task without changing OCR output.
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
- #16 DB pool pressure evidence (Medium; open)
  Proof required: Staging-safe load evidence for pool max, latency, active connections, and dashboard observations.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/unit/runtime-tuning-config.spec.ts`, `pnpm run baseline:production-scale-local -- --dry-run`, `pnpm run operator:dashboard`
  Next action: Run bounded staging load and record sanitized DB pool observations.
- #17 Rate limiter write pressure (Medium; open)
  Proof required: Non-mutating or bounded synthetic rate-limit pressure proof with DB write metrics.
  Allowed commands: `pnpm run baseline:production-scale-local -- --dry-run`, `pnpm run operator:dashboard`, `pnpm run test:api`
  Next action: Add bounded synthetic pressure evidence with sanitized aggregate write-pressure signals.
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
  Proof required: Evidence report that records exact commands, skipped dashboard checks, and dashboard PASS limitation.
  Allowed commands: `pnpm run production-scale:evidence`, `pnpm run operator:dashboard`, `pnpm exec vitest run --config vitest.config.ts tests/unit/operator-regression-dashboard.spec.ts`
  Next action: Label release evidence by exact commands and skipped checks, not dashboard headline status.

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
  Proof required: Repeated measured local or staging load evidence with throughput, latency, queue, OCR, PDF, and DB observations.
  Allowed commands: `pnpm run baseline:production-scale-local -- --dry-run`, `pnpm run operator:dashboard`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-scale-harness.spec.ts`
  Next action: Collect bounded local or staging capacity evidence and label dry-run output SIMULATED.
- SIMULATED - #8 Response operations maturity (High; partial)
  Proof required: Soak, scheduler boundary, alert dry-run or exclusion, purge/archive, backfill, and remediation evidence.
  Allowed commands: `pnpm run response:soak-check`, `pnpm run response:orchestration-check`, `pnpm run response:worker-orchestrate -- --dry-run`, `pnpm run response:lifecycle -- --dry-run`, `pnpm run response:replay -- --dry-run`, `pnpm run operator:dashboard`
  Next action: Close one response-ops proof row at a time with deterministic synthetic or staging-safe evidence.
- SIMULATED - #9 Observability/alerting (High; partial)
  Proof required: Sanitized dashboard metrics plus external alert dry-run/mock proof or accepted exclusion.
  Allowed commands: `pnpm run operator:dashboard`, `pnpm run response:orchestration-check`, `pnpm exec vitest run --config vitest.config.ts tests/unit/operator-regression-dashboard.spec.ts`
  Next action: Add a mock alert dry-run or document a formal operator-monitoring exclusion.
- SIMULATED - #16 DB pool pressure evidence (Medium; open)
  Proof required: Staging-safe load evidence for pool max, latency, active connections, and dashboard observations.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/unit/runtime-tuning-config.spec.ts`, `pnpm run baseline:production-scale-local -- --dry-run`, `pnpm run operator:dashboard`
  Next action: Run bounded staging load and record sanitized DB pool observations.
- SIMULATED - #17 Rate limiter write pressure (Medium; open)
  Proof required: Non-mutating or bounded synthetic rate-limit pressure proof with DB write metrics.
  Allowed commands: `pnpm run baseline:production-scale-local -- --dry-run`, `pnpm run operator:dashboard`, `pnpm run test:api`
  Next action: Add bounded synthetic pressure evidence with sanitized aggregate write-pressure signals.

## Staging Evidence

- #2 Production ingest runtime (Critical; simulated-proof-only)
  Proof required: SIMULATED worker queue-drain proof now exists; bounded staging-safe queue-depth evidence is still required before any production-scoped activation.
  Allowed commands: `pnpm run ingest:worker:simulated-proof`, `pnpm run ingest:worker -- --dry-run --max-jobs 1 --concurrency 1`, `pnpm run staging:ingest-worker -- --dry-run`, `pnpm run operator:dashboard`, `pnpm run test:api`
  Next action: Use SIMULATED proof only for autonomous queue-drain guard coverage; record bounded staging worker queue-depth recovery evidence without production activation.
- #3 Load/concurrency proof (High; simulated-proof-only)
  Proof required: Repeated measured local or staging load evidence with throughput, latency, queue, OCR, PDF, and DB observations.
  Allowed commands: `pnpm run baseline:production-scale-local -- --dry-run`, `pnpm run operator:dashboard`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-scale-harness.spec.ts`
  Next action: Collect bounded local or staging capacity evidence and label dry-run output SIMULATED.
- #4 Packet PDF scaling (High; partial)
  Proof required: Packet PDF cache proof plus staging-safe cache-miss envelope evidence or a bounded render queue.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/unit/packet-pdf-cache.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/api/packet-lifecycle-endpoint.spec.ts`, `pnpm run test:golden-path`, `pnpm run operator:dashboard`
  Next action: Prove cache-miss behavior under bounded synthetic load or add a separate render queue.
- #6 Historical raw report bytes (High; partial)
  Proof required: Non-destructive inventory and remediation plan for old inline rows while new rows stay reference-based.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/api/evidence-privacy-endpoint.spec.ts`, `pnpm run test:api`, `pnpm run operator:dashboard`
  Next action: Create a sanitized inventory and reviewed remediation plan without moving data silently.
- #8 Response operations maturity (High; partial)
  Proof required: Soak, scheduler boundary, alert dry-run or exclusion, purge/archive, backfill, and remediation evidence.
  Allowed commands: `pnpm run response:soak-check`, `pnpm run response:orchestration-check`, `pnpm run response:worker-orchestrate -- --dry-run`, `pnpm run response:lifecycle -- --dry-run`, `pnpm run response:replay -- --dry-run`, `pnpm run operator:dashboard`
  Next action: Close one response-ops proof row at a time with deterministic synthetic or staging-safe evidence.
- #16 DB pool pressure evidence (Medium; open)
  Proof required: Staging-safe load evidence for pool max, latency, active connections, and dashboard observations.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/unit/runtime-tuning-config.spec.ts`, `pnpm run baseline:production-scale-local -- --dry-run`, `pnpm run operator:dashboard`
  Next action: Run bounded staging load and record sanitized DB pool observations.
- #17 Rate limiter write pressure (Medium; open)
  Proof required: Non-mutating or bounded synthetic rate-limit pressure proof with DB write metrics.
  Allowed commands: `pnpm run baseline:production-scale-local -- --dry-run`, `pnpm run operator:dashboard`, `pnpm run test:api`
  Next action: Add bounded synthetic pressure evidence with sanitized aggregate write-pressure signals.
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
  Proof required: Soak, scheduler boundary, alert dry-run or exclusion, purge/archive, backfill, and remediation evidence.
  Allowed commands: `pnpm run response:soak-check`, `pnpm run response:orchestration-check`, `pnpm run response:worker-orchestrate -- --dry-run`, `pnpm run response:lifecycle -- --dry-run`, `pnpm run response:replay -- --dry-run`, `pnpm run operator:dashboard`
  Next action: Close one response-ops proof row at a time with deterministic synthetic or staging-safe evidence.
- #9 Observability/alerting (High; partial)
  Proof required: Sanitized dashboard metrics plus external alert dry-run/mock proof or accepted exclusion.
  Allowed commands: `pnpm run operator:dashboard`, `pnpm run response:orchestration-check`, `pnpm exec vitest run --config vitest.config.ts tests/unit/operator-regression-dashboard.spec.ts`
  Next action: Add a mock alert dry-run or document a formal operator-monitoring exclusion.
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
  Proof required: Repeated measured local or staging load evidence with throughput, latency, queue, OCR, PDF, and DB observations.
  Allowed commands: `pnpm run baseline:production-scale-local -- --dry-run`, `pnpm run operator:dashboard`, `pnpm exec vitest run --config vitest.config.ts tests/unit/production-scale-harness.spec.ts`
  Next action: Collect bounded local or staging capacity evidence and label dry-run output SIMULATED.
- #4 Packet PDF scaling (High; partial)
  Proof required: Packet PDF cache proof plus staging-safe cache-miss envelope evidence or a bounded render queue.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/unit/packet-pdf-cache.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/api/packet-lifecycle-endpoint.spec.ts`, `pnpm run test:golden-path`, `pnpm run operator:dashboard`
  Next action: Prove cache-miss behavior under bounded synthetic load or add a separate render queue.
- #6 Historical raw report bytes (High; partial)
  Proof required: Non-destructive inventory and remediation plan for old inline rows while new rows stay reference-based.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/api/evidence-privacy-endpoint.spec.ts`, `pnpm run test:api`, `pnpm run operator:dashboard`
  Next action: Create a sanitized inventory and reviewed remediation plan without moving data silently.
- #7 Bureau communication storage (High; open)
  Proof required: Storage adapter proof for new bureau attachments plus compatibility proof for old records.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/api/evidence-privacy-endpoint.spec.ts`, `pnpm run test:api`, `pnpm run typecheck`
  Next action: Move bureau attachments to the existing storage adapter in a separate task.
- #8 Response operations maturity (High; partial)
  Proof required: Soak, scheduler boundary, alert dry-run or exclusion, purge/archive, backfill, and remediation evidence.
  Allowed commands: `pnpm run response:soak-check`, `pnpm run response:orchestration-check`, `pnpm run response:worker-orchestrate -- --dry-run`, `pnpm run response:lifecycle -- --dry-run`, `pnpm run response:replay -- --dry-run`, `pnpm run operator:dashboard`
  Next action: Close one response-ops proof row at a time with deterministic synthetic or staging-safe evidence.
- #9 Observability/alerting (High; partial)
  Proof required: Sanitized dashboard metrics plus external alert dry-run/mock proof or accepted exclusion.
  Allowed commands: `pnpm run operator:dashboard`, `pnpm run response:orchestration-check`, `pnpm exec vitest run --config vitest.config.ts tests/unit/operator-regression-dashboard.spec.ts`
  Next action: Add a mock alert dry-run or document a formal operator-monitoring exclusion.
- #10 Migration governance (High; partial)
  Proof required: Non-mutating migration inventory evidence now; reviewed ledger and drift gate later.
  Allowed commands: `pnpm run check:migrations`, `pnpm exec vitest run --config vitest.config.ts tests/unit/migration-checker.spec.ts`, `pnpm run typecheck`
  Next action: Convert runtime schema inventory into reviewed migration governance in a separate task.
- #11 Production deployment parity (High; partial)
  Proof required: Workflow unit tests and human-observed read-only production evidence; seeded smokes stay local/staging.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/unit/production-readiness-gate.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/deploy-production-workflow.spec.ts`, `pnpm run test:contracts`
  Next action: Keep production probes read-only and run seeded privacy smokes only locally or in staging.
- #12 OCR route-local validation shape (Medium; open)
  Proof required: OCR upload-limit and output-stability tests after shared validation alignment.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/api/ocr-extract-upload-limit-endpoint.spec.ts`, `pnpm exec vitest run --config vitest.config.ts tests/unit/deterministic-ocr-readiness.spec.ts`, `pnpm run test:deterministic-ingestion-report`
  Next action: Align OCR validation in a separate bounded route task without changing OCR output.
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
- #16 DB pool pressure evidence (Medium; open)
  Proof required: Staging-safe load evidence for pool max, latency, active connections, and dashboard observations.
  Allowed commands: `pnpm exec vitest run --config vitest.config.ts tests/unit/runtime-tuning-config.spec.ts`, `pnpm run baseline:production-scale-local -- --dry-run`, `pnpm run operator:dashboard`
  Next action: Run bounded staging load and record sanitized DB pool observations.
- #17 Rate limiter write pressure (Medium; open)
  Proof required: Non-mutating or bounded synthetic rate-limit pressure proof with DB write metrics.
  Allowed commands: `pnpm run baseline:production-scale-local -- --dry-run`, `pnpm run operator:dashboard`, `pnpm run test:api`
  Next action: Add bounded synthetic pressure evidence with sanitized aggregate write-pressure signals.
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
  Proof required: Evidence report that records exact commands, skipped dashboard checks, and dashboard PASS limitation.
  Allowed commands: `pnpm run production-scale:evidence`, `pnpm run operator:dashboard`, `pnpm exec vitest run --config vitest.config.ts tests/unit/operator-regression-dashboard.spec.ts`
  Next action: Label release evidence by exact commands and skipped checks, not dashboard headline status.

