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
