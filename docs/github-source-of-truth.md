# GitHub Source of Truth

This project treats GitHub as the canonical copy of the application code.
Staging and production should only run code that exists in GitHub at a known commit.

## Repository

- Local staging repo: `C:\Users\webbd\Projects\creditregulatorpro-staging`
- GitHub remote: `https://github.com/dpwebb/creditregulatorpro-staging.git`
- Default staging branch: `staging`

## Workflow

1. Make source changes in the local staging repo.
2. Run local checks (`typecheck` + `build`) for fast feedback only.
3. Classify whether the work changed only code or also changed core data/config.
4. Convert meaningful core data/config changes into a reproducible artifact.
5. Commit the intended changes.
6. Push the branch to GitHub.
7. Use staging as the primary validation gate for end-to-end behavior.
8. Promote to production only from an approved staging commit in GitHub.

## Hybrid Validation Model

- Localhost is the initial workbase for code, UI, and logic changes.
- Staging is the first authoritative runtime validation environment.
- Production promotions are blocked unless staging gate checks pass.
- Do not bypass staging by pushing localhost work directly to production.
- Code moves upward through GitHub: localhost -> `origin/staging` -> staging deploy -> production promotion.
- Data normally moves downward for reproduction: staging -> localhost refresh.

## Data And Configuration Promotion

Localhost database changes are disposable unless they are converted into a
reproducible staging change. If a local change must exist on staging, it must be
represented as one of:

- a committed migration or idempotent schema script,
- a committed seed/backfill script,
- a controlled admin operation with verification,
- an export/import artifact for supported admin data,
- an audited staging remediation script.

Core truth must not be fixed only in localhost. Core truth includes:

- admin/support roles,
- feature flags,
- system settings,
- compliance configuration,
- parser mappings,
- statutes, rules, and reference data,
- letter templates,
- lifecycle/test configuration,
- seeded platform defaults,
- database schema.

Environment-specific operational data should not automatically move upward from
localhost to staging or production. This includes sessions, OAuth rows, reset
tokens, email-verification tokens, login attempts, rate limits, audit logs,
uploaded documents, support tickets, payment records, IP addresses, user-agent
data, and ad hoc local test users.

## Rules

- Do not make long-lived manual edits on the server.
- If an emergency server edit is made, copy it back into this repo and commit it immediately.
- If a change is not in GitHub, treat it as temporary and unsafe.
- Before deploying, confirm the working tree exactly matches the GitHub upstream branch.

## Verify Before Deploy

Run:

```bash
npm run check:source-of-truth
```

The check passes only when:

- the repo has an upstream branch configured,
- the latest upstream state has been fetched,
- the working tree has no uncommitted changes,
- local `HEAD` exactly matches the upstream GitHub branch.

If the check fails, commit and push intended changes or pull the latest GitHub state before deploying.

## Automatic Staging Deploys

The staging site is deployed by `.github/workflows/deploy-staging.yml`.

When a commit is pushed to the `staging` branch:

1. GitHub Actions checks out the commit.
2. GitHub Actions installs dependencies and builds the app.
3. If the build passes, GitHub Actions connects to the staging server.
4. The staging server checks out the exact pushed commit.
5. The staging server installs dependencies, builds, and restarts the staging container.

Required GitHub environment secrets for `staging`:

- `STAGING_HOST`
- `STAGING_USER`
- `STAGING_SSH_PRIVATE_KEY`

Optional GitHub environment secret:

- `STAGING_SSH_PORT` defaults to `22` when omitted

## Production Promotion

Production promotion uses the same local command in every Codex project:

```bash
pnpm run promote:production
```

The command is a dry run by default. It verifies:

- the current branch is `staging`,
- the local branch is clean,
- local `HEAD` matches `origin/staging`,
- `pnpm run check:staging-gate` passes,
- `pnpm run check` passes,
- the production repository is reachable,
- the production branch has not moved unexpectedly.

To promote the exact approved staging commit to production:

```bash
pnpm run promote:production -- --confirm
```

Emergency bypass (not normal flow):

```bash
pnpm run promote:production -- --confirm --skip-staging-gate
```

Use `--skip-staging-gate` only when staging itself is unavailable and rollback/incident response requires immediate production action.

Default production target:

- Repository: `https://github.com/dpwebb/creditregulatorpro-prod.git`
- Branch: `main`

If production history is not an ancestor of the approved staging commit, the command stops. After reviewing the history, a one-time replacement can be made explicitly:

```bash
pnpm run promote:production -- --confirm --allow-non-fast-forward
```

This uses `--force-with-lease` against the production branch's last observed commit, so it will fail if someone else updates production between the check and the push.

No GitHub secrets, deploy keys, server credentials, or production environment variables are added or changed by this workflow. It uses the Git credentials already available on the machine running the command.

## Rollback

Use the `Deploy staging` GitHub Actions workflow manually and enter a previous commit SHA in `rollback_sha`.

That redeploys the selected commit to `/opt/creditregulatorpro-staging/app` and restarts the staging container.
