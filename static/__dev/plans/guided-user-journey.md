---
created: 2026-04-08T16:34:05.025Z
updated: 2026-04-08T16:38:15.375Z
---

# Guided User Journey — Simplify the Dispute Flow

## Summary
Redesign the regular user experience around a clear, visual step-by-step journey that walks low-literacy users through the entire credit dispute process. The core loop is: **Upload Report → See Problems → Write Letters → Mail Letters → Record Response → Upload Again**. No backend changes. All existing deep functionality remains intact — we're adding a guided layer on top.

## Goals
- Users with less than grade 12 education can follow the process without confusion
- The "what to do next" action is always obvious — one big button, not five options
- Reduce sidebar clutter for regular users to the bare minimum
- Every page a regular user touches should use plain language (grade 8 reading level)

## Approach

### Step 1: Replace Dashboard with a Guided Journey View (for regular users only)
**File: `pages/_index.tsx`**

Replace the current stats grid, pending issues, and activity table with a **vertical journey tracker** — a visual timeline showing where the user is in the dispute process.

**Journey Steps:**
1. **Upload Your Report** — "Send us your credit report so we can check it for you"
   - Status: ✅ Done (if has artifacts) / 🔵 Do This Now (if no artifacts)
   - Action: "Upload Report" button
2. **See What We Found** — "We checked your report and here's what we found"
   - Status: ✅ Done (if violations scanned) / ⏳ Waiting (if just uploaded) / 🔒 Not yet
   - Action: "See Problems" → links to most recent upload-results page
3. **Write Your Dispute Letters** — "We'll help you write letters to fix the problems"
   - Status: ✅ Done (if has packets) / 🔵 Do This Now / 🔒 Not yet
   - Action: "Write a Letter" → links to packets page
4. **Mail Your Letters** — "Send your letters to the credit companies"
   - Status: ✅ Done (if packets sent) / 🔵 Do This Now / 🔒 Not yet
   - Actions: 
     - Option A: "Mail It Yourself" → links to packets page to print and mail manually
     - Option B: "Have XAPP Send It" → opens the existing `DeliveryWizard` component to send via registered or first-class mail through the PostGrid integration
5. **Record Their Response** — "When you hear back, tell us what they said"
   - Status: ✅ Done (if evidence recorded) / 🔵 Do This Now / 🔒 Not yet
   - Action: "Record a Response" → links to evidence page
6. **Upload New Report & Compare** — "Upload a new report to see what changed"
   - Status: 🔵 Do This Now (when responses recorded) / 🔒 Not yet
   - Action: "Upload New Report" → links to upload page

**Key design principles:**
- Completed steps are collapsed/subtle, current step is prominent and expanded
- Only ONE step should have the primary CTA at any time
- Each step has an emoji/icon, a simple title, a one-sentence explanation
- Admin users still see the existing dashboard (no changes to admin view)
- Below the journey, show a simple "Your Numbers" section with just: accounts count, letters sent, problems found

### Step 2: Simplify Sidebar Navigation for Regular Users
**File: `components/AppLayout.tsx`**

Reduce the regular user sidebar from 3 groups / 8 items to a flat list of 5 items:

```
🏠 Home
📤 Upload Report  
💳 My Accounts
✉️ My Letters
👤 My Info & Help
```

Remove from regular user nav:
- Evidence & Messages (accessible from journey step 5 and from within packets)
- Calendar & Deadlines (accessible from My Accounts)
- Progress & Stats (accessible from Home journey view or My Info)

### Step 3: Create the Journey Tracker Component
**New file: `components/DisputeJourneyTracker.tsx`**

A new component that:
- Accepts user stats (from existing `dashboardQueries`)
- Determines which step the user is currently on
- Renders a clean vertical timeline with step cards
- Highlights the current step with a prominent CTA
- Shows completed steps as checkmarks
- Shows future steps as locked/greyed out
- Mobile-friendly: works great on phones

### Step 4: Add "What To Do Next" Banner to Key Pages
**Files: `pages/packets.tsx`, `pages/upload-results.$artifactId.tsx`, `pages/evidence.tsx`**

On each page the user visits during the flow, add a small contextual banner at the top that says what to do next:
- Upload results page: "Found problems? → Write a Dispute Letter"
- Packets page (after creating): "Letter ready? → Mail It"
- Evidence page (after recording): "Got all responses? → Upload a New Report"

These are simple `<Link>` banners, not new components — just a few lines of JSX.

### Step 5: Simplify Upload Results Language
**File: `components/UploadScanSummary.tsx`**

- Replace "Threat Score" with "Problem Score" ✅ (already done)
- Replace "Compliance Scan Results" with "What We Found" on the page
- Replace "Procedural Vectors" with "Other Ways to Challenge" ✅ (already done)  
- Make the primary CTA more prominent: "Write a Dispute Letter Now →"
- Remove technical terms like "entity type breakdown" — use "Who is responsible"

## Files to Modify
1. **`pages/_index.tsx`** — Replace dashboard body with journey tracker for regular users, keep admin dashboard as-is
2. **`pages/_index.module.css`** — New styles for journey view
3. **`components/AppLayout.tsx`** — Simplify regular user nav items (reduce from 8 to 5)
4. **`pages/packets.tsx`** — Add "next step" banner after sending letters
5. **`pages/upload-results.$artifactId.tsx`** — Add "next step" banner, simplify language
6. **`pages/evidence.tsx`** — Add "next step" banner pointing to upload
7. **`components/UploadScanSummary.tsx`** — Final language polish pass

## Files to Create
1. **`components/DisputeJourneyTracker.tsx`** + `.module.css` — The main guided journey component. *Note: Depends on existing `DeliveryWizard`, `postgridClient`, and the `send-registered`/`send-first-class` endpoints for Step 4's "Have XAPP Send It" feature.*

## Files NOT Modified (backend stays untouched)
- No endpoint changes
- No helper changes (except possibly dashboardQueries if we need a new stat)
- No schema changes
- No database changes

## Risks & Considerations
- **Admin experience unchanged**: Admin users should continue to see the full dashboard with stats, pending issues, etc. The journey tracker is only for `role === "user"`.
- **No features removed**: All pages (evidence, calendar, progress, etc.) remain accessible via direct URLs and in-context links. We're only removing them from the sidebar nav for regular users.
- **Mobile-first**: Many users may be on phones. The journey tracker must be vertically stacked and touch-friendly.
- **Backward compatible**: This is a native mobile app — no breaking changes to inputs/outputs.
- **Existing `QuickSetupWizard`**: This component becomes redundant since the journey tracker replaces it. We can remove it from the dashboard or keep it hidden (it already hides after first report upload).
