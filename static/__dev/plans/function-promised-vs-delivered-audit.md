---
created: 2026-04-09T02:20:49.671Z
updated: 2026-04-09T02:20:49.671Z
---

# Comprehensive Audit: Functions Promised vs. Functions Delivered

## Summary
A thorough audit of every user-facing promise (UI labels, journey steps, navigation items, CTA buttons) against actual backend/frontend delivery. This plan documents **gaps, broken flows, and misleading UI** so they can be systematically resolved.

---

## 1. DisputeJourneyTracker (6-Step Journey) — Regular Users

| Step | Promise | Delivered? | Issue |
|------|---------|-----------|-------|
| **1. Upload Your Report** | Links to `/upload` | ✅ Works | Upload page fully functional, ingestion pipeline works end-to-end |
| **2. See What We Found** | Links to `/upload-results/{artifactId}` or `/my-accounts` | ⚠️ Partial | If no artifact exists yet, links to `/my-accounts` — but step 2 is shown as "done" based on `totalTradelines > 0`, not whether user has *reviewed* findings. User might skip the scan summary entirely |
| **3. Write Your Dispute Letters** | Links to `/packets` | ⚠️ Bug present | Packet creation works, but the **PacketViewer** still fails when opening a just-created preview packet (the `[object Object]` bug was just fixed — needs verification in production) |
| **4. Mail Your Letters** | Two options: "Mail It Yourself" → `/packets`, "Have XAPP Send It" → DeliveryWizard | ⚠️ Partial | **"Have XAPP Send It"** button only appears if there's a packet with status `"ready to mail"`. But newly created packets have status `"Draft"` — there's **no obvious UI to change status to "Ready to Mail"** from the regular user's journey. The status dropdown is buried inside the CreatePacketDialog. User is stuck. |
| **5. Record Their Response** | Links to `/evidence` | ✅ Works | Evidence page has Messages and Files tabs, both functional |
| **6. Upload New Report & Compare** | Links to `/upload` | ✅ Works | Follow-up upload triggers cross-reference comparison |

### Key Gap in Step 4
The journey says "Mail Your Letters" but the regular user has no clear path to transition a letter from "Draft" → "Ready to Mail". The `CreatePacketDialog` defaults status to "Draft". The `PacketViewer` has no inline status-change control. The DeliveryWizard only triggers for "Ready to Mail" packets. **This is the biggest functional gap in the user journey.**

---

## 2. Regular User Sidebar Navigation (5 items)

| Nav Item | Path | Page Exists? | Functional? | Issue |
|----------|------|-------------|------------|-------|
| **Home** | `/` | ✅ | ✅ | Shows `DisputeJourneyTracker` for regular users |
| **Upload Report** | `/upload` | ✅ | ✅ | Full ingestion pipeline works |
| **My Accounts** | `/my-accounts` | ✅ | ⚠️ | Tabs: "All Accounts", "Problems Found", "Changes Detected", "Uploaded Reports", "Bankruptcy". **"Changes Detected"** and **"Bankruptcy"** tabs are advanced/admin-level features that may confuse low-literacy users |
| **My Letters** | `/packets` | ✅ | ⚠️ | Packet list works but the just-fixed preview bug needs verification. Also, the table shows technical fields like "Rule Check" and "Final Status" columns that are meaningless to regular users |
| **My Info & Help** | `/my-info` | ✅ | ✅ | Profile, User Manual, and Report a Problem tabs all present |

### Missing from Regular User Nav
- **No direct link to Evidence/Messages** — Step 5 says "Record Their Response" linking to `/evidence`, but `/evidence` is **not in the regular user sidebar**. Users can only reach it from the journey tracker step or the "next step" banner on `/packets`.
- **No Calendar/Deadlines** — The admin sidebar has this but regular users don't. If a user has deadlines, they have no way to see them.
- **No Progress/Stats** — Regular users can't see their analytics unless they navigate directly.

---

## 3. Dashboard Stats ("Your Numbers") — Regular User Home

| Stat Label | Data Source | Accurate? | Issue |
|-----------|-----------|----------|-------|
| **Accounts** | `stats.totalTradelines` | ✅ | Correct |
| **Letters Sent** | `stats.totalPackets` | ⚠️ Misleading | Label says "Letters **Sent**" but the count is `totalPackets` which includes Draft and unsent packets. Should be filtered to sent-only or label changed to "Letters Created" |
| **Problems Found** | `stats.totalObligations` | ⚠️ Misleading | `totalObligations` counts obligation *instances* (dispute tracking records), not compliance violations. A user with 0 violations but 5 obligation instances would see "5 Problems Found" which is wrong |

---

## 4. Packets Page — Promises vs. Delivery

| Feature | Promised | Delivered? | Issue |
|---------|---------|-----------|-------|
| **Create Letter** | "Write a New Letter" button | ✅ | Dialog works, letter generation via OpenAI works |
| **View Letter PDF** | Eye icon → PacketViewer | ⚠️ Fixed | Was broken with `[object Object]` — just patched |
| **Delete Letter** | Trash icon → confirm dialog | ✅ | Works |
| **Export CSV/PDF** | Export dropdown | ✅ | Works |
| **Bulk Actions** | Bulk delete/export toolbar | ✅ | Works |
| **Mail Letter** | Mail icon for "Ready to Mail" packets | ⚠️ Gap | Icon only shows for "Ready to Mail" status. No way for regular user to change status to "Ready to Mail" from the packet list |
| **"Next step" banner** | "Letters ready? Your next step is to mail them" | ⚠️ Conditional | Only shows when `hasReadyToMail` is true — which is rarely true because users don't know how to set status |

---

## 5. Upload Results Page — Post-Upload Flow

| Feature | Promised | Delivered? | Issue |
|---------|---------|-----------|-------|
| **Scan Summary** | Shows threat score, violations, findings | ✅ | Comprehensive and well-designed |
| **"Write a Dispute Letter Now"** CTA | Links to `/upload-review/{artifactId}` | ✅ | Links to review page where user can create packets |
| **Follow-up comparison** | Cross-reference with previous upload | ✅ | Works when multiple artifacts exist |
| **"See Your Accounts"** button | Links to `/tradelines` | ⚠️ | Links to `/tradelines` which is a standalone page, not the `/my-accounts` tabbed page. User might be confused navigating back |

---

## 6. DeliveryWizard — Mail Flow

| Feature | Promised | Delivered? | Issue |
|---------|---------|-----------|-------|
| **"Let us mail it for you"** (XAPP Send) | PostGrid integration, Stripe payment | ⚠️ Partial | Works technically but requires: (1) consumer signature on file, (2) Stripe payment. No guidance if PostGrid API fails. Error messages are technical |
| **"I'll print and mail it myself"** | Download PDF, checklist, record tracking | ✅ | Clean 3-step flow works |
| **"I'll Do This Later"** | Sets status to "Ready to Mail" | ✅ | Works, but ironic — this is the *only* way regular users can set "Ready to Mail" status, and it's buried in the self-mail sub-flow |

---

## 7. Profile & Help Pages

| Feature | Promised | Delivered? | Issue |
|---------|---------|-----------|-------|
| **Profile Settings** | Edit name, address, DOB, phone | ✅ | Works |
| **User Manual** | "How to Use This App" | ✅ | Content present |
| **Report a Problem** | Beta issue reporting | ✅ | Works |

---

## 8. Known Bugs Still Present

1. ~~**PacketViewer `[object Object]` bug**~~ — Just fixed in this session, needs verification
2. **`DashboardQuickActions` component** — Imported in `_index.tsx` but **never rendered** for regular users (only `DisputeJourneyTracker` is rendered). Dead import.
3. **Form validation errors** — Console shows `Form validation failed` errors on packet creation, suggesting the form schema may be rejecting valid submissions silently
4. **Duplicate CSS key warnings** — Console shows "Encountered two children with the same key" for react-big-calendar and react-pdf-viewer CSS. Not breaking but indicates improper imports.

---

## Files to Modify (Recommended Fixes)

### Priority 1 — Critical Journey Gaps
1. **`pages/packets.tsx`** — Add inline status-change capability (Draft → Ready to Mail) so regular users can progress their letters without going through the DeliveryWizard back-door
2. **`components/DisputeJourneyTracker.tsx`** — Fix "Letters Sent" stat label; fix Step 4 to handle packets that aren't "Ready to Mail" yet (show a note like "Change your letter status to 'Ready to Mail' first")
3. **`components/AppLayout.tsx`** — Add `/evidence` to regular user sidebar (it's referenced in the journey but unreachable from nav)

### Priority 2 — Misleading Labels
4. **`components/DisputeJourneyTracker.tsx`** — Change "Letters Sent" → "Letters Created" in the summary stats
5. **`components/DisputeJourneyTracker.tsx`** — Change "Problems Found" to use actual violation count instead of `totalObligations`
6. **`pages/packets.tsx`** — Simplify table columns for regular users (hide "Rule Check" and "Final Status" columns)

### Priority 3 — Navigation Consistency
7. **`components/UploadScanSummary.tsx`** — Change `/tradelines` link to `/my-accounts` for consistency
8. **`pages/_index.tsx`** — Remove unused `DashboardQuickActions` import

## Files to Create
None needed — all fixes are modifications to existing files.

## Approach
1. Fix the critical Step 4 gap by adding a status-change action to the packets table (e.g., a "Mark Ready to Mail" button on Draft packets)
2. Add `/evidence` to regular user nav
3. Fix misleading stat labels
4. Simplify packets table for regular users
5. Fix dead imports and stale links

## Risks & Considerations
- **Backward compatibility**: This is a native mobile app. No endpoint changes needed — all fixes are frontend-only.
- **Status transitions**: Need to verify that `useUpdatePacketStatus` hook exists and works for `Draft → Ready to Mail` transitions.
- **Stat accuracy**: Changing "Problems Found" to use violation counts requires either a new field from `dashboard/stats_GET` or reusing an existing one. The endpoint currently returns `totalObligations` (obligation instances), not compliance violation counts.
