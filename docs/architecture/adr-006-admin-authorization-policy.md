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

