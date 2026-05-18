# Architect + Codex Operating System

This operating system is the default workflow for faster Architect + Codex development in CreditRegulatorPro staging. It is meant to reduce repeated prompt-writing and handoff overhead without relaxing protected-system gates.

## Task Lanes

Use one lane per task. If a task spans lanes, split it before implementation.

| Lane | Purpose | Allowed Output | Must Not Do |
| --- | --- | --- | --- |
| Design-only | Decide model, boundaries, risks, endpoint/UI shape, and tests before code. | Architecture report, recommendation, implementation prompt. | Modify files, schema, code, docs roadmap, commit, or push. |
| Implementation | Add a bounded backend, UI, schema, service, or test slice after the boundary is clear. | Minimal code/docs/test changes plus validation, commit, push. | Broaden scope, change protected truth, skip tests, use broad staging. |
| Smoke | Add or fix gated operator-run harnesses that verify staging/local behavior safely. | Gated script, script tests, package script, safe JSON summary. | Store secrets, use production, weaken auth, fake success from env values. |
| Docs/readiness | Record verified state and remaining gaps after implementation or smoke succeeds. | Roadmap/checklist/dashboard wording only. | Claim unverified readiness, change runtime behavior, overstate completion. |

## Protected-Area Matrix

| Area | Default Posture | Requires Extra Design? | Never Allowed as Side Effect |
| --- | --- | --- | --- |
| Authentication/session/roles | Preserve existing guards. | Yes for new role paths. | Admin bypass, client role escalation, support-as-admin drift. |
| Parser/canonical/OCR | Do not touch outside parser tasks. | Yes. | Parser truth drift, canonical model mutation, OCR fallback changes. |
| Evidence extraction/location | Additive and privacy-safe only. | Yes. | Raw text leaks, signed URLs, full account/SIN exposure. |
| Violation firing | Frozen unless explicitly requested. | Yes. | New firing behavior from unrelated UI/docs/smoke work. |
| Packet readiness/wording/PDF | Frozen unless packet task. | Yes. | Readiness rule drift, wording drift, PDF layout drift. |
| Outcome tracking | Deterministic and append-only. | Yes for new response/outcome semantics. | Admin override, response docs as canonical facts, source-row mutation. |
| Admin review | Metadata-only. | Yes. | Rewriting deterministic truth, legal conclusions, silent overrides. |
| Regulation registry/runtime truth | DB registry is governance metadata. | Yes. | Runtime activation or DB truth promotion without explicit approval. |
| Direct furnisher flow | Absent by design. | Yes. | Any direct furnisher packet/send path. |
| Secrets/env/deploy config | Do not edit or print. | Yes. | Secret logging, `.env` changes, deploy credential changes. |

## Pre-Decision Table

Before editing, answer these in the working update or design report.

| Question | If Yes | If No |
| --- | --- | --- |
| Is the worktree clean? | Continue. | Stop and report changed files. |
| Is this design-only? | Inspect and report only. | Continue to implementation lane. |
| Does this touch a protected area? | State risk, boundaries, tests, and rollback path first. | Use normal bounded workflow. |
| Does this need schema/data/config? | Prefer additive, tested, migration-safe changes. | Avoid schema drift. |
| Does this require staging credentials or secrets? | Build gated operator flow. | Do not ask for or print secrets. |
| Can success be verified locally? | Run focused tests and typecheck. | Explain residual staging/manual check. |
| Is a docs/readiness claim being made? | Require actual successful run evidence. | Mark pending, not passed. |

## Validation Bundles

Use the smallest bundle that covers the touched surface. Add adjacent tests when protected systems are nearby.

| Task Type | Minimum Bundle |
| --- | --- |
| Design-only | `git status --short` before and after. No file changes. |
| Docs/readiness | `pnpm run typecheck`, `git diff --check`. Add dashboard test if dashboard text changes. |
| Test-only | Targeted `pnpm exec vitest run ...`, `pnpm run typecheck`, `git diff --check`. |
| Backend endpoint | Endpoint spec, adjacent endpoint spec, service/unit spec, `pnpm run typecheck`, `git diff --check`. |
| Schema slice | Schema helper/local DB harness tests, dependent endpoint tests, Golden Path if source data flow is touched, typecheck. |
| UI slice | UI unit spec, route/sidebar spec if applicable, relevant endpoint specs, typecheck. Use browser smoke when a dev server is required. |
| Smoke harness | Harness unit spec, affected endpoint/UI tests, typecheck, `git diff --check`. |
| Parser/canonical/OCR | Parser/extraction regression bundle, deterministic ingestion report, Golden Path, typecheck. |
| Packet | Packet lifecycle/delivery/readiness/PDF tests, Golden Path, typecheck. |
| Outcome tracking | Outcome comparison, outcome endpoint/admin-review/UI tests as applicable, packet lifecycle if linked, typecheck. |

## Selective Staging Rule

Never use `git add -A` for Codex task commits. Stage exact files:

```powershell
git add docs/future-build-plan.md
git add scripts/specific-script.ts
git add tests/unit/specific-test.spec.ts
git diff --cached --name-only
git diff --cached --stat
```

If an integrated helper uses broad staging, inspect it before running. Prefer manual explicit staging when task instructions prohibit broad staging or when unrelated local changes exist.

## Smoke Failure Taxonomy

| Failure Class | Meaning | Correct Response |
| --- | --- | --- |
| Gate missing | Required env flag or target missing. | Exit skipped; do not mark success. |
| Auth missing/invalid | Credentials/cookie absent or rejected. | Exit skipped or failed with safe message; never print secret. |
| Unsafe host | Production or unknown host. | Refuse before network calls. |
| Fixture unverifiable | Marker/run/data cannot be verified through safe surface. | Fail before mutation. |
| Endpoint contract failure | Authenticated safe request returns unexpected status/body. | Fix endpoint only if real bug; otherwise fix harness expectation. |
| Locator ambiguity | UI smoke selector matches multiple elements. | Scope locator or add minimal accessibility label. |
| Privacy overexposure | Response includes raw text, full account/SIN, storage path, token, DB URL, secret. | Treat as real defect unless proven to be harness scanning source/request payload. |
| Runtime safety drift | Parser/OCR/packet/violation/regulation/admin override/direct furnisher path called. | Stop and fix only the bounded unsafe call. |
| Staging deploy failure | Build/deploy health fails after push. | Inspect CI/deploy logs, fix narrow cause, do not claim readiness. |

## Escalation Rules

Stop and ask for a design task instead of coding when:

- The fix requires broad architecture changes.
- A protected truth layer would change.
- Schema design is unclear.
- A real production/staging secret is needed.
- The requested outcome would weaken auth, ownership, privacy, or audit.
- A smoke run would require real consumer data or production data.
- The task would create direct furnisher flow, admin override, or runtime regulation truth activation.

Escalate from implementation to design-only when the first safe patch would require changing parser/canonical/OCR, evidence extraction, violation firing, packet readiness, packet wording, packet PDF layout, deterministic outcome truth, or regulation runtime behavior.

## Worktree Recommendation

Keep each Codex task in a clean worktree on the staging repo. Do not mix user edits and Codex edits. If a task needs experimental work, use a branch/worktree with the `dpwebb` prefix and keep the main staging worktree clean for deployable commits.

Recommended local posture:

1. Start from `C:\Users\webbd\Projects\creditregulatorpro-staging`.
2. Run `git status --short`.
3. Stop if dirty unless the task explicitly resumes known dirty files.
4. Use exact file staging only.
5. Push to `origin/staging` only after validation passes.
6. Verify staging deploy and HTTP 200 health after push.

## Codex Non-Interactive Mode

Use non-interactive Codex runs for repeatable, bounded work with clear inputs:

- Generating a design report from a known prompt template.
- Running a read-only audit or scope report.
- Applying a small docs/readiness update.
- Running a gated smoke harness after env vars are already set.
- Re-running known focused tests after a narrow fix.

Do not use non-interactive mode for ambiguous schema design, auth/security changes, broad parser or packet work, production promotion decisions, or any task that may require human judgment after unexpected output.

## When Not To Automate

Do not automate:

- Production promotion without a human-reviewed diff and readiness evidence.
- Credential setup, secret entry, or mailbox integration.
- Any use of real consumer data.
- Legal-conclusion wording.
- Admin override or runtime truth activation.
- Parser/canonical changes from unreviewed examples.
- Cleanup/delete behavior for append-only audit/outcome records unless a safe explicit design exists.

## Quality Gates That Must Never Be Removed

- Clean-worktree preflight.
- Explicit safety gates for smoke/setup scripts.
- Host allowlist and production-host refusal.
- Auth and ownership checks.
- Secret redaction.
- Privacy/no-overexposure checks.
- Runtime safety checks for parser/OCR/packet/violation/regulation/admin override/direct furnisher paths.
- Deterministic truth preservation checks.
- Additive schema posture unless explicitly designed otherwise.
- Focused tests plus typecheck for code/tooling changes.
- Exact file staging.
- Staging deploy and health verification after push.
