# Production-Scale Evidence Framework

This directory tracks the Top 25 production-at-scale blockers from `docs/production-at-scale-maximum-audit.md`.

Run:

```bash
pnpm run production-scale:evidence
```

The command validates `docs/production-scale/blocker-registry.json` against the controlling audit and writes:

- `docs/production-scale/evidence/latest-production-scale-evidence.md`
- `docs/production-scale/evidence/latest-production-scale-evidence.json`

The command is evidence/reporting only. It fails closed in production-like environments, does not mutate production, does not use real consumer PII, and does not connect to live external providers.

## Status Values

- `open`: blocker has no accepted proof yet.
- `partial`: some bounded evidence or implementation exists, but the blocker remains unresolved.
- `fixed`: blocker may be marked fixed only with recognized automated evidence or an explicit human-proof requirement.
- `simulated-proof-only`: only SIMULATED local/staging-safe evidence exists; this is not production proof.
- `staging-proof-only`: staging-safe evidence exists or is required; this is not production proof.
- `requires-human-proof`: a human-observed, sanitized proof artifact is required.
- `waived`: blocker is intentionally waived with explicit governance evidence.

## Evidence Categories

- Automated local evidence is deterministic local command output such as unit/API/contract checks.
- SIMULATED evidence is synthetic, local, or staging-safe and must never be represented as production proof.
- Staging evidence must use synthetic records, bounded workflows, and no live external provider delivery.
- Read-only production evidence must be human-observed, sanitized, and non-mutating.
- Human-observed evidence is required for restore, retention recoverability, and production probe claims that Codex must not perform directly.

Dashboard PASS alone is not release evidence. Dashboard `SKIP` rows remain visible in the generated report and cannot be treated as PASS.

The operator dashboard distinguishes `PASS`, `FAIL`, `SKIP`, `SIMULATED`, and `HUMAN_REQUIRED`. Release evidence must record exact commands and cannot promote `SIMULATED` or `HUMAN_REQUIRED` rows to production proof.

## Production Promotion Pack

Run:

```bash
pnpm run production-scale:promotion-pack
```

Outputs:

- `docs/production-scale/evidence/latest-production-promotion-pack.md`
- `docs/production-scale/evidence/latest-production-promotion-pack.json`

The promotion pack consolidates the blocker registry, latest generated evidence files, required command references, skipped dashboard checks, simulated proof-only blockers, staging-only proof, human-required proof, waivers, and unresolved production/scale blockers.

Readiness classification is evidence-bound:

- `limited beta`: critical/high, simulated-only, human-required, partial, or open blockers remain.
- `broader production`: no critical/high unresolved blocker remains, but production-at-scale evidence is still incomplete.
- `production-at-scale`: every blocker is fixed with accepted evidence or explicitly waived with an approved reason.

Codex must not promote the classification beyond the evidence in the pack. SIMULATED evidence is not production proof, dashboard PASS alone is not release evidence when SKIP rows exist, and production activation requires explicit operator approval.

## Production-Safe Probe Evidence

Run:

```bash
pnpm run production-safe-probes:evidence
```

Outputs:

- `docs/production-scale/evidence/latest-production-safe-probes.md`
- `docs/production-scale/evidence/latest-production-safe-probes.json`

The runtime production probe plan is read-only: only `GET` and `HEAD` requests may be executed against a production-like target. Cron-token denials, webhook unsigned/invalid denials, and retired public reset routes are POST-capable surfaces, so this evidence records them as static route-contract proof only and does not execute those POSTs against production.

The report records branch, commit, target host, exact probe groups, static rejection contracts, body-scan status for unauthenticated runtime responses, and explicit safety statements that no production fixtures are created, no production data is mutated, no production worker is activated, and no live external provider is called.

## Local/Staging Owner-Denial Smoke

Run:

```bash
pnpm run staging-owner-denial-smoke:evidence
```

Outputs:

- `docs/production-scale/evidence/latest-staging-owner-denial-smoke.md`
- `docs/production-scale/evidence/latest-staging-owner-denial-smoke.json`

This is `LOCAL/STAGING SYNTHETIC ONLY` evidence. It uses synthetic owner A, owner B, support, and admin fixtures to prove owner B cannot read owner A case, evidence, report artifact, packet, packet PDF, or response-related records, and that admin-only routes remain admin-only. It is not production proof and must not create production fixtures.

## Simulated Restore Drill

Run:

```bash
pnpm run restore:drill:simulated
```

Outputs:

- `docs/production-scale/evidence/latest-restore-drill-simulated.md`
- `docs/production-scale/evidence/latest-restore-drill-simulated.json`

These files are `SIMULATED` evidence only. They use synthetic backup metadata, synthetic restore target metadata, and local temp-state labels. They do not access production backups, do not restore production dumps, do not mutate production data, and do not connect to live providers.

The disaster recovery blocker remains open until a human-observed restore drill produces signed, sanitized evidence with RPO/RTO, post-restore auth/session, packet PDF, response queue, cleanup/lifecycle, and operator acknowledgement results.

## Human Restore Evidence Acceptance

Run:

```bash
pnpm run restore:accept-human-evidence
```

The command looks for a filled, sanitized human-observed evidence artifact at:

- `docs/production-scale/evidence/human-restore-drill-evidence.md`
- `docs/production-scale/evidence/human-restore-drill-evidence.json`

It writes:

- `docs/production-scale/evidence/latest-human-restore-drill-evidence-acceptance.md`
- `docs/production-scale/evidence/latest-human-restore-drill-evidence-acceptance.json`

If no human evidence artifact has been submitted, the command reports `not-submitted`, accepts no proof, and closes no blockers. If an artifact is present, it must include operator identity or role, date/time, environment, backup source, restore target, RPO/RTO results, post-restore auth/session, packet PDF, response queue, cleanup/lifecycle, retention archive/restore or explicit retention exclusion, rollback/cleanup, signed operator acknowledgement, and an explicit sanitized-evidence statement.

The validator rejects placeholders, SIMULATED-only evidence submitted as human proof, secrets, tokens, private keys, database URLs, raw PII, raw report text, raw base64, access keys, signed URLs, and production completion claims without signed operator acknowledgement. Promotion-pack logic may classify blocker 1 or blocker 22 as evidence-closed only when this strict acceptance result is present and accepted.

## SIMULATED Retention Archive/Restore

Run:

```bash
pnpm run retention:archive-restore:simulated
```

Outputs:

- `docs/production-scale/evidence/latest-retention-archive-restore-simulated.md`
- `docs/production-scale/evidence/latest-retention-archive-restore-simulated.json`

These files are `SIMULATED` evidence only. They use synthetic retention records, simulate retention preview, simulate archive marker/write, simulate restore verification, and verify synthetic audit events and apply-guard markers. They do not purge production data, do not write a physical archive, do not restore production data, do not change retention windows, and do not enable destructive retention.

Destructive retention apply remains guarded by existing preview defaults and explicit confirmation. Physical archive/restore lifecycle evidence remains required for production recoverability. Disaster recovery restore-drill proof is separate and still requires human-observed, signed, sanitized evidence.

## Simulated Ingest Worker Queue Drain

Run:

```bash
pnpm run ingest:worker:simulated-proof
```

Outputs:

- `docs/production-scale/evidence/latest-ingest-worker-simulated.md`
- `docs/production-scale/evidence/latest-ingest-worker-simulated.json`

These files are `SIMULATED` evidence only. They use synthetic in-memory queue jobs, mocked worker dependencies, and no real reports or production queue records. They do not activate a production worker, do not change production deployment, do not mutate production data, and do not connect to live providers.

The production ingest runtime blocker remains unresolved for production use until bounded staging-safe queue-depth recovery evidence is recorded and reviewed. Simulated proof cannot be promoted to production proof.

## Production Worker Activation Plan

Run:

```bash
pnpm run production-worker:activation-plan
pnpm run production-worker:readiness-evidence
```

Outputs:

- `docs/production-scale/evidence/latest-production-worker-activation-plan.md`
- `docs/production-scale/evidence/latest-production-worker-activation-plan.json`
- `docs/production-scale/evidence/latest-production-worker-readiness.md`
- `docs/production-scale/evidence/latest-production-worker-readiness.json`

This is design and guard evidence only. It documents the default-off production workflow path, dry-run procedure, bounded apply guards, queue-depth evidence expectations, and rollback/stop procedure. It does not activate a production worker, process production jobs, mutate production data, or claim production-at-scale readiness.

Production apply remains fail-closed unless every explicit workflow input and runtime guard in `docs/production-ingest-worker-activation.md` is present. The readiness evidence records branch, commit, default-off status, dry-run command, guard list, bounded max-jobs requirement, rollback/stop instructions, future queue-depth before/after fields, and the explicit statement that Codex processed no production jobs.

Blocker 2 remains not production-ready until accepted operator production queue-depth evidence exists. Blocker 11 remains partial until production workflow parity and rollback/stop evidence are accepted. Blocker 21 must be supported by exact release evidence commands and cannot rely on dashboard PASS alone.

## Simulated Load Evidence

Run:

```bash
pnpm run baseline:production-scale-local -- --simulated
```

Outputs:

- `docs/production-scale/evidence/latest-load-simulated.md`
- `docs/production-scale/evidence/latest-load-simulated.json`

This command creates SIMULATED local evidence for bounded throughput, latency, synthetic ingest queue depth, packet PDF cache hit/miss and cache-miss timing, DB pool configured/borrowed signal, rate-limit accepted/rejected counts, and external provider call count. It does not process real reports, create real packets, call live providers, or mutate production.

SIMULATED load evidence is not repeated target-environment production-scale proof. Blockers for load/concurrency, packet PDF scaling, DB pool pressure, and rate-limit write pressure remain incomplete for broader production until reviewed local/staging evidence or design fixes close the remaining gaps.

## Measured Local/Staging-Safe Load Evidence

Run:

```bash
pnpm run baseline:production-scale-measured -- --local
```

Outputs:

- `docs/production-scale/evidence/latest-load-measured.md`
- `docs/production-scale/evidence/latest-load-measured.json`

Threshold policy:

- `docs/production-scale/load-threshold-policy.json`

This command requires exactly one explicit target flag: `--local` or `--staging-safe`. It refuses production hosts, production-like environments, live provider flags, real reports, PII, and mutation flags. The default local run uses synthetic fixtures only and records request/job count, concurrency, latency p50/p95/max, queue depth before/after, DB pool configured max plus observed signal or explicit unavailable reason, rate limiter accepted/rejected counts, packet PDF cache hit/miss metrics, operator dashboard before/after command references, and zero external provider calls.

Promotion-pack logic may close blockers 3, 16, and 17 only when the latest measured evidence is accepted under a release-blocking threshold policy. SIMULATED load evidence, dry-run evidence, warning-only threshold results, or production-targeted evidence cannot close those blockers.

## Packet PDF Cache-Miss Envelope

Run:

```bash
pnpm run packet-pdf:cache-miss-proof
```

Outputs:

- `docs/production-scale/evidence/latest-packet-pdf-cache-miss-proof.md`
- `docs/production-scale/evidence/latest-packet-pdf-cache-miss-proof.json`

This command creates `SIMULATED` local evidence for the bounded synchronous packet PDF cache-miss envelope. It measures synthetic cache misses, duplicate in-flight collapse, bounded concurrency, cache hits after warmup, visible failure behavior, and confirms zero live provider calls. It is not production-at-scale proof.

The selected strategy is documented in `docs/packet-pdf-cache-miss-scaling-decision.md`. The residual risk is that cache misses still wait for a bounded synchronous slot instead of moving to an async render queue; overload and timeout paths fail safely before mail-provider calls.

## SIMULATED Alert Dry Run

Run:

```bash
pnpm run alerts:dry-run
```

Outputs:

- `docs/production-scale/evidence/latest-alerts-dry-run.md`
- `docs/production-scale/evidence/latest-alerts-dry-run.json`

This command creates `SIMULATED` and `DRY RUN` alert evidence for critical ingest backlog, response dead-letter backlog, stale-running response jobs, packet PDF/cache warnings, storage/raw-report warnings, DB/pool pressure, missing restore evidence, and dashboard skip warnings. It sends zero live external alerts, calls zero live external providers, and scans rendered payloads for PII, secrets, raw report data, credential URLs, signed URLs, and signature data.

Live external alerting remains disabled unless separately configured and proven. If no external alert provider is used, release evidence must document the accepted exclusion, this dry-run result, operator dashboard/soak evidence, and the human monitoring path. The dry-run is not live alert delivery proof.

## Response Operations Readiness

Run:

```bash
pnpm run alerts:exclusion:validate
pnpm run response:ops-readiness-evidence
```

Outputs:

- `docs/production-scale/evidence/latest-alerting-exclusion-validation.md`
- `docs/production-scale/evidence/latest-alerting-exclusion-validation.json`
- `docs/production-scale/evidence/latest-response-ops-readiness.md`
- `docs/production-scale/evidence/latest-response-ops-readiness.json`

`response:ops-readiness-evidence` is reporting-only. It verifies that the live scheduler remains default-off, backfill is dry-run first with guarded apply, purge/archive is dry-run first with append-only lifecycle controls, dashboard SKIP semantics remain visible, response soak evidence is referenced, and alert dry-run evidence is not treated as live alert proof.

`alerts:exclusion:validate` accepts only a filled, sanitized operator artifact at `docs/production-scale/evidence/alerting-exclusion-evidence.md` or `.json`. If no artifact is submitted, it reports `not-submitted` and closes no alerting blocker. The validator rejects placeholders, PII, secrets, raw report/response data, signed URLs, database URLs, and any exclusion that lacks signed operator acknowledgement that no external alert provider will be used.

## Storage Raw Report Inventory

Run:

```bash
pnpm run storage:raw-report-inventory
```

Outputs:

- `docs/production-scale/evidence/latest-storage-raw-report-inventory.md`
- `docs/production-scale/evidence/latest-storage-raw-report-inventory.json`

This is sanitized read-only inventory evidence. It counts possible inline `reportArtifact.storageUrl` and `evidenceAttachment.storageUrl` rows without printing raw bytes, raw base64, raw PII, storage secrets, or signed URLs. It does not migrate or delete historical inline rows.

If the local database is unavailable, the generated report is marked `database-unavailable`; those unavailable counts are not zero-row proof.

New bureau communication attachments use storage references; old inline evidence attachment rows remain compatible and readable through metadata-safe paths. OCR upload validation now uses the shared upload boundary checks while preserving valid PDF OCR output.

Historical raw report bytes remain a partial blocker until an approved remediation plan handles old inline rows. The inventory command is evidence, not remediation and not production-at-scale proof.

### Raw Report Remediation Plan And Acceptance

Run:

```bash
pnpm run storage:raw-report-remediation-plan
pnpm run storage:raw-report-remediation-acceptance
```

Outputs:

- `docs/production-scale/evidence/latest-storage-raw-report-remediation-plan.md`
- `docs/production-scale/evidence/latest-storage-raw-report-remediation-plan.json`
- `docs/production-scale/evidence/latest-storage-raw-report-remediation-acceptance.md`
- `docs/production-scale/evidence/latest-storage-raw-report-remediation-acceptance.json`

The remediation plan is dry-run only. It reads sanitized inventory evidence when present, classifies aggregate row categories, records affected tables and estimated counts, and documents rollback, backup, operator approval, and post-remediation validation requirements. It rejects production-like execution and mutation flags such as `--apply`, `--execute`, `--run`, and `--mutate`.

Blocker 6 can be evidence-closed only after a sanitized operator acceptance artifact is submitted at `docs/production-scale/evidence/storage-raw-report-remediation-acceptance-evidence.json`. Acceptance requires proof that inventory was run, the plan was approved, remediation was performed by an operator or approved process, old inline compatibility was tested, post-remediation counts were recorded, backup/restore prerequisite was acknowledged, the operator acknowledgement was signed, and no raw sensitive values appear in the evidence. A dry-run plan or dashboard PASS alone is not accepted remediation proof.

## Runtime Size And Heavy Dependency Policy

Run after a build:

```bash
pnpm run build
pnpm run report:runtime-size
pnpm run check:runtime-size
pnpm run runtime-size:policy-acceptance
```

Outputs:

- `docs/production-scale/evidence/latest-runtime-size.md`
- `docs/production-scale/evidence/latest-runtime-size.json`
- `docs/production-scale/evidence/latest-runtime-size-policy-acceptance.md`
- `docs/production-scale/evidence/latest-runtime-size-policy-acceptance.json`

The policy file is `docs/production-scale/runtime-size-threshold-policy.json`. It classifies configured rows as `PASS`, `WARN`, `FAIL`, or `WAIVED`. The current mode is warning-only, so `WARN` and `WAIVED` rows are visible release evidence but do not hard-fail builds or deploys. `FAIL` is available only if a future reviewed policy explicitly switches to `hard-gate` and enables `failOnExceed` for a threshold.

The policy acceptance command validates that the threshold policy exists, warning-only mode has an accepted formal waiver, every `WARN` row has either remediation owner/date/plan or an explicit waiver reason, every `WAIVED` row has an explicit reason, recent build output has been captured when determinable, and warning-only evidence does not claim hard-gate behavior. Promotion-pack logic classifies blocker 18 as waived with explicit reason when warning-only acceptance passes; it classifies blocker 18 as fixed by automated evidence only for a reviewed hard-gate mode with no exceeded thresholds.

The policy tracks main JS raw/gzip, CSS raw/gzip, `pdfjs-dist`, `pdf-parse`, `pdfmake`, and Docker OCR/PDF runtime inventory. This evidence does not refactor dependencies, change chunks, alter Docker packages, or change OCR/PDF behavior. Dependency isolation, replacement, or chunking work remains deferred until a separately tested task.

## Sensitive List Endpoint Evidence

Run:

```bash
pnpm run sensitive-list-endpoints:evidence
```

Outputs:

- `docs/production-scale/evidence/latest-sensitive-list-endpoints.md`
- `docs/production-scale/evidence/latest-sensitive-list-endpoints.json`

Parser-test list responses are metadata-only and no longer include `rawExtractedText`. Admins can still access raw parser-test text through `/_api/parser-test-case/get` and `/_api/parser-test-case/export`, both of which remain admin-only.

Consumer-signature list responses are metadata-only and no longer include `signatureData`. Signature image data is available through `/_api/consumer-signature/get`, which requires the owner or an admin. Non-owner users cannot retrieve another user's signature data.

Hidden-risk list semantics remain partial/design-only in this evidence. The endpoint still computes aggregate and stale-suppression semantics over the full matching set, so a safe future fix must split aggregate counts from bounded row pagination instead of applying a blind limit.

## Migration Governance Evidence

Run:

```bash
pnpm run check:migrations
pnpm run migrations:evidence
pnpm run migrations:gate
```

Outputs:

- `docs/production-scale/evidence/latest-migration-governance.md`
- `docs/production-scale/evidence/latest-migration-governance.json`
- `docs/production-scale/evidence/latest-migration-gate.md`
- `docs/production-scale/evidence/latest-migration-gate.json`

The checker is a static, non-mutating source and ledger scan. It reports branch, commit, evidence timestamp, known runtime ensure sources, bootstrap scripts, unknown or unledgered schema mutation sources, missing expected sources, missing expected inventory entries, and whether findings are `warning-only` or `release-blocking`.

The gate policy is `docs/production-scale/migration-governance-policy.json`. `migrations:gate` is also static and non-mutating. It fails closed for unknown schema mutation sources, unledgered mutation sources, missing expected sources, missing inventory entries, unapproved bootstrap mutation sources, and forbidden mutation patterns. It does not connect to a database, run DDL, inspect production, or alter deployment state.

Current gate mode is `waived`: approved runtime ensure residuals are formally waived only while reviewed additive migration ledger cutover remains in progress. That waiver does not permit unknown, missing, unledgered, or unapproved schema mutation sources. The remediation path remains a reviewed additive migration ledger cutover, one runtime ensure workstream at a time, with rollback notes before switching the policy to `release-blocking`.
