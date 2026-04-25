---
created: 2026-04-07T05:51:00.881Z
updated: 2026-04-07T05:58:56.981Z
---

# Low-Literacy UI Overhaul

## Summary
Redesign the entire UI layer (no backend changes) to be fully accessible to users with less than a high school education. This means: simpler words everywhere, larger text, bigger touch targets, less jargon, clearer navigation labels, more visual cues (icons, colors), and inline guidance that explains what things mean without requiring prior knowledge. Target reading level: Grade 5–6 (Flesch-Kincaid).

---

## Guiding Principles
1. **Use everyday words.** "Tradeline" → "Account on Your Report". "Obligation" → "Rules They Must Follow" (e.g., "Creditor Obligations" → "Rules Creditors Must Follow", "Bureau Obligations" → "Rules Credit Reporting Companies Must Follow", "Collector Obligations" → "Rules Collectors Must Follow"). "Packet" → "Dispute Letter". "Compliance" → "Rule Check". "Bureau" → "Credit Reporting Company".
2. **Short sentences.** No sentence longer than ~15 words. No compound-complex sentences.
3. **Big text, big buttons.** Minimum body text 16px. Buttons minimum 48px tall on mobile.
4. **Icons reinforce meaning.** Every label gets a paired icon so even non-readers can navigate.
5. **No abbreviations without explanation.** "CA" → "Canada". "Acct" → "Account". "ID" always accompanied by "#".
6. **Progressive disclosure.** Hide advanced/admin-only info behind expandable sections instead of showing everything at once.
7. **Encouraging tone.** "Great job!" not "Operation completed successfully."

---

## Phase 1: Global Design System Changes

### Files to Modify

#### `/base.css`
- Increase base font size to 16px (currently relies on browser default which is 16px, but many components use 0.75rem–0.875rem which is too small)
- Increase minimum line-height to 1.6 for body text
- Add a new CSS variable `--font-size-body: 1rem` (16px), `--font-size-label: 0.9375rem` (15px), `--font-size-small: 0.875rem` (14px minimum for any visible text)
- Ensure no text in the app is below 14px (0.875rem)
- Increase default `--radius` values slightly for friendlier feel
- Increase spacing-related variables slightly for more breathing room

---

## Phase 2: Navigation & Sidebar Simplification

### Files to Modify

#### `components/AppLayout.tsx`
Rename all sidebar navigation labels to plain language:
- **Core Workflow** → **"Main"**
  - "Dashboard" → "Home" (LayoutDashboard icon stays)
  - "Upload Report" → "Upload Your Report" 
  - "Credit Reports" → "Your Reports"
  - "Bankruptcy Tracker" → "Bankruptcy Info"
  - "Bureaus" → "Credit Reporting Companies"
- **Disputes & Evidence** → **"Your Disputes"**
  - "Tradelines" → "Accounts on Your Report"
  - "Communications Trail" → "Messages Sent & Received"
  - "Evidence Hub" → "Your Proof & Files"
  - "Creditor Validations" → "Check a Creditor"
- **Compliance & Packets** → **"Your Letters"**
  - "Packets" → "Dispute Letters"
  - "Compliance Calendar" → "Important Dates"
- **Analytics** → **"Progress & Stats"**
  - "Analytics Dashboard" → "How You're Doing"
  - "Change Detection" → "What Changed"
  - "Dispute Rotation Analytics" → "Dispute History"
  - "Deadline Tracker" → "Upcoming Deadlines"
- **Account & Help** → **"You & Help"**
  - "Profile Settings" → "Your Info"
  - "User Manual" → "How to Use This App"
  - "Beta Issues" → "Report a Problem"

Also simplify the global banner: "You are the disputing party. XAPP does not act on your behalf." → "You are sending these letters yourself. XAPP helps you but does not act for you."

Email verification banner: "Your email is not verified. Please verify to ensure you receive important dispute notifications." → "We need to check your email. Click the button so we can send you important updates."

#### `components/AppSidebarNavigation.tsx` / `.module.css`
- Increase nav item font size from 0.9375rem to 1rem
- Increase nav item padding for bigger touch targets
- Increase group label font size from 0.75rem to 0.8125rem

---

## Phase 3: Dashboard Page Simplification

### Files to Modify

#### `pages/_index.tsx`
- "Your credit reporting overview" → "Here's what's happening with your credit"
- "Attention Required" → "⚠️ Things You Need to Look At"
- "Overview" → "Your Numbers"
- Metric card labels:
  - "Active Bureaus" → "Credit Reporting Companies"
  - "My Tradelines" / "Total Tradelines" → "Accounts on Your Report"
  - "My Obligations" / "Total Obligations" → "Rules They Must Follow"
  - "My Packets" / "Total Packets" → "Your Dispute Letters"
- HelpTooltip for PIPEDA: "This system enforces Canada-only credit reporting policies (PIPEDA). All data processing remains within Canadian borders." → "This app only works for Canadian credit reports. Your information stays in Canada."
- Metric tooltips rewritten in plain language

#### `components/QuickSetupWizard.tsx`
- "Get started with XAPP-CA" → "Let's Get Started!"
- "Welcome! Use these quick links to begin your Canadian credit dispute processing setup." → "Welcome! Here are some things you can do right away."
- Button labels: "Upload Report" → "Upload Your Report", "View Tradelines" → "See Your Accounts", "Create Packet" → "Write a Dispute Letter"

#### `components/DashboardQuickActions.tsx`
- "Quick Actions" → "What Would You Like to Do?"
- "Setup Wizard" / "Re-run onboarding" → "Start Again" / "See the welcome guide"
- "Create Packet" / "Start a new dispute" → "Write a Letter" / "Start a new dispute letter"
- "View Deadlines" / "Check upcoming dates" → "See Deadlines" / "See what's coming up"

#### `components/DashboardPendingIssues.tsx`
- Simplify all issue descriptions to plain language
- "Compliance issues that need review" → "Problems we found that you should look at"

#### `components/DashboardActivityTable.tsx`
- Simplify column headers and status labels

#### `components/DashboardMetricCard.tsx`
- Ensure labels use simplified names

---

## Phase 4: Upload Page Simplification

### Files to Modify

#### `pages/upload.tsx`
- "Upload Credit Report" → "Upload Your Credit Report"
- "Reports are parsed and immediately processed..." tooltip → "We will read your report and find any problems right away."
- "Upload credit reports for immediate processing and compliance analysis" → "Send us your credit report and we'll check it for you"
- "Region: CA (Canada-only)" → "🇨🇦 Canada Only"
- "Data will be stored in CA region with 1-year retention policy." → "Your information is kept safe in Canada for 1 year."
- "Select Credit Report File" → "Choose Your File"
- Supported Formats tooltip: Simplify to "You can upload PDF, CSV, TXT, JSON, or XML files. Maximum size: 15MB."
- "Upload & Process Report" → "Upload My Report"
- "Processing Report..." → "Reading your report..."
- Simplify all progress stage names in getFriendlyStageName():
  - "Connecting to XApp AI..." → "Getting ready..."
  - "Uploading to XApp AI..." → "Sending your file..."
  - "Processing with XApp AI..." → "Reading your report..."
  - "Parsing extraction response..." → "Finding your accounts..."
  - "Validating extraction output..." → "Double-checking..."
  - "Extraction complete!" → "All done reading!"
  - "Parsing tradelines..." → "Finding your accounts..."
  - "Validating against Metro2 rules..." → "Checking for problems..."
  - "Scanning for compliance violations..." → "Looking for rule violations..."
  - "Finalizing upload..." → "Almost done..."
  - "Complete!" → "Done! ✓"

---

## Phase 5: Tradelines Page Simplification

### Files to Modify

#### `pages/tradelines.tsx`
- Page title "Tradelines" → "Your Accounts"
- "Manage consumer credit accounts and dispute statuses." → "See all the accounts on your credit report."
- "Add Tradeline" → "Add an Account"
- Legend labels:
  - "No Dispute Avenue Found" → "No Problems Found"
  - "Violations Pending Challenge" → "Problems Found — Not Sent Yet"
  - "Dispute Delivery Pending" → "Letter Being Sent"
  - "Violations Challenged" → "Letter Sent — Waiting for Answer"
  - "No Bureau Response" → "No Answer Yet"
  - "Insufficient Bureau Response" → "Bad Answer from Credit Reporting Company"
  - "All Challenges Exhausted" → "All Steps Done ✓"
- "Dispute Status Legend" → "What the Colors Mean"

#### `components/TradelinesTable.tsx`
- Simplify column headers
- "Account Number" → "Account #"
- "Dispute Status" → "Status"

#### `components/CreateTradelineDialog.tsx`
- Simplify form labels and descriptions

---

## Phase 6: Packets Page Simplification

### Files to Modify

#### `pages/packets.tsx`
- "Packets" → "Your Dispute Letters"
- "Manage dispute packets and evidence transmissions." → "See all the letters you're sending to credit reporting companies."
- HelpTooltip: "Packets are collections of evidence..." → "A dispute letter is what you send to a credit reporting company to fix something wrong on your report."
- "Create Packet" → "Write a New Letter"
- Column headers simplified:
  - "Packet Details" → "Letter Info"
  - "Terminal Label" → "Final Status"
  - "Compliance" → "Rule Check"
- Empty state: "No Packets Found" → "No Letters Yet"
- "Create a dispute packet to start the evidence process." → "Write your first dispute letter to get started."
- Delete dialog: "Confirm Deletion" → "Delete This Letter?"
- "Are you sure you want to delete this packet? This action cannot be undone." → "Are you sure? Once you delete this letter, it's gone for good."

#### `components/CreatePacketDialog.tsx`
- Simplify all form labels

#### `components/PacketViewer.tsx`
- Simplify viewer labels and descriptions

#### `components/DeliveryWizard.tsx`
- Already uses simple language (Grade 5 level) — minor tweaks:
  - Progress steps: "1. Choose" → "1. Pick", "2. Confirm" → "2. Check", "3. Done" → "3. Finished!"
  - "How do you want to send this?" — good as-is
  - Cost label: "This is what it costs." — good
  - "I checked this letter and it looks right." — good
  - "Everything in this letter is true." — good

---

## Phase 7: Other User-Facing Pages

### Files to Modify

#### `pages/bureaus.tsx`
- "Bureaus" → "Credit Reporting Companies"
- Simplify descriptions

#### `pages/evidence-events.tsx`
- "Communications Trail" → "Messages Sent & Received"
- Simplify event type labels

#### `pages/evidence-management.tsx`
- "Evidence Hub" → "Your Proof & Files"
- Simplify

#### `pages/compliance-calendar.tsx`
- "Compliance Calendar" → "Important Dates"
- Simplify descriptions

#### `pages/analytics-dashboard.tsx`
- "Analytics Dashboard" → "How You're Doing"
- Simplify metric names

#### `pages/bankruptcy-tracker.tsx`
- Simplify form labels and descriptions

#### `pages/deadline-calendar.tsx`
- "Deadline Tracker" → "Upcoming Deadlines"
- Simplify

#### `pages/change-detection.tsx`
- "Change Detection" → "What Changed on Your Report"
- Simplify descriptions

#### `pages/creditor-validations.tsx`
- "Creditor Validations" → "Check a Creditor"
- Simplify

#### `pages/dispute-rotation-analytics.tsx`
- "Dispute Rotation Analytics" → "Your Dispute History"
- Simplify

#### `pages/profile-settings.tsx`
- "Profile Settings" → "Your Info"
- Simplify labels

#### `pages/report-artifacts.tsx`
- "Credit Reports" → "Your Reports"
- Simplify

#### `pages/user-manual.tsx`
- "User Manual" → "How to Use This App"
- Simplify content

---

## Phase 8: Shared Component Language Updates

### Files to Modify

#### `components/PageHeader.tsx` / `.module.css`
- Increase title font size slightly
- Increase subtitle font size from 0.9375rem to 1rem

#### `components/HelpTooltip.tsx` / `.module.css`
- Increase tooltip body font size from 0.85rem to 0.9375rem
- Increase max-width from 18rem to 22rem so longer plain-language explanations fit

#### `components/Badge.tsx`
- Ensure badge text is at least 0.8125rem (13px)

#### `components/OnboardingTour.tsx`
- Simplify all tour step titles and descriptions to plain language

#### `components/ProfileCompletionDialog.tsx`
- Simplify prompts

#### `components/TermsDialog.tsx`
- Simplify terms language where possible

#### `components/ConsumerInfoMismatchDialog.tsx`
- "Consumer Information Mismatch" → "Your Info Doesn't Match"
- Simplify all field comparison labels

#### `components/UploadScanSummary.tsx`
- Simplify scan result labels

#### `components/FreezeStatusBadge.tsx`, `components/FraudFreezeManager.tsx`
- Simplify freeze-related language

#### `components/PacketComplianceBadge.tsx`
- Simplify compliance status labels

#### `components/PublishChecklistDialog.tsx`
- Simplify checklist items

---

## Phase 9: Login/Register Pages

### Files to Modify

#### `pages/login.tsx`
- Simplify instructions and labels

#### `pages/register.tsx`
- Simplify instructions and labels

#### `components/PasswordLoginForm.tsx`
- "Email Address" → "Your Email"
- "Password" → "Your Password"

#### `components/PasswordRegisterForm.tsx`
- Simplify labels and validation messages

---

## Approach

### Implementation Order
1. **base.css** — Global typography/spacing changes (affects everything)
2. **AppLayout + AppSidebarNavigation** — Navigation labels (most visible change)
3. **Dashboard (_index)** + quick actions/wizard — First thing users see
4. **Upload page** — Critical user flow
5. **Tradelines page** — Core feature
6. **Packets page** + DeliveryWizard — Core feature
7. **All other pages** — Batch update remaining pages
8. **Shared components** — HelpTooltip, PageHeader, badges, dialogs
9. **Login/Register** — Entry point

### Batching Strategy
- Group related file changes into single updateItems calls (e.g. all dashboard components together)
- CSS changes can often be batched with their component changes
- Use replaceInFiles for simple string replacements across many files

---

## Risks & Considerations

1. **Longer labels may break layouts.** "Tradelines" is 10 chars; "Accounts on Your Report" is 23 chars. Sidebar width may need slight increase, or we rely on text wrapping gracefully. Test at mobile breakpoints.
2. **Admin labels stay technical.** Admin-only pages (Legal & Compliance, Administration groups) can keep some technical language since admins are staff, but should still be simplified where possible.
3. **Helmet titles should match new labels.** Update all `<title>` tags to match the new page names.
4. **No backend changes.** All status values, API field names, and DB values stay the same. Only display-layer text changes.
5. **Accessibility side-effect.** These changes inherently improve WCAG compliance (larger text, better contrast, clearer labels).
6. **Mobile/native app impact.** Since this is a native mobile app deployment, larger text and touch targets are especially important. Test the 48px minimum touch target on all interactive elements.
7. **Backward compatibility.** Since this is UI-only and the project is deployed as a native mobile app, we must not change any endpoint inputs/outputs. All changes are purely in display text within components and pages.