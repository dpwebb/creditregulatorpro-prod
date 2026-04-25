---
created: 2026-04-15T03:08:35.563Z
updated: 2026-04-15T03:10:36.087Z
---

# PostGrid Markup Revenue Tracking

## Summary
Properly split postal transaction records to separate PostGrid base cost from XAPP's 15% markup revenue, and add an admin revenue summary view. Users continue to see only the final price — never the cost/markup breakdown. BOTH First Class and Registered Mail carry a 15% markup. Currently, registered mail has no markup — this needs to be added as part of these changes.

## Database Changes
Add a `markup_cad` column to the `postal_transaction` table:
- `ALTER TABLE postal_transaction ADD COLUMN markup_cad NUMERIC(10,2) DEFAULT 0.00;`
- This stores the XAPP markup portion per transaction (e.g. $0.44 for First Class, $0.82 for Registered Mail)

## Files to Modify

### 1. `endpoints/packet/send-first-class_POST.ts`
- Change how `postalTransaction` inserts work:
  - `base_cost_cad` = `pricing.firstClassBaseCost` (raw PostGrid cost, e.g. $2.90)
  - `markup_cad` = `pricing.firstClassCost - pricing.firstClassBaseCost` (e.g. $0.44)
  - `surcharge_cad` = `0.00` (unchanged)
  - `amount_cad` = `pricing.firstClassCost` (total charged to user, e.g. $3.34)
- Apply to both the successful transaction insert AND the refund insert

### 2. `endpoints/packet/send-registered_POST.ts`
- Currently registered mail uses: baseCost=$4.99, surcharge=$0.50 (baseCost × surchargeRate 0.10), total=$5.49 — NO markup
- New behavior: the total charged to user should be (baseCost + surcharge) × 1.15. So $5.49 × 1.15 = $6.31
- Split registered mail transactions:
  - `base_cost_cad` = `baseCost + surcharge` (raw PostGrid cost, e.g. $5.49)
  - `markup_cad` = `registeredCost - (baseCost + surcharge)` (e.g. $0.82)
  - `surcharge_cad` = `surcharge`
  - `amount_cad` = `registeredCost` (marked-up total charged to user, e.g. $6.31)
- Apply to both the successful transaction insert AND the refund insert

### 3. `endpoints/postal/transactions_GET.ts`
- Continue returning all fields — the new `markup_cad` will be included automatically via `selectAll()`
- No schema changes needed for user-facing data (users see `amount_cad` only, the UI doesn't display the breakdown)

### 4. `helpers/getPostalPricingFromDB.tsx`
- Must compute marked-up registered mail pricing: `registeredCost = totalCost * 1.15` (where totalCost = baseCost + surcharge)
- Return both the raw `totalCost` (PostGrid cost) and `registeredCost` (user-facing price with markup)
- First Class already correctly computes `firstClassCost = firstClassBaseCost * 1.15`

### 5. `endpoints/stripe/create-payment-intent_POST.ts`
- For registered mail, must use the marked-up `registeredCost` instead of the raw `totalCost` when creating the Stripe PaymentIntent
- First Class already correctly uses `pricing.firstClassCost` (marked up)

### 6. `helpers/useSystemSettings.tsx`
- The `usePostalPricing` hook needs to expose the new registered mail markup fields so the DeliveryWizard can show the correct marked-up registered price to users

### 7. New endpoint: `endpoints/admin/postal-revenue_GET`
- Admin-only endpoint that returns:
  - Total transactions count
  - Total revenue (sum of `amount_cad` where status = 'completed')
  - Total PostGrid cost (sum of `base_cost_cad` where status = 'completed')
  - Total markup revenue (sum of `markup_cad` where status = 'completed')
  - Breakdown by mail type (First Class vs Registered)
  - Breakdown by time period (last 30 days, last 90 days, all time)
  - Refund totals

### 8. `pages/admin-compliance-config.tsx`
- Add a "Revenue Summary" section in the Postal Pricing tab, below the existing pricing config cards
- Shows cards for:
  - Total Markup Revenue earned
  - Total PostGrid costs
  - Total amount charged to users
  - Transaction count
  - Refund count/amount
- Read-only summary — admin can see the financial health of the postal service

### 9. `helpers/postalBillingQueries.tsx`
- Add a `usePostalRevenueSummary()` hook for the new admin endpoint

## Files to Create

### `endpoints/admin/postal-revenue_GET` (endpoint + schema)
- Admin-only endpoint returning revenue analytics from `postal_transaction` table

## Approach

1. **DB migration**: Add `markup_cad` column to `postal_transaction`
2. **Backfill existing data**:
   - For existing completed First Class transactions, calculate and update `markup_cad` retroactively based on the known 15% rate: `markup_cad = amount_cad - (amount_cad / 1.15)`
   - For existing registered mail transactions, set `markup_cad = 0` (since they were historically charged at raw cost without markup)
3. **Update send-first-class endpoint**: Split transaction recording to use `base_cost_cad` for PostGrid cost, `markup_cad` for the margin
4. **Update send-registered endpoint**: Split transaction recording using the new registered mail markup
5. **Update pricing helpers & Stripe intent endpoint**: Propagate the 15% markup for registered mail so it is displayed in UI and charged in Stripe
6. **Create admin revenue endpoint**: Aggregate query for revenue stats
7. **Add admin revenue hook**: React Query hook in postalBillingQueries
8. **Update admin UI**: Add revenue summary cards to the Postal Pricing tab

## Risks & Considerations
- **Backward compatibility**: Adding a column with a default is safe; no breaking changes to existing API responses (the column appears in `selectAll()` results but the frontend doesn't display the breakdown to users)
- **Existing data**: Need to backfill `markup_cad` for historical transactions so revenue reports are accurate from day one
- **Registered mail pricing change**: Registered mail pricing changes from $5.49 to $6.31 — users will see a price increase. This is expected since the markup was previously missing.
- **Stripe amount change**: The Stripe PaymentIntent amount for registered mail will change — ensure the DeliveryWizard displays the updated price before users reach the payment step.
- **User privacy**: Users should never see `base_cost_cad` or `markup_cad` breakdown — only the final `amount_cad`. The user-facing transactions endpoint already returns all columns; the UI should be careful to only display `amount_cad` (currently the `usePostalTransactions` hook isn't used in any page, so this is safe)