# Regulation Registry Endpoint Rules

Regulation registry endpoints are protected truth-layer surfaces.

Before changing this directory, explain effects on:
- regulation mappings
- review and approval states
- active/inactive reference behavior
- violation-to-regulation links
- admin audit and rollback paths

No regulation mapping, authority classification, citation, or active reference may change silently. Any truth-affecting registry change needs tests, a version/update marker, audit or review trail, and an admin review path.

Run at minimum:
- `pnpm run test:golden-path`
- `pnpm run test:unit -- tests/unit/legal-authority-registry.spec.ts tests/unit/violation-regulation-map.spec.ts tests/unit/violation-rule-evidence.spec.ts`
