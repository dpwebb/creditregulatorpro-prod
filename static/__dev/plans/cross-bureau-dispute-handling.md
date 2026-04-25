---
created: 2026-04-16T21:51:12.539Z
updated: 2026-04-16T22:03:53.840Z
---


# Cross-Bureau Dispute Handling

## Summary
When the same account (same creditor + same/similar account number) appears on both Equifax and TransUnion, the system should:
1. Automatically detect and link cross-bureau tradeline pairs
2. Show the counterpart tradeline on the detail page
3. Let the user dispute the same issue on both bureaus at once, generating bureau-specific letters (Equifax template → Montreal P.O. Box; TransUnion template → Hamilton P.O. Box)

## Root Cause: TransUnion Tradeline Persistence Bug

The A_FULL extraction for the TransUnion report (artifact 187) successfully extracted all 4 accounts (Bank of Nova Scotia, Capital One Bank, FIDO, Rogers Communications). However, only Scotiabank (id 326) and Rogers (id 329) were persisted as tradelines. FIDO and Capital One from TransUnion were dropped during the tradeline persistence step (ingestTradelinePersistence or ingestTradelineValidator). When the Equifax report was uploaded later, FIDO and Capital One were extracted and saved — but correctly tagged as Equifax. This means the TransUnion versions were lost entirely.

Priority fix: investigate and fix the tradeline persistence layer (ingestTradelinePersistence, ingestTradelineValidator, ingestReportHandler) to understand why extracted accounts are being dropped. This must be fixed before the cross-bureau matching feature will work, since the TransUnion tradelines need to exist first.

## Files to Modify

### `endpoints/tradeline/get_GET.ts` + `endpoints/tradeline/get_GET.schema.ts`
- Add a `crossBureauTradeline` field to the output (the sibling tradeline on the other bureau, if any)
- Matching logic: same `userId`, same or similar `creditorName` (case-insensitive), same or overlapping `accountNumber` (last 4 digits match), different `bureauId`
- Include the sibling's id, bureauId, bureauName, creditorName, accountNumber, disputeStatus, and balance

### `endpoints/tradeline/list_GET.ts` + `endpoints/tradeline/list_GET.schema.ts`
- Add a `crossBureauTradelineId` field to each tradeline in the output
- Uses the same matching logic: same userId, similar creditorName, matching account number suffix, different bureauId
- Lightweight — only returns the sibling's id (not full data)

### `components/TradelineHeader.tsx`
- Add an optional `crossBureauTradeline` prop
- Show a subtle banner/badge: "This account also appears on [TransUnion/Equifax]" with a link to the sibling tradeline

### `pages/tradelines.$id.tsx`
- Pass the `crossBureauTradeline` data from the get endpoint to TradelineHeader
- Add a "Dispute Both Bureaus" button that creates two packets — one for each bureau
- When clicking "Dispute Both Bureaus", the system:
  1. Validates readiness (profile complete, both bureaus have addresses)
  2. Creates a packet for the current tradeline's bureau (existing flow)
  3. Creates a packet for the sibling tradeline's bureau (same violation/reason, different bureau template)
  4. Shows both packet previews or confirms success

### `components/TradelinesTable.tsx`
- When `crossBureauTradelineId` is present, show a small dual-bureau badge/icon on the tradeline card
- Tooltip: "This account is reported on both Equifax and TransUnion"

### `components/CreatePacketDialog.tsx`
- Add a "Dispute on both bureaus" checkbox/toggle when the tradeline has a cross-bureau sibling
- When checked, create two packets in sequence — one per bureau, each using the correct template
- Show a summary of both generated packets

### `helpers/ingestTradelinePersistence.tsx`
- Investigate deduplication/validation logic that dropped FIDO and Capital One from TransUnion

### `helpers/ingestTradelineValidator.tsx`
- Check if validation rules incorrectly rejected these accounts

### `endpoints/ingest/process_POST.ts`
- The endpoint that orchestrates the ingestion pipeline

## Files to Create

### `helpers/crossBureauMatcher.tsx`
- Shared logic for matching tradelines across bureaus
- `findCrossBureauSibling(tradeline, allTradelines)`: returns the matching sibling or null
- Matching rules:
  - Same userId
  - Different bureauId
  - Creditor name similarity (case-insensitive, fuzzy — strip "Inc", "Ltd", etc.)
  - Account number overlap (last 4 digits match, or full match)
- Used by both endpoints and potentially by frontend for display logic

## Approach

0. **Fix the ingestion persistence bug first** — investigate why FIDO and Capital One from TransUnion were dropped during persistence despite being successfully extracted. Fix the deduplication/validation logic so all accounts from all bureaus are saved as separate tradelines.
1. **Create `helpers/crossBureauMatcher`** — shared matching logic for identifying sibling tradelines
2. **Update `tradeline/get_GET`** — add cross-bureau sibling to the single-tradeline response
3. **Update `tradeline/list_GET`** — add cross-bureau sibling IDs to the list response
4. **Update `TradelineHeader`** — show cross-bureau banner with link to sibling
5. **Update `TradelinesTable`** — show dual-bureau badge on cards
6. **Update `CreatePacketDialog`** — add "dispute both bureaus" option
7. **Update `tradelines.$id` page** — wire cross-bureau data and add "Dispute Both" action

## Risks & Considerations

- **Matching accuracy**: Creditor names may differ slightly between bureaus (e.g. "TD Bank" vs "Toronto-Dominion Bank"). The fuzzy matcher needs to handle common variations. Using `creditorId` (if populated) as primary match, falling back to name similarity + account number.
- **Account number differences**: Bureaus sometimes mask or truncate account numbers differently. Match on last 4+ digits as a fallback.
- **Performance**: The list endpoint runs a secondary query. Keep the matching lightweight — do it in-memory after fetching all user tradelines (small dataset per user).
- **Backward compatibility**: All new fields are optional/nullable, so existing mobile app clients won't break.
- **Packet creation**: Creating two packets in one flow needs proper error handling — if the first succeeds but second fails, the user should know which succeeded.
