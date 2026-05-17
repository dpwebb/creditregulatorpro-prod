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
- Full packet outcome tracking.

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
- Violation search/status endpoint coverage passes: `pnpm exec vitest run tests/api/violation-search-status-endpoint.spec.ts`.
- Report ingest lifecycle endpoint coverage passes: `pnpm exec vitest run tests/api/report-ingest-lifecycle-endpoint.spec.ts`.
- Evidence privacy endpoint coverage passes: `pnpm exec vitest run tests/api/evidence-privacy-endpoint.spec.ts`.
- Contracts pass: `pnpm run test:contracts`.
- API tests pass: `pnpm run test:api`.
- Typecheck passes: `pnpm run typecheck`.
- `git diff --check` passes.
- OCR runtime availability is confirmed after deployment when OCR paths, container image, or OCR dependencies change.

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

The dashboard summarizes repository/release state, core logical regressions, auth/session/logout lifecycle endpoint coverage, admin audit-log filtering/sanitization coverage, packet lifecycle and delivery/status endpoint coverage, no-schema outcome comparison helper coverage, report ingest/process/list/detail endpoint coverage, violation search/status endpoint coverage, evidence privacy/ownership and coordinate coverage, regulation governance, public/internal exposure safety, manual/gated smoke harnesses, and known scale-readiness gaps.

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

- Persisted outcome tracking, outcome endpoints, and outcome admin review UI. The current helper is no-schema and local only.
- Broader production-scale workflow coverage.
- Admin correction candidate classification.
- Formal rule/version approval.
- Backup/restore verification.
- Monitoring and alert delivery.
- Broader real-world anonymized fixtures.
- No admin override exists and should remain absent.
- DB registry remains non-runtime governance metadata.
- Static runtime mappings remain active runtime truth.
