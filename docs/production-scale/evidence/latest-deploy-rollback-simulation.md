# Deploy Rollback Simulation Evidence

Generated: 2026-05-22T20:41:28.733Z
Current HEAD: 035b06c1271475e74d0bbd808daeb001898fe7b3
Status: passed
CERTIFYING:false

## Summary

- Health pass keeps target: passed
- Health fail restores previous: passed
- Rollback failure remains non-certifying: passed
- Workflow rollback failure handler: passed
- Pass/fail evidence produced: passed
- Bash syntax for extracted run blocks: passed

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
