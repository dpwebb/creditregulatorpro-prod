# Leftover Blocker Closure Audit

Generated at: 2026-05-21T00:24:11.292Z
Source promotion pack: `docs/production-scale/evidence/latest-production-promotion-pack.json`
Source promotion pack generated at: 2026-05-21T00:23:57.777Z
Branch: `staging`
Commit: `16ff7ee53f6ec16c1d8db24d4209b699f36a5729`
Readiness: **limited beta**
Can promote production-at-scale: no

## Summary

- Total blockers: 25
- Remaining blockers: 9
- Remaining production blockers: 5
- Remaining scale blockers: 0
- Human-required blockers: 3
- Simulated-only blockers: 1
- Waived blockers: 2
- Dashboard SKIP count: 55
- Dashboard SKIP treated as PASS: no

## Command Results

- pnpm run production-scale:evidence: evidence-file-present; latest=2026-05-21T00:23:44.532Z
- pnpm run production-scale:promotion-pack: reference-required
- pnpm run operator:dashboard: reference-required
- pnpm run typecheck: reference-required
- git diff --check: reference-required

## Optional Evidence Command Results

- pnpm run restore:evidence:current-check: evidence-file-present; status=simulated-only; latest=2026-05-21T00:19:58.813Z
- pnpm run ingest:worker:staging-evidence: evidence-file-present; status=accepted-staging-queue-drain; latest=2026-05-21T00:20:22.209Z
- pnpm run production-worker:activation-evidence: evidence-file-present; status=prepared-default-off; latest=2026-05-21T00:19:58.836Z
- pnpm run production-deployment-parity:evidence: evidence-file-present; status=accepted-production-deployment-parity; latest=2026-05-21T00:19:58.836Z
- pnpm run response-ops:readiness-evidence: evidence-file-present; status=operator-ready-with-deferred-controls; latest=2026-05-21T00:20:11.502Z
- pnpm run migrations:gate: evidence-file-present; status=accepted-formal-waiver; latest=2026-05-21T00:20:18.719Z
- pnpm run baseline:production-scale-measured -- --local: evidence-file-present; status=passed; latest=2026-05-21T00:20:40.403Z
- pnpm run runtime-size:policy-acceptance: evidence-file-present; status=accepted-warning-only-waiver; latest=2026-05-21T00:20:18.797Z
- pnpm run storage:raw-report-remediation-plan: evidence-file-present; status=inventory-unreliable; latest=2026-05-21T00:20:18.909Z
- pnpm run storage:raw-report-remediation-acceptance: evidence-file-present; status=not-submitted; latest=2026-05-21T00:20:40.418Z

## Prior Leftover Blockers

- #1 Disaster recovery: human proof required
- #2 Production ingest runtime: partial
- #6 Historical raw report bytes: human proof required
- #8 Response operations maturity: fixed with automated evidence
- #9 Observability/alerting: simulated proof only
- #10 Migration governance: waived with explicit reason; waiver=Runtime ensure residuals are formally policy-waived until reviewed additive migration ledger cutover completes; migrations:gate still fails closed for unknown, missing, unledgered, or unapproved schema mutation sources.
- #11 Production deployment parity: fixed with automated evidence
- #20 Production-safe privacy probe depth: fixed with staging evidence
- #21 Ingest observability release gating: fixed with automated evidence
- #22 Retention archive/restore proof: human proof required
- #3 Load/concurrency proof: fixed with automated evidence
- #16 DB pool pressure evidence: fixed with automated evidence
- #17 Rate limiter write pressure: fixed with automated evidence
- #18 Runtime-size gates: waived with explicit reason; waiver=Runtime-size policy remains warning-only under a formal limited-beta waiver with governed WARN rows; no dependency, chunking, build behavior, or OCR/PDF changes were made.

## Remaining Blockers

- #1 Disaster recovery: human proof required
  - Missing evidence: Filled sanitized human-observed restore drill evidence proving RPO/RTO, auth/session, packet PDF, response queue, cleanup/lifecycle, rollback/cleanup, and signed operator acknowledgement.
  - Required command/artifact: `pnpm run restore:accept-human-evidence`; artifacts: `docs/production-scale/evidence/human-restore-drill-evidence.md`, `docs/production-scale/evidence/human-restore-drill-evidence.json`
  - Closure path: operator action required
- #2 Production ingest runtime: partial
  - Missing evidence: Accepted operator production queue-depth before/after evidence for a bounded production ingest worker run; simulated worker proof is not production runtime proof.
  - Required command/artifact: `pnpm run production-worker:readiness-evidence`; artifacts: `docs/production-scale/evidence/production-worker-queue-depth-evidence.md`, `docs/production-scale/evidence/production-worker-queue-depth-evidence.json`
  - Closure path: operator action required
- #6 Historical raw report bytes: human proof required
  - Missing evidence: Sanitized operator acceptance showing inventory ran, remediation plan was approved, remediation was performed by operator/approved process, old inline compatibility was tested, post-remediation counts were recorded, and backup/restore prerequisite was acknowledged.
  - Required command/artifact: `pnpm run storage:raw-report-remediation-acceptance`; artifacts: `docs/production-scale/evidence/storage-raw-report-remediation-acceptance-evidence.md`, `docs/production-scale/evidence/storage-raw-report-remediation-acceptance-evidence.json`
  - Closure path: operator action required
- #9 Observability/alerting: simulated proof only
  - Missing evidence: Live external alert proof or accepted formal alert exclusion. Existing alert evidence is dry-run/simulated only.
  - Required command/artifact: `pnpm run alerts:exclusion:validate`, `pnpm run response:ops-readiness-evidence`; artifacts: `docs/production-scale/evidence/alerting-exclusion-evidence.md`, `docs/production-scale/evidence/alerting-exclusion-evidence.json`, `docs/production-scale/evidence/live-alert-proof.md`, `docs/production-scale/evidence/live-alert-proof.json`
  - Closure path: operator action required
- #15 Hidden-risk list semantics: partial
  - Missing evidence: Design/evidence artifact for hidden-risk aggregate semantics, stale-suppression semantics, and a separate bounded pagination plan that does not change aggregate truth.
  - Required command/artifact: `pnpm run sensitive-list-endpoints:evidence`, `pnpm exec vitest run --config vitest.config.ts tests/api/high-growth-list-limits.spec.ts`; artifacts: none
  - Closure path: Codex can close in a separate scoped evidence task
- #19 Heavy PDF/OCR dependencies: partial
  - Missing evidence: Accepted heavy PDF/OCR dependency governance tying runtime-size WARN/WAIVED baseline to deterministic OCR/parser regression proof for any future dependency or Docker package change.
  - Required command/artifact: `pnpm run report:runtime-size`, `pnpm run check:runtime-size`, `pnpm exec vitest run --config vitest.config.ts tests/unit/deterministic-ocr-readiness.spec.ts`; artifacts: none
  - Closure path: Codex can close in a separate scoped evidence task
- #22 Retention archive/restore proof: human proof required
  - Missing evidence: Human-observed physical retention archive/restore lifecycle evidence or accepted explicit retention exclusion. Simulated retention proof is not physical recoverability proof.
  - Required command/artifact: `pnpm run retention:archive-restore:simulated`, `pnpm run restore:accept-human-evidence`; artifacts: `docs/production-scale/evidence/human-restore-drill-evidence.md`, `docs/production-scale/evidence/human-restore-drill-evidence.json`
  - Closure path: operator action required
- #23 Public routes inventory risk: partial
  - Missing evidence: Executable route auth contract proof that public legacy handlers remain classified, retired public routes stay reset/410, and public inventory changes require explicit test updates.
  - Required command/artifact: `pnpm run test:contracts`, `pnpm run production-safe-probes:evidence`; artifacts: none
  - Closure path: Codex can close in a separate scoped evidence task
- #24 Documentation drift: partial
  - Missing evidence: Stale audit/tracker reference cleanup and aligned promotion-pack evidence after the latest commit, with blocker data still matching the controlling audit.
  - Required command/artifact: `pnpm run production-scale:evidence`, `pnpm run production-scale:promotion-pack`, `git diff --check`; artifacts: none
  - Closure path: Codex can close in a separate scoped evidence task

## Missing Evidence Files

- `docs/production-scale/evidence/human-restore-drill-evidence.md`
- `docs/production-scale/evidence/human-restore-drill-evidence.json`
- `docs/production-scale/evidence/production-worker-queue-depth-evidence.json`
- `docs/production-scale/evidence/production-worker-queue-depth-evidence.md`
- `docs/production-scale/evidence/storage-raw-report-remediation-acceptance-evidence.json`
- `docs/production-scale/evidence/storage-raw-report-remediation-acceptance-evidence.md`
- `docs/production-scale/evidence/alerting-exclusion-evidence.json`
- `docs/production-scale/evidence/alerting-exclusion-evidence.md`
- `docs/production-scale/evidence/live-alert-proof.json`
- `docs/production-scale/evidence/live-alert-proof.md`

## Safety

- Production data mutated: no
- Live providers used: no
- Real PII used: no
- Simulated proof promoted to production proof: no
- Staging proof promoted to production proof: no
- Dashboard SKIP treated as PASS: no
- Production-at-scale claimed with open blockers: no
- Evidence boundary: SIMULATED and staging-only evidence are tracked as evidence, but are not promoted to production proof.
