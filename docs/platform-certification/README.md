# Level 5 Platform Certification Inputs

`pnpm certify:platform` distinguishes platform failures from certification
inputs that are unavailable on the current machine.

## Runtime Diagnostics

Workstation with SSH:

```bash
STAGING_USER="<user>" STAGING_OBSERVABILITY_SSH_KEY="<path>" pnpm certify:platform
STAGING_USER="<user>" STAGING_RUNTIME_SSH_KEY="<path>" pnpm certify:platform
pnpm audit:runtime --ssh --ssh-user <user> --ssh-key <path>
```

Directly on the staging VPS:

```bash
cd /opt/creditregulatorpro-staging/app
pnpm audit:runtime --local-vps
pnpm certify:platform
```

Runtime certification is not a PASS until Docker, Traefik, env, DB, storage,
OCR/PDF tooling, logs, volumes, and disk checks are verified.

## Admin Credentials

API/admin packet probe:

```bash
STAGING_ADMIN_EMAIL="<email>" STAGING_ADMIN_PASSWORD="<password>" pnpm audit:admin-auth
STAGING_ADMIN_EMAIL="<email>" STAGING_ADMIN_PASSWORD="<password>" pnpm audit:e2e --require-admin
STAGING_ADMIN_SESSION_COOKIE="<cookie>" pnpm audit:admin-auth
STAGING_ADMIN_SESSION_COOKIE="<cookie>" pnpm audit:e2e --require-admin
```

Browser admin click-through:

```bash
E2E_ADMIN_EMAIL="<email>" E2E_ADMIN_PASSWORD="<password>" pnpm certify:platform
STAGING_ADMIN_EMAIL="<email>" STAGING_ADMIN_PASSWORD="<password>" pnpm certify:platform
```

Missing credentials or unavailable SSH diagnostics produce `INCOMPLETE` /
`BLOCKED_BY_INPUTS` in the default development certification mode. They still
block production certification because `CERTIFYING` remains false.

Use strict mode for production gates:

```bash
pnpm certify:platform --strict
```
