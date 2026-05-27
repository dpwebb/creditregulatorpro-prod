# AI Task Risk Routing

This repository uses deterministic risk routing before AI/Codex changes. The goal is to select the right reasoning level, validation scope, and approval gate before code changes begin.

Codex must classify every task before editing files and print:

```text
AI TASK RISK ROUTING
Tier:
Reason:
Recommended Codex setting:
Required validation:
Approval gate:
Files likely affected:
```

If a task is Tier 3 or Tier 4, Codex must not broaden scope. Preserve existing behavior unless the user explicitly scopes a behavior change.

## Tier 1: Low Risk

Use for small, bounded, non-behavioral changes.

Examples:

- Copy changes.
- Minor UI text.
- Comments.
- Documentation.
- Unused lint disable cleanup.
- Isolated styling.
- Typos or grammar.

Recommended Codex setting:

```text
Medium/Fast
```

Rules:

- Keep the change small and bounded.
- Do not touch protected systems.
- Run lint/typecheck if code was touched.
- Commit is allowed after validation.

Typical validation:

```text
pnpm run lint
pnpm run typecheck
```

For docs-only work, a doc review may be enough unless repo policy requires broader checks.

## Tier 2: Medium Risk

Use for normal bounded implementation work.

Examples:

- Normal UI component edits.
- API endpoint additions that do not touch protected auth, payment, compliance, parser, packet, or deletion flows.
- Isolated helper changes.
- New tests.
- Admin page improvements that do not change role boundaries or security behavior.

Recommended Codex setting:

```text
High
```

Rules:

- Keep implementation bounded.
- Inspect relevant files before editing.
- Run lint/typecheck and tests relevant to the touched area.
- Summarize behavior impact before commit.

Typical validation:

```text
pnpm run lint
pnpm run typecheck
pnpm run validate:changed
```

## Tier 3: High Risk

Use for changes that touch protected runtime, compliance, security, data, or deployment paths.

Examples:

- Parser fixes.
- Ingestion changes.
- Violation detection.
- Evidence links or evidence binding.
- Packet generation.
- Readiness gating.
- Dispute flows.
- Bureau matching or bureau-specific parsing.
- Creditor matching or creditor display.
- Collector or collection-account handling.
- Compliance scanner behavior.
- Database writes.
- Authentication.
- User deletion/reset.
- Payment or billing.
- Production deployment.

Recommended Codex setting:

```text
Extra High
```

Rules:

- No broad refactor.
- Preserve existing behavior unless explicitly scoped.
- Add or update regression tests.
- Run full relevant validation for the touched subsystem.
- Require human review before production push.
- Do not broaden scope while fixing adjacent problems unless the user approves.

Typical validation:

```text
pnpm run lint
pnpm run typecheck
pnpm run validate:staging
```

Use targeted protected-system checks where applicable:

```text
pnpm run test:golden-path
pnpm run test:deterministic-ingestion-report
pnpm run test:credit-regression
pnpm run test:tradeline-internal
pnpm run test:violation-corrections
pnpm run migrations:gate
pnpm run certify:admin
```

## Tier 4: Critical / Architecture

Use for architectural, destructive, or large cross-cutting work.

Examples:

- Schema redesign.
- Compliance rule engine redesign.
- Rule engine redesign.
- Parser architecture replacement.
- Parser replacement.
- Auth architecture.
- Deployment architecture.
- Destructive migrations.
- Large cross-cutting refactors.
- Replacing a working subsystem.

Recommended Codex setting:

```text
ChatGPT architecture review first; Codex Extra High only after approved plan
```

Rules:

- Do not code immediately.
- Produce an implementation plan first.
- Split work into staged prompts.
- No autonomous rewrite.
- No production push without explicit approval.
- Require an approved rollback/validation strategy before implementation.

Typical validation:

```text
pnpm run validate:release
```

Additional validation depends on the approved implementation plan and affected subsystem.

## CreditRegulatorPro Danger Zones

Treat these as Tier 3 by default unless the request clearly escalates to Tier 4 architecture work:

- Ingestion.
- Credit report parsing.
- OCR fallback.
- Canonical tradeline mapping.
- Bureau-specific parsing or matching.
- Creditor matching.
- Collector and collection-account handling.
- Compliance scanning.
- Compliance scanner behavior.
- Evidence location links.
- Dispute packet creation.
- Packet PDF generation.
- Readiness validation.
- User data deletion/reset.
- Auth/admin access.
- Production deployment.
- Database migrations.

Escalate to Tier 4 when a danger-zone task asks for redesign, replacement, schema redesign, broad refactor, or destructive migration.

## Deterministic Classifier

Use the deterministic classifier for a first-pass routing decision:

```bash
pnpm run ai:classify -- "fix parser findings not rendering"
```

Run the deterministic classifier self-test after changing routing rules:

```bash
pnpm run ai:classify:test
```

The classifier is keyword/risk-rule based. It does not use AI. Highest-risk match wins.

Example:

```text
AI TASK RISK ROUTING
Tier: 3
Tier name: HIGH RISK
Recommended Codex setting: Extra High
Reason: high-risk CRP protected workflow
Required validation: lint, typecheck, relevant tests, regression validation
Approval gate: human review required before production push
Files likely affected: helpers/, tests/
Scope rule: do not broaden scope; preserve existing behavior unless explicitly scoped.
```

The classifier is advisory. If human judgment indicates greater risk, escalate upward.

## Relationship To Validation Tiers

Risk routing decides how carefully to plan and review a task. Validation tiers decide what to run before commit, staging, or production.

- Tier 1 usually maps to `validate:fast` or lint/typecheck only.
- Tier 2 usually maps to `validate:changed`.
- Tier 3 usually maps to `validate:staging` plus protected subsystem checks.
- Tier 4 requires architecture approval first, then staged validation up to `validate:release` as applicable.

Never use risk routing to weaken readiness gates, parser safeguards, packet validation, role restrictions, migration governance, or compliance scanner tests.
