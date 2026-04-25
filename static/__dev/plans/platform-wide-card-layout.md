---
created: 2026-04-14T15:25:29.279Z
updated: 2026-04-14T15:25:29.279Z
---

# Platform-Wide Card Layout — Eliminate Horizontal Scrolling

## Summary
Convert all tables with overflow risk (6+ columns or dense content) to card-based layouts, matching the approach used on `pages/regulatory-updates`. Each row becomes a card with info spread across two lines that wrap naturally. Skip tables that are already compact (3 columns or fewer).

## Files to Modify

### Batch 1: User-facing pages

#### `pages/packets` (packets.tsx + packets.module.css)
- Replace table with card list. Each card:
  - **Top row:** Status badge, Created date, compliance badge (admin only), terminal label (admin only)
  - **Bottom row:** Letter info (icon + account + ID), action buttons (mark ready, mail, view, delete)
- Keep next-step banners, bulk actions toolbar, and all dialog logic

#### `pages/report-artifacts` (report-artifacts.tsx + report-artifacts.module.css)
- Replace table with card list. Each card:
  - **Top row:** Type (editable), Status badge, Report date (editable), Created date
  - **Bottom row:** Account link info, action buttons (view doc, delete)
- Keep inline editing behavior (EditableTextCell, EditableDateCell)

#### `pages/bureaus` (bureaus.tsx + bureaus.module.css)
- Replace table with card list. Each card:
  - **Top row:** Bureau name with icon, Region badge, delete button
  - **Bottom row:** Contact email, phone, dispute mail address, dispute email/portal link
- Keep bulk select checkboxes, bulk actions toolbar, create dialog

#### `pages/change-detection` (change-detection.tsx + change-detection.module.css)
- Replace table with card list. Each card:
  - **Top row:** Account info (number + creditor), Severity badge, Detected date, linked letter badge
  - **Bottom row:** Field name, Old value → New value, time drift, view tradeline link
- Keep stats cards, filters, search

#### `pages/beta-issues` (beta-issues.tsx + beta-issues.module.css)
- Replace table with card list. Each card:
  - **Top row:** Severity badge, Category badge, Status badge, Created date
  - **Bottom row:** Title (wraps), Reporter info (admin), admin actions (analyze, status dropdown, notes)
- Keep expandable AI analysis section below card when expanded

#### `pages/dispute-rotation-analytics` (dispute-rotation-analytics.tsx + dispute-rotation-analytics.module.css)
- Replace the tradeline table with card list. Each card:
  - **Top row:** Account (number + creditor), Health indicator, Success rate bar
  - **Bottom row:** Last strategy badge + date, "View Details" link
- Keep charts and stats sections unchanged

### Batch 2: Admin-only pages

#### `pages/admin-user-management` (admin-user-management.tsx + admin-user-management.module.css)
- Replace table with card list. Each card:
  - **Top row:** User name + email, Role badge, Verified icon, Joined date
  - **Bottom row:** Stats (Tradelines/Packets/Evidence counts), actions dropdown
- Keep search, role filter, add agent dialog, reset dialog

#### `pages/admin-error-logs` (admin-error-logs.tsx + admin-error-logs.module.css)
- Replace table with card list. Each card:
  - **Top row:** Timestamp, Entity badge, Action text, User email
  - **Bottom row:** Error message (truncated, full width), expand chevron
  - Expanded state shows error details, JSON context, and meta info below the card
- Keep filters, date range picker

#### `pages/admin-activity-logs` (admin-activity-logs.tsx + admin-activity-logs.module.css)
- Replace table with card list. Each card:
  - **Top row:** Timestamp, User info, Action badge, Status badge
  - **Bottom row:** IP address (if present), expand chevron
  - Expanded state shows user agent, region, details JSON, error message
- Keep filters

#### `pages/creditor-obligations` (creditor-obligations.tsx + creditor-obligations.module.css)
- Replace table with card list. Each card:
  - **Top row:** Duty type badge, Jurisdiction, Timeframe, Statutory reference
  - **Bottom row:** Description (wraps), action buttons (view, edit, delete)
- Keep search, jurisdiction/duty type filters

#### `pages/enforcement-mechanisms` (enforcement-mechanisms.tsx + enforcement-mechanisms.module.css)
- Replace table with card list. Each card:
  - **Top row:** Type badge, Jurisdiction, Filing deadline
  - **Bottom row:** Name + description (wraps), details (penalty/contact/ref), action buttons
- Keep filters

#### `pages/admin-user-management.$userId` (admin-user-management.$userId.tsx + admin-user-management.$userId.module.css)
- Replace ALL four tab tables (Tradelines, Packets, Reports, Activity) with card lists
- **Tradelines card:** Top: Creditor name, Bureau badge, Status. Bottom: Balance, Opened, Last reported
- **Packets card:** Top: Status badge, Violation badge, Terminal label. Bottom: Creditor name, Delivery, Created
- **Reports card:** Top: Type, Region badge. Bottom: Report date, Created
- **Activity card:** Top: Action badge, Entity, Status badge. Bottom: Entity ID, Timestamp

## Files to Create
None.

## Approach
1. Work through Batch 1 (user-facing pages) first, then Batch 2 (admin pages)
2. For each page: replace `<TableContainer>/<Table>` with a card list div, convert each `<TableRow>` to a card with two-line layout
3. Remove Table component imports where no longer used
4. Replace table-specific CSS with card list styles (`.cardList`, `.card`, `.cardTopRow`, `.cardBottomRow`)
5. Ensure all cards wrap content naturally — no `overflow-x: auto`, no `min-width`, no `white-space: nowrap` on critical text
6. Keep all existing functionality: dialogs, mutations, bulk actions, expandable sections, inline editing
7. Maintain consistent card styling across all pages (border, radius, padding, gap)

## Risks & Considerations
- Large scope (12 pages). Each page is self-contained so no cross-dependencies
- Expandable rows (error logs, activity logs, beta issues) need special handling — expanded content appears below the card
- Inline editing on report-artifacts must work within card layout
- Bulk select checkboxes need to work within card layout (bureaus, packets)
- Admin-user-management.$userId has 4 sub-tables in tabs — all need conversion
- No backend changes needed — this is purely frontend
