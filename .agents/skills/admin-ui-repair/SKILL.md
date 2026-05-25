---
name: admin-ui-repair
description: Use for bounded CreditRegulatorPro admin UI repairs, admin route fixes, admin workflow wiring, table/form state fixes, or display-only admin changes that must not alter parser, violation, evidence, regulation, or packet truth.
---

# Admin UI Repair

1. Read `AGENTS.md` and any directory-level `AGENTS.md` for touched pages, endpoints, or helpers.
2. Before editing, identify whether the change is display-only or touches protected truth systems.
3. Keep UI fixes bounded. Do not alter schemas, parser output, violation rules, evidence binding, regulation mappings, or packet generation from a UI repair task.
4. If the UI writes admin-reviewed truth, require explicit tests and audit/admin review behavior.
5. Preserve existing routing, permissions, loading/error states, and user/admin ownership boundaries.
6. Run targeted admin UI/unit tests plus:
   - `pnpm run validate:changed` for normal bounded admin UI repairs
   - `pnpm run validate:staging` when the UI touches parser, evidence, violation, regulation, or packet workflows
   - `pnpm run certify:admin` for route, permission, navigation, rendering, or production-critical admin flow changes
7. Report changed admin workflows and whether any protected truth changed.
