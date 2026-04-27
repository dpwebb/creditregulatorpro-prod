---
created: 2026-04-14T13:59:07.810Z
updated: 2026-04-14T13:59:07.810Z
---

# Go Live — Production Mode

## Summary
Switch XAPP-CA from beta to production live. This involves flipping the `production_mode` system setting to `true`, changing new-user registration from creating "beta" subscriptions (100-year trial) to "trialing" subscriptions (30-day trial), and updating all related endpoints and UI messaging.

Existing beta users keep their beta plan but can now upgrade to paid plans via Stripe (the production_mode toggle already unlocks this in the subscription endpoints).

## Files to Modify

### 1. Database — `system_settings`
- Set `production_mode` to `"true"` via SQL.

### 2. `endpoints/auth/register_with_password_POST.ts`
- Check `production_mode` setting from DB.
- If production mode is ON: create new users with `plan: "trialing"`, `status: "trialing"`, and a 30-day `trialEnd`.
- If production mode is OFF (fallback): keep current behavior (`plan: "beta"`, 100-year trial).
- Update the returned `subscriptionPlan` and `subscriptionStatus` accordingly.

### 3. `endpoints/auth/oauth_callback_GET.ts`
- Same logic for new OAuth user creation (~line 521): check production_mode, assign trialing or beta plan accordingly.
- Same for backfill subscription logic (~line 467): check production_mode before defaulting to beta.

### 4. `endpoints/subscription/status_GET.ts`
- When backfilling a missing subscription: check production_mode to decide between beta (100-year) and trialing (30-day).

### 5. `components/SubscriptionSection.tsx`
- Update messaging: when in production mode and user is on beta, show "You're on the original Beta plan — upgrade anytime to continue using XAPP-CA" instead of "When the application enters production mode..."
- When user is on trialing plan, ensure the trial days remaining message is clear about the need to subscribe after trial ends.

### 6. `static/__dev/system-prompt.md` (project system prompt)
- Add note that the system is now in production mode and new registrations create trialing subscriptions.

## Files to Create
None.

## Approach
1. **Set DB flag**: Run SQL to set `production_mode = "true"`.
2. **Update registration endpoint** (`register_with_password_POST`): Add production_mode check. In production mode, create `trialing` subscription with 30-day trial instead of `beta`.
3. **Update OAuth callback** (`oauth_callback_GET`): Same logic for new user creation and subscription backfill.
4. **Update subscription status backfill** (`subscription/status_GET`): Same production_mode-aware logic.
5. **Update SubscriptionSection UI**: Adjust messaging for production mode.
6. **Update system prompt**: Reflect that system is now live.

## Risks & Considerations
- **Backward compatibility**: The native mobile app is deployed, so all endpoint changes must be backward-compatible. Adding the production_mode check internally doesn't change input/output shapes — safe.
- **Existing beta users**: They remain on `plan: "beta"` and are unaffected. They can now upgrade since `production_mode = true`.
- **Trial enforcement**: The 30-day trial end needs enforcement — existing `subscription/update-plan_POST` and `create-checkout_POST` already handle plan upgrades. A user whose trial expires without upgrading will need a lock-out mechanism. This is already handled if the subscription status transitions to "expired" after trial end — verify this is in place or note it as a follow-up.
- **Stripe integration**: The `create-checkout_POST` and `update-plan_POST` endpoints already gate on `production_mode` — flipping the flag enables them immediately. Ensure Stripe keys are properly configured before going live.
