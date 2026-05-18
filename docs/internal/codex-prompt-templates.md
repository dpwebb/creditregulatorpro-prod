# Codex Prompt Templates

These templates are starting points. Replace bracketed fields and remove sections that do not apply. Keep protected-system rules in place unless the task explicitly targets that system.

## Design-Only Task

```text
HEADER: DESIGN ONLY - [SUBJECT]

Use Codex 5.5 on highest intelligence.

Objective:
Design [specific boundary/feature] without modifying files.

Do not modify code.
Do not modify schema.
Do not create migrations.
Do not update docs.
Do not commit.
Do not push.
Do not use git add -A.

Start with:
git status --short

If the working tree is not clean, stop and report changed files.

Inspect:
- [files]

Report:
1. Current architecture
2. Safety boundaries
3. Options comparison
4. Recommended first slice
5. Tests required
6. Risks
7. Proposed implementation prompt
8. Final git status
```

## Backend Endpoint Slice

```text
HEADER: IMPLEMENT BACKEND ENDPOINT SLICE - [SUBJECT]

Objective:
Implement [endpoint/service] as a bounded backend-only slice.

Do not modify UI.
Do not modify parser/canonical/OCR.
Do not change violation firing.
Do not change packet readiness/wording/PDF.
Do not activate DB regulation runtime truth.
Do not create admin override.
Do not create direct furnisher flow.
Do not use git add -A.

Start with git status --short. Stop if dirty.

Inspect [related endpoints/services/tests].

Implement:
- [endpoint file]
- [schema file]
- [service/helper]
- [focused tests]

Validation:
- pnpm exec vitest run [target endpoint spec]
- pnpm run typecheck
- git diff --check

Stage only directly related files, commit, push, verify staging deploy and health.
```

## UI Slice

```text
HEADER: IMPLEMENT UI SLICE - [SUBJECT]

Objective:
Implement [admin/user] UI using existing endpoints only.

Do not modify schema.
Do not modify backend endpoint behavior.
Do not add forbidden controls or consumer legal conclusions.
Do not change parser/canonical/OCR, violation firing, packet readiness/wording/PDF, regulation runtime truth, admin override, or direct furnisher flow.
Do not use git add -A.

Start with git status --short. Stop if dirty.

Inspect current route/layout/sidebar/query/test patterns.

Implement:
- [page/component/hooks/css]
- [route/sidebar entry if needed]
- [unit tests]

Validate safe rendering, permissions, forbidden-control absence, and source endpoint boundaries.

Run:
- pnpm exec vitest run [UI test]
- pnpm run typecheck
- git diff --check

Commit/push only after tests pass, then verify staging deploy and health.
```

## Schema Slice

```text
HEADER: IMPLEMENT ADDITIVE SCHEMA SLICE - [SUBJECT]

Objective:
Add an additive schema/helper-backed model for [subject].

Do not drop or rewrite existing columns.
Do not change deterministic truth.
Do not modify parser/canonical/OCR, violation firing, packet readiness/wording/PDF, regulation runtime truth, admin override, or direct furnisher flow.
Do not use git add -A.

Start with git status --short. Stop if dirty.

Inspect schema helper, Kysely types, local DB harness, related endpoints/tests.

Implement additive fields/table only with idempotent helper behavior.

Run:
- pnpm exec vitest run [schema/local DB test]
- pnpm exec vitest run [affected endpoint tests]
- pnpm run typecheck
- git diff --check

Stage exact files only, commit, push, verify deploy and health.
```

## Test-Only Slice

```text
HEADER: ADD TEST COVERAGE ONLY - [SUBJECT]

Objective:
Add focused tests for [behavior] without changing runtime code.

Do not modify app behavior.
Do not modify schema.
Do not use git add -A.

Start with git status --short. Stop if dirty.

Inspect existing test patterns.

Add or update only directly related tests.

Run:
- pnpm exec vitest run [target spec]
- pnpm run typecheck
- git diff --check

Commit/push only after tests pass.
```

## Smoke Harness

```text
HEADER: ADD GATED SMOKE HARNESS - [SUBJECT]

Objective:
Add a gated operator-run smoke harness for [staging/local behavior].

Do not weaken authentication or ownership.
Do not use production data.
Do not print secrets.
Do not fake success from env values.
Do not use git add -A.

Start with git status --short. Stop if dirty.

Required gate:
[ENV_FLAG]=true

Allowed hosts:
- staging.creditregulatorpro.com
- localhost
- 127.0.0.1

Refuse production hosts and unknown hosts.

Implement:
- scripts/[smoke].ts
- tests/unit/[smoke].spec.ts
- package script [name]

Validate:
- gate refusal
- host refusal
- missing auth skipped
- marker/fixture verification
- runtime safety checks
- privacy/no-overexposure
- secret redaction

Run focused tests, typecheck, diff check, commit, push, verify staging.
```

## Operator-Run Smoke

```text
Run [package script] from C:\Users\webbd\Projects\creditregulatorpro-staging using the existing locally set environment variables:
- [ENV VARS]

Do not print cookies, passwords, tokens, env secrets, browser storage, or DB URLs.
Return only the safe JSON summary and final git status.
```

## Harness Locator Fix

```text
HEADER: FIX SMOKE HARNESS LOCATOR - [SUBJECT]

Objective:
Fix a smoke harness false failure caused by [ambiguous locator/overbroad assertion].

Do not weaken authentication.
Do not modify endpoint behavior.
Do not modify schema.
Do not use git add -A.

Start with git status --short. Stop if dirty.

Inspect:
- scripts/[smoke].ts
- tests/unit/[smoke].spec.ts
- relevant page/component only if needed

Prefer scoping the locator/assertion to a stable region. Add minimal accessibility attributes only if strictly required.

Run harness unit test, related UI/API tests, typecheck, diff check. Commit/push after tests pass.
```

## Docs/Readiness Update

```text
HEADER: UPDATE ROADMAP/READINESS AFTER [VERIFIED EVENT]

Objective:
Update docs/dashboard to record [verified state].

Do not modify app runtime code, schema, backend endpoint behavior, UI code, parser/canonical/OCR, evidence extraction, violation firing, packet readiness/wording/PDF, regulation runtime truth, admin override, or direct furnisher flow.
Do not use git add -A.

Start with git status --short. Stop if dirty.

Update only relevant docs/dashboard files.
Do not claim unverified behavior.
Keep remaining risks.

Run:
- pnpm exec vitest run tests/unit/operator-regression-dashboard.spec.ts if dashboard changed
- pnpm run typecheck
- git diff --check

Stage exact files only, commit, push, verify staging deploy and health.
```

## Production Promotion Audit

```text
HEADER: DESIGN/READINESS AUDIT - PRODUCTION PROMOTION

Objective:
Audit whether staging is ready for production promotion.

Do not modify files.
Do not commit.
Do not push.

Start with git status --short. Stop if dirty.

Inspect:
- latest staging deploy
- staging health
- production-readiness checklist
- operator dashboard
- promotion diff
- known gaps

Report go/no-go, blockers, required smoke evidence, rollback SHA, and exact promotion command if approved.
```

## Production Promotion

```text
HEADER: PRODUCTION PROMOTION - APPROVED STAGING SHA [SHA]

Objective:
Promote CreditRegulatorPro staging to production using the approved repo command.

Do not create secrets, deploy keys, or credentials.
Do not edit production paths manually.
Do not use git add -A.

Start with git status --short. Stop if dirty.

Verify approved staging SHA and readiness evidence.
Run:
pnpm run promote:production

Then verify production deploy/health according to repo instructions and report rollback SHA.
```

