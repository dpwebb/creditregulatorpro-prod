---
created: 2026-04-14T14:35:45.889Z
updated: 2026-04-14T14:35:45.889Z
---

# Admin Recent Activity — User Context & Activity Descriptions

## Summary
Update the admin "What Happened Recently" section to show the user name and a brief human-readable description of their recent activity, limited to a maximum of 5 activities. The drill-down for more detail is already available via the Users section.

## Files to Modify

### `endpoints/dashboard/stats_GET.ts`
- For admin requests, join `packet` with `users` table to fetch `displayName` and `email` for each recent packet.
- Also select `packet.userId` so the frontend can associate activity with a user.
- Limit recent packets to 5 (already the case).

### `endpoints/dashboard/stats_GET.schema.ts`
- Extend `PacketWithDetails` type with:
  - `userName: string | null` (user's display name)
  - `userEmail: string | null` (user's email, as fallback)
  - `userId: number | null`

### `components/DashboardActivityTable.tsx`
- Update the admin view of the table:
  - Replace the "Account" column with a "User" column showing the user's display name (fallback to email).
  - Replace "Status" / "Final Status" columns with an "Activity" column showing a brief human-readable description (e.g., "Created a dispute letter for account #1234", "Sent dispute letter via registered mail", etc.) derived from packet data (type, status, delivery method, account number).
  - Keep the "When" (date) column.
  - Table columns for admin: User | Activity | When
- Non-admin view remains unchanged (current columns).

### `components/DashboardActivityTable.module.css`
- Add styles for the new user name display and activity description text (truncation for long text, etc.)

## Files to Create
None.

## Approach
1. Update `dashboard/stats_GET` endpoint to join with `users` table for admin and return user info with recent packets.
2. Update schema types to include the new user fields.
3. Update `DashboardActivityTable` component to detect admin context and render the new columns with user name + activity description.
4. Generate human-readable activity descriptions from packet fields (type, status, account number, delivery method).

## Risks & Considerations
- **Backward compatibility**: The new fields (`userName`, `userEmail`, `userId`) are nullable additions to the existing response shape — no breaking change for non-admin or mobile clients.
- Non-admin users continue to see the existing packet-focused table unchanged.
- Activity description logic should handle missing data gracefully (e.g., no account number, no delivery method).
