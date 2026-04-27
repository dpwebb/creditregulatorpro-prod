# GitHub Source of Truth

This project treats GitHub as the canonical copy of the application code.
Staging and production should only run code that exists in GitHub at a known commit.

## Repository

- Local staging repo: `C:\Users\webbd\My Drive\Projects\creditregulatorpro-staging`
- GitHub remote: `https://github.com/dpwebb/creditregulatorpro-staging.git`
- Default staging branch: `staging`

## Workflow

1. Make source changes in the local staging repo.
2. Run checks locally.
3. Commit the intended changes.
4. Push the branch to GitHub.
5. Deploy staging from the pushed GitHub commit.
6. Promote to production only from an approved GitHub commit, tag, or release.

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
- `STAGING_SSH_PORT` optional, defaults to `22`

## Rollback

Use the `Deploy staging` GitHub Actions workflow manually and enter a previous commit SHA in `rollback_sha`.

That redeploys the selected commit to `/opt/creditregulatorpro-staging/app` and restarts the staging container.
