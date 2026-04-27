---
created: 2026-04-14T14:49:36.520Z
updated: 2026-04-14T14:49:36.520Z
---

# Prevent Duplicate Draft Packets & Show Violation Reference in Admin

## Summary
Two issues to fix:
1. **Duplicate prevention**: The platform currently allows creating multiple Draft packets for the same user + tradeline + bureau + violation (`creditor_obligation_test_id`). Add a server-side uniqueness check in `packet/create_POST` to reject duplicate Draft packets.
2. **Admin visibility**: The admin user-detail Dispute Letters tab doesn't show which violation each packet targets, making identical-looking rows confusing. Add a "Violation" column showing the `violation_category` from `creditor_obligation_test`.
3. **Data cleanup**: Delete the duplicate packet (ID 41) leaving only packet 40.

## Files to Modify

### `endpoints/packet/create_POST.ts`
- After the early validation block (where tradelineId and bureauId are required), add a duplicate check query:
  - Query `packet` table for existing rows with the same `user_id`, `tradeline_id`, `bureau_id`, `creditor_obligation_test_id`, and `status = 'Draft'`
  - If a match is found, return a 409 Conflict error with a clear message: "A draft dispute letter already exists for this tradeline and violation."
  - This check should only apply to non-preview requests

### `endpoints/admin/user-detail_GET.ts`
- In the packets query (step 6), join with `creditor_obligation_test` on `packet.creditorObligationTestId = creditor_obligation_test.id`
- Select `creditor_obligation_test.violation_category as violationCategory` and `creditor_obligation_test.obligation_type as obligationType`

### `endpoints/admin/user-detail_GET.schema.ts`
- Add `violationCategory: string | null` and `obligationType: string | null` to the packets array type in `UserDetailOutput`

### `pages/admin-user-management.$userId.tsx`
- In the Dispute Letters tab table, add a "Violation" column after the "Tradeline Name" column
- Display the violation info as a Badge showing the `violationCategory` (formatted: replace underscores with spaces, title-case)
- Update colSpan on empty state to 7

## Files to Create
None.

## Approach
1. Clean up duplicate data: delete packet ID 41 (keeping 40)
2. Add the duplicate-prevention check in `packet/create_POST`
3. Update the admin user-detail endpoint to include violation info in packets
4. Update the admin page UI to display the violation column

## Risks & Considerations
- The uniqueness check is a soft check (query before insert) — not a DB unique constraint — because the combination includes nullable `creditor_obligation_test_id` and the constraint should only apply to Draft status. A partial unique index could be added later for stricter enforcement.
- Backward compatible: the new fields (`violationCategory`, `obligationType`) are nullable so existing consumers are unaffected.
- Existing non-Draft packets (sent, completed, etc.) should NOT be deduplicated — a user may legitimately re-dispute after a response.
