# Parser Mapping Endpoint Rules

Parser mapping endpoints are protected parser/canonical-truth surfaces.

Before changing this directory, explain effects on:
- deterministic extraction
- canonical field shape
- parser mappings and rollback
- parser-test baselines
- downstream evidence, violations, and packets

Do not silently change parser mappings, canonical fields, or mapping rollback behavior. Any truth-affecting mapping change needs tests, a version/update marker, audit or review trail, and an admin review path.

Run at minimum:
- `pnpm run test:golden-path`
- `pnpm run test:deterministic-ingestion-report`
- `pnpm run test:unit -- tests/unit/parser-extraction-rules.spec.ts tests/unit/parser-pipeline-field-reconciliation.spec.ts`
