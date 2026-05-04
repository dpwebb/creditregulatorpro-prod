# CreditRegulatorPro Staging Repo Rules

## Scope
- Work only in this repository: C:\Users\webbd\Projects\creditregulatorpro-staging
- Never edit production paths
- Treat this repo as the only writable codebase

## Do not change unless explicitly requested
- .env
- .env.*
- docker-compose files
- deployment scripts
- proxy config
- backup / rollback scripts
- GitHub Actions secrets or credentials

## Default behavior
- Prefer minimal diffs
- Preserve existing behavior unless the request explicitly changes behavior
- Keep styles and architecture consistent with the current codebase
- Explain changed files after each task
- Give exact test steps after each task
- If uncertain, inspect first and summarize before editing

## Git workflow
- Treat this local directory as the working copy for Codex chat changes
- GitHub remains the source of truth for deployment after commits are pushed
- Make changes in staging only
- Default publish path is `pnpm run commit-push -- --message "<summary>"`
- `commit-push` is the standard integrated publish command and must target `staging`
- Unless the user explicitly asks to hold changes locally, run the automated commit-push flow after task changes are complete and checks pass
- Do not add or require new secrets, tokens, deploy keys, Hostinger authentication, or GitHub authentication
- Suggest a commit message after each task

## Browser/testing workflow
- Use the normal browser for authenticated staging pages
- Do not rely on the Codex in-app browser for login-protected flows
- For CreditRegulatorPro localhost work, use `http://localhost:5175` for browser/frontend testing.
- Treat `http://localhost:3333` as the local backend/API port only; do not use it as the browser URL for app flows.
- Do not use `http://localhost:5174` for this repo. That port belongs to another local project.

## Live staging diagnostics

This repo is the staging app at:

/opt/creditregulatorpro-staging/app

Codex may read staging logs and run diagnostics:

- docker logs --tail=500 creditregulatorpro-staging
- docker ps -a
- curl -k -I https://staging.creditregulatorpro.com
- npm run check
- npm run build

Allowed:
- modify app source files in this repo
- run install/check/build commands
- suggest Docker or server commands

Forbidden:
- edit /opt/creditregulatorpro/app
- edit .env or .env.*
- modify production containers
- modify Traefik or Postgres config
- expose secrets in output
