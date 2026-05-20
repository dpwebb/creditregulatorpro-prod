# Limited Beta Operator Launch Policy

Updated May 19, 2026.

This policy allows only a controlled limited beta. It does not claim production-at-scale readiness.

The hardened response-processing subsystem does not make report ingest, OCR, packet PDF generation, or report storage scale-ready. Response processing has durable queueing, dry-run tooling, drift detection, and append-only protections. Report ingest/OCR/compliance has since moved behind queued worker execution and new report PDF uploads store file references instead of inline database bytes, but historical inline records remain compatible, packet PDFs are still generated synchronously, and ingest/PDF/storage observability is still incomplete.

## Current Scale Blockers

Limited beta remains constrained because these blockers are unresolved:

- Historical inline `reportArtifact.storageUrl` records remain readable and are not destructively migrated.
- Report upload, OCR, parser, compliance scan, storage, and cleanup work still require strict operator limits until repeated load/concurrency and restore evidence exists.
- New report PDF uploads store storage references instead of raw inline bytes, and retention apply is guarded by preview-first confirmation, but storage lifecycle, purge/archive, growth monitoring, and restore proof remain incomplete.
- Packet PDF download/send paths still generate PDFs synchronously.
- Ingest, packet PDF, storage growth, and auth failure observability is incomplete.
- A production restore drill is not recorded as completed in the scale audit.
- External alert delivery is not implemented; internal/operator dashboard visibility is the current limit.

## Temporary Beta Limits

These limits apply until the unresolved scale blockers are replaced by durable queueing, storage lifecycle controls, and production-scale observability.

| Area | Temporary limit |
| --- | --- |
| Beta population | Maximum 5 total beta participants, whether external beta users or internal pilot users. |
| Concurrent active users | Maximum 3 active users at one time. |
| Concurrent report upload/process operations | 1 active report upload or ingest/process operation at a time across the beta. |
| Authenticated report upload size | Maximum 15 MiB decoded bytes, matching the server-side authenticated report limit. |
| Anonymous report upload size | Maximum 20 MiB decoded bytes if the anonymous flow is enabled for beta; prefer authenticated uploads for beta operation. |
| Evidence and bureau communication upload size | Maximum 10 MiB decoded bytes. |
| Daily report uploads | Maximum 25 total report uploads per calendar day. |
| Per-user report uploads | Maximum 5 report uploads per user per calendar day. |
| Packet creations | Maximum 25 packet creation operations per calendar day. |
| Packet PDF downloads/sends | Maximum 50 packet PDF download or send operations per calendar day; repeated retries for the same failed packet count against the limit. |
| OCR and scanned PDFs | Accept only when deterministic OCR is enabled, runtime dependencies are available, and operator review is available for low-confidence or unsupported OCR. Otherwise reject or hold scanned/image-only PDFs. |
| Response-worker dry-run | Run before each beta operating window, after each operating window, and immediately after any failed response event. |
| Response-worker apply/non-dry use | Operator-supervised only. Use bounded runs only, maximum 10 jobs per supervised window, with explicit confirmation and review of output before and after. |
| Response replay/lifecycle apply use | Operator-supervised only, explicit confirmation required, maximum 10 records per supervised window. |
| Operator dashboard review | At least daily during beta, before promotion, after promotion, and immediately after any failed ingest, packet, PDF, storage, auth, or response event. |
| Staging promotion | Staging must be deployed at the intended commit, health checks must pass, contracts/API/typecheck/build must pass, and rollback SHA must be recorded. |
| Production promotion | Production root, `/login`, and unauthenticated `/_api/auth/session` checks must pass after deploy; no staging-only synthetic admin smokes may run against production unless separately approved as production-safe. |

Operators must lower these limits if staging or production shows elevated latency, repeated retries, storage growth, DB pressure, failed OCR, failed packet generation, failed response jobs, or unexpected auth/session behavior.

## Beta Allowed Only If

- All Phase 1 blockers in `docs/production-scale-readiness-audit.md` are implemented or, where the audit permits operational control rather than code, explicitly constrained by this policy.
- `pnpm run test:contracts`, relevant API suites, `pnpm run typecheck`, `pnpm run build`, and `git diff --check` passed for the promoted commit.
- The current staging deployed SHA is known and matches the intended promotion source.
- The production rollback SHA is recorded before promotion.
- Upload limits and MIME checks remain server-side enforced.
- The operator can monitor active upload/process operations and keep report ingest concurrency at 1.
- The operator can review `pnpm run operator:dashboard` output at the required cadence.
- Deterministic OCR is enabled and available before accepting scanned/image-only PDFs; otherwise scanned/image-only PDFs are rejected or held.
- Operators have a clear stop/rollback path and are available during beta operating windows.

## Stop Beta Immediately If

- Two or more unexpected HTTP 5xx responses occur within 15 minutes on upload, ingest, packet, PDF, auth, or response routes.
- Parser, OCR, compliance scan, or ingest failures spike above 3 failures or held reports in one calendar day.
- Packet PDF generation, packet send, or packet download failures occur 2 or more times in one hour.
- Response queue metrics show critical drift, dead-letter growth, stale-running growth, repeated worker failures, or missing soak-check history.
- An unauthorized access signal, non-owner data exposure, suspicious session behavior, webhook auth failure, or cron-token anomaly appears.
- DB latency, connection pressure, process memory, CPU, or container restart behavior suggests request-bound ingest/OCR/PDF work is saturating capacity.
- Report artifact storage growth is anomalous, unexplained, or exceeds the planned beta volume envelope.
- A raw consumer PDF, raw extracted text, secret, token, cookie, or private key appears in logs, public paths, generated artifacts, or support output.
- Production health checks fail after deploy or rollback readiness is uncertain.
- Operators cannot enforce the concurrency, volume, review, or rollback requirements in this policy.

When beta stops, pause new uploads and packet operations, preserve logs and audit context, verify root/login/auth-session health, review operator dashboard and safe logs, and rollback if health, privacy, or ownership boundaries are uncertain.

## Rollback Triggers

Rollback or disable beta entry points if any of these occur:

- Repeated 5xx responses on protected user workflows.
- Parser/OCR failure spike or scanned-PDF behavior that does not fail closed.
- Packet PDF failure spike or repeated send/download timeout.
- Response queue critical drift or repeated worker failure.
- Unauthorized access signal, role/session anomaly, webhook auth anomaly, or cron-token anomaly.
- DB pressure, memory pressure, container restart loop, or storage growth anomaly.
- Promotion SHA mismatch, failed production root/login/auth-session health check, or inability to identify the rollback SHA.

## Do Not Claim Production-At-Scale Readiness Until

- A durable ingest/OCR/compliance queue exists with leases, retries, dead letters, idempotency, and operator remediation and has repeated production-safe operating evidence.
- Report PDFs are moved out of database-backed inline storage for new uploads, historical inline compatibility is controlled, and storage lifecycle/growth/restore behavior is proven.
- Report artifact retention preview, purge/archive, and restore behavior are proven.
- Packet PDF generation is cached or queued with idempotent invalidation.
- Ingest, OCR, packet PDF, storage, auth, and DB-pressure metrics are visible to operators with documented thresholds.
- A human-observed production restore drill is completed and recorded.
- Production-scale repeated smoke/load coverage exists for upload, OCR fallback, packet build/PDF, response worker operation, and dashboard reads.
- External alert delivery is implemented or formally accepted as out of scope for the production tier being claimed.

## Operating Notes

- This policy is an operator guardrail. It does not add runtime throttling.
- If a limit cannot be measured or enforced operationally, beta is not allowed for that window.
- Retention cron and admin retention routes preview by default; destructive apply requires the explicit `APPLY_RETENTION_PURGE` confirmation and must be operator-supervised.
- Do not increase limits because response processing is hardened; response queue hardening does not remove synchronous ingest/OCR/PDF/storage risk.
- Do not use real consumer data in staging smokes or diagnostics.
- Do not broaden beta scope to unsupported bureau layouts, unsupported scanned PDFs, direct furnisher workflows, or legal-determination language.
