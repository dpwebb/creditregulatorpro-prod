# Production Readiness Checklist

This checklist is for the operator deciding whether Credit Regulator Pro is ready to promote, keep operating, or roll back. It does not replace engineering review, but it gives the release decision a consistent shape.

## Production Scope

Controlled production means all of the following are true:

- Canadian credit reports only.
- Supported TransUnion and Equifax credit-report layouts only.
- Credit Bureau packet and Collection Agency packet paths only.
- No direct furnisher packet workflow.
- Packets are readiness-gated before preview, creation, save, and PDF download.
- Credit-report extraction remains deterministic, replayable, and auditable.
- OCR and scanned-PDF behavior is fail-closed: low-confidence or unsupported OCR output must not become canonical truth.
- Consumer-facing output does not make unsupported legal conclusions.
- Uncertain parser, evidence, regulation, or packet cases require admin or operator review instead of automatic promotion to packet-ready output.

## Not Yet In Scope

The current controlled production scope does not include:

- A guarantee that all scanned PDFs will parse.
- A guarantee that all bureau layouts are supported.
- Broad production support for creditor statements.
- Broad production support for collection letters.
- Legal advice or legal determinations.
- Automatic DB regulation registry runtime truth.
- Admin override paths.
- Full consumer-facing outcome automation, live mailbox/inbox integration, historical production backfill, external alert delivery, or packet outcome automation.

## Required Pre-Promotion Checks

Before promoting staging to production, confirm:

- `git status --short` is clean.
- Current staging deployed commit is known.
- Current production deployed commit is known.
- Commits pending promotion have been reviewed.
- Rollback SHA is recorded.
- No `.env` files, credentials, private keys, session cookies, tokens, raw consumer PDFs, or raw consumer extracted text are included in the promotion diff.
- No internal docs are under `static`, `public`, or other publicly served paths.
- No confidential/internal PDF remains under `output/pdf`.
- Public-static guard passes: `pnpm exec vitest run tests/unit/public-static-dev-assets.spec.ts`.
- Auth/session/logout lifecycle endpoint coverage passes: `pnpm exec vitest run tests/api/auth-session-lifecycle-endpoint.spec.ts`.
- Admin audit-log endpoint coverage passes: `pnpm exec vitest run tests/api/admin-audit-log-endpoint.spec.ts`.
- Golden Path passes: `pnpm run test:golden-path`.
- Packet lifecycle endpoint coverage passes: `pnpm exec vitest run tests/api/packet-lifecycle-endpoint.spec.ts`.
- Packet delivery/status endpoint coverage passes: `pnpm exec vitest run tests/api/packet-delivery-status-endpoint.spec.ts`.
- Outcome comparison helper coverage passes: `pnpm exec vitest run tests/unit/outcome-comparison.spec.ts`.
- Persisted outcome tracking endpoint coverage passes: `pnpm exec vitest run tests/api/outcome-tracking-endpoint.spec.ts`.
- Outcome admin-review endpoint coverage passes: `pnpm exec vitest run tests/api/outcome-admin-review-endpoint.spec.ts`.
- Outcome admin-review UI coverage passes: `pnpm exec vitest run tests/unit/outcome-admin-review-ui.spec.tsx`.
- Authenticated persisted outcome tracking staging smoke has passed for synthetic fixture compare/list/get behavior, or a newer equivalent gated smoke result is recorded before relying on outcome backend changes for release.
- Authenticated outcome admin-review staging smoke has passed for a synthetic existing outcome run, or a newer equivalent gated smoke result is recorded before relying on outcome admin-review backend changes for release.
- Authenticated admin Outcome Reviews UI staging smoke has passed for a synthetic existing outcome run, or a newer equivalent gated smoke result is recorded before relying on outcome admin-review UI changes for release.
- Response-document capture endpoint coverage passes: `pnpm exec vitest run tests/api/response-document-endpoint.spec.ts`.
- Response classification engine coverage passes: `pnpm exec vitest run tests/unit/response-classification-engine.spec.ts`, including deterministic classification, confidence gating, negation and contradiction handling, hostile/vague response patterns, metadata-only/OCR-damaged fail-closed behavior, evidence-linked provenance, manual-review fail-closed states, regulation-reference review links, and no readiness/violation truth mutation.
- Response intake idempotency coverage passes inside `tests/api/response-document-endpoint.spec.ts`, including `manual_admin`, `simulated_inbox`, inert `future_mailbox`, reordered equivalent metadata dedupe, meaningful relationship/subject/source metadata separation, concurrent duplicate collapse through the unique idempotency index, duplicate audit entries, and no raw response-text exposure.
- Response replay/backfill coverage passes inside `tests/api/response-document-endpoint.spec.ts`, and the local operator dry-run command succeeds: `pnpm run response:replay -- --dry-run`. Replay must remain dry-run by default; CLI apply mode must require `--apply --confirm-apply --actor-user-id <id>`, service apply mode must require `confirmApply: true` plus a positive actor ID, malformed filters must fail closed, and apply mode must write append-only processing/audit events only.
- Response processing queue coverage passes: `pnpm exec vitest run tests/api/response-processing-queue.spec.ts`, remediation endpoint coverage passes: `pnpm exec vitest run tests/api/response-processing-queue-remediation-endpoint.spec.ts`, the bounded worker dry-run command succeeds: `pnpm run response:worker -- --dry-run`, and the synthetic queue/load check succeeds: `pnpm run response:queue-load-check`. Queue jobs must remain DB-backed, sanitized, idempotent for active duplicate keys, row-lock claimed, retry/dead-letter deterministic, and append-only through `response_processing_job_event`; remediation must remain admin-only, actor-attributed, confirmation-gated for retry, append-only for acknowledgement/stale review/replacement events, and must not silently auto-reclaim stale-running jobs. Dead-letter retry must create a sanitized replacement job rather than mutating the terminal job silently, and concurrent duplicate retry requests must return the existing replacement link with an append-only duplicate-remediation event. Worker/remediation processing must not store raw response text or mutate canonical report facts, tradeline facts, violation truth, packet eligibility, or readiness rules. The synthetic queue/load check must fail loudly if source-scoped cleanup leaves jobs behind.
- Authenticated response-document capture staging smoke has passed in both admin and user-owned contexts, or a newer equivalent gated smoke result is recorded before relying on response-document capture changes for release.
- Response-document admin-review endpoint coverage passes: `pnpm exec vitest run tests/api/response-document-admin-review-endpoint.spec.ts`.
- Authenticated response-document admin-review staging smoke has passed for an existing synthetic response, with unauthenticated denial, required-note validation, unsupported corrected/removed/unchanged/legal/override action rejection, metadata-only review updates, deterministic source preservation, and privacy/no-overexposure checks verified.
- Admin Response Documents UI coverage passes: `pnpm exec vitest run tests/unit/response-document-ui.spec.tsx`, including list/detail visibility, deterministic processing source visibility, manual-review states, operator metrics, metadata-only admin-review controls, required notes, confirmation guardrails, supported metadata actions, unsupported legal/override/source-truth control absence, and source guards limited to response list/get/metrics/admin-review endpoints.
- Authenticated admin Response Documents list/detail UI smoke has passed for an existing synthetic response, or a newer equivalent gated smoke result is recorded before relying on the list/detail response UI for release.
- Authenticated response admin-review UI smoke has passed for metadata-only admin-review controls, or a newer equivalent gated smoke result is recorded before relying on the response review UI for release.
- Staging deploy now runs the autonomous post-deploy response auth smoke suite after deploy and health checks, including synthetic admin bootstrap, normal login/session flow, resolved-admin role verification, one synthetic marker through fixture -> outcome -> response capture -> admin review -> UI review, response capture/list/get smoke, response UI smoke, response admin-review backend smoke, response admin-review UI smoke, synthetic admin neutralization, no-secret output, and metadata-only/later-report-comparison safety checks. The full suite is scope-gated: runtime/app/workflow/Docker/backend/UI/script changes run it, docs/readiness/operator-dashboard-only changes skip it by design, and unknown changed-file scope fails closed by running it.
- Violation search/status endpoint coverage passes: `pnpm exec vitest run tests/api/violation-search-status-endpoint.spec.ts`.
- Report ingest lifecycle endpoint coverage passes: `pnpm exec vitest run tests/api/report-ingest-lifecycle-endpoint.spec.ts`.
- Evidence privacy endpoint coverage passes: `pnpm exec vitest run tests/api/evidence-privacy-endpoint.spec.ts`.
- Contracts pass: `pnpm run test:contracts`.
- API tests pass: `pnpm run test:api`.
- Typecheck passes: `pnpm run typecheck`.
- `git diff --check` passes.
- If a staging-to-local refresh failure was observed during publish, rerun the local-only refresh path before relying on local DB-backed tests: `pnpm run refresh:local-from-staging -- --confirm`. The current verified failure source is the post-push refresh step in `scripts/commit-push-staging.mjs`; the latest clean-schema restore completed successfully and did not indicate a response-intake schema or idempotency-index incompatibility.
- OCR runtime availability is confirmed after deployment when OCR paths, container image, or OCR dependencies change. The app Docker image includes `apt-utils` before OCR/PDF runtime package installation, `poppler-utils`, `tesseract-ocr`, and `tesseract-ocr-eng` remain installed, and filtered deploy/package-install logs should not show the Debian `apt-utils is not installed` warning.

## Required Post-Promotion Checks

After production promotion, confirm:

- Production deployed SHA matches the promoted staging SHA.
- `https://creditregulatorpro.com/` returns HTTP 200.
- `https://creditregulatorpro.com/login` returns HTTP 200.
- `https://creditregulatorpro.com/_api/auth/session` returns the expected unauthenticated response, normally HTTP 401 or HTTP 403.
- `/README.txt` does not serve the removed static README content.
- Internal docs are not publicly served; probes should return fallback HTML or an access denial, not Markdown or PDF content.
- Packet PDF path is not broken, using only synthetic tests or unauthenticated denial probes. Do not use real consumer packets.
- Safe logs show no relevant unhandled errors, parser/OCR failure spikes, packet-generation failures, or HTTP 5xx spikes.
- Production container is running.

## Fail-Closed Expectations

Production should fail closed in these cases:

- Low-quality OCR does not become canonical data.
- Missing evidence blocks packet generation.
- Manual-review evidence blocks packet generation.
- Parser uncertainty blocks packet generation.
- Non-owner packet access is denied.
- DB regulation registry rows do not become runtime truth.
- Reconciliation candidates and bridge mappings do not activate runtime references.

## Rollback Checklist

Before promotion, record:

- Rollback SHA.
- Production repo and branch.
- Repo-approved rollback command or process.

If rollback is required:

- Restore production main to the rollback SHA using the repo-approved method.
- Use force-with-lease only when required by the repo convention.
- Monitor the production deploy workflow.
- Confirm production root returns HTTP 200.
- Confirm `/login` returns HTTP 200.
- Confirm the production container is running.
- Confirm safe logs show no relevant unhandled errors.
- Remember that additive lazy tables may remain present but inert after rollback. Do not mutate them during rollback verification.

## Production-Ready Status Levels

### Controlled Production Ready

The system is safe for bounded production operation within the stated scope. Core deterministic extraction, evidence, violation, and packet checks pass; unsupported or uncertain cases fail closed; production can be rolled back.

### General Production Ready

Controlled production remains green and broader endpoint-backed user flows, admin correction candidate classification, backup/restore verification, monitoring, and repeated staging smoke runs are in place.

### Scale Production Ready

General production remains green and sustained operational monitoring, alert delivery, restore drills, broader anonymized fixture coverage, outcome tracking, and production-scale workflow coverage are proven.

## Operator Regression Dashboard

Run the operator dashboard before promotion review or during release health review:

- `pnpm run operator:dashboard`
- `pnpm run operator:dashboard -- --json`
- `pnpm run operator:dashboard -- --list-checks`
- `pnpm run operator:dashboard -- --run-checks`

The dashboard summarizes repository/release state, Docker image runtime dependency posture including `apt-utils`, core logical regressions, auth/session/logout lifecycle endpoint coverage, admin audit-log filtering/sanitization coverage, packet lifecycle and delivery/status endpoint coverage, no-schema outcome comparison helper coverage, persisted backend outcome compare/list/get endpoint coverage, outcome admin-review endpoint coverage and authenticated smoke visibility, admin-only Outcome Reviews UI unit coverage and authenticated smoke visibility, response-document capture plus append-only processing endpoint coverage, deterministic response classification coverage, response replay/backfill dry-run readiness, response-processing queue health and bounded worker dry-run visibility, response-document admin-review endpoint coverage and authenticated smoke visibility, admin-only Response Documents UI unit coverage for list/detail, metrics, deterministic-source visibility, replay readiness metrics, queue health metrics including stale-running visibility, and metadata-only admin-review controls, authenticated response UI smoke visibility, authenticated response admin-review UI smoke visibility, scope-gated autonomous post-deploy response auth smoke coverage, authenticated outcome tracking smoke visibility, report ingest/process/list/detail endpoint coverage, violation search/status endpoint coverage, evidence privacy/ownership and coordinate coverage, regulation governance, public/internal exposure safety, manual/gated smoke harnesses, and known scale-readiness gaps.

The dashboard distinguishes local checks from manual or gated smoke checks:

- Local checks are safe bounded commands that run against local code and synthetic/unit/API fixtures.
- Manual/gated smoke checks require explicit staging flags and safe credentials or session context. The dashboard lists these but does not run them automatically.
- Operational/manual checks still require human review of deployment SHA, logs, rollback target, production health, and the promotion diff.

Status meanings:

- `PASS`: the check passed in this dashboard invocation or the release state is present.
- `FAIL`: the check failed or a required release state is unsafe.
- `SKIP`: the check is available but was not run in this dashboard invocation.
- `MANUAL`: the check is gated and requires explicit operator context.
- `OPEN`: a known scale-readiness gap remains.
- `INFO`: release context or a non-runtime governance warning.

The dashboard does not replace final human release review. Operators must still review the promotion diff, sensitive-file exposure, rollback SHA, staging deployment state, production health, and any caveats from the readiness audit.

## Current Remaining Scale Gaps

The following gaps remain before claiming scale production readiness:

- Persisted outcome tracking backend has passed authenticated staging smoke for a synthetic response-only `response_received` path with append-only outcome rows, privacy checks, and no source-record mutation. Response-document capture now stores immutable response metadata plus append-only `response_processing_event` rows with deterministic classification, confidence, provenance, regulation-reference review links where applicable, and readiness/violation impact statements that explicitly record no source-truth mutation. Admin-review actions also write append-only `response_admin_review_event` rows with hashed note presence, confirmation flags, previous/next response status, and explicit no-canonical/no-packet/no-runtime mutation flags; the response row still carries denormalized latest review state for UI filtering. Local endpoint coverage now includes response processing schema, response-to-packet/outcome/finding/evidence/tradeline/violation linkage, admin-only metrics for uncertainty, OCR fallback, suspicious patterns, dead letters, repeated mismatches, readiness regression, workflow stalls, replay readiness, queue health, manual_admin/simulated_inbox/future_mailbox intake, response-text hashing, duplicate/idempotent intake handling, relationship-scoped idempotency, concurrent duplicate collapse, and no raw response-text exposure, plus deterministic classifier unit coverage for negated, contradictory, hostile, vague, metadata-only, and OCR-damaged inputs. The admin-only Response Documents UI now shows deterministic extraction source, confidence, manual-review state, rationale/provenance, regulation-reference review links, operator metrics, replay readiness metrics, queue health metrics, and a manual/simulated response intake form that submits to the existing capture endpoint through the inbox-ready intake abstraction. The replay/backfill command is dry-run by default, apply-capable only with explicit confirmation and actor ID, and append-only when applied; it reports records without replayable sanitized summaries as non-replayable because raw response text is intentionally not stored. A durable response-processing queue now exists with sanitized payloads, active-job idempotency, row-lock claiming, bounded deterministic retry/backoff, dead-letter status, append-only job events, stale-running detection, append-only dead-letter acknowledgement, sanitized replacement-job creation for dead-letter retry, and `pnpm run response:worker -- --dry-run` preview support; stale running jobs are visible in metrics and are not silently reclaimed by the worker. Current manual/admin capture remains synchronous, and live mailbox jobs remain inert placeholders. The consumer packet page shows a bounded response timeline only when response records exist, without admin controls. Response-document admin-review remains metadata-only and isolated. The staging deploy workflow still runs scope-gated autonomous post-deploy response auth smokes after deploy and health checks with synthetic admin bootstrap, normal login/session flow, role verification, fixture -> outcome -> response capture -> admin review -> UI review, synthetic admin neutralization, and no-secret output; runtime/app/workflow/Docker/backend/UI/script changes run the full suite, docs/readiness/operator-dashboard-only changes skip it by design, and unknown changed-file scope runs it fail-closed. The app Docker image includes `apt-utils`, `poppler-utils`, `tesseract-ocr`, and `tesseract-ocr-eng`. Response documents are not canonical credit-report facts, response classifications are intake outcomes only, no packet/readiness/violation/source truth is changed by response capture, admin review, replay, or queued worker processing alone, and later deterministic report comparison remains required for corrected/removed/unchanged source-truth outcomes. Known classifier limitations: it is phrase/rule based, intentionally conservative on mixed language, and sends low-signal, OCR-damaged, metadata-only, or contradictory text to manual review. Live mailbox integration, historical production backfill strategy for non-replayable records, production-scale repeated smoke/load coverage, external alert delivery, and broader real-world anonymized fixture corpus work remain future work.
- Broader production-scale workflow coverage.
- Admin correction candidate classification.
- Formal rule/version approval.
- Backup/restore verification.
- External alert delivery beyond the local/operator-dashboard response metrics.
- Broader real-world anonymized fixtures.
- No admin override exists and should remain absent.
- DB registry remains non-runtime governance metadata.
- Static runtime mappings remain active runtime truth.
