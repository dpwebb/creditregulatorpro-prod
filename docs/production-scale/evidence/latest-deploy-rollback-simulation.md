# Deploy Rollback Simulation Evidence

Generated: 2026-05-21T09:14:14.766Z
Current HEAD: 0da5d6e2801f4c21e20ad161631c1f2f87e1f58a
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
- `pnpm run commit-push -- --message "Add deploy rollback simulation and recovery path"`: passed; pushed `0da5d6e2801f4c21e20ad161631c1f2f87e1f58a`, then staging Action `26216640000` failed in deploy due nested heredoc indentation.
- `gh run view 26216640000 --log-failed`: passed; confirmed the failed step was `Deploy selected commit` with `here-document ... wanted EOF`.
- Remediation: rollback evidence writers now use `printf` JSON output and the static simulator checks that nested heredocs are not used for rollback evidence.

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
- passed: rollback evidence writers avoid nested heredocs
- passed: shell blocks pass bash -n

## Boundaries

- Automated local simulation and static workflow validation only; no live deployment was required.
- No secrets, remote hosts, external providers, or production data were used.
- This evidence validates rollback control behavior, not full blue-green deployment capacity.
