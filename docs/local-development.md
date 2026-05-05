# Local Development Bootstrap

This repo can run against local-only services without copying secrets into the
working tree or changing staging/production deploy behavior.

## Guardrails

- Keep secrets outside the repo, for example in `C:\Users\webbd\Projects\global-secrets.env`.
- Keep machine-local overrides in `env.json`.
- `env.json` is ignored by Git and excluded from Docker build context.
- Global secrets are loaded only when `CRP_LOCAL_DEV=true` and `NODE_ENV` is not `production`.
- Localhost origins are allowed by the domain guard only when `CRP_LOCAL_DEV=true` and `NODE_ENV=development`.
- `LOCAL_DATABASE_NAME` only rewrites the app database name in local-dev bootstrap mode.

These guards prevent local-only bootstrap settings from changing staging or
production when commits are pushed.

## Local Files

Create `env.json` in the repo root:

```json
{
  "CRP_LOCAL_DEV": "true",
  "NODE_ENV": "development",
  "PORT": "3333",
  "APP_BASE_URL": "http://localhost:5175",
  "PREVIEW_URL": "http://localhost:5175",
  "GLOBAL_SECRETS_PATH": "C:\\Users\\webbd\\Projects\\global-secrets.env",
  "LOCAL_DATABASE_NAME": "creditregulatorpro_staging",
  "LOCAL_DOCUMENT_STORAGE_PATH": ".local/document-storage",
  "LOG_LEVEL": "debug"
}
```

The global secrets file should provide shared external access variables such as
database credentials, JWT secret, and AI provider keys. Do not paste those
values into tracked files.

## Local Database

The app expects `FLOOT_DATABASE_URL`. In local-dev bootstrap mode, if
`FLOOT_DATABASE_URL` is absent, invalid, or a placeholder, `DATABASE_URL` is used
as the base connection string. If `LOCAL_DATABASE_NAME` is set, only the database
name is replaced.

This allows one local Postgres service on `127.0.0.1:5432` to host separate
databases for separate projects. For this repo, use:

```text
creditregulatorpro_staging
```

Do not point local development at the live staging database unless you intend
local actions to write staging data.

To populate localhost with the auth schema, core app tables, users, report
artifacts, tradelines, and parser-test persistence tables:

```powershell
pnpm run bootstrap:local-auth-schema
pnpm run bootstrap:local-app-fixtures
```

The app fixture bootstrap refuses to run unless local-dev mode is enabled and
the resolved database host is localhost.

## Run

Start the backend:

```powershell
pnpm run start
```

Start the frontend:

```powershell
pnpm run dev
```

Open:

```text
http://localhost:5175/try-upload
```

Do not use `http://localhost:3333` as the browser URL for local app flows. In
local development, `3333` is the backend/API port and Vite on `5175` proxies API
requests to it. The backend redirects direct HTML page requests to `5175` when
`CRP_LOCAL_DEV=true` so localhost testing stays on the correct frontend port.

Do not use `http://localhost:5174` for this repo. That port is reserved for a
different local project.
