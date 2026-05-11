---
name: regulation-mapping-update
description: Use for CreditRegulatorPro regulation registry, statutory/reference mapping, violation-to-regulation links, authority classification, citation, or legal-reference wording changes.
---

# Regulation Mapping Update

1. Read `AGENTS.md`, `helpers/AGENTS.md`, `services/violations/AGENTS.md`, and `endpoints/regulation-registry/AGENTS.md` when applicable.
2. Before editing, explain the source authority, affected violation categories, downstream evidence/packet/admin consumers, impact boundary, and tests.
3. No Silent Truth Change: mapping changes require tests, a version/update marker, audit or review trail, and admin review path when needed.
4. Keep private reporting standards separate from statutory authority. Do not label private standards as confirmed legal violations.
5. Consumer-facing copy must say the item may require review under a rule/reference unless reviewed authority classification supports stronger wording.
6. Run:
   - `pnpm run test:golden-path`
   - `pnpm run test:unit -- tests/unit/legal-authority-registry.spec.ts tests/unit/violation-regulation-map.spec.ts tests/unit/violation-rule-evidence.spec.ts tests/unit/legal-reference-language.spec.ts`
7. Report changed references, mappings, classifications, tests, and admin review implications.
