# Production Scale Remediation Plan - 2026-05-22

Source audit Markdown: `production-at-scale-level-10-audit-2026-05-22.md`
Source audit JSON: `production-at-scale-level-10-audit-2026-05-22.json`
Repository: `C:\Users\webbd\Projects\creditregulatorpro-staging`
Source commit inspected: `cf43d47ca918adffb95cc6c4379ca0eb4474adbd`

Status: planning artifact only. This file does not close blockers, authorize production operations, or weaken readiness gates.

CERTIFYING:false

## Confirmed Audit State

- Overall audit status: FAIL.
- Production promotion: NOT SAFE.
- Staging promotion: SAFE WITH LIMITATIONS.
- Finding counts: P0 0, P1 6, P2 9, P3 3.
- Core packet, auth, ingestion, owner-scope, deterministic parser, evidence, and packet humanization tests are strong and must remain mandatory.
- Production must not be promoted until production promotion evidence is genuinely certifying true.

## Inspection Notes

The requested audit files were present and parsed. The current repo has these path differences from the task/audit wording:

- `scripts/restore-evidence-current-check.mjs` is not present. The current implementation is `scripts/staging-backup-restore-checklist.mjs`, exposed by `pnpm run restore:evidence:current-check`.
- `scripts/storage-raw-report-inventory.mjs` is not present. The current implementation is `scripts/storage-raw-report-inventory.ts`, exposed by `pnpm run storage:raw-report-inventory`.
- `scripts/check-staging-services.mjs` is not present. The current service diagnostic entry is `scripts/check-staging-services.sh`, exposed by `pnpm run check:staging-services`.

Relevant script/test surfaces inspected include `package.json`, production scale certification and promotion pack scripts, worker readiness and activation evidence scripts, restore evidence validation, storage raw-report inventory/remediation, response ops and alert dry-run evidence, promotion/rollback governance, migration governance, sensitive-list evidence, and packet/auth/evidence regression tests.

## Protected Boundary

Remediation must be bounded. Do not change parser truth, canonical extraction, evidence binding, violation detection, packet wording, auth/ownership checks, or packet readiness unless a later task explicitly approves that protected-system change and adds targeted tests.

No remediation task may:

- mutate production data from Codex
- run live production operations unless the existing script is read-only or dry-run by default
- print secrets, raw credit reports, signed URLs, PII, raw report bytes, or service credentials
- bypass readiness gates, auth, ownership checks, or production promotion evidence
- mark human-observed blockers closed without genuine operator evidence
- force push or delete existing evidence artifacts unless replacing them with stronger evidence

## Commit Sequence

1. `SEQ-01 Restore evidence acceptance`: close L10-P1-002 only with accepted human-observed restore and retention recoverability proof.
2. `SEQ-02 Production ingest runtime`: close L10-P1-003 only with sanitized bounded production queue-depth/operator proof.
3. `SEQ-03 Raw report storage remediation`: close L10-P1-004 with reliable sanitized inventory plus accepted remediation evidence.
4. `SEQ-04 Observability and response ops`: close L10-P1-005 and L10-P2-007 with live alert proof or accepted formal exclusion plus response ops evidence.
5. `SEQ-05 Migration governance`: close L10-P1-006 by converting temporary runtime ensure allowlist residuals into reviewed additive migrations or accepted non-mutating policy closure.
6. `SEQ-06 Harness and local command reliability`: close L10-P2-001, L10-P2-002, and L10-P2-003 without weakening tests.
7. `SEQ-07 Environment/operator diagnostics`: close L10-P2-004 and L10-P2-005 with read-only staging observability/service proof from an authorized environment.
8. `SEQ-08 Sensitive endpoint proof`: close L10-P2-009 with endpoint-level privacy contract tests and bounded hidden-risk aggregate/page semantics.
9. `SEQ-09 Remaining P2/P3 hardening`: address runtime-size warning policy, production-safe probe depth, CRLF cleanup, admin-only packet diagnostic proof, and command-friction docs.
10. `SEQ-10 Final certification`: rerun production scale evidence, certification, and promotion pack. Only then may L10-P1-001 close.

## P1 Blocker Map

### L10-P1-001 - Production Promotion Pack Is Non-Certifying

Severity: P1.

Affected scripts/files:

- `scripts/production-promotion-pack.mjs`
- `scripts/production-scale-evidence.mjs`
- `docs/production-scale/blocker-registry.json`
- `docs/production-scale/evidence/latest-production-promotion-pack.json`
- `tests/unit/production-promotion-pack.spec.ts`
- `tests/unit/production-scale-blocker-evidence.spec.ts`

Fix type: evidence and operator proof first; code only if current validators cannot accept genuine certifying artifacts.

Safe commands:

- `pnpm run production-scale:evidence`
- `pnpm run production-scale:promotion-pack`
- `pnpm exec vitest run --config vitest.config.ts tests/unit/production-promotion-pack.spec.ts tests/unit/production-scale-blocker-evidence.spec.ts`

Unsafe commands to avoid:

- `pnpm run promote:production` before `latest-production-promotion-pack.json` is genuinely `CERTIFYING:true`
- manual edits that flip `CERTIFYING`, readiness classification, or blocker classifications
- deleting non-certifying evidence instead of replacing it with stronger current evidence

Expected certifying evidence artifact:

- `docs/production-scale/evidence/latest-production-promotion-pack.json` with `CERTIFYING:true`, `readinessClassification.canPromoteProductionAtScale:true`, no unresolved production blockers, current target SHA, and references to accepted evidence for L10-P1-002 through L10-P1-006.

Tests to add/update:

- Promotion pack must fail if any six P1 closure artifacts are missing, stale, simulated-only, partial, or not current-head evidence.
- Promotion pack must validate the Level 10 audit closure set instead of relying on report prose.

Commit sequence: SEQ-10.

### L10-P1-002 - Disaster Recovery Proof Is Simulated-Only

Severity: P1.

Affected scripts/files:

- `scripts/staging-backup-restore-checklist.mjs`
- `docs/restore-drill-evidence-template.md`
- `docs/production-scale/evidence/latest-human-restore-drill-evidence-acceptance.json`
- `docs/production-scale/evidence/latest-restore-readiness-check.json`
- `tests/unit/staging-backup-restore-checklist.spec.ts`
- `scripts/production-promotion-pack.mjs`

Fix type: operator proof and evidence. Code changes only if current validator cannot represent genuine sanitized proof.

Safe commands:

- `pnpm run restore:accept-human-evidence`
- `pnpm run restore:evidence:current-check`
- `pnpm run check:restore-drill-evidence`
- `pnpm exec vitest run --config vitest.config.ts tests/unit/staging-backup-restore-checklist.spec.ts`

Unsafe commands to avoid:

- running a production dump/restore from Codex
- treating `pnpm run restore:drill:simulated` as production proof
- including backup contents, raw restored data, credentials, URLs, or PII in evidence

Expected certifying evidence artifact:

- `docs/production-scale/evidence/latest-human-restore-drill-evidence-acceptance.json` accepted true.
- `docs/production-scale/evidence/latest-restore-readiness-check.json` with `status:"current-human-observed"`, `currentOperationalProof:true`, `evidenceType:"HUMAN-OBSERVED"`, `simulatedOnly:false`, `stale:false`, and blocker coverage for disaster recovery and retention recoverability.

Tests to add/update:

- Keep rejection tests for simulated, stale, missing RPO/RTO, missing post-restore checks, placeholders, secrets, PII, raw report data, and signed URLs.
- Add promotion-pack coverage that refuses stale accepted evidence.

Commit sequence: SEQ-01.

### L10-P1-003 - Production Ingest Runtime Proof Is Not Accepted

Severity: P1.

Affected scripts/files:

- `scripts/production-worker-readiness-evidence.mjs`
- `scripts/production-worker-activation-evidence.mjs`
- `scripts/ingest-processing-worker.ts`
- `.github/workflows/deploy-production.yml`
- `docs/production-scale/evidence/production-worker-queue-depth-evidence.json`
- `docs/production-scale/evidence/latest-production-worker-readiness.json`
- `tests/unit/production-worker-readiness-evidence.spec.ts`
- `tests/unit/production-worker-activation-evidence.spec.ts`

Fix type: operator proof and evidence, with code only for validator gaps.

Safe commands:

- `pnpm run production-worker:activation-evidence`
- `pnpm run production-worker:readiness-evidence`
- `pnpm exec vitest run --config vitest.config.ts tests/unit/production-worker-readiness-evidence.spec.ts tests/unit/production-worker-activation-evidence.spec.ts`

Unsafe commands to avoid:

- running `pnpm run ingest:worker --apply` against production from Codex
- using staging queue drain evidence as production runtime proof
- bypassing workflow inputs, operator acknowledgement, max-job limits, failure stop behavior, or rollback stop verification

Expected certifying evidence artifact:

- `docs/production-scale/evidence/production-worker-queue-depth-evidence.json` with sanitized operator fields: apply mode, operator production run completed, queue depth before/after, processed count, failure count 0, dead-letter count, workflow parity, rollback stop verified, and signed acknowledgement.
- `docs/production-scale/evidence/latest-production-worker-readiness.json` with `productionProof:true` and blocker coverage for production ingest runtime.

Tests to add/update:

- Accepted queue-depth evidence must be required for blocker 2.
- Dry-run, staging-only, failure, missing acknowledgement, or missing rollback stop proof must remain non-certifying.

Commit sequence: SEQ-02.

### L10-P1-004 - Historical Raw Report Byte Remediation Remains Unresolved

Severity: P1.

Affected scripts/files:

- `scripts/storage-raw-report-inventory.ts`
- `scripts/storage-raw-report-remediation-plan.mjs`
- `docs/report-artifact-storage.md`
- `docs/production-scale/evidence/latest-storage-raw-report-inventory.json`
- `docs/production-scale/evidence/latest-storage-raw-report-remediation-plan.json`
- `docs/production-scale/evidence/storage-raw-report-remediation-acceptance-evidence.json`
- `tests/unit/storage-raw-report-inventory.spec.ts`
- `tests/unit/storage-raw-report-remediation-plan.spec.ts`

Fix type: evidence and operator proof; code only if reliable sanitized inventory cannot be collected through existing scripts.

Safe commands:

- `pnpm run storage:raw-report-inventory`
- `pnpm run storage:raw-report-remediation-plan`
- `pnpm run storage:raw-report-remediation-acceptance`
- `pnpm exec vitest run --config vitest.config.ts tests/unit/storage-raw-report-inventory.spec.ts tests/unit/storage-raw-report-remediation-plan.spec.ts`

Unsafe commands to avoid:

- direct production DB deletes/updates from Codex
- mutation flags such as `--apply`, `--execute`, `--mutate`, or custom SQL remediation from this session
- printing `storageUrl` values, raw base64, raw PDFs, signed URLs, database URLs, or consumer identifiers

Expected certifying evidence artifact:

- `latest-storage-raw-report-inventory.json` with reachable DB and reliable aggregate counts.
- `latest-storage-raw-report-remediation-plan.json` with governed dry-run plan based on reliable inventory.
- `latest-storage-raw-report-remediation-acceptance.json` accepted true and `blockerCoverage.historicalRawReportBytes:true`.

Tests to add/update:

- Inventory unavailable must not imply zero inline rows.
- Acceptance must reject simulated proof, missing operator approval, unreliable inventory, raw sensitive values, secrets, and PII.

Commit sequence: SEQ-03.

### L10-P1-005 - Observability And Alerting Proof Is Not Accepted

Severity: P1.

Affected scripts/files:

- `scripts/response-ops-readiness-evidence.mjs`
- `scripts/alerts-dry-run.mjs`
- `scripts/staging-observability-check.mjs`
- `docs/production-scale/alerting-exclusion-template.md`
- `docs/production-scale/evidence/latest-alerting-exclusion-validation.json`
- `docs/production-scale/evidence/latest-alerts-dry-run.json`
- `docs/production-scale/evidence/latest-response-ops-readiness.json`
- `tests/unit/response-ops-readiness-evidence.spec.ts`
- `tests/unit/alerts-dry-run.spec.ts`
- `tests/unit/staging-observability-check.spec.ts`

Fix type: evidence and operator proof. Code only if an accepted formal exclusion or live proof cannot be represented.

Safe commands:

- `pnpm run alerts:dry-run`
- `pnpm run alerts:exclusion:validate`
- `pnpm run response-ops:readiness-evidence`
- `pnpm run check:staging-observability` only from an authorized read-only staging environment
- `pnpm exec vitest run --config vitest.config.ts tests/unit/response-ops-readiness-evidence.spec.ts tests/unit/alerts-dry-run.spec.ts tests/unit/staging-observability-check.spec.ts`

Unsafe commands to avoid:

- sending live external alerts from Codex without explicit approved operator action
- treating dry-run alerts as live proof
- printing webhook URLs, Slack/email provider secrets, SSH keys, raw logs with PII, or tokens

Expected certifying evidence artifact:

- Either `docs/production-scale/evidence/live-alert-proof.json` accepted by `latest-response-ops-readiness.json`, or `latest-alerting-exclusion-validation.json` accepted true with signed formal exclusion.
- `latest-response-ops-readiness.json` with `alerting.status` of `live-evidenced` or `formally-excluded` and `blockerCoverage.observabilityAlerting:true`.

Tests to add/update:

- Formal exclusion must require scope, reason, risk acceptance, review/expiry, human monitoring path, dry-run-not-live acknowledgement, and signed operator acknowledgement.
- Promotion pack must not close blocker 9 with dry-run-only evidence.

Commit sequence: SEQ-04.

### L10-P1-006 - Migration Governance Still Depends On A Temporary Allowlist

Severity: P1.

Affected scripts/files:

- `scripts/migration-gate.mjs`
- `scripts/check-migrations.mjs`
- `docs/production-scale/migration-governance-policy.json`
- `migrations/0000-runtime-schema-inventory.md`
- reviewed additive migration files added later one subsystem at a time
- `docs/production-scale/evidence/latest-migration-gate.json`
- `docs/production-scale/evidence/latest-migration-governance.json`
- `tests/unit/migration-gate.spec.ts`
- `tests/unit/migration-checker.spec.ts`

Fix type: code, migration governance, and evidence. This is protected-system work and must be explain-before-edit in a later task.

Safe commands:

- `pnpm run check:migrations`
- `pnpm run migrations:evidence`
- `pnpm run migrations:gate`
- `pnpm exec vitest run --config vitest.config.ts tests/unit/migration-gate.spec.ts tests/unit/migration-checker.spec.ts`

Unsafe commands to avoid:

- running production DDL from Codex
- removing temporary allowlist entries before reviewed additive migrations or accepted policy closure exists
- changing `CERTIFYING` to true while temporary allowlist residuals remain active
- adding unreviewed schema ensures or ad hoc migrations

Expected certifying evidence artifact:

- `docs/production-scale/evidence/latest-migration-gate.json` with `status:"accepted-release-blocking"`, `CERTIFYING:true`, `temporaryAllowlistActive:false`, `releaseBlockingFindings:0`, `blockerCoverage.migrationGovernance:true`, and non-mutating safety fields true.

Tests to add/update:

- Converted runtime ensure paths must be ledgered and migration-backed.
- Gate must fail for unknown, unledgered, invalid allowlist, expired allowlist, schema mutation, production mutation, or DDL execution signals.

Commit sequence: SEQ-05.

## Highest-Impact P2 Blocker Map

### L10-P2-001 - Production Certification Harness Is Not Self-Contained

Severity: P2.

Affected scripts/files:

- `scripts/production-scale-certification.mjs`
- `scripts/staging-auth-workflow-smoke.ts`
- `scripts/staging-auth-packet-workflow-smoke.ts`
- `docs/production-scale/evidence/latest-production-scale-certification.json`
- `tests/unit/production-scale-certification.spec.ts`

Fix type: code and evidence documentation.

Safe commands:

- `pnpm run production-scale:certify`
- `pnpm run smoke:auth-workflow`
- `pnpm run smoke:auth-workflow:packet`
- `pnpm exec vitest run --config vitest.config.ts tests/unit/production-scale-certification.spec.ts`

Unsafe commands to avoid:

- embedding staging credentials or secrets in the repo
- downgrading auth smoke gates to optional pass
- treating missing environment as app auth failure

Expected certifying evidence artifact:

- `latest-production-scale-certification.json` with auth smokes either passed under supplied staging-safe env or explicitly failing with actionable missing-env diagnostics, not ambiguous harness failure.

Tests to add/update:

- Harness env handling must be self-contained through documented, non-secret input plumbing.
- Required gates must remain required.

Commit sequence: SEQ-06.

### L10-P2-002 - `pnpm run check` Times Out Rollback Governance Tests Locally

Severity: P2.

Affected scripts/files:

- `tests/unit/deploy-rollback-sha-governance.spec.ts`
- `scripts/deploy-rollback-sha-governance.mjs`
- `vitest.config.ts`
- `docs/production-scale/evidence/latest-rollback-sha-governance.json`

Fix type: code/test reliability.

Safe commands:

- `pnpm exec vitest run --config vitest.config.ts tests/unit/deploy-rollback-sha-governance.spec.ts --testTimeout=60000`
- `pnpm run deploy:rollback-sha-governance -- --write-evidence --json`
- `pnpm run check` after the bounded timeout/optimization fix

Unsafe commands to avoid:

- deleting rollback SHA governance assertions
- skipping shell block validation without an equivalent static proof
- widening deploy permissions or weakening rollback validation

Expected certifying evidence artifact:

- Local `pnpm run check` passes without a rollback governance timeout, and rollback governance evidence remains passed.

Tests to add/update:

- Add suite-specific timeout or optimize static workflow/bash validation while keeping assertions intact.

Commit sequence: SEQ-06.

### L10-P2-003 - Missing Lint/Test Command Aliases

Severity: P2.

Affected scripts/files:

- `package.json`
- package-script assertion tests added later if needed

Fix type: code/package metadata.

Safe commands:

- `pnpm run lint`
- `pnpm test`
- `pnpm run test:unit`

Unsafe commands to avoid:

- mapping aliases to no-op commands
- replacing existing canonical test commands with weaker aliases

Expected certifying evidence artifact:

- `package.json` exposes real aliases, for example `test` delegating to `test:unit` and `lint` delegating to an existing static check or a deliberately added linter.

Tests to add/update:

- Add or extend package script tests to assert aliases point at real commands.

Commit sequence: SEQ-06.

### L10-P2-004 - Staging Observability SSH Proof Cannot Run From This Environment

Severity: P2.

Affected scripts/files:

- `scripts/staging-observability-check.mjs`
- `tests/unit/staging-observability-check.spec.ts`
- `docs/production-scale/evidence/` future staging observability artifact

Fix type: environment/operator proof, plus code if durable evidence output is needed.

Safe commands:

- `pnpm run check:staging-observability` with `CRP_STAGING_OBSERVABILITY_CHECK=true` from an authorized read-only staging access path
- `pnpm run check:staging-observability -- --source log-file --log-file <sanitized-log-file>` for sanitized offline evidence
- `pnpm exec vitest run --config vitest.config.ts tests/unit/staging-observability-check.spec.ts`

Unsafe commands to avoid:

- using production host targets
- changing server config, Traefik, Docker, Postgres, secrets, or production containers
- printing raw logs that may contain PII or credentials

Expected certifying evidence artifact:

- A future `docs/production-scale/evidence/latest-staging-observability.json` or attached sanitized operator artifact with read-only source, accepted HTTP checks, accepted log thresholds, raw logs excluded, secrets redacted, and production hosts refused.

Tests to add/update:

- Evidence writer should preserve current read-only and redaction guarantees if added.

Commit sequence: SEQ-07.

### L10-P2-005 - Local Docker Daemon Unavailable For Service Diagnostics

Severity: P2.

Affected scripts/files:

- `scripts/check-staging-services.sh`
- future service diagnostic evidence wrapper, if needed

Fix type: environment/operator proof, plus code if a portable evidence wrapper is added.

Safe commands:

- `pnpm run check:staging-services` from an environment with Docker access to the staging service
- `docker ps -a` read-only diagnostics
- `docker logs --tail=500 creditregulatorpro-staging` read-only diagnostics

Unsafe commands to avoid:

- `docker compose up`, `down`, `rm`, `restart`, or container mutation from this bounded remediation map task
- editing staging/proxy/Postgres/production config
- exposing environment variables or service credentials

Expected certifying evidence artifact:

- Sanitized service diagnostics showing expected staging containers, health, recent log tail classification, no raw secrets, and no mutation.

Tests to add/update:

- If converted to a script, add tests for Docker-unavailable reporting and secret/log redaction.

Commit sequence: SEQ-07.

### L10-P2-007 - Response Operations Are Operator-Ready With Deferred Live Controls

Severity: P2.

Affected scripts/files:

- `scripts/response-ops-readiness-evidence.mjs`
- `scripts/response-processing-worker-orchestrator.ts`
- `scripts/response-processing-replay.ts`
- `scripts/response-processing-lifecycle.ts`
- `scripts/response-processing-soak-check.ts`
- `tests/unit/response-ops-readiness-evidence.spec.ts`

Fix type: evidence and operator proof.

Safe commands:

- `pnpm run response-ops:readiness-evidence`
- `pnpm run response:soak-check`
- `pnpm run operator:dashboard`
- `pnpm run response:worker-orchestrate -- --dry-run`
- `pnpm run response:replay -- --dry-run`
- `pnpm run response:lifecycle -- --dry-run`

Unsafe commands to avoid:

- enabling live scheduler from Codex
- running apply/backfill/purge/archive without approved operator window and dry-run evidence
- treating dashboard PASS while SKIP/HUMAN_REQUIRED rows remain as release proof

Expected certifying evidence artifact:

- `latest-response-ops-readiness.json` with response operations maturity accepted, live controls either proven under approved operator evidence or explicitly excluded/limited with current dashboard and soak evidence.

Tests to add/update:

- Preserve SKIP/SIMULATED/HUMAN_REQUIRED semantics.
- Require exact commands and do not allow dashboard pass alone to close release evidence.

Commit sequence: SEQ-04.

### L10-P2-009 - Sensitive List Endpoint Proof Is Partial/Design-Only

Severity: P2.

Affected scripts/files:

- `scripts/sensitive-list-endpoints-evidence.mjs`
- `endpoints/parser-test-case/list_GET.ts`
- `endpoints/parser-test-case/list_GET.schema.ts`
- `endpoints/consumer-signature/list_GET.ts`
- `endpoints/consumer-signature/list_GET.schema.ts`
- `endpoints/hidden-risk/list_GET.ts`
- `tests/unit/sensitive-list-endpoints-evidence.spec.ts`
- endpoint-level privacy/API tests added later

Fix type: code and tests.

Safe commands:

- `pnpm run sensitive-list-endpoints:evidence`
- `pnpm exec vitest run --config vitest.config.ts tests/unit/sensitive-list-endpoints-evidence.spec.ts`
- `pnpm exec vitest run --config vitest.config.ts tests/api/evidence-privacy-endpoint.spec.ts tests/contracts/route-auth-classification.spec.ts`

Unsafe commands to avoid:

- adding blind row limits that change aggregate semantics
- returning raw extracted text, signature data, storage URLs, signed URLs, or raw snippets from list endpoints
- weakening owner/admin boundaries

Expected certifying evidence artifact:

- `latest-sensitive-list-endpoints.json` no longer `partial-design-only` for hidden-risk semantics, plus endpoint-level tests proving metadata-only list responses and bounded aggregate/page contracts.

Tests to add/update:

- Parser-test and consumer-signature list privacy contracts.
- Hidden-risk aggregate totals remain full-set while row results are bounded and paginated.

Commit sequence: SEQ-08.

## Tracked Lower-Priority Findings

### L10-P2-006 - Runtime Size Warnings Remain Accepted By Waiver

Keep as SEQ-09. Use `pnpm run report:runtime-size`, `pnpm run check:runtime-size`, and `pnpm exec vitest run --config vitest.config.ts tests/unit/runtime-size-report-script.spec.ts tests/unit/runtime-size-policy-acceptance.spec.ts`. Do not turn warning-only policy into a hard gate without performance evidence and release owner approval.

### L10-P2-008 - Production-Safe Probes Are Plan-Only

Keep as SEQ-09 unless production-read-only probe policy is approved earlier. Safe command is `pnpm run production-safe-probes:evidence` in its current plan-only form. Do not run live production probes from Codex unless an existing command is explicitly read-only/dry-run and authorized.

### L10-P3-001 - Generated Evidence Files Trigger CRLF Warnings

Keep as SEQ-09 cleanup. Normalize line endings only for generated evidence replacement files and verify with `git diff --check`.

### L10-P3-002 - Admin Packet Page Mentions Render/Cache Internals

Keep admin diagnostics gated. If addressed, add a normal-user full-page assertion before touching copy. Do not change packet truth or evidence wording.

### L10-P3-003 - Safety-Flag Refusal Messages Add Command Friction

Document exact safe command variants. Do not remove explicit safety flags from production-scale harnesses.

## Verification Commands For This Map

Run after creating these planning artifacts:

- `git status --short --branch`
- `git diff --check`
- `pnpm run typecheck`
- `pnpm run build`
- `pnpm exec vitest run --config vitest.config.ts tests/unit/deploy-rollback-sha-governance.spec.ts --testTimeout=60000`
- Existing Level 10 audit JSON validation tests: none found by repository search. Validate this plan JSON with `node -e "JSON.parse(require('fs').readFileSync('production-scale-remediation-plan-2026-05-22.json','utf8')); JSON.parse(require('fs').readFileSync('production-at-scale-level-10-audit-2026-05-22.json','utf8')); console.log('json ok')"`
