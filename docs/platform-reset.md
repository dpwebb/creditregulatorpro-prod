# Platform Reset

Use `pnpm reset:platform` to clear development or staging operational data before large end-to-end testing cycles while preserving core platform intelligence.

The command refuses production, requires `--confirm-env local` or `--confirm-env staging`, prints the database host/name, and fails closed when the environment cannot be identified. Destructive modes also require `--confirm`.

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
pnpm reset:platform --soft --confirm-env local --confirm
```

Apply a hard reset:

```bash
pnpm reset:platform --hard --confirm-env staging --confirm
```

After a local reset, reseed the local admin/settings minimum when needed:

```bash
pnpm seed:minimal
```

## Soft vs Hard

Soft reset removes operational report, packet, finding, response, queue, parser-run, lifecycle, beta, session/token, audit/log, compliance detection configuration, and generated file data while preserving users.

Hard reset does everything in soft reset, then deletes every user except the configured admin/super_admin account in `RESET_PRESERVE_ADMIN_EMAILS`. References from preserved intelligence tables are nullified or reassigned to the preserved admin where needed.

Set exactly one `RESET_PRESERVE_ADMIN_EMAILS` value or pass one `--preserve-admin-email user@example.com` for hard reset. Hard reset fails when the allowlist is empty, when no matching admin/super_admin exists, or when more than one admin would remain unless `RESET_ALLOW_MULTIPLE_PRESERVED_ADMINS=true` is explicitly configured.

## Preserved

- Migrations and version metadata
- Laws, statutes, obligations, legal references, and rule definitions
- Parser mappings, parser test cases, parser training archive, parser rules, known entities, and canonical extraction intelligence
- Exactly one configured admin/super_admin user and its password row in hard mode
- System settings, feature flags, deterministic OCR/runtime configuration, and letter templates
- Supported bureau records and licensed collection agency reference mappings

## Deleted Or Reset

- Uploaded reports, report artifacts, parsed report child rows, tradelines, findings, violations, packet rows, generated PDFs, and packet exports
- Ingest jobs/events, response jobs/events, response timeline rows, outcome comparison rows, and worker/lifecycle state
- Parser lab run results, beta/lifecycle test records, support/test activity, audit/log rows, sessions, reset/email/OAuth tokens, login attempts, and rate-limit rows
- All users except the configured preserved admin, plus deleted-user account/password/profile rows in hard mode
- Generated files under `.local/document-storage/report-artifacts`, `.local/document-storage/packet-pdfs`, `.local/document-storage/packets`, `document-storage/...`, `output/pdf`, `.local/test-runs`, `.local/beta-testing-hub`, and local temp/cache folders

## Validation

After an applied reset, the script verifies database connectivity, the preserved admin password row, exactly one remaining admin/user row by default, deleted-user absence when hard mode deletes users, preserved rule/parser table availability, storage write/read/delete health, and empty core operational tables. It also probes the app shell plus admin, ingestion, and packet endpoints using `http://localhost:5175` by default. Use `--base-url` for another running app URL or `--require-http-validation` to fail the reset report if HTTP probes are unreachable.

## Recommended Workflow

1. Reset: `pnpm reset:platform --hard --confirm-env staging --confirm`
2. Seed minimal local admin/settings if needed: `pnpm seed:minimal`
3. Smoke test: `pnpm run validate:fast`
4. Begin full E2E testing

Use soft reset when you need to preserve users. On staging, run the command inside the `creditregulatorpro-staging` app container or with the exact staging database environment loaded so the reset targets the same database as the website.
