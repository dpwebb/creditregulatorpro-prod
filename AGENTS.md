# CreditRegulatorPro Staging Repo Rules

## Scope
- Work only in this repository: C:\Users\webbd\My Drive\Projects\creditregulatorpro-staging
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
- Make changes in staging only
- Do not commit automatically unless explicitly asked
- Do not push automatically unless explicitly asked
- Suggest a commit message after each task

## Browser/testing workflow
- Use the normal browser for authenticated staging pages
- Do not rely on the Codex in-app browser for login-protected flows
