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

Soft reset removes operational report, packet, finding, response, queue, parser-run, lifecycle, beta, session/token, audit/log, and generated file data. It also removes non-admin operational users and their account/password/subscription/profile rows. Admin users are preserved, and service/system users are preserved when those roles exist.

Hard reset does everything in soft reset, then preserves only canonical admin users. References from preserved intelligence tables are nullified or reassigned to the preserved admin where needed.

Set `RESET_PRESERVE_ADMIN_EMAILS` or pass `--preserve-admin-email user@example.com` when a staging admin account must be preserved even if role data is being repaired. Prefer role-based preservation; the email allowlist is a safety override.

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
- Non-admin users and their account/password/profile rows in soft mode; all non-canonical-admin users in hard mode
- Generated files under `.local/document-storage/report-artifacts`, `.local/document-storage/packet-pdfs`, `.local/document-storage/packets`, `document-storage/...`, `output/pdf`, `.local/test-runs`, `.local/beta-testing-hub`, and local temp/cache folders

## Validation

After an applied reset, the script verifies database connectivity, an admin login row/password row, deleted-user absence, preserved rule/config table availability, and empty core operational tables. It also probes the app shell plus ingestion and packet endpoints using `http://localhost:5175` by default. Use `--base-url` for another running app URL or `--require-http-validation` to fail the reset report if HTTP probes are unreachable.

## Recommended Workflow

1. Reset: `pnpm reset:platform --soft --confirm-env local --confirm`
2. Seed minimal local admin/settings if needed: `pnpm seed:minimal`
3. Smoke test: `pnpm run validate:fast`
4. Begin full E2E testing

Use hard reset only when you intentionally want to preserve only canonical admin accounts in a local or staging database. On staging, run the command inside the `creditregulatorpro-staging` app container or with the exact staging database environment loaded so the reset targets the same database as the website.
