# Deploy Rollback Simulation Evidence

Generated: 2026-05-21T09:00:20.465Z
Current HEAD: 03744f97c787d67828003e40f7f7faf7e068fe9b
Status: passed
CERTIFYING:false

## Summary

- Health pass keeps target: passed
- Health fail restores previous: passed
- Rollback failure remains non-certifying: passed
- Workflow rollback failure handler: passed
- Pass/fail evidence produced: passed
- Bash syntax for extracted run blocks: passed

## Commands Run

- `git diff --check`: passed; Git reported line-ending warnings only.
- `pnpm exec vitest run tests/unit --runInBand`: failed before test execution because Vitest 4.1.5 rejects the unsupported `--runInBand` option.
- `pnpm exec vitest run --config vitest.config.ts tests/unit`: passed, 155 files and 1131 tests.
- `pnpm exec vitest run --config vitest.config.ts tests/unit/deploy-rollback-simulation.spec.ts tests/unit/deploy-staging-workflow.spec.ts tests/unit/deploy-production-workflow.spec.ts tests/unit/deploy-rollback-sha-governance.spec.ts`: passed, 4 files and 32 tests.
- `pnpm run deploy:rollback-simulation -- --write-evidence --json`: passed.
- `pnpm run check`: passed.

## Scenarios

### target-health-pass
- Target SHA: `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`
- Previous SHA: `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`
- Final SHA: `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`
- Health result: passed
- Rollback attempted: no
- Rollback succeeded: no
- Rollback health result: not-run
- CERTIFYING: false

### target-health-fail-rollback-pass
- Target SHA: `cccccccccccccccccccccccccccccccccccccccc`
- Previous SHA: `dddddddddddddddddddddddddddddddddddddddd`
- Final SHA: `dddddddddddddddddddddddddddddddddddddddd`
- Health result: failed
- Rollback attempted: yes
- Rollback succeeded: yes
- Rollback health result: passed
- CERTIFYING: false

### target-health-fail-rollback-fail
- Target SHA: `eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee`
- Previous SHA: `ffffffffffffffffffffffffffffffffffffffff`
- Final SHA: `eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee`
- Health result: failed
- Rollback attempted: yes
- Rollback succeeded: no
- Rollback health result: not-run
- CERTIFYING: false

## Workflow Validation

- passed: staging captures previous SHA before target checkout
- passed: production captures previous SHA before target checkout
- passed: workflows preserve previous image IDs for restore fallback
- passed: staging has automatic rollback failure handler
- passed: production has automatic rollback failure handler
- passed: machine-readable rollback evidence is emitted
- passed: shell blocks pass bash -n

## Boundaries

- Automated local simulation and static workflow validation only; no live deployment was required.
- No secrets, remote hosts, external providers, or production data were used.
- This evidence validates rollback control behavior, not full blue-green deployment capacity.
