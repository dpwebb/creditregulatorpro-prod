---
name: safe-parser-fix
description: Use for bounded parser, extraction, canonical mapping, parser test case, or deterministic ingestion fixes in CreditRegulatorPro when Codex must preserve canonical output, evidence binding, and downstream violation/packet behavior.
---

# Safe Parser Fix

1. Read `AGENTS.md`, `helpers/AGENTS.md`, `services/ingestion/AGENTS.md`, and any directory-level `AGENTS.md` in the files being edited.
2. Before editing, state model path, risk level, upstream callers, downstream consumers, impact boundary, protected systems, and regression tests.
3. Do not introduce AI or probabilistic output into canonical extraction.
4. Preserve canonical output shape, replay hash behavior, source evidence, and null-overwrite rules.
5. Update or add fixtures when parser truth changes. Prefer synthetic TransUnion/Equifax fixtures over real consumer data.
6. Run:
   - `pnpm run validate:staging`
   - `pnpm run test:deterministic-ingestion-report`
   - targeted parser tests for the touched extractor or endpoint
7. Report whether canonical truth, mappings, evidence links, violations, or packet inputs changed.
