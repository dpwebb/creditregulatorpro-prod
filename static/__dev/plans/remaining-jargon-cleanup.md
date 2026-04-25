---
created: 2026-04-07T13:49:50.583Z
updated: 2026-04-07T13:49:50.583Z
---

# Remaining Jargon Cleanup — Plain Language Pass

## Summary
Despite the Phase 1-9 low-literacy overhaul, many technical terms still appear in UI-facing text across components and pages. This plan identifies every remaining instance and maps each to a Grade 5-6 reading level replacement. **No backend, database, or variable-name changes** — only user-visible strings (labels, headings, descriptions, tooltips, badges, tab names, page titles).

---

## Terminology Map

| Technical Term | Plain Language Replacement |
|---|---|
| Tradeline / Tradelines | Account / Accounts on Your Report |
| Packet / Packets | Dispute Letter / Dispute Letters |
| Packet Generation | Create a Dispute Letter |
| Packet Impact | How Your Letters Helped |
| Compliance | Rule Check |
| Compliance & Disputes (tab) | Problems & Disputes |
| Compliance Issues (inline link) | Problems Found |
| Compliance Violations | Problems We Found |
| Violation / Violations | Problem / Problems |
| Metro2 Validation | Reporting Format Check |
| Metro2 CRRG | Credit reporting format rules |
| PIPEDA | Canada's Privacy Law (PIPEDA) |
| Drift / Drift Analysis | Changes Found / Change Check |
| Change Detection (tab) | What Changed |
| Discrimination Claims | Unfair Treatment Claims |
| Evidence Timeline | What Happened So Far |
| Evidence Chain / Chain of Custody | Proof Trail |
| Bureau Communications | Messages from Credit Companies |
| Source Documentation | Original Report |
| Obligation Instance | Dispute Step |
| Dispute Vector / Vector Rotation | Dispute Approach / Approach Rotation |
| Terminal Label / PROCEDURALLY EXHAUSTED | Final Status / ALL STEPS COMPLETE |
| Phase X/Y | Step X of Y |
| Rescan Compliance | Check Again |
| Obligation Transition | Dispute Update |
| Artifact / Report Artifact | Report / Uploaded Report |
| Furnisher | Company that reports your info |

---

## Files to Modify

### 1. `pages/tradelines.$id.tsx`
- **Page title (Helmet):** `Tradeline {accountNumber}` → `Account {accountNumber}`
- **Error state:** "Tradeline Not Found" → "Account Not Found"; "Return to Tradelines" → "Back to Your Accounts"
- **Tab labels:**
  - "Compliance & Disputes" → "Problems & Disputes"
  - "Change Detection" → "What Changed"
  - "Packet Impact" → "How Your Letters Helped"
  - "Metro2 Validation" → "Reporting Format Check"
  - "Discrimination Claims" → "Unfair Treatment Claims"
- **Overview tab:**
  - "Bureau Communications" → "Messages from Credit Companies"
  - "Log Bureau Response" → "Log a Response You Got"
  - "Source Documentation" → "Original Report"
  - "Evidence Timeline" → "What Happened So Far"
  - "Packet #" → "Letter #"
- **Discrimination tab:** heading "Anti-Discrimination Grounds Tracking" → "Unfair Treatment Claims"; description simplified.

### 2. `components/TradelineHeader.tsx`
- "Collection Account" → "Account Sent to a Collector"
- "Collection Agency:" → "Collector:"
- "Collection Agency Not Listed on Report" → "No collector name listed"
- "VIOLATION" badge text — keep as-is (this is a formal legal assertion) OR change to "PROBLEM"
- "MOP" label → "Payment Rating"
- Terminal bar: "PROCEDURALLY EXHAUSTED — CURRENTLY" → "ALL STEPS COMPLETE" (display only; DB value unchanged)
- "Phase X/Y" → "Step X of Y"

### 3. `components/TradelineComplianceHub.tsx`
- Summary bar labels: already updated ("Violations Found", "Letters Sent", "Replies Back") — mostly OK
- Tab labels: "Violations Found" → "Problems Found"; "Letters Sent" — keep; "Activity Log" — keep; "Next Steps" — keep
- Tab header text:
  - "Violations We Found" → "Problems We Found"
  - Sub-description mentioning "Violations" → "problems"
  - PIPEDA/Metro2 CRRG banner: simplify to "Canada's privacy law (PIPEDA) says your information must be correct and up-to-date. Credit reporting format rules (Metro2) also apply."
- Province warning: "Province Required for Accurate Compliance" → "We Need Your Province to Check the Right Rules"
- "PRIMARY VIOLATION" banner → "MAIN PROBLEM"
- Rescan button label: "Rescan Compliance" → "Check Again"

### 4. `components/ComplianceViolationCard.tsx`
- Badge "PRIMARY VIOLATION" → "MAIN PROBLEM"
- "DISPUTED — AWAITING RESPONSE" — keep (already clear)
- "Applicable Regulations" label → "Laws That Protect You"
- "What To Do" — keep
- Tip text mentioning "compliance violations" → "problems"

### 5. `components/TradelinePacketGenerationCard.tsx`
- Card title "Packet Generation" → "Create a Dispute Letter"
- "Generate Dispute Packet" button → "Create Dispute Letter"
- "View Dispute Packet" → "View Your Letter"
- All instruction text: replace "packet" with "letter", "tradeline" with "account", "obligation instance" with "dispute step", "compliance violations" → "problems"
- Inline link "Compliance Issues" → "Problems Found"

### 6. `components/TradelineExportSection.tsx`
- Card title "Export Evidence Package" → "Download Your Proof"
- Description: "Generate a court-ready PDF package containing the full chain of custody, verified timestamps, audit logs, and all associated evidence files." → "Download a PDF with all your proof, records, and files in one place — ready to use if needed."
- "No obligation instances found for this tradeline." → "No dispute steps found for this account."
- "PROCEDURALLY_EXHAUSTED" display text → "All Steps Complete"
- "General Dispute" → keep
- Tooltip "Download complete evidence package with digital signatures" → "Download your full proof package as a PDF"

### 7. `components/TradelineDriftPanel.tsx`
- Title "Drift Analysis" → "Change Check"
- Subtitle "Detect inconsistencies across report versions" → "See what changed between your credit reports"
- "Run Analysis" → "Check Now"
- "No drift detected yet." → "No changes found yet."
- "Run analysis to compare report artifacts." → "Upload a new report to see what changed."
- "Packet #" → "Letter #"
- "X days drift detected" → "Changed by X days"

### 8. `components/TradelineValidationSection.tsx`
- Title "Metro2 Validation Report" → "Reporting Format Check"
- Description: "Analysis of Metro2 reporting compliance and data integrity for this tradeline." → "We checked how your account is being reported to make sure it follows the rules."

### 9. `components/DisputeVectorRotation.tsx`
- Title "Dispute Vector Rotation" → "Dispute Approach History"
- "Blocked:" badge → "Can't use again:"
- "Rotation Open" → "Any approach available"
- Column title "Usage History" → "Past Approaches"
- Column title "Next Strategy Recommendations" → "What to Try Next"
- "No dispute vectors used yet." → "No approaches used yet."
- "Best Choice" → keep
- Policy note: "Rotation Policy: Consecutive use of the same vector is blocked to prevent robotic patterns. Varying the dispute basis increases the likelihood of manual review by the creditor." → "Why we switch it up: Using the same approach twice in a row can make it look automatic. Changing your approach makes it more likely that a real person will review your dispute."
- "Score:" pill → "Fit:" or keep as-is

### 10. `components/PacketImpactView.tsx`
- Section title "Packet Impacts" → "How Your Letters Helped"
- "Packet #" → "Letter #"
- "Change Timeline" → "What Happened"
- Timeline labels:
  - "Report Snapshot Captured" → "Report Saved"
  - "Packet Generated" → "Letter Created"
  - "Impact Assessed" → "Results Checked"
  - "Drift Detected:" → "Change Found:"
  - "Obligation Transition" → "Dispute Update"
  - "Evidence Logged" → "Proof Recorded"
- Badge labels: "Snapshot" → "Report"; "Packet" → "Letter"; "Impact" → "Result"; "Drift" → "Change"
- "Artifact ID:" → "Report #:"
- "Awaiting follow-up report to assess impact" → "Waiting for your next report to see what changed"
- "Vector:" → "Approach:"

### 11. `components/AppLayout.tsx` (Admin-only section — lower priority but still needs attention)
- "Compliance Config" → "Rule Check Settings"
- "Compliance Audit" → "Rule Check Audit"
- "Metro2 Guide" → "Reporting Format Guide"
- "Statutes" → "Laws" (admin context but still clearer)

### 12. `components/ComplianceRescanButton.tsx`
- Button text "Rescan Compliance" → "Check Again"
- Loading text "Rescanning..." → "Checking..."

---

## Files to Create
None — all changes are in existing files.

---

## Approach

### Step 1: Update the Tradeline Detail Page + Helmet
Update `pages/tradelines.$id.tsx` — tab labels, page title, error states, overview section text.

### Step 2: Update TradelineHeader
Replace collection terminology, terminal label display text, MOP label.

### Step 3: Update TradelineComplianceHub + ComplianceViolationCard + ComplianceRescanButton
The main compliance panel and its child cards — replace all "violation" → "problem", simplify PIPEDA/Metro2 banner, province warning.

### Step 4: Update TradelinePacketGenerationCard + TradelineExportSection
Packet-related cards on the overview tab — "packet" → "letter", "obligation instance" → "dispute step".

### Step 5: Update TradelineDriftPanel + TradelineValidationSection
Drift and validation panels — "drift" → "change", "Metro2" → "reporting format".

### Step 6: Update DisputeVectorRotation + PacketImpactView
Strategy and impact views — "vector" → "approach", timeline event labels simplified.

### Step 7: Update AppLayout admin labels + ComplianceRescanButton
Lower-priority admin nav items and rescan button.

---

## Risks & Considerations

1. **DB values unchanged** — All backend field values (PROCEDURALLY_EXHAUSTED, violation categories, etc.) remain the same. Only display-layer strings change.
2. **No prop/variable renames** — Component prop names like `onViewCompliance` stay as-is. Only user-facing text changes.
3. **Admin labels** — Some admin-only labels are simplified too. If admin users prefer technical terms, these can be reverted. The plan marks them as lower priority.
4. **Legal precision** — Terms like "PIPEDA" are kept but parenthetically explained ("Canada's Privacy Law (PIPEDA)"). The word "violation" is replaced with "problem" in user-facing contexts but the regulation citations remain accurate.
5. **Backward compatibility** — No backend changes, no endpoint changes, no schema changes. Fully backward compatible with the native mobile app.
