# Codex Regression Guardrails

This repo treats ingestion, deterministic parsing, canonical mapping, evidence binding, violation detection, regulation references, dispute packets, audit logging, and admin correction as protected systems.

## Required Codex Checkpoint

Before Codex edits anything in this repository:

```bash
git status
git add .
git commit -m "checkpoint before codex task"
```

If the tree contains secrets or forbidden environment files, stop instead of staging them.

## Explain Before Edit

For parser, violation, evidence, regulation, packet, audit, admin truth-layer, or schema work, Codex must first state:

- selected model path and risk level
- upstream callers and downstream consumers
- impact boundary
- protected systems touched
- regression risks and tests to run

Do not edit protected subsystem code until that explanation is visible.

## No Silent Truth Change

Do not change canonical truth, parser mappings, regulation mappings, violation rules, evidence binding, seeded reference data, packet truth, or schema behavior without all applicable items:

- test update proving the new truth
- version or migration/update marker
- audit log or review trail
- admin review path when human approval is needed

## Tiered Validation

Use the smallest safe tier for the change:

```bash
pnpm run validate:fast
pnpm run validate:changed
pnpm run validate:staging
pnpm run validate:release
```

`validate:staging` automatically runs the golden path and full regression when protected systems change. `validate:release` always runs the full baseline and release safety gates before production promotion.

The golden path uses a fixed pair of synthetic TransUnion and Equifax reports and checks:

- upload payload contract
- parse
- canonical map
- anomaly detect
- violation detect
- evidence bind
- packet generate
- PDF download

For a human-readable dashboard:

```bash
pnpm run test:regression-dashboard
```

## Consumer Confusion Test

Consumer-facing pages must make the next action obvious to a non-technical user in under 30 seconds. The static guardrail lives in `tests/unit/consumer-confusion-page-copy.spec.ts` and checks curated consumer pages for visible next-step cues and unsafe legal-conclusion wording.

## Legal Reference Rule

Consumer-facing output must separate references from conclusions. Prefer:

> This item may require review under [rule/reference].

Avoid stating that an item is a confirmed legal violation unless a reviewed authority classification explicitly supports that label and the surface is approved for that wording.

## PR Review

Every pull request should request Codex review for regressions, missing tests, and security issues. The PR template records the selected validation tier, protected-system truth checks, and consumer wording review.
