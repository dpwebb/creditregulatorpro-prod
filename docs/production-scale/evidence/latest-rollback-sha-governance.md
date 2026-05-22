# Rollback SHA Governance Evidence

Generated: 2026-05-22T12:46:04.686Z
Current HEAD: 79af5282d400136dd75aa3d9d952799a37b92d32
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
