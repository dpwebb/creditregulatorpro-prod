# Packet List Scope Evidence

Generated at: 2026-05-21T11:35:19.307Z
Current HEAD: `1daae8107db898193d6138abc70d92436c980d7d`
Status: passed
CERTIFYING:true

## Scope

- Endpoint: `endpoints/packet/list_GET.ts`
- Helper: `helpers/packetQueries.tsx`
- Schema: `endpoints/packet/list_GET.schema.ts`
- Admin scope: admin retains existing global packet list behavior
- Non-admin scope: server requires packet.userId to match the session user, packet.organizationId to match the session organization, and processingStatus=completed
- Client filtering: display defense only
- Pagination: bounded default and max limits from list_GET.schema.ts

## Source Validation

- packet list has server scope helper: passed
- non-admin packet list filters by owner: passed
- non-admin packet list filters by organization: passed
- non-admin packet list excludes incomplete rows: passed
- packet list has bounded pagination: passed
- client filtering remains display defense only: passed

## Commands

- `git diff --check`: passed
- `pnpm exec vitest run tests/api tests/unit --runInBand`: unsupported-fallback-passed
- `pnpm exec vitest run --config vitest.config.ts tests/api tests/unit`: passed
- `pnpm run check`: passed
