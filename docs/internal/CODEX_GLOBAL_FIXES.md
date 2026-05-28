# Codex Global Project Directives

This file preserves durable Codex standing directives for CreditRegulatorPro. It applies across future Codex tasks unless the operator explicitly overrides it.

## CreditRegulatorPro Non-Public Deployment Directive

Until the operator explicitly declares LIVE Production, treat CreditRegulatorPro as a non-public/offline production-test project, even when deploying to the production target. The production website is not considered public/live yet. Do not repeatedly run full LIVE-style release suites after every small fix. Use targeted failed checks first. Prefer same-commit `nonPublicDeploymentAcceptable:true` certification evidence plus core safety gates for non-public production-test promotion. Keep strict LIVE Production gates deferred until the operator explicitly declares LIVE Production.

## Validation Strategy Before LIVE Production

- Prefer targeted validation for the changed area.
- If a command fails, rerun the failed command or failed test file first, not the entire suite.
- Do not rerun thousands of already-passed tests unless a promotion gate truly requires it.
- Do not use full LIVE release gates as the default for small fixes.
- For non-public deployment, rely on valid same-commit certification evidence where:
  - `certificationMode` is `NON_PUBLIC_PRODUCTION_TEST` or `OFFLINE_DEPLOYMENT`
  - `nonPublicDeploymentAcceptable` is `true`
  - `hardUnresolvedBlockers` is empty
  - failed command count is `0`
  - safety flags are clean
  - `currentCommit` matches `HEAD`
  - runtime/infrastructure readiness is `PASS`
  - `parserConfidenceCertification` is `PASS`
  - `packetLifecycleStatus` is `PASS`
  - `storageLifecycleStatus` is `PASS`
  - `reproducibilityStatus` is `PASS`

## LIVE Production Boundary

- LIVE Production begins only when the operator explicitly says the project is going into LIVE Production.
- Until then, missing admin credential proof, admin click-through proof, response soak proof, public exposure hardening, and full LIVE-style release certification may be tracked as deferred LIVE-production blockers.
- Once LIVE Production is declared, strict gates become mandatory again.
- Do not silently convert non-public acceptance into LIVE certification.

## Codex Work Discipline

- Make the smallest safe change that solves the stated problem.
- Avoid overcoding.
- Avoid broad rewrites unless specifically requested.
- Do not combine unrelated fixes.
- Do not modify authentication, authorization, session, role, or production guard behavior unless the task explicitly requires it.
- Preserve app-level auth and admin route protections.
- Do not expose admin pages publicly.
- Do not print secrets, credentials, cookies, database URLs, API keys, tokens, or private env values.
- If secrets are needed, ask for env var names or use existing environment without printing values.
- Prefer deterministic fixes over AI/heuristic behavior changes.
- Preserve parser, packet, violation, evidence, and readiness behavior unless the task specifically targets those systems.

## Deployment and Promotion Discipline

- Do not run promotion automatically unless explicitly instructed.
- Before promotion, confirm branch, `HEAD` commit, clean working tree, and same-commit certification evidence.
- If the repo is in detached `HEAD`, attach the commit to the correct branch before pushing.
- Do not force-push unless explicitly instructed.
- For non-public promotion, prefer a dedicated command such as `promote:non-public-production` if available.
- For LIVE Production promotion, use the strict `promote:production` path.

## Response to Failed Gates

- If a gate fails, classify it first:
  - real application defect
  - missing input/configuration
  - stale evidence
  - environment mismatch
  - test isolation issue
  - LIVE-only blocker deferred during non-public mode
- Do not start broad remediation until the failure is classified.
- If a single test file fails, run that file first after the fix.
- If a failure is caused by environment leakage, fix test isolation rather than weakening the production logic.
- If a failure is caused by stale certification evidence, regenerate evidence for the current `HEAD` instead of changing application code.

## Current Known Non-Public Certification Pattern

- `certificationStatus` may remain `INCOMPLETE` if LIVE-only blockers are deferred.
- `liveProductionCertified` should remain `false` until LIVE Production.
- `nonPublicDeploymentAcceptable:true` is acceptable for non-public/offline deployment if hard blockers are absent.
- `deferredLiveProductionBlockers` must remain visible and must not be hidden.
- The operator must be able to distinguish non-public deployment acceptance from LIVE certification.

## Future Codex Prompt Rule

Whenever Codex is asked to work on CreditRegulatorPro before LIVE Production is declared, it must read this file first and follow these directives unless the operator explicitly overrides them.
