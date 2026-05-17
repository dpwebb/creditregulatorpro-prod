---
created: 2026-04-14T13:12:09.143Z
updated: 2026-04-14T13:12:09.143Z
---

# Fix Support Ticket System Audit Anomalies

## Summary
Fix 5 anomalies discovered during QA audit of the customer service ticket system. Prioritized by severity: 1 critical, 1 high, 2 medium, 1 low.

## Files to Modify

### 1. `endpoints/admin/users_GET.schema.ts` — ANO-001 (HIGH)
- Update the Zod `role` enum from `z.enum(["admin", "user"])` to `z.enum(["admin", "user", "support"])` so the admin user management page can filter by the "support" role.

### 2. `components/SupportTicketDetail.tsx` — ANO-002 (CRITICAL) + ANO-003 (MEDIUM)
- **ANO-002**: Replace the `useAdminUsers({})` call with a new hook `useSupportAgentList()` that calls a new lightweight endpoint accessible by both admin and support roles.
- **ANO-003**: Update the message rendering to use `senderDisplayName` from the enriched endpoint response instead of generic labels like "Support Agent" / "Admin".

### 3. `components/AppLayout.tsx` — ANO-004 (LOW)
- Add `{ path: "/support-tickets", label: "Support Tickets", icon: MessageSquare }` to the `adminItems` nav array under the "Platform" group.

### 4. `components/ProtectedRoute.tsx` — ANO-005 (LOW)
- Remove the two `("support" as any)` casts and replace with plain `"support"` string comparisons, since `User["role"]` already includes `"support"`.

## Files to Create

### 1. `endpoints/support-ticket/agents_GET` (schema + handler)
- New lightweight endpoint that returns a list of users with role `"support"` or `"admin"` (id + displayName only).
- Access: requires authenticated user with role `"admin"` or `"support"`.
- This replaces the misuse of `admin/users_GET` inside `SupportTicketDetail`.

### 2. Update `helpers/supportTicketQueries.tsx`
- Add a new `useSupportAgentList()` hook that calls the new `support-ticket/agents_GET` endpoint.

## Modify Existing

### `endpoints/support-ticket/get_GET.ts` + schema — ANO-003
- Join `users` table on `supportTicketMessage.senderId` to return `senderDisplayName` for each message.
- Update the `OutputType` to include `senderDisplayName: string` in the messages array type.

## Approach

### Step 1 — ANO-001: Fix admin/users role filter schema
- Single-line change in `endpoints/admin/users_GET.schema.ts`: add `"support"` to the role enum.
- Backward compatible: existing "admin" and "user" values still work.

### Step 2 — ANO-002: Create agents list endpoint + hook
- Create `endpoints/support-ticket/agents_GET` that returns `{ agents: { id: number, displayName: string }[] }`.
- Guard: require role === "admin" or "support".
- Add `useSupportAgentList()` hook in `helpers/supportTicketQueries.tsx`.
- Update `components/SupportTicketDetail.tsx` to use the new hook instead of `useAdminUsers`.

### Step 3 — ANO-003: Enrich message sender names
- In `endpoints/support-ticket/get_GET.ts`, when fetching messages, join with `users` on `senderId` to get `displayName`.
- Return `senderDisplayName` alongside each message.
- Update `SupportTicketDetail.tsx` to display `msg.senderDisplayName` instead of generic role labels.

### Step 4 — ANO-004: Add admin sidebar link
- Add support tickets nav item to admin sidebar in `AppLayout.tsx`.

### Step 5 — ANO-005: Remove type casts
- Replace `("support" as any)` with `"support"` in `ProtectedRoute.tsx`.

## Risks & Considerations

- **Backward compatibility**: The new `agents_GET` endpoint is additive. The `get_GET` endpoint response shape changes (messages now include `senderDisplayName`). The mobile app uses superjson, so adding a new field is backward compatible — old clients will simply ignore the new field.
- **admin/users schema change**: Adding "support" to the enum is purely additive and backward compatible.
- **No breaking changes**: All existing endpoint inputs/outputs remain valid. Only additive fields are introduced.
