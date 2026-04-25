---
created: 2026-04-15T04:14:33.920Z
updated: 2026-04-15T04:17:06.675Z
---

# Grade 8 UI Simplification Plan

## Summary
Target audience: Grade 8 education. All user-facing text must use plain, everyday language. No technical jargon. Short sentences. Encouraging tone. This plan consolidates the remaining work from the low-literacy-ui-overhaul and remaining-jargon-cleanup plans.

## What's Already Done
- Sidebar navigation labels (simplified)
- Main page titles and subtitles (Dashboard, Upload, Packets, Evidence, Progress, My Info)
- Upload page progress stages
- Packet page labels ("Your Dispute Letters", "Write a New Letter", etc.)
- Evidence page tabs ("Messages", "Files & Proof")
- Banner messages (global banner, email verification)

## What Still Needs Fixing

### Phase 1: Tradelines Toolbar & Legend Consistency (HIGH PRIORITY)
Files: `components/TradelinesToolbar.tsx`, `pages/tradelines.tsx`

The toolbar filter buttons still use old jargon. Update to match the legend and table badges:
- "No Dispute Avenue Found" → "No Problems Found"
- "Violations Pending Challenge" → "Problems Found — Not Sent"
- "Dispute Delivery Pending" → merge into "Problems Found — Not Sent" (same filter matches both VIOLATION_PENDING and OBLIGATION_PENDING)
- "Violations Challenged" → "Letter Sent — Waiting"
- "No Bureau Response" → "No Answer Yet"
- "Insufficient Bureau Response" → "Bad Answer"
- "All Challenges Exhausted" → "All Steps Done ✓"

Also update the legend labels to match exactly (currently legend says "Problems Found — Not Sent Yet" but toolbar says different). Make all three (toolbar, legend, table badge) use the SAME short labels.

Merge VIOLATION_PENDING and OBLIGATION_PENDING into a single filter since they show the same label. Update filter logic in tradelines.tsx to match both statuses when "problems_found" filter is selected.

### Phase 2: Tradeline Detail Page Tabs
File: `pages/tradelines.$id.tsx`

Tab labels still use jargon:
- "Compliance & Disputes" → "Problems & Disputes"
- "Change Detection" → "What Changed"
- "Packet Impact" → "How Your Letters Helped"
- "Metro2 Validation" → "Reporting Format Check"
- "Discrimination Claims" → "Unfair Treatment Claims"

Also update page title from "Tradeline {number}" to "Account {number}".

### Phase 3: TradelineHeader Component
File: `components/TradelineHeader.tsx`
- "Collection Account" → "Account Sent to a Collector"
- "Collection Agency:" → "Collector:"
- "MOP" → "Payment Rating"
- "PROCEDURALLY EXHAUSTED — CURRENTLY" → "ALL STEPS COMPLETE"
- "Phase X/Y" → "Step X of Y"
- "VIOLATION" badge → "PROBLEM"

### Phase 4: TradelineComplianceHub + ComplianceViolationCard
Files: `components/TradelineComplianceHub.tsx`, `components/ComplianceViolationCard.tsx`
- "Violations Found" tab → "Problems Found"
- "Violations We Found" → "Problems We Found"
- "PRIMARY VIOLATION" → "MAIN PROBLEM"
- "Rescan Compliance" → "Check Again"
- "Province Required for Accurate Compliance" → "We Need Your Province to Check the Right Rules"
- "Applicable Regulations" → "Laws That Protect You"
- Simplify PIPEDA/Metro2 explanations

### Phase 5: Packet-Related Components on Tradeline Detail
Files: `components/TradelinePacketGenerationCard.tsx`, `components/TradelineExportSection.tsx`
- "Packet Generation" → "Create a Dispute Letter"
- "Generate Dispute Packet" → "Create Dispute Letter"
- "Export Evidence Package" → "Download Your Proof"
- "obligation instances" → "dispute steps"
- "chain of custody" → "records"

### Phase 6: Analytics & Strategy Components
Files: `components/TradelineDriftPanel.tsx`, `components/DisputeVectorRotation.tsx`, `components/PacketImpactView.tsx`
- "Drift Analysis" → "Change Check"
- "Dispute Vector Rotation" → "Dispute Approach History"
- "Blocked:" → "Can't use again:"
- "Packet Impacts" → "How Your Letters Helped"
- "Obligation Transition" → "Dispute Update"
- "Report Snapshot Captured" → "Report Saved"
- Timeline labels simplified

### Phase 7: Metro2 Validation & Compliance Components
Files: `components/TradelineValidationSection.tsx`, `components/ComplianceRescanButton.tsx`, `components/Metro2ValidationPanel.tsx`
- "Metro2 Validation Report" → "Reporting Format Check"
- "Rescan Compliance" → "Check Again"
- "Metro2 CRRG" → "credit reporting format rules"

### Phase 8: Sub-Pages Still Using Jargon
Files: `pages/analytics-dashboard.tsx`, `pages/change-detection.tsx`, `pages/dispute-rotation-analytics.tsx`, `pages/creditor-validations.tsx`, `pages/evidence-events.tsx`, `pages/evidence-management.tsx`, `pages/compliance-calendar.tsx`, `pages/bankruptcy-tracker.tsx`

Check each sub-page for remaining jargon and simplify. These are embedded in consolidated tabs so their internal headings/labels still need updating.

### Phase 9: Shared Component Text
Files: `components/OnboardingTour.tsx`, `components/ConsumerInfoMismatchDialog.tsx`, `components/UploadScanSummary.tsx`, `components/PacketComplianceBadge.tsx`, `components/PublishChecklistDialog.tsx`, `components/DisputeJourneyTracker.tsx`, `components/QuickSetupWizard.tsx`

Audit and simplify all user-facing text in these shared components.

### Phase 10: Admin Dashboard Labels (Lower Priority)
File: `pages/_index.tsx`
- "Total Obligations" → "Total Rules to Follow"
- "Compliance Config" → "Rule Check Settings"
- Admin labels can stay slightly more technical but should still be clear

## Approach
- Work phase by phase, starting with the most visible changes (Phase 1)
- Group related component changes into single updateItems calls
- Use replaceInFiles for simple string swaps across many files
- All changes are display-layer only — no backend, DB, or endpoint changes
- Ensure backward compatibility with the native mobile app

## Risks
- Longer labels may break layouts — test on mobile
- Admin labels simplified less aggressively since admins are staff
- Legal terms (PIPEDA) kept but explained in parentheses
- All DB values and API field names stay the same