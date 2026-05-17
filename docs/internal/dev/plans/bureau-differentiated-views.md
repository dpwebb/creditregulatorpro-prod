---
created: 2026-04-20T15:17:58.923Z
updated: 2026-04-20T15:17:58.923Z
---


# Bureau-Differentiated Views

## Summary
Add clear visual and structural differentiation between TransUnion and Equifax across the entire user-facing UI. Currently, parsed results from both bureaus are displayed in flat, undifferentiated lists. This plan introduces:

1. **Bureau filter tabs** on the tradelines table, upload results, and report artifacts
2. **Grouped-by-bureau views** that visually separate Equifax and TransUnion sections
3. **Side-by-side cross-bureau comparison view** when the same account appears on both bureaus
4. **Prominent cross-bureau discrepancy highlighting** when data differs between TU and EQ for the same account
5. **Bureau-specific visual identity** (consistent color/icon scheme for TU vs EQ throughout the app)

Target audience: Grade 8 reading level. All labels use plain language.

## Bureau Visual Identity

Establish a consistent visual identity used everywhere:
- **Equifax**: A warm color accent (e.g. orange/amber badge), short label "Equifax" or "EQ"
- **TransUnion**: A cool color accent (e.g. blue/teal badge), short label "TransUnion" or "TU"
- **Unknown/Other**: Neutral gray
- Use a new shared component `BureauBadge` that encapsulates the color, icon, and label for each bureau.

## Files to Create

### `components/BureauBadge`
A small presentational component that renders a colored badge/pill for a bureau name. Accepts `bureauName: string | null` and optional `size` prop. Internally normalizes the name and renders with the appropriate color scheme (Equifax=warm, TransUnion=cool, Other=neutral). Shows a small building icon + label.

### `components/CrossBureauComparison`
A side-by-side comparison card for when the same account appears on both bureaus. Accepts two tradeline objects (one per bureau). Displays:
- Bureau badge header on each side
- Key fields side by side: balance, status, opened date, DOFD, credit limit, high credit, amount past due, last activity date
- **Highlighted discrepancies**: Fields where values differ between the two bureaus get a colored border/background to draw attention
- A "What This Means" plain-language explanation at the bottom (e.g. "These two credit companies are showing different information for the same account. This could be a problem worth disputing.")
- Link to each tradeline detail page

### `components/BureauFilterTabs`
A reusable tab/toggle component with three options: "All", "Equifax", "TransUnion". Accepts `value` and `onChange`. Uses the BureauBadge colors for each tab. Compact design that sits in page headers.

## Files to Modify

### `pages/tradelines` (Your Accounts list)
- Add `BureauFilterTabs` above the table to filter tradelines by bureau
- When "All" is selected, group tradelines under bureau section headers ("Equifax Accounts" / "TransUnion Accounts") instead of one flat list
- Pass the bureau filter down to TradelinesTable or filter in the page
- At the top, if cross-bureau matches exist, show a summary banner: "X accounts appear on both bureaus" with a link/button to jump to comparison view

### `components/TradelinesTable`
- Replace the plain text bureau name column with the `BureauBadge` component
- Accept an optional `groupByBureau` prop. When true, render grouped sections with bureau headers
- Replace the existing `2x` cross-bureau badge with a more prominent "Both Bureaus" badge that uses a distinct style (e.g. gradient combining both bureau colors). Make it clickable — navigating to the cross-bureau comparison.

### `pages/my-accounts`
- Add a `BureauFilterTabs` component at the top level that affects the "Your Accounts" and "Errors We Found" tabs
- Pass the selected bureau filter down to child pages/components
- Add a new **4th tab**: "Compare Bureaus" that shows the `CrossBureauComparison` cards for all accounts that exist on both bureaus

### `components/UploadScanSummary`
- In the stats section, break down findings by bureau: show separate stat cards for Equifax violations vs TransUnion violations (in addition to the existing totals)
- In the "Most Important Problems" section, add a `BureauBadge` next to each finding's creditor name so users can see which bureau the problem is from
- If both bureaus were uploaded, add a "Cross-Bureau Issues" section that highlights accounts where the two bureaus report different data

### `pages/upload-results.$artifactId`
- In the subtitle, include the bureau name (e.g. "Analysis complete for Equifax Report" or "Analysis complete for TransUnion Report") pulled from the report artifact metadata
- Use `BureauBadge` in the header area

### `pages/report-artifacts` (Your Files tab)
- Group reports by bureau with section headers ("Equifax Reports" / "TransUnion Reports" / "Other")
- Add `BureauBadge` to each artifact card (already partially done with `bureauName` text — replace with the badge component)
- Add `BureauFilterTabs` to filter the list

### `components/TradelineHeader` (Account detail page)
- Replace the plain text `bureauName` in the meta row with the `BureauBadge` component for strong visual identity
- When a cross-bureau sibling exists, make the cross-bureau banner more prominent: show both bureau badges side by side with a "Compare" button that opens the `CrossBureauComparison` inline or as a sheet/dialog

### `pages/tradelines.$id` (Account detail page)
- When a cross-bureau match exists, add a prominent comparison section at the top (below the header) using `CrossBureauComparison` or a link to it
- Use `BureauBadge` in any place where the bureau name appears

### `endpoints/upload-results/get_GET`
- Add `bureauName` to each top finding object in the response (join with bureau table) so the frontend can display bureau badges on findings
- Add per-bureau violation counts to the stats: `equifaxViolations`, `transunionViolations`

### `endpoints/tradeline/get_GET`
- When the tradeline has a cross-bureau sibling (via `crossBureauMatcher`), include the sibling's key fields in the response so the detail page can render the comparison without a separate API call. Add a `crossBureauTradeline` object with: `id`, `bureauId`, `bureauName`, `creditorName`, `accountNumber`, `balance`, `currentBalance`, `status`, `openedDate`, `dateClosed`, `dateOfFirstDelinquency`, `creditLimit`, `highCredit`, `amountPastDue`, `lastActivityDate`

## Approach

1. Create `BureauBadge` component — foundational visual element used everywhere
2. Create `BureauFilterTabs` component — reusable filter control
3. Update `endpoints/upload-results/get_GET` and `endpoints/tradeline/get_GET` — backend data enrichment
4. Update `TradelinesTable` — add BureauBadge, grouped view support, improved cross-bureau badge
5. Update `pages/tradelines` — add bureau filter tabs and grouping
6. Update `pages/my-accounts` — add bureau filter and "Compare Bureaus" tab
7. Create `CrossBureauComparison` component — side-by-side view
8. Update `UploadScanSummary` — per-bureau stats and badges on findings
9. Update `pages/upload-results.$artifactId` — bureau name in header
10. Update `pages/report-artifacts` — grouped by bureau + filter tabs
11. Update `TradelineHeader` and `pages/tradelines.$id` — bureau badge + cross-bureau comparison

## Risks & Considerations

- **Backward compatibility**: All endpoint changes are additive (new fields). Existing mobile app clients will simply ignore the new fields.
- **Performance**: The `tradeline/get_GET` cross-bureau sibling data is a single additional query, negligible cost.
- **Users with one bureau only**: The filter tabs should gracefully show only the bureaus that have data. If only TransUnion reports exist, the "Equifax" tab should show "No Equifax accounts" rather than disappearing.
- **Grade 8 language**: Use "Credit Reporting Company" or the bureau name directly, not "bureau". Labels like "Compare Both Companies" rather than "Cross-Bureau Analysis".
- **Existing `BureauSelector` component**: This is for forms (selecting a bureau). The new `BureauBadge` is for display only — they serve different purposes and should coexist.
- **Cross-bureau matching relies on `crossBureauMatcher` helper**: Already in place and working. The `tradeline/list_GET` endpoint already computes pairs. We just need to surface them better in the UI and add sibling data to `tradeline/get_GET`.
