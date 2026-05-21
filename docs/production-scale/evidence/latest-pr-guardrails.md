# PR Regression Guardrails Evidence

Generated at: 2026-05-21T11:11:04.697Z
Current HEAD: `1f96053a13ef763aeb2a932ad0e98432ba85d897`
Target environment: `pull-request`
Status: passed
CERTIFYING:true

## Workflow Names

- .github/workflows/pr-regression-guardrails.yml: PR regression guardrails
- .github/workflows/deploy-production.yml: Deploy production

## Fast Guardrail

- `pnpm run test:golden-path`

## Compliance-Critical PR Guardrail

- `pnpm run test:contracts`
- `pnpm run test:api`
- `pnpm run test:deterministic-ingestion-report`
- `pnpm run migrations:gate`
- `pnpm run packet-pdf:cache-miss-proof`
- `pnpm run test:evidence-ledger`

## Heavier Automated Pre-Promotion Checks

- `pnpm run response:soak-check`
- `pnpm run storage:durability-contract`
- `pnpm run deploy:rollback-simulation`
- `pnpm run production-scale:evidence`
- `pnpm run production-scale:promotion-pack`

## Validation

- pr workflow parsed: passed
- production workflow parsed: passed
- fast golden path preserved: passed
- compliance-critical PR guardrail commands present: passed
- heavy checks are scheduled or manually dispatchable: passed
- production promotion workflow includes heavier checks: passed
- guardrail commands require no manual UI interaction: passed
- PR workflow run blocks pass bash syntax: passed
- production workflow run blocks pass bash syntax: passed
