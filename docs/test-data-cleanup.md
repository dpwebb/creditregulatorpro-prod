# Test Data Cleanup

Use `pnpm cleanup:test-data` to remove old, explicitly marked test data from local or staging databases. The default age threshold is 5 days.

## Commands

Dry run:

```bash
pnpm cleanup:test-data --dry-run
```

Confirmed cleanup:

```bash
pnpm cleanup:test-data --confirm
```

The script prints the resolved database host and database name before reporting or deleting rows. It fails closed when it cannot determine whether the target is local, staging, or production.

## What It Removes

Rows must be older than 5 days and explicitly test-marked.

Current deletion scope:

- `ingest_processing_job_event`
- `ingest_processing_job`
- `ingest_processing_worker_heartbeat`
- `response_processing_job_event`
- `response_processing_job`
- `response_worker_orchestration_event`
- `response_worker_orchestration_run`
- `response_processing_lifecycle_event`
- `response_admin_review_event`
- `response_processing_event`
- `bureau_response_event`
- response-auth-smoke rows in `finding_outcome`, `outcome_comparison_run`, `report_artifact`, `audit_log`, and `users` when safely unreferenced
- storage-less `OUTCOME_SMOKE` fixture rows in `tradeline_artifact_presence`, `tradeline`, `report_artifact`, `creditor`, and `bureau`

Markers include clear test/demo/seed/fixture/mock/synthetic/smoke/parser-lab/lifecycle-test/beta-test/development-only labels, `example.test`, `example.invalid`, `auth.workflow`, `ingest_queue_test`, response-auth-smoke, response queue/soak/orchestration prefixes, and `OUTCOME_SMOKE`.

## What It Never Removes

The utility does not delete real users, real uploaded reports, real dispute packets, real findings, legal or regulatory reference data, admin settings, migrations, parser mappings, rule definitions, or production records. It also does not delete audit/security/compliance logs unless a future change adds a specific test-only target and test coverage.

## Safety

Production-like database targets are refused unless `--dangerously-allow-production` is supplied. That override is intentionally separate from `--confirm`.

The script uses hard deletion only for allowlisted tables that already use hard-delete cleanup in smoke tests or for storage-less synthetic outcome fixtures. It deletes child rows before parent rows where foreign keys require ordering.

## Known Test Data Sources

- Local seed/demo fixtures: `scripts/bootstrap-local-app-fixtures.ts`. These are idempotent local fixtures and are not broadly removed.
- Parser testing and parser lab: parser test cases/runs are preserved because they may be regression fixtures or admin review assets.
- Ingest queue tests and worker smokes: old explicitly marked queue jobs/events are eligible.
- Response queue, response soak, worker orchestration, response timeline, and response-auth-smoke records: old explicitly marked jobs/runs/events/responses are eligible.
- Outcome tracking fixture setup: old storage-less `OUTCOME_SMOKE` rows are eligible.
- Auth workflow smoke and mock lifecycle tests: these create full user/report/packet flows and already use explicit account deletion. Leftovers should be handled through the existing user deletion/admin reset path, not this generic cleanup.
- Packet tests and creditor validation tests: persisted findings, packets, and evidence are preserved unless cleaned by their test setup.

Recommended cadence: weekly on local/staging, or before heavy ingestion/packet/outcome testing.
