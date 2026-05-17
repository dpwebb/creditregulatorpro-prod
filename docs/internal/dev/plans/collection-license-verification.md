---
created: 2026-04-16T15:34:11.389Z
updated: 2026-04-16T16:02:03.589Z
---

# Collection Agency License Verification — Full Hybrid

## Summary
Comprehensive system to automatically verify collection agency license status and reduce false positives, combining:
1. **Fix detection logic** — correct the data mapping from Equifax reports to properly distinguish between creditors and collection agents
2. **Known Licensed Agency database** — a `licensed_collection_agency` table for verified agencies
3. **Ontario open data auto-import** — import Ontario's public CSV of licensed collection agencies from data.ontario.ca
4. **AI-enhanced validation** — use OpenAI to do smarter agency name analysis beyond simple regex heuristics
5. **Provincial registry links** — show direct links to government registries for manual verification
6. **Dismiss/verify feature** — users can mark violations after checking

## DB Schema Changes

### New table: `licensed_collection_agency`
- `id` serial primary key
- `agency_name` text not null — canonical name
- `agency_name_normalized` text not null — uppercase, trimmed, for matching
- `province` varchar(2) not null — Canadian province code
- `license_number` text — if available from data source
- `license_status` enum ('active', 'expired', 'suspended', 'revoked') default 'active'
- `license_expiry_date` date — when the license expires
- `data_source` enum ('ontario_open_data', 'admin_manual', 'ai_verified') — where this record came from
- `verified_at` timestamptz — when last verified
- `created_at` timestamptz default now()
- `updated_at` timestamptz default now()
- Unique constraint on (agency_name_normalized, province)
- Index on agency_name_normalized for fast lookups

### Modify table: `creditor_obligation_test`
- Add `user_status` enum ('active', 'dismissed', 'verified') default 'active'
- Add `user_status_reason` text
- Add `user_status_updated_at` timestamptz

## Corrected Entity Identification

NCRI INC (National Credit Recovery Inc.) is itself a **collection agency**, not the original creditor. It is a licensed Ontario-based debt collection and BPO company that collects on behalf of original creditors.

The correct mapping for both collection accounts:

| Report Field | Value | Actual Role |
|---|---|---|
| `<h2>` Heading | NATIONAL LEGAL GROUP / NCRI CAPITAL ASSET INC | **Collection sub-agent / assigned agent** |
| "Member Name" | NCRI INC | **Primary collection agency / bureau member** (NOT the original creditor) |
| "Member Number" | 481YC00465 | Bureau member ID for NCRI INC |
| Original Creditor | **UNKNOWN — not disclosed on report** | The actual bank/telecom/company where the debt originated |

### Compliance Implications
1. **Three Collection Entities, One Debt**: NCRI INC holds the membership, but two different agent names appear as headings — suggesting sub-contracting or re-assignment of collection activity on the same debt. All three entities (NCRI INC, NATIONAL LEGAL GROUP, NCRI CAPITAL ASSET INC) are collection agencies, not the original creditor.
2. **License Verification Scope**: All three entities should be checked for valid provincial collection licenses — NCRI INC as the primary agency, plus both sub-agents.

### Updated Data Model for Collections
- `tradeline.originalCreditorName` → should store the **actual original creditor** if disclosed
- `creditor.name` or new field → should store the **bureau member name** (NCRI INC) — the reporting collection agency
- `tradeline.collectionAgencyName` → should store the **assigned collection agent** from the heading (NATIONAL LEGAL GROUP / NCRI CAPITAL ASSET INC)
- New field: **member_number** → store "481YC00465" for linking and license lookup

### What the Parser Should Do
The HTML parser extracts collection accounts from the `<h1>Collections</h1>` section. For each collection:
1. The `<h2>` heading = collection agent name → store in `tradeline.collection_agency_name`
2. "Member Name" field = bureau member name → store in `creditor.name`
3. "Member Number" field = bureau member identifier → store on the creditor record or as a new tradeline field `member_number`

### UI Labels (corrected)
- Heading: Show the collection agent name from the heading
- "Bureau Member: NCRI INC" (the agency reporting to Equifax)
- "Collection Agent: NATIONAL LEGAL GROUP"

## Duplicate Collection Assignment Detection

### Problem
Tradelines representing the same underlying debt are sometimes assigned to two different collection agencies at different times.
For example, two collections may share Member Number 481YC00465, account ***672, and DOFD 2021/02/01 — confirming they are the same debt assigned to two different collection agents by the same primary agency (NCRI INC).
- NCRI CAPITAL ASSET INC was assigned first (Dec 2023, $811)
- NATIONAL LEGAL GROUP was assigned later (Jan 2024, $606)
Both actively reporting simultaneously is a compliance concern. The previous collector should cease reporting when the debt is reassigned.

### Detection Logic
Add a new compliance detector (or extend complianceDetectorCollector) that:
1. Groups collection accounts by matching criteria: same `account_number` + same `creditor_id` + same `date_of_first_delinquency`
2. When multiple collection tradelines match, flag them as "Duplicate Collection Assignments" on the same underlying debt
3. The earlier assignment (older `date_assigned_to_collection`) should be flagged as potentially stale — that collector should have stopped reporting
4. Create a compliance violation: "Same debt reported by multiple collectors simultaneously"

### UI Changes
- On the tradeline detail page, show a "Related Collection Accounts" section that links the duplicate assignments together
- Each linked tradeline shows: collection agency name, date assigned, balance, and a link to its detail page
- Show a warning badge: "This debt is also being reported by [other agency]"

### Files to Modify
- `helpers/complianceDetectorCollector.tsx` — add duplicate assignment detection logic
- `pages/tradelines.$id.tsx` — add Related Collection Accounts section
- `endpoints/tradeline/get_GET.ts` or new endpoint — return related collection tradelines grouped by same debt

## Files to Create

### `helpers/licensedAgencyQueries.tsx`
- React Query hooks for the licensed agency table
- `useLicensedAgencyCheck(agencyName, province)` — frontend hook to check if an agency is in the DB
- DB query helpers for backend: `findLicensedAgency(name, province)`, `importAgencies(agencies[])`

### `endpoints/licensed-agency/check_GET`
- Check if a specific agency name is found in the licensed_collection_agency table for a given province
- Input: agencyName, province
- Returns: { found: boolean, agency: {...} | null, registryUrl: string }

### `endpoints/licensed-agency/import_POST`
- Admin-only endpoint to import agencies from Ontario open data CSV
- Fetches CSV from data.ontario.ca, parses it, upserts into licensed_collection_agency table
- Can also accept manual entries from admin

### `endpoints/licensed-agency/list_GET`
- Admin endpoint to list/search licensed agencies in the DB
- Supports filtering by province, name search, status

### `endpoints/licensed-agency/ai-verify_POST`
- Takes an agency name + province
- Uses OpenAI to analyze the agency name for legitimacy signals:
  - Is the name consistent with known Canadian collection agency naming patterns?
  - Does it match known industry players?
  - Does it have proper corporate structure indicators?
  - Cross-reference with any context the model knows about Canadian collection agencies
- Returns a confidence score and analysis
- If high confidence, auto-creates/updates a record in licensed_collection_agency with data_source='ai_verified'

### `endpoints/creditor-validation/dismiss_POST`
- Endpoint to update violation user_status to 'dismissed' or 'verified'
- Input: violationId, status ('dismissed' | 'verified'), reason (optional text)
- Auth required, must own the tradeline or be admin

### `helpers/ontarioOpenDataImporter.tsx`
- Helper to fetch and parse the Ontario open data CSV of licensed businesses
- Filter for collection agency license types
- Normalize names for matching
- Used by the import endpoint and potentially a cron job

## Files to Modify

### Report Parser Files (`helpers/equifaxReportParser.tsx`, `helpers/_htmlAccountParser.tsx`, `helpers/htmlReportParser.tsx`)
- Update the HTML parsing logic for collection accounts to correctly map the Member Name, Heading, and Member Number to the correct data model fields (creditor name, collection agency name, and creditor member number).

### `components/TradelineHeader.tsx`
- Update UI to clearly differentiate Bureau Member from Collection Agent and Original Creditor
- Show Collection Agent prominently in the collector box from `collection_agency_name`
- Remove the "PROBLEM" badge for missing collection agency if it's now correctly populated
- Label clearly: "Bureau Member: NCRI INC" and "Collection Agent: NATIONAL LEGAL GROUP"
- If it's a collection account, do not require a linked original tradeline for it to display correctly

### `helpers/complianceDetectorCollector.tsx`
- In `detectCollectorLicenseFailure()`:
  - Use the corrected `collection_agency_name` field for validation
  - Before flagging, check the `licensed_collection_agency` table — if the agency is found with 'active' status, skip the violation
  - If not found in DB, run AI-enhanced validation as a second check
  - Include the registry URL and AI confidence in the violation's technical_details
- Add duplicate collection assignment detection logic

### `helpers/collectionAgencyRegistry.tsx`
- Add a function `normalizeAgencyName(name)` for consistent matching
- Already has registry URLs — no other changes needed

### `components/ComplianceViolationCard.tsx`
- For COLLECTOR_LICENSE_FAILURE violations:
  - Show "Check the provincial registry →" link using the registry URL from technical_details
  - Show AI confidence analysis if available (e.g., "Our AI analysis: 85% likely licensed")
  - Add "Dismiss" and "Mark as Verified" action buttons
- For dismissed violations: show in muted/collapsed state with the reason

### `components/TradelineComplianceHub.tsx`
- De-emphasize dismissed violations (show at bottom, greyed out)
- Update violation count to exclude dismissed ones

### `helpers/complianceViolationQueries.tsx`
- Add mutation hook for dismissing/verifying violations

### `endpoints/creditor-validation/update_POST` (or the existing update endpoint)
- Support updating user_status fields

### `pages/tradelines.$id.tsx`
- Add Related Collection Accounts section
- Show warning badge if debt is reported by multiple collectors

### `endpoints/tradeline/get_GET.ts` (or new endpoint)
- Return related collection tradelines grouped by same debt criteria

## Approach

### Phase 1: Foundation (DB + Logic Fix)
1. Run DB migrations — create `licensed_collection_agency` table, add columns to `creditor_obligation_test`
2. Pull updated schema
3. Fix the HTML parser layer to correctly map Equifax report fields
4. Fix the UI and detection logic to use the corrected mapping
5. Add licensed agency DB lookup to the detector

### Phase 2: Ontario Auto-Import
6. Create `ontarioOpenDataImporter` helper
7. Create `licensed-agency/import_POST` endpoint
8. Create `licensed-agency/list_GET` and `licensed-agency/check_GET` endpoints
9. Run initial Ontario import

### Phase 3: AI-Enhanced Validation
10. Create `licensed-agency/ai-verify_POST` endpoint using OpenAI
11. Integrate AI verification into the compliance detector as a fallback

### Phase 4: Dismiss/Verify UI
12. Create `creditor-validation/dismiss_POST` endpoint
13. Update `ComplianceViolationCard` with registry link, AI analysis display, and dismiss/verify buttons
14. Update `TradelineComplianceHub` to handle dismissed state
15. Add mutation hooks to `complianceViolationQueries`

### Phase 5: Admin Interface
16. Add admin UI for managing the licensed agency database (list, add, import)

## Risks & Considerations

- **Ontario data format may change** — the CSV structure from data.ontario.ca could change; add error handling and format validation
- **AI hallucination risk** — OpenAI may confidently claim an agency is legitimate when it isn't. Always show AI results as "analysis" not "confirmed." Never auto-dismiss a violation based solely on AI — only boost confidence.
- **Rate limiting on data.ontario.ca** — don't fetch too frequently; cache the import and only refresh periodically (e.g., monthly via admin action or cron)
- **Name matching fuzziness** — agencies may be listed under slightly different names (e.g., "ABC Collections Inc." vs "ABC Collections Inc"). Use normalized comparison (uppercase, trim, remove punctuation).
- **Backward compatibility** — existing tradelines will need to be re-parsed to fix the data mapping. Migrations may be needed if we don't want to re-parse.
- **Re-scan behavior** — dismissed violations should remain dismissed on re-scan. The scanner should check for existing dismissed violations with same category + tradeline.
- **Privacy** — the licensed agency data is public information, no privacy concerns with storing it