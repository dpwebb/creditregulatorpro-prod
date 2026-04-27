---
created: 2026-04-15T04:50:31.151Z
updated: 2026-04-15T04:50:31.151Z
---

# User Experience Complete Rewrite

## Summary
A full rewrite of the consumer-facing UI/UX for XAPP-CA, redesigning every user-facing page to be simple, encouraging, jargon-free, and guided — built for an adult with a Grade 8 education. The goal is to turn a compliance engine into a friendly step-by-step companion that helps Canadians fix their credit reports.

**Guiding Principles:**
- No jargon. Ever. If a Grade 8 student can't understand it, rewrite it.
- Show only what the user needs right now. Hide everything else.
- Every screen should answer: "What should I do next?"
- Cards over tables. Short sentences. Big buttons. Encouraging tone.
- Mobile-first design (many users will be on phones via the native app).
- Progressive disclosure: simple view by default, details on tap/click.

---

## Current Problems (Full Audit)

### Navigation & Structure
- **7 sidebar items** is too many for the target audience
- "My Accounts" has **5 tabs** (All Accounts, Problems Found, Changes Detected, Uploaded Reports, Bankruptcy) — overwhelming
- "Evidence & Messages" and "Progress" add more nested tabs
- Users don't know what order to do things in

### Jargon & Confusing Labels
| Current Term | Problem | Plain Alternative |
|---|---|---|
| Problems Found (tab) | Vague; All Accounts also shows problems | Errors on Your Report |
| Changes Detected (tab) | What changes? | What Changed |
| Uploaded Reports (tab) | Shows `#42`, `credit_report`, "Not Linked" | Your Files |
| Artifact / Artifact Type | Developer term | Type of File / Report Type |
| Storage URL | Technical field | Remove entirely |
| Not Linked | Linked to what? | Not connected to an account |
| ERROR / WARNING / INFO | System severity codes | Big Problem / Heads Up / Just So You Know |
| `currentBalance`, `paymentHistoryProfile` | Raw field names | Balance, Payment History |
| Post-Dispute Only / Unlinked Only | Filter jargon | Remove or simplify |
| Strategy Analysis (Progress tab) | Too technical | How Your Disputes Are Going |
| Terminal Label | Legal/system term | Hide from user view |
| Packet ID / `#42` | Database IDs | Remove from user view |
| Obligation / Obligation Instance | Legal jargon | Rule / Letter |
| Tradeline | Industry term | Account |
| Creditor Validation | Technical name | Errors We Found |
| Drift Log | Technical name | Changes |
| Furnisher | Industry term | Company that reports your info |

### UI Clutter
- Report artifact cards show: ID badge, editable type, status badge, report date, created date, account link, action buttons — too much at once
- Change Detection page has: 4 stat cards + 3 filter dropdowns + search + detailed cards with code-like field names
- Problems Found page: 3 stat cards with non-clickable links, then an info banner, then a grid of cards
- Packets page: bulk select, export dropdown, packet ID, terminal label, compliance badge — all visible at once
- Dashboard: QuickSetupWizard + DisputeJourneyTracker is good but could be tighter

---

## Redesigned Architecture

### New Sidebar Navigation (5 items, down from 7+)

```
🏠 Home                    → /
📤 Upload Report            → /upload
💳 My Accounts              → /my-accounts
✉️ My Letters               → /packets
📊 My Progress              → /progress
👤 My Info                  → /my-info (with Support link inside)
```

**What changes:**
- **Remove** "Evidence & Messages" as a top-level nav item. Fold message recording into the account detail and letters flow.
- **Remove** "Support" as a separate sidebar item. Move it into "My Info" as a tab (it's already there as a standalone page).
- Support link remains accessible from My Info page and can also be reached from contextual help throughout the app.

### New "My Accounts" Page (3 tabs, down from 5)

```
Tab 1: "Your Accounts"        — Clean card list of all accounts (replaces All Accounts + TradelinesTable)
Tab 2: "Errors We Found"      — Simplified violation cards (replaces Problems Found / Creditor Validations)  
Tab 3: "Your Files"           — Clean file list (replaces Uploaded Reports / Report Artifacts)
```

**What gets removed/relocated:**
- **"Changes Detected" tab** → Removed as a standalone tab. Change information gets folded into each account's detail page (`/tradelines/$id`) as a "What Changed" section. Most users don't need a global change log.
- **"Bankruptcy" tab** → Moved to its own page accessible from "My Info" or conditionally shown. Most users don't have bankruptcy records, so it shouldn't take up a primary tab. If a user has bankruptcy records, show a banner/link on the My Accounts page.

### New "My Progress" Page (simplified, 1 view)

- Remove the "Strategy Analysis" tab — it's too technical for the target user.
- Show a single, clean progress dashboard: percentage complete, letters sent, responses received, visual journey tracker.
- The rotation/vector analytics can remain accessible to admin only or via a small "Details" link for power users.

### New "Evidence & Messages" → Absorbed into flow

- "Record a Response" becomes a prominent action on the Letters page and account detail page.
- "Files & Proof" becomes accessible from the account detail page.
- Users shouldn't have to navigate to a separate section to record a response — it should be part of the letter flow.

---

## Detailed File Changes

### Files to Modify

#### 1. `components/AppLayout.tsx` — Simplify sidebar navigation
- Reduce user nav items from 7 to 5-6
- Remove "Evidence & Messages" nav item
- Rename "Support" → fold into "My Info"
- Keep admin navigation unchanged

#### 2. `pages/my-accounts.tsx` — Reduce to 3 tabs
- Tab 1: "Your Accounts" (keep)
- Tab 2: "Errors We Found" (rename from "Problems Found")
- Tab 3: "Your Files" (rename from "Uploaded Reports")
- Remove "Changes Detected" tab
- Remove "Bankruptcy" tab (conditionally show a banner if records exist, link to dedicated page)

#### 3. `pages/report-artifacts.tsx` — Major cleanup ("Your Files" tab)
- **Remove `#{artifact.id}` display** — users don't need database IDs
- **Humanize artifact type labels** — transform `credit_report` → "Credit Report", `dispute_letter` → "Dispute Letter" using a mapping function
- **Replace "Not Linked"** → "Not connected to an account" or simply hide the row when not linked
- **Simplify card layout:**
  - Show: File icon + humanized type, date uploaded (single date, not two), status badge, account name (if linked), view/delete actions
  - Remove: Report Date vs Created date distinction (show just one as "Uploaded on"), editable inline fields (move to a detail/edit dialog instead)
- **Simplify create dialog:**
  - Remove "Storage URL" field entirely
  - Rename "Artifact Type" → "What kind of file?"
  - Use a Select dropdown with predefined options (Credit Report, Dispute Letter, Bureau Response, Other) instead of free text
  - Rename "Expires At" → "When does this expire?" or remove if rarely used
  - Rename "Report Date" → "When was this report made?"

#### 4. `pages/creditor-validations.tsx` — Simplify ("Errors We Found" tab)
- Rename page title from "Check a Creditor" → "Errors We Found"
- Rename subtitle to "We checked your accounts against the rules. Here's what we found."
- **Reduce stat cards from 3 to 1-2:** Keep "Total Errors" and "Needs Your Attention". Remove "Accounts Affected" (redundant — the cards below already show this).
- Simplify info banner text
- Keep the ComplianceTradelineCard grid — it's actually decent
- The `.creditorName` field in ComplianceTradelineCard should be the most prominent text (not account number) since users identify by creditor name, not account number

#### 5. `pages/change-detection.tsx` — Simplify and fold into account detail
- This page will no longer be a tab in My Accounts
- **Create a smaller "What Changed" component** that can be embedded in the account detail page (`/tradelines/$id`)
- The standalone page can remain accessible via direct URL for admin use but isn't in the user navigation
- In the embedded version:
  - Remove stat cards entirely
  - Remove all 3 filter dropdowns
  - Show a simple list: "Balance changed from $X to $Y on [date]" in plain English
  - Humanize field names via a mapping function
  - Replace severity badges with simple color indicators or icons

#### 6. `pages/packets.tsx` — Clean up "My Letters"
- **Remove `ID: #123`** from card display
- **Remove terminal label display** for non-admin users (it's already partially gated but the container still shows)
- **Remove bulk select/export UI by default** — move to an overflow menu or admin-only feature
- **Simplify card layout:**
  - Primary info: Status badge + Creditor/Account name + how long ago
  - Action buttons: View, Mail/Send, Delete
  - Remove PacketComplianceBadge for non-admin
- **Improve empty state** with step-by-step guidance
- Keep the "next step" banners — these are good

#### 7. `pages/progress.tsx` — Single view, remove Strategy tab
- Remove "Strategy Analysis" tab for regular users
- Show a single clean progress view
- Rename page title to "Your Progress"
- Admin can still access the strategy view via direct URL

#### 8. `pages/evidence.tsx` — Redirect/restructure
- Keep the page but make it less prominent (not in main nav)
- Add a "Record a Response" button to the packets page that deep-links to evidence
- The "Files & Proof" tab content should be accessible from account detail pages

#### 9. `components/ComplianceTradelineCard.tsx` — Reorder information hierarchy
- Make creditor name the primary/largest text
- Make account number secondary/smaller
- Humanize "Account Status" label to just "Status"
- Keep the issue count badge and priority alert — these are clear

#### 10. Global: Create a `helpers/humanizeLabels.tsx` helper
- Centralized functions to convert technical terms to plain English:
  - `humanizeFieldName(fieldName: string): string` — "currentBalance" → "Balance"
  - `humanizeArtifactType(type: string): string` — "credit_report" → "Credit Report"
  - `humanizeSeverity(severity: string): string` — "ERROR" → "Big Problem"
  - `humanizeStatus(status: string): string` — general status humanizer
- Used across all pages for consistent language

### Files to Create

#### 1. `helpers/humanizeLabels.tsx` — Centralized plain-language label helper
- Contains mapping functions for all jargon → plain English conversions
- Single source of truth for label transformations across the app

#### 2. `components/AccountChangesSummary.tsx` — Embedded "What Changed" component
- Lightweight component for the account detail page
- Shows recent changes for a specific tradeline in plain English
- No filters, no stats — just a simple chronological list
- "Your balance changed from $1,200 to $800 on June 15"
- "Your account status changed from Open to Closed on May 3"

#### 3. `components/SimpleFileCard.tsx` — Redesigned report file card
- Clean card showing: file type icon, humanized type name, upload date, status, linked account
- No database IDs, no editable inline fields
- View and Delete actions only
- Optional: "Connected to: [Account Name]" line

### Files to Delete (or deprecate)
- No files need to be deleted — existing pages remain accessible via direct URL for backward compatibility with the native mobile app. We only remove them from user navigation.

---

## Approach

### Phase 1: Foundation (do first)
1. Create `helpers/humanizeLabels` with all mapping functions
2. Update `components/AppLayout` sidebar navigation (reduce items)
3. Update `pages/my-accounts` tabs (reduce from 5 to 3)

### Phase 2: Report Files Cleanup
4. Redesign `pages/report-artifacts` — remove IDs, humanize types, simplify create dialog
5. Create `components/SimpleFileCard` if needed for cleaner cards

### Phase 3: Errors & Violations Cleanup
6. Update `pages/creditor-validations` — rename, reduce stats, simplify
7. Update `components/ComplianceTradelineCard` — reorder info hierarchy

### Phase 4: Change Detection Restructure
8. Create `components/AccountChangesSummary` for embedded changes view
9. Update `pages/tradelines.$id` to embed the changes summary
10. Remove change-detection tab from my-accounts

### Phase 5: Letters & Progress Cleanup
11. Update `pages/packets` — remove IDs, simplify cards, hide bulk actions
12. Update `pages/progress` — simplify to single view for users
13. Update `pages/evidence` — add contextual links from letters page

### Phase 6: Final Polish
14. Review all user-facing strings across modified pages for jargon
15. Test mobile layout for all modified pages
16. Ensure the "what should I do next?" guidance exists on every page

---

## Risks & Considerations

### Backward Compatibility (CRITICAL — Native Mobile App)
- **All backend endpoints must remain unchanged.** This is purely a frontend rewrite.
- **No page routes are being deleted.** Pages like `/change-detection` and `/bankruptcy-tracker` remain accessible via direct URL — they're just removed from the primary navigation tabs.
- **No endpoint input/output shapes change.**

### Data Display
- Removing database IDs from display means users can't reference them in support tickets. **Mitigation:** Support agents can look up by account name/creditor. Alternatively, show a "Reference #" only on the detail/expanded view.
- Hiding "Changes Detected" from the main tabs means users might miss important changes. **Mitigation:** Show a badge/count on the account card in "Your Accounts" tab if there are recent changes. Link to detail page.

### Progressive Rollout
- All changes are frontend-only and can be rolled out incrementally by phase.
- Each phase is independently valuable — we don't need to complete all 6 phases for improvement.

### Edge Cases
- Users with bankruptcy records: show a banner on My Accounts linking to the bankruptcy page
- Users with zero accounts: empty states should guide to Upload
- Admin view: admin navigation is NOT changed in this plan — admin pages remain as-is
- Support agent view: not changed in this plan

### Language Review
- After implementation, all user-facing strings should be reviewed against the Grade 8 reading level standard
- Use short sentences (under 15 words when possible)
- Use active voice ("We found 3 errors" not "3 errors were detected")
- Use encouraging tone ("Great job!" "You're making progress!" "Almost done!")
