# Evidence Endpoint Rules

Evidence endpoints are protected.

Before changing this directory, explain effects on:
- evidence ownership boundaries
- packet links
- report artifact links
- audit logging
- admin correction workflows
- user-visible evidence lists and packages

Do not silently change evidence binding, attachment scope, packet linkage, or audit behavior. Any truth-affecting evidence change needs tests, a version/update marker, audit or review trail, and an admin review path when needed.

Run at minimum:
- `pnpm run test:golden-path`
- `pnpm run test:unit -- helpers/evidencePackageSections.spec.tsx`
