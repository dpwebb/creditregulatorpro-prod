# Level 3 E2E Operational Audit

`pnpm audit:e2e` runs the live staging upload, OCR, parser, readiness, packet, PDF, authorization, and cleanup workflow. The admin packet workflow is a separate credentialed probe and must not use hardcoded credentials.

## Statuses

- `PASS`: all required non-admin and admin probes completed successfully.
- `INCOMPLETE`: the non-admin operational workflow completed, but the admin packet workflow was skipped because admin credentials were not supplied.
- `FAIL`: platform behavior failed, or the admin packet workflow failed while valid admin credentials were supplied or required.

Missing admin credentials are reported with `ADMIN_PROBE_SKIPPED_CREDENTIALS_MISSING`. This is not treated as a platform workflow failure unless `--require-admin` is set, but it is also not a certification pass.

## Commands

Without admin probe:

```bash
pnpm audit:e2e
```

With admin email/password:

```bash
STAGING_ADMIN_EMAIL="..." STAGING_ADMIN_PASSWORD="..." pnpm audit:e2e --require-admin
```

With session cookie:

```bash
STAGING_ADMIN_SESSION_COOKIE="..." pnpm audit:e2e --require-admin
```

Local smoke targets can use the existing local admin variables when `LOCAL_SMOKE_BASE_URL` points at localhost:

```bash
LOCAL_SMOKE_BASE_URL="http://localhost:3333" LOCAL_SMOKE_ADMIN_EMAIL="..." LOCAL_SMOKE_ADMIN_PASSWORD="..." pnpm audit:e2e --require-admin
```

Do not commit credentials, print passwords, or store session cookies in repository files.
