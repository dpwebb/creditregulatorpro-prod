---
created: 2026-04-18T16:34:25.412Z
updated: 2026-04-18T16:34:25.412Z
---

# Simplify Tradelines Page for Grade 8 Audience

## Summary
Remove the "Add an Account" button, the filter toolbar tabs, and the "Export All" button from the tradelines page. These features are too complex for our target audience (Grade 8 education level). Accounts are populated automatically from uploaded credit reports — users should not need to manually add them. The filter tabs and export are power-user features that add clutter.

## Files to Modify

### `pages/tradelines.tsx`
- Remove the `CreateTradelineDialog` import and usage
- Remove the `isCreateOpen` state
- Remove the `TradelinesToolbar` import and usage
- Remove the `statusFilter` state and all filtering logic tied to the toolbar tabs
- Remove the `+ Add an Account` button from the header actions
- Keep the `TradelineSearchToggle` (search is simple and useful)
- Remove the `onAddTradeline` prop passed to `TradelinesTable`

### `pages/tradelines.module.css`
- Remove the `.createButton` styles (no longer needed)

### `components/TradelinesTable.tsx`
- Remove the `onAddTradeline` prop from the component interface
- Remove the `ExportDropdown` import and the entire toolbar/export section at the top
- In the empty state, instead of showing "Add an Account" button, show a friendlier message directing users to upload their credit report (link to `/upload`)
- Keep all the table display, sorting, mobile card views as-is

### `components/TradelinesTable.module.css`
- Remove `.toolbarContainer` and `.toolbarRight` styles (no longer needed)

## Files NOT to Delete
- `components/TradelinesToolbar` — Keep for now. It may still be used or referenced elsewhere. Check references before deleting.
- `components/CreateTradelineDialog` — Keep for now. Admin may still need it. Check references before deleting.
- `components/ExportDropdown` — Used in other places. Do not delete.

## Approach
1. Update `pages/tradelines.tsx` to remove the Add button, toolbar filter, and their associated state/imports
2. Update `components/TradelinesTable.tsx` to remove the export toolbar and update the empty state to guide users to upload their report instead of manually adding accounts
3. Clean up associated CSS

## Risks & Considerations
- The search bar remains since typing a name to find an account is intuitive at any education level
- The sort-by-column feature on the table headers stays — it's discoverable on interaction and doesn't add visual clutter
- The `TradelinesToolbar` and `CreateTradelineDialog` components should be checked for other references before considering deletion
- This is a frontend-only change — no backend or endpoint changes needed
- Mobile app backward compatibility is preserved since no endpoints are modified
