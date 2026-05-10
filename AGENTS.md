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

## Model routing rules (Codex Windows App)
- Do not use one model for everything; route by complexity, risk, and required reasoning depth.
- Before starting any task:
- inspect relevant files first
- state selected model and why
- state risk level: low / medium / high
- do not modify files until model path is clear

### GPT-5.5 Extra High / Fast Mode
- Use for architecture decisions, full-project audits, workflow planning, unclear multi-system debugging, schema/database design, compliance/regulation reasoning, admin truth-layer design, security/auth decisions, testing strategy, and deployment/staging diagnosis.
- For CreditRegulatorPro, use for violation detection architecture, admin correction truth-layer design, regulatory citation mapping, training feedback loops, E2E testing strategy, and extraction engine improvement strategy.
- Do not use for tiny copy edits or repetitive simple changes.

### GPT-5.3 Codex
- Use for production code implementation, backend endpoints, migrations, API validation, service-layer refactors, frontend/admin implementation, tests, and concrete bug fixes.
- For CreditRegulatorPro, use for implementing approved admin correction systems, migrations, endpoints, validation, tests, and frontend/backend wiring.
- Prefer this when correctness matters more than speed.

### GPT-5.3 Codex Spark
- Use only for small non-critical edits: wording changes, admin UI labels, CSS spacing/layout, simple display-only tweaks, and isolated cleanup.
- Do not use for database/auth/compliance/violation extraction/regulation mapping/PDF extraction/admin truth-layer/production deployment/security/multi-file refactors.

### Decision rule
- High-risk, system-level, or unclear tasks: use GPT-5.5 Extra High.
- Clear implementation or test writing tasks: use GPT-5.3 Codex.
- Small cosmetic isolated edits: use GPT-5.3 Codex Spark.
- When in doubt, escalate upward.

### Guardrails
- Prefer minimal diffs.
- Preserve existing behavior unless explicitly changing it.
- Do not touch production, secrets, environment files, or deployment config unless explicitly instructed.

## Git workflow
- Treat this local directory as the working copy for Codex chat changes
- GitHub remains the source of truth for deployment after commits are pushed
- Make changes in staging only
- Default publish path is `pnpm run commit-push -- --message "<summary>"`
- `commit-push` is the standard integrated publish command and must target `staging`
- Unless the user explicitly asks to hold changes locally, run the automated commit-push flow after task changes are complete and checks pass
- Do not add or require new secrets, tokens, deploy keys, Hostinger authentication, or GitHub authentication
- Suggest a commit message after each task

## Localhost, staging, and data/config promotion
- Keep localhost as the initial workbase for code, UI, and logic changes.
- Do not bypass staging by pushing localhost work directly to production.
- Treat staging as the authoritative pre-production runtime test environment.
- Code moves upward through GitHub: localhost -> `origin/staging` -> staging deploy -> production promotion.
- Data normally moves downward for reproduction: staging -> localhost refresh.
- Do not assume localhost database, uploaded-file, session, token, role, or configuration changes will appear on staging.
- Any meaningful data/config change required on staging must be made reproducible as a migration, seed, admin operation, export/import, or audited remediation script.
- Core truth includes admin/support roles, feature flags, system settings, compliance config, parser mappings, statutes/rules/reference data, letter templates, lifecycle/test configuration, seeded platform defaults, and schema.
- Environment-specific operational data includes sessions, OAuth rows, reset/email tokens, login attempts, rate limits, audit logs, uploaded documents, payment records, support tickets, IP addresses, and user-agent data.
- Before staging validation, identify whether the task changed only code or also changed core data/config that must be applied and verified on staging.

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
