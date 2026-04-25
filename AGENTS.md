# AGENTS.md

## Project
Credit Regulator Pro staging repository.

## Mission
Make requested code changes in staging only.
Never deploy directly to production.
Optimize for safe, small, reviewable changes.

## Repo rules
- Treat this repo as the staging source of truth.
- Never edit `.env`, `.env.*`, secrets, API keys, or tokens.
- Never change `docker-compose.yml`, deployment scripts, or server config unless explicitly asked.
- Never remove logging, backup, rollback, or release-log behavior unless explicitly asked.
- Preserve existing auth, billing, and admin protections.
- Do not commit generated build output, logs, caches, or local machine files.

## Workflow
- Inspect relevant files first.
- Make the smallest change that satisfies the request.
- Prefer editing existing components over creating duplicates.
- Keep UI consistent with the current app.
- After changes, explain:
  - what changed
  - which files changed
  - risks
  - how to test in staging

## Safety rails
- Never touch production URLs, production compose files, or production env files.
- Never commit secrets.
- Never bypass authentication or authorization.
- Never delete backups.
- If a task looks risky, stop and ask for approval.

