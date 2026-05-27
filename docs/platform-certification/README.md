# Level 5 Platform Certification Inputs

`pnpm certify:platform` distinguishes platform failures from certification
inputs that are unavailable on the current machine.

## Deployment Certification Mode

The certification scripts fail closed by default:

```bash
CRP_DEPLOYMENT_CERTIFICATION_MODE=LIVE_PRODUCTION pnpm certify:platform
```

Accepted values are:

- `LIVE_PRODUCTION`
- `NON_PUBLIC_PRODUCTION_TEST`
- `OFFLINE_DEPLOYMENT`

Missing or invalid values resolve to `LIVE_PRODUCTION`.

`NON_PUBLIC_PRODUCTION_TEST` and `OFFLINE_DEPLOYMENT` are only for the
current offline/non-public deployment target. They are not LIVE Production
approval. In these modes, only admin credential/session or browser
click-through incompleteness may be deferred into
`deferredLiveProductionBlockers`. Build, migration, runtime, storage,
parser/packet, resilience, rollback, parity, host-key, destructive-risk, and
data-safety gates remain hard blockers.

The platform JSON records:

- `certificationMode`
- `liveProductionCertified`
- `nonPublicDeploymentAcceptable`
- `deferredLiveProductionBlockers`

Before any LIVE Production declaration, rerun strict LIVE certification with
verified admin credentials or a verified admin session:

```bash
CRP_DEPLOYMENT_CERTIFICATION_MODE=LIVE_PRODUCTION \
  STAGING_ADMIN_EMAIL="<email>" \
  STAGING_ADMIN_PASSWORD="<password>" \
  E2E_ADMIN_EMAIL="<email>" \
  E2E_ADMIN_PASSWORD="<password>" \
  pnpm certify:platform --strict
```

Missing admin click-through proof remains a LIVE-production blocker.

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

When `STAGING_ADMIN_EMAIL` plus `STAGING_ADMIN_PASSWORD`, or
`STAGING_ADMIN_SESSION_COOKIE`, is available to `pnpm certify:platform`, the
Level 3 operational gate automatically runs:

```bash
pnpm audit:e2e --require-admin
```

Without those inputs, certification keeps the non-admin E2E workflow and reports
the admin packet workflow as `INCOMPLETE` / `BLOCKED_BY_INPUTS`.

Browser admin click-through:

```bash
E2E_ADMIN_EMAIL="<email>" E2E_ADMIN_PASSWORD="<password>" pnpm certify:platform
STAGING_ADMIN_EMAIL="<email>" STAGING_ADMIN_PASSWORD="<password>" pnpm certify:platform
```

Missing credentials or unavailable SSH diagnostics produce `INCOMPLETE` /
`BLOCKED_BY_INPUTS` in the default certification mode. Runtime diagnostics
cannot be deferred. Admin credential/click-through incompleteness can be
deferred only under `NON_PUBLIC_PRODUCTION_TEST` or `OFFLINE_DEPLOYMENT`; it
still blocks LIVE Production because `liveProductionCertified` and
`CERTIFYING` remain false.

Use strict mode for production gates:

```bash
pnpm certify:platform --strict
```

## Production Go-Live Guard

The production promotion guard uses the committed Level 5 platform certification
evidence, production SSH host-key pinning, and the production worker policy.

Set the production SSH host-key fingerprint as either a GitHub Actions variable
or secret on `dpwebb/creditregulatorpro-prod`:

```bash
gh variable set PRODUCTION_SSH_HOST_KEY_SHA256 \
  --repo dpwebb/creditregulatorpro-prod \
  --body "SHA256:<fingerprint>[,SHA256:<fingerprint>...]"
```

The deploy workflow refuses to write `known_hosts` until the scanned production
host key matches `PRODUCTION_SSH_HOST_KEY_SHA256`.

For first go-live, the production ingest worker is intentionally no-worker by
default. Normal production deploys start only `creditregulatorpro`; any
production ingest worker dry-run or bounded apply requires explicit
`workflow_dispatch` inputs.
