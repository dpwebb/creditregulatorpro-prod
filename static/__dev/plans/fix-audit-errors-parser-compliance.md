---
created: 2026-04-21T11:09:31.075Z
updated: 2026-04-21T11:14:27.576Z
---

# Fix Parser & Compliance Scanner Errors from Level 5 Audit

## Summary
Five confirmed bugs were uncovered during a manual Level 5 audit of report artifact 219 (TransUnion report with 4 tradelines). These span the parsing pipeline and compliance scanner. All produce either incorrect stored data or false-positive compliance violations.

### Error Log

| # | Tradeline | Error | Severity |
|---|-----------|-------|----------|
| 1 | 377 — Capital One | Status stored as `CG` instead of correct `WO` (write-off) | Critical |
| 2 | 378 — FIDO | Status stored as `CG` instead of correct `TC` (third-party collection) | Critical |
| 3 | 377 — Capital One | MOP stored as `0` instead of correct `9` | Critical |
| 4 | 378 — FIDO | False SOL violation flagged (account actively reported Dec 2025, but scanner used openedDate fallback of Feb 2020) | High |
| 5 | ALL (376–379) | False DISCLOSURE_DEFICIENCY violations for `payment_history` (data exists in source but scanner can't find it in extraction) | High |

## Files to Modify

### 1. `helpers/transunionAccountParser.tsx` — Status priority fix (Errors #1 & #2)

**Problem:** The `finalStatus` logic finds the *first* derogatory code via `parts.find(p => /WO|CG|TC|CO|CHARGE\s*OFF/i.test(p))`. When the legend contains multiple derogatory codes (e.g., `"CG-..., WO-..., X-Unknown"`), it always picks `CG` because it appears first in the string.

**Fix:** Replace the naive `.find()` with a priority-ranked selection. The most specific/severe derogatory status should win:
- Priority order: `WO` (write-off, highest) > `CO` (charge-off) > `TC` (turned over to collection) > `CG` (cancelled by grantor, lowest)
- Parse ALL derogatory codes from the legend parts, then pick the one with the highest priority rank.

### 2. `helpers/docstrangeParser.tsx` — MOP override fix (Error #3)

**Problem:** The tradeline mapping unconditionally sets `mop` from the first payment history detail row:
```ts
mop: (t.paymentHistoryDetails?.[0] as any)?.mop != null ? String(...) : undefined,
```
This overwrites the parser's correctly inferred MOP (e.g., `"9"` from WO status) with the first row's MOP value (e.g., `"0"`).

**Fix:** Use the parser's inferred `t.mop` as the primary MOP value. Only fall back to the first payment history detail row's MOP if `t.mop` is not set or is `"0"` (unknown). The logic should be:
```
mop = t.mop && t.mop !== "0" ? t.mop : paymentHistoryDetails[0]?.mop ?? t.mop
```

### 3. `helpers/complianceDetectorTemporal.tsx` — SOL false positive fix (Error #4)

**Problem:** The reference date chain falls through to `openedDate` when all preferred dates are null. For actively-reported accounts (e.g., FIDO with lastReportedDate Dec 2025), using openedDate from 2020 triggers a false SOL violation.

The code already has a comment saying: *"The opened date alone is NOT a valid basis for a statute of limitations violation in Canada."* — but the code contradicts this by still using it.

**Fix:** The approved reference date priority chain is: DOFD → Last Activity Date → **Date of Last Payment** → Date Closed → Opened Date.

When the reference date resolves to `openedDate` (the weakest fallback), add a guard: check `lastReportedDate` / `postedDate`. If the account was reported within the retention period (e.g., within the last 6–7 years), skip the SOL violation. An account that was actively reported recently cannot be past its retention period.

Specifically:
- Ensure the reference date priority chain respects: DOFD → Last Activity Date → `dateOfLastPayment` → Date Closed → Opened Date.
- After resolving `referenceValue`, check if `referenceDateSource === "openedDate"`
- If so, check `lastReportedDate` or `postedDate` — if either is within the last 12 months, skip the SOL check entirely (the account is clearly still active)
- This preserves the SOL check for truly stale accounts where openedDate is the only available date AND the account hasn't been reported recently
- Additionally, the parser should be improved to better extract and populate `dateOfLastPayment` from the source data when available, so the chain doesn't need to fall back to `openedDate` as often.
  - **Important Caveat for `dateOfLastPayment`:** A tradeline showing payments of $0 does NOT constitute a "last payment". The Date of Last Payment should only be used in the SOL reference chain when there is evidence of an actual monetary payment (payment amount > $0). If all payment history rows show $0 payments, dateOfLastPayment must be treated as null/unavailable and the chain should continue to the next fallback.
  - When extracting `dateOfLastPayment` from source data, only populate it from a "Last Payment" or "Date of Last Payment" field explicitly present in the source report, or from payment history rows where the payment amount is greater than $0.
  - This is critical for accounts like FIDO where the consumer never made any payments — all rows show Payment: 0, so there is no valid "last payment date" to use.

### 4. `helpers/complianceDetectorDisclosure.tsx` — Payment history false positive fix (Error #5)

**Problem:** The disclosure detector checks `accounts[].payment_history` in the extraction data, but the parser stores payment data as:
- `payment_pattern` (summary string like `"30d:0 60d:0 90d:0 months:26"`)
- `paymentHistoryDetails` (detailed monthly rows)
Neither is stored under the key `payment_history`, so the check always returns false → false DISCLOSURE_DEFICIENCY violation on every tradeline.

**Fix:** Update the `checkFieldExists` function to recognize payment data in its various stored forms. When the path is `accounts[].payment_history`, also check for:
- `payment_pattern` (non-null, non-empty)
- `paymentHistoryDetails` (non-null, non-empty array)
- `paymentHistory` (the summary object with 30/60/90 counts)

If any of these exist, consider the payment history as present.

### 5. `static/__dev/notes/canadian-credit-law-rules.md` — Add TC status clarification

Add new section **"## 13. TC Status vs Collection Tradeline"** documenting that:
- TC status does NOT make a tradeline a collection tradeline
- TC means the original creditor turned the account over to collections
- The tradeline still belongs to the original creditor
- `is_collection_account` should remain `false` for TC-status original creditor tradelines
- A true collection tradeline is a separate entry reported BY the collection agency

## Files to Create

None — all changes are to existing files.

## Approach

1. **Fix status priority** in `transunionAccountParser.tsx` — define a priority map for derogatory codes and select the highest-priority match instead of the first match
2. **Fix MOP override** in `docstrangeParser.tsx` — preserve the parser's inferred MOP unless it's missing/unknown
3. **Fix SOL false positive** in `complianceDetectorTemporal.tsx` — add lastReportedDate guard when reference date is openedDate
4. **Fix disclosure false positive** in `complianceDetectorDisclosure.tsx` — expand payment history field check to recognize all stored forms
5. **Add TC note** to the Canadian credit law rules dev note
6. **Write/update tests** for the status priority logic in transunionAccountParser and the MOP selection logic in docstrangeParser, as these are the most critical and tricky parsing changes

## Risks & Considerations

- **Backward compatibility**: These are all bug fixes to backend logic — no endpoint input/output shapes change. Existing stored data in the DB will still have incorrect values from prior parses. Users would need to re-upload or re-parse reports to get corrected data.
- **Status priority ordering**: The priority `WO > CO > TC > CG` is based on this audit's findings. If a different legend combination appears in the wild (e.g., `TC, WO`), the priority should still select `WO`. Verify against any other known report samples.
- **MOP edge cases**: Some accounts may legitimately have MOP 0 from the parser (e.g., newly opened accounts). The fix must only prefer `t.mop` when it's explicitly set to a non-zero value by the status inference logic.
- **SOL openedDate guard**: The 12-month recency check for lastReportedDate is conservative. An account reported 13 months ago might still not be past SOL. However, this is a pragmatic guard — the real fix is always having a DOFD for derogatory accounts.
- **Disclosure payment_history**: The root cause is a field naming mismatch between what the disclosure_requirement table expects and what the parser stores. A more thorough fix would normalize the extraction schema, but that's a larger refactor out of scope here.
