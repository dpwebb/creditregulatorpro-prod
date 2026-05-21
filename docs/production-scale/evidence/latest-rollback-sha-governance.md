# Rollback SHA Governance Evidence

Generated: 2026-05-21T08:40:01.613Z
Current HEAD: 12d0e9bf3b51dd5adf2739324b6226666c415bfd
Status: passed
CERTIFYING:false

## Summary

- Resolve target before validation: passed
- Strict rollback SHA validation: passed
- Approved branch reachability: passed
- Validation checkout equals target: passed
- Remote checkout equals target: passed
- Explicit production compose file: passed
- Bash syntax for extracted run blocks: passed

## Commands

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm run deploy:rollback-sha-governance -- --json` | PASS | Static workflow validator passed for staging and production. |
| `pnpm exec vitest run --config vitest.config.ts tests/unit/deploy-rollback-sha-governance.spec.ts tests/unit/deploy-production-workflow.spec.ts tests/unit/deploy-staging-workflow.spec.ts tests/unit/production-deployment-parity-evidence.spec.ts` | PASS | Focused workflow governance tests passed: 4 files, 31 tests. |
| `pnpm run deploy:rollback-sha-governance -- --write-evidence --json` | PASS | Generated this rollback SHA governance evidence. |
| `pnpm run production-deployment-parity:evidence -- --json` | PASS | Existing production deployment parity evidence accepted the new target SHA controls. |
| `git diff --check` | PASS | Whitespace check passed; Git reported line-ending warnings only. |
| `pnpm exec vitest run tests/unit --runInBand` | FAIL | Vitest 4.1.5 rejected unsupported option `--runInBand` before running tests. |
| `pnpm exec vitest run --config vitest.config.ts tests/unit` | PASS | Compatible unit suite passed: 154 files, 1124 tests. |
| `pnpm run check` | PASS | Build, golden path, unit, deterministic ingestion, credit regression, tradeline internal, and violation correction checks passed. |

## Workflow Checks

### staging
- Path: `.github/workflows/deploy-staging.yml`
- Approved branch: `staging`
- Status: passed
- passed: TARGET_SHA is resolved before validation jobs
- passed: rollback_sha is strict 40-hex and passed through env
- passed: TARGET_SHA must be reachable from the approved branch
- passed: validation checkout must equal TARGET_SHA
- passed: deploy evidence target SHA must equal deploy target SHA
- passed: remote checkout verifies HEAD equals TARGET_SHA
- passed: run shell blocks pass bash -n

### production
- Path: `.github/workflows/deploy-production.yml`
- Approved branch: `main`
- Status: passed
- passed: TARGET_SHA is resolved before validation jobs
- passed: rollback_sha is strict 40-hex and passed through env
- passed: TARGET_SHA must be reachable from the approved branch
- passed: validation checkout must equal TARGET_SHA
- passed: deploy evidence target SHA must equal deploy target SHA
- passed: remote checkout verifies HEAD equals TARGET_SHA
- passed: run shell blocks pass bash -n
- passed: production compose file is passed explicitly

## Boundaries

- Static workflow validation only; no live deployment was required.
- No secrets, remote hosts, or external providers were called.
- This evidence certifies only the rollback SHA governance controls in the workflows.
