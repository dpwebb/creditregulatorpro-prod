---
created: 2026-04-15T02:57:56.359Z
updated: 2026-04-15T03:01:06.272Z
---

# Add Admin-Configurable First Class Mail Pricing

## Summary
Admin sets the First Class base cost (what PostGrid charges XAPP). The system automatically adds a 15% markup. Users see only the final marked-up price. PostGrid doesn't expose pricing via API so the base cost must be admin-configured.

## Current State
- **Registered Mail**: Admin-configurable via `postgrid_base_cost` and `postgrid_surcharge_rate` system settings (stays as-is). ✅
- **First Class Mail**: Hardcoded to `$2.90` with no markup in:
  - `helpers/getPostalPricingFromDB` → `firstClassCost: 2.90`
  - `helpers/postalBillingQueries` → `POSTGRID_FIRST_CLASS_COST = 2.90`
  - Used by `DeliveryWizard`, `StripePaymentDialog`, `send-first-class_POST` endpoint

## Files to Modify

### 1. `helpers/getPostalPricingFromDB` (backend)
- Add `postgrid_first_class_base_cost` to the DB query
- Read from DB with fallback to 2.90
- Apply 15% markup: `firstClassCost = base * 1.15`
- Return both `firstClassBaseCost` (raw) and `firstClassCost` (with markup) for transparency

### 2. `helpers/useSystemSettings` (frontend)
- Update `usePostalPricing` to also return `firstClassBaseCost` and `firstClassCost` (base × 1.15)

### 3. `helpers/postalBillingQueries` (frontend)
- Keep `POSTGRID_FIRST_CLASS_COST = 2.90` as legacy fallback constant only
- Export `usePostalPricing` (already re-exported from `useSystemSettings`) — consumers should prefer the hook

### 4. `endpoints/admin/settings_GET` (backend)
- Add `postgrid_first_class_base_cost` to NON_SENSITIVE_SETTING_KEYS whitelist so non-admin users can read it

### 5. `pages/admin-compliance-config` (admin UI)
- Add a new "First Class Mail Pricing" card inside the **Postal Pricing** tab, alongside the existing "Registered Mail Pricing" card
- Single input: "PostGrid Base Cost (CAD)" — what PostGrid charges XAPP
- Display the computed user price (base × 1.15) as read-only below the input
- Info text: "A 15% markup is automatically applied. Users will be charged the marked-up price."
- Add local state tied to `pricingDirty` and save logic that writes the `postgrid_first_class_base_cost` key.

### 6. `components/DeliveryWizard` (frontend)
- Use `firstClassCost` from `usePostalPricing()` hook (already includes 15% markup) instead of hardcoded constant

### 7. `components/StripePaymentDialog` (if it uses the hardcoded constant)
- Verify and update to use the dynamic pricing value passed via props (already receives `baseCost` prop from DeliveryWizard)

## Files to Create
None — all changes are to existing files.

## Approach
1. **Step 1:** Seed `postgrid_first_class_base_cost = "2.90"` into `system_settings` so it exists for the admin UI to read immediately.
2. **Step 2:** Update backend (`getPostalPricingFromDB`, `admin/settings_GET`) to read the new key and expose it.
3. **Step 3:** Update frontend hooks (`useSystemSettings.usePostalPricing`) to return base and marked-up cost.
4. **Step 4:** Update admin page (`admin-compliance-config`) with First Class pricing card showing base + auto-calculated markup.
5. **Step 5:** Update `DeliveryWizard` to use hook-driven price instead of hardcoded constant.

## Risks & Considerations
- **Backward compatible**: Fallback to 2.90 base if DB key is missing.
- **System-enforced markup**: The 15% markup is system-enforced, not admin-configurable (to prevent accidental underpricing).
- **Registered Mail pricing stays unchanged**: Still uses the base + surcharge% model.
- **No DB schema changes needed**: Uses the existing `system_settings` key-value table.