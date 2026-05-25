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

## Codex task checkpoint
- Before Codex edits any file, run:
  - `git status`
  - `git add .`
  - `git commit -m "checkpoint before codex task"`
- If the working tree includes secrets, `.env` files, forbidden deployment config, or files outside this repo, stop instead of staging.
- Treat the checkpoint as a rollback marker only; do not use it to hide or overwrite user work.

## Platform engineering doctrine

### Primary rule
No code modification may negatively impact:
- existing flows
- existing ingestion
- deterministic parsing
- canonical mapping
- evidence binding
- violation detection
- dispute packet generation
- admin workflows
- user workflows
- regression stability

All requested fixes or augmentations must:
- remain bounded
- preserve existing behavior outside the target scope
- use the smallest safe patch possible
- avoid unrelated refactors
- avoid architectural drift
- avoid speculative abstractions

### Required workflow
Before any code change:
1. Inspect current architecture
2. Identify upstream/downstream dependencies
3. Define impact boundary
4. Identify protected systems
5. Identify regression risks

After changes:
1. Run relevant tests
2. Validate existing flows
3. Confirm no unrelated files/functions changed
4. Report exact impact scope

### Hard restrictions
Do not:
- rewrite working systems unnecessarily
- modify unrelated files
- silently change schemas
- alter canonical models without approval
- alter parser logic outside parser tasks
- alter violation logic outside violation tasks
- alter dispute logic outside dispute tasks
- introduce AI logic into deterministic systems
- change consumer-facing wording unnecessarily
- create duplicate services/subsystems

### Protected systems
The following systems are considered platform-critical and require bounded modifications only:
- ingestion pipeline
- deterministic parser
- canonical mapping engine
- evidence engine
- violation engine
- regulation registry
- dispute packet generator
- audit logging
- admin correction system

### Change philosophy
Prefer:
- minimal diffs
- deterministic behavior
- explicit logic
- regression safety
- backward compatibility
- additive augmentation

Avoid:
- broad refactors
- speculative optimization
- unnecessary abstraction
- hidden side effects
- architectural expansion without justification

### Testing requirements
Every meaningful change must:
- validate the target function
- validate adjacent flows
- validate no regression
- preserve existing deterministic behavior

Use the tiered validation commands documented in `docs/validation-tiers.md`:
- ordinary local work: `pnpm run validate:fast`
- changed subsystem work: `pnpm run validate:changed`
- staging push readiness: `pnpm run validate:staging`
- production promotion readiness: `pnpm run validate:release`
- admin route/permission/navigation/rendering changes: `pnpm run certify:admin`

The fixed golden path must stay green as part of `validate:staging` whenever protected systems change and as part of every `validate:release` run. Use `pnpm run test:regression-dashboard` when a human-readable pass/fail table is needed.

The golden path covers upload payload contract, parse, canonical map, anomaly detect, violation detect, evidence bind, packet generate, and PDF download.

### High-risk explain-before-edit rule
For parser, violation, evidence, regulation, packet, audit, admin truth-layer, and schema changes, Codex must explain before editing:
- selected model path and risk level
- upstream callers and downstream consumers
- impact boundary
- protected systems touched
- regression risks and exact tests to run

Do not modify protected subsystem code until that explanation is visible.

### No Silent Truth Change
Nothing may change canonical truth, parser mappings, regulation mappings, violation rules, evidence binding, seeded reference data, packet truth, or schema behavior without:
- a test update proving the intended truth
- a version, migration, or explicit update marker
- an audit log or review trail
- an admin review path when human approval is needed

### Consumer clarity and legal-reference wording
Every consumer-facing page must answer: could a non-technical user understand what to do next in under 30 seconds?

Consumer-facing legal language must separate references from conclusions. Prefer:
`This item may require review under [rule/reference].`

Do not call an item a confirmed legal violation in consumer-facing copy unless a reviewed authority classification explicitly supports that wording and the surface is approved for it.

### Failure rule
If the requested change requires broad architectural modification:
STOP.
Produce an implementation plan and risk analysis instead of modifying code directly.

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
- `commit-push` defaults to `validate:fast`; use `--local-gate changed`, `--local-gate staging`, or `--local-gate full` when the changed files require broader validation.
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
