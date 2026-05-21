# SSH Host Key Pinning Evidence

Generated: 2026-05-21T09:32:52.753Z
Current HEAD: 87f3e0b338f7fdb15f1a63c7105ec8c03acedefd
Status: passed
CERTIFYING:false

## Required Configuration

- Production must set `PRODUCTION_SSH_HOST_KEY_SHA256` as a GitHub secret or variable.
- Staging supports `STAGING_SSH_HOST_KEY_SHA256` as a GitHub secret or variable; configure it to enforce the same pinning behavior on staging.
- Values must be SSH host key fingerprints in `SHA256:...` format. This document intentionally does not include real values.

## Summary

- Missing production expected fingerprint fails closed: passed
- Mismatched expected fingerprint fails closed: passed
- Matched expected fingerprint passes: passed
- known_hosts write happens after verifier gate: passed
- Bash syntax for extracted run blocks: passed

## Commands Run

- `git diff --check`: passed; Git reported line-ending warnings only.
- `pnpm exec vitest run tests/unit --runInBand`: failed before test execution because Vitest 4.1.5 rejects the unsupported `--runInBand` option.
- `pnpm exec vitest run --config vitest.config.ts tests/unit`: passed, 156 files and 1139 tests.
- `pnpm exec vitest run --config vitest.config.ts tests/unit/deploy-ssh-host-key-pinning.spec.ts tests/unit/deploy-staging-workflow.spec.ts tests/unit/deploy-production-workflow.spec.ts`: passed, 3 files and 27 tests.
- `pnpm run deploy:ssh-host-key-pinning -- --write-evidence --json`: passed.
- `pnpm run check`: passed.

## Workflow Validation

- passed: production requires expected SSH host fingerprint
- passed: production compares scanned key to expected fingerprint
- passed: staging supports the same expected fingerprint verifier
- passed: ssh-keyscan remains collection only
- passed: production known_hosts is written only after verification
- passed: staging known_hosts is written only after verifier gate
- passed: shell blocks pass bash -n

## Simulation Results

- production: failed (missing-expected-fingerprint); known_hosts written=no
- production: failed (fingerprint-mismatch); known_hosts written=no
- production: passed (fingerprint-matched); known_hosts written=yes
- staging: passed (fingerprint-matched); known_hosts written=yes

## Boundaries

- Automated local simulation and static workflow validation only; no live deployment was required.
- No private keys, host key values, GitHub secrets, or production data are included.
- `ssh-keyscan` remains a collection step; workflow trust comes from comparing the collected key fingerprint to configured expected values.
