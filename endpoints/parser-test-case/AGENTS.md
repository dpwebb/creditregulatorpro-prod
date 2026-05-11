# Parser Test Case Endpoint Rules

Parser test case endpoints protect parser baselines and admin-reviewed truth.

Before changing this directory, explain effects on:
- saved parser baselines
- canonical replay metadata
- adjudication state
- training archives
- materialized report artifacts
- downstream violation correction review

Do not silently change expected output, approved truth, replay hashes, adjudication semantics, or materialization behavior. Any truth-affecting test-case change needs tests, a version/update marker, audit or review trail, and an admin review path.

Run at minimum:
- `pnpm run test:golden-path`
- `pnpm run test:deterministic-ingestion-report`
- `pnpm run test:unit -- tests/unit/parser-test-production-parser.spec.ts tests/unit/parser-test-case-editor.spec.tsx tests/unit/parser-rule-promotion-decision.spec.ts`
