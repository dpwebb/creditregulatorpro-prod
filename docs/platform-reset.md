# Platform Reset

Use `pnpm reset:platform` to clear development or staging operational data before large end-to-end testing cycles while preserving core platform intelligence.

The command refuses production, requires `--confirm-env local` or `--confirm-env staging`, prints the database host/name, and fails closed when the environment cannot be identified.

## Commands

Preview the normal soft reset:

```bash
pnpm reset:platform --dry-run --confirm-env local
```

Preview the hard reset:

```bash
pnpm reset:platform --dry-run --preview-hard --confirm-env staging
```

Apply a soft reset:

```bash
pnpm reset:platform --soft --confirm-env local
```

Apply a hard reset:

```bash
pnpm reset:platform --hard --confirm-env staging
```

After a local reset, reseed the local admin/settings minimum when needed:

```bash
pnpm seed:minimal
```

## Soft vs Hard

Soft reset removes operational report, packet, finding, response, queue, parser-run, lifecycle, beta, session/token, audit/log, and generated file data. It preserves all users and their account/password/subscription rows.

Hard reset does everything in soft reset, then removes non-admin users and their account/password/profile rows. Admin users are preserved, and references from preserved intelligence tables are nullified or reassigned to the preserved admin where needed.

## Preserved

- Migrations and version metadata
- Laws, statutes, obligations, legal references, rule definitions, and compliance configuration
- Parser mappings, parser test cases, parser training archive, parser rules, known entities, and canonical extraction intelligence
- Admin users and admin password records
- System settings, feature flags, deterministic OCR/runtime configuration, and letter templates
- Supported bureau records and licensed collection agency reference mappings

## Deleted Or Reset

- Uploaded reports, report artifacts, parsed report child rows, tradelines, findings, violations, packet rows, generated PDFs, and packet exports
- Ingest jobs/events, response jobs/events, response timeline rows, outcome comparison rows, and worker/lifecycle state
- Parser lab run results, beta/lifecycle test records, support/test activity, audit/log rows, sessions, reset/email/OAuth tokens, login attempts, and rate-limit rows
- In hard mode only: non-admin users and non-admin user account/password/profile rows
- Generated files under `.local/document-storage/report-artifacts`, `.local/document-storage/packet-pdfs`, `.local/document-storage/packets`, `document-storage/...`, `output/pdf`, `.local/test-runs`, `.local/beta-testing-hub`, and local temp/cache folders

## Validation

After an applied reset, the script verifies database connectivity, an admin login row/password row, and preserved rule/config table availability. It also probes the app shell plus ingestion and packet endpoints using `http://localhost:5175` by default. Use `--base-url` for another running app URL or `--require-http-validation` to fail the reset report if HTTP probes are unreachable.

## Recommended Workflow

1. Reset: `pnpm reset:platform --soft --confirm-env local`
2. Seed minimal local admin/settings if needed: `pnpm seed:minimal`
3. Smoke test: `pnpm run validate:fast`
4. Begin full E2E testing

Use hard reset only when you intentionally want to remove all non-admin users from a local or staging database.
