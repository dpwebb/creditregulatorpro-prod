# ADR 006: Admin Authorization Policy

Status: accepted
Date: 2026-05-27

## Context

Admin access and auth/session handling are protected CRP workflows. The client has route-level protection, while server endpoints enforce session and role checks independently.

## Decision

`components/ProtectedRoute.tsx` is client-side route protection only. It improves navigation and user experience, but it is not a server-side security boundary.

Server endpoints must not rely on client-side route protection. Endpoints that expose admin behavior must validate the server session and role themselves.

`helpers/getServerUserSession.tsx` and `helpers/getSetServerSession.tsx` are the server session source of truth. They hydrate the current user from the session cookie and database-backed session row.

## Technical Debt

Repeated inline checks such as `user.role !== "admin"` across admin endpoints are technical debt. They make authorization behavior harder to audit and can lead to inconsistent errors, logging, or future role handling.

## Future Migration Rule

Future work should introduce a shared `requireAdminUser` helper, but only in small endpoint groups with tests. The migration must preserve response status codes, audit logging, role semantics, support-role behavior, platform reset special cases, and route-auth classification tests.

## Phase 3A Helper Boundary

`helpers/requireAdminUser.tsx` is the first shared server-side admin authorization helper. It loads the session through `helpers/getServerUserSession.tsx`, rejects non-admin users with the existing `Admin privileges required` / `403` behavior used by the migrated endpoints, and does not introduce new auth concepts.

Phase 3A migrated only these read-only admin endpoints:

- `endpoints/admin/ai-assist/runs_GET.ts`
- `endpoints/admin/ai-assist/findings_GET.ts`

Endpoints intentionally not migrated in this pass include user delete/reset, platform reset, billing, evidence mutation, packet mutation, parser, ingestion, scanner, violation correction, compliance configuration, and admin truth-layer routes. These remain on their existing inline or specialized checks until separately approved and covered by endpoint-specific regression tests.

delete/reset/platform/admin truth-layer endpoints require separate approval before any helper migration. Future migrations must stay in small endpoint groups and must preserve current status codes, response shapes, audit behavior, role semantics, and route-auth classification coverage.

## Phase 3C Safe Read-Only Migration

Phase 3C migrated only these safe read-only admin endpoints:

- `endpoints/admin/audit-logs_GET.ts`
- `endpoints/admin/users_GET.ts`
- `endpoints/admin/user-detail_GET.ts`

`helpers/requireAdminUser.tsx` must remain narrow: it loads the canonical server session, rejects non-admin users with `403` and `{ "error": "Admin privileges required" }`, and must not grow configurable messages, alternate status codes, role expansion, or client-side concepts.

High-risk admin endpoints remain intentionally unmigrated, including delete/reset, platform reset, stale auth cleanup, support-agent creation, billing/revenue, parser, ingestion, scanner/compliance, evidence ledger, packet/readiness/PDF, retired public 410 routes, and violation-correction/admin truth-layer routes.
