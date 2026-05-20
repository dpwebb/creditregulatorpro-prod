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

## Runtime Size And Heavy Dependency Policy

Run after a build:

```bash
pnpm run build
pnpm run report:runtime-size
pnpm run check:runtime-size
```

Outputs:

- `docs/production-scale/evidence/latest-runtime-size.md`
- `docs/production-scale/evidence/latest-runtime-size.json`

The policy file is `docs/production-scale/runtime-size-threshold-policy.json`. It classifies configured rows as `PASS`, `WARN`, `FAIL`, or `WAIVED`. The current mode is warning-only, so `WARN` and `WAIVED` rows are visible release evidence but do not hard-fail builds or deploys. `FAIL` is available only if a future reviewed policy explicitly switches to `hard-gate` and enables `failOnExceed` for a threshold.

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
```

Outputs:

- `docs/production-scale/evidence/latest-migration-governance.md`
- `docs/production-scale/evidence/latest-migration-governance.json`

The checker is a static, non-mutating source and ledger scan. It reports branch, commit, evidence timestamp, known runtime ensure sources, bootstrap scripts, unknown or unledgered schema mutation sources, missing expected sources, missing expected inventory entries, and whether findings are `warning-only` or `release-blocking`.

Migration governance remains partial while runtime ensure paths exist. The remediation path is a reviewed additive migration ledger cutover, one runtime ensure workstream at a time, with rollback notes and separately approved deployment gating.
