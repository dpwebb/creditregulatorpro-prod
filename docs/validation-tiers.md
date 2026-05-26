# Validation Tiers

This repo uses tiered validation to keep ordinary development fast without removing production safety gates.

## Tier Summary

| Tier | Command | Use |
| --- | --- | --- |
| Fast | `pnpm run validate:fast` | Local commit and ordinary development. Runs typecheck plus changed/related Vitest files when detectable. Does not run full baseline, full click-through, full E2E, or full regression. |
| Changed | `pnpm run validate:changed` | Pull requests and local subsystem work. Runs typecheck plus changed-area tests and related subsystem checks. Adds golden path only when changed files touch protected critical subsystems. |
| Staging | `pnpm run validate:staging` | Pushes to staging. Runs lint-status, typecheck, build, and targeted tests. Runs full regression only for core ingestion, parser, violation scanning, packet generation, auth/roles, database migration, or admin routing changes. |
| Release | `pnpm run validate:release` | Production promotion. Always runs the full baseline, runtime smokes, migration/promotion gates, storage/rollback/soak evidence, and production promotion guard. |
| Admin Certification | `pnpm run certify:admin` | Required when admin routes, permissions, navigation, page rendering, or production-critical admin flows change. Runs admin route/role tests and Playwright admin click-through. |

`pnpm run check` is retained as a compatibility alias for `pnpm run validate:release`.

GitHub release-validation workflows run `response:soak-check` against an isolated local PostgreSQL service that is bootstrapped during the job. The soak check must not use production database credentials during pre-deploy validation.

## Full Regression Trigger

`validate:staging` promotes from targeted checks to full regression when changed files touch any of these areas:

- Core ingestion, upload processing, parser, canonical mapping, bureau parsing, or deterministic replay.
- Violation scanning, compliance detection, regulation mapping, or legal-reference logic.
- Dispute packet generation, packet PDF, packet lifecycle, response-document linkage, or evidence binding.
- Auth, session, roles, support/admin permissions, route protection, or owner visibility.
- Database migrations, runtime schema governance, or migration tooling.
- Admin routing, admin sidebar/navigation, admin endpoints, or admin-critical rendering.

Unknown changed-file scope fails safe and uses full regression outside `validate:fast`.

## Staging Runtime Smoke Scope

The staging deploy workflow always validates and deploys the selected commit, then checks the public `/login` route before and after deployment. The heavier response/auth smoke block runs only when changed files touch runtime surfaces that can affect auth, sessions, roles, response documents, outcome tracking, admin review/routing, backend routing, migrations, deployment config, or the smoke scripts themselves.

Unknown changed-file scope or an empty changed-file list still fails safe and runs the response/auth smoke block.

## Duplicate Runs Removed

The release tier intentionally does not run `test:contracts`, `test:api`, or `test:evidence-ledger` separately because `test:unit:check` already includes those Vitest suites while splitting long-running queue specs into bounded invocations.

Production workflow now calls `validate:release` once instead of running:

- `pnpm run migrations:gate`
- `pnpm run check`
- `pnpm run test:contracts`
- `pnpm run test:api`
- `pnpm run test:deterministic-ingestion-report`
- `pnpm run migrations:gate` again
- `pnpm run packet-pdf:cache-miss-proof`
- `pnpm run test:evidence-ledger`
- the heavier promotion evidence commands as a separate block

Production-scale certification also no longer has a separate `applicationCheck` gate that reruns `pnpm run check` after its individual required gates.

## Recommended Command Sequences

Small code change:

```bash
pnpm run validate:fast
pnpm run commit-push -- --message "short summary"
```

Parser or ingestion change:

```bash
pnpm run validate:changed
pnpm run validate:staging
pnpm run commit-push -- --message "parser/ingestion summary" --local-gate staging
```

Admin UI change:

```bash
pnpm run validate:changed
pnpm run certify:admin
pnpm run validate:staging
pnpm run commit-push -- --message "admin UI summary" --local-gate staging
```

Production release:

```bash
pnpm run validate:release
pnpm run promote:production -- --confirm
```

If the release includes admin-critical changes, run `pnpm run certify:admin` before `pnpm run promote:production -- --confirm`; `validate:release` will also require admin certification when it detects admin-critical changed files.

## Safety Rules

- Do not bypass `validate:release` for production promotion.
- Do not use `--local-gate none` unless GitHub Actions is intentionally the first full gate and the push will still be verified.
- Do not treat skipped Playwright admin tests as certification. `certify:admin` fails closed when remote admin credentials are required but unavailable.
- Do not remove readiness gating, parser safeguards, packet validation, role restrictions, migration governance, or compliance scanner tests.
