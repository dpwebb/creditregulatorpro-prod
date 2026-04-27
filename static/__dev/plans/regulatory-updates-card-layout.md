---
created: 2026-04-14T15:22:08.714Z
updated: 2026-04-14T15:22:08.714Z
---

# Regulatory Updates — Card Layout (No Horizontal Scrolling)

## Summary
Replace the table in the Updates Log tab with a stacked card-based layout. Each regulatory update becomes a card with info spread across two lines, so everything fits without horizontal scrolling at any viewport width.

## Files to Modify

### `pages/regulatory-updates.tsx`
- Replace the `<TableContainer>/<Table>` block with a list of cards
- Each card shows:
  - **Line 1:** Status badge, Jurisdiction, Change Type badge, Detected date
  - **Line 2:** Title (full width, allowed to wrap), Source with link icon, and action buttons (generate rule, view, edit, rollback, delete)
- Statutory reference shown below title in small muted text (already exists)
- Keep the urgent row styling (left border accent, tinted background)
- Keep `onClick` on card to open edit dialog
- Keep all action button logic as-is

### `pages/regulatory-updates.module.css`
- Remove all table-specific styles (`.tableWrapper`, `.hideOnMobile`, `.actionsHeader`, `.titleCell` max/min-width constraints)
- Add card list styles:
  - `.cardList` — vertical flex/stack with gap
  - `.updateCard` — card with border, radius, padding, two-line layout
  - `.cardTopRow` — flex row with status, jurisdiction, change type, date — wraps on narrow screens
  - `.cardBottomRow` — flex row with title (flex-grow, wraps), source, actions
  - `.urgentCard` — left border + tinted background variant
- Ensure no `overflow-x: auto` is needed — everything wraps naturally

## Files to Create
None.

## Approach
1. Replace the table markup with a vertical card list
2. Each card has two rows of content that naturally wrap
3. Action buttons sit at the end of the second row (or wrap below on very narrow screens)
4. Clean up unused table CSS classes

## Risks & Considerations
- This is admin-only page so no backward compatibility concern for mobile app
- Need to make sure the card click-to-edit behavior still works with action button stopPropagation
- Cards should still look good on wide screens (not too stretched)
