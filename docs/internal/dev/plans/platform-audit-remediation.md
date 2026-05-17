---
created: 2026-04-17T16:47:47.185Z
updated: 2026-04-17T16:49:31.502Z
---

# Platform Audit Remediation Plan

## Summary
Address all 7 priority action items identified in the comprehensive platform audit to raise readiness from 786/1000 toward 900+. Covers security hardening, billing pipeline completion, webhook reliability, data seeding, and code cleanup.

---

## Action Item 1: Domain Guard — Switch to Enforce Mode

**SKIPPED — will be addressed separately.**

### Problem
`domainGuard.tsx` defaults to `log_only` when no `DOMAIN_GUARD_MODE` key exists in `system_settings`. Suspicious cross-origin requests are logged but never blocked.

### Approach
- Insert `DOMAIN_GUARD_MODE = "enforce"` into `system_settings` via SQL.
- No code changes needed — the helper already reads this key and respects the value.

### Files to Modify
None (database-only change).

### Risks & Considerations
- Verify that the 5-entry ALLOWLIST in `domainGuard.tsx` includes all published domains plus the sandbox. Currently it does: `creditregulatorpro.com`, `www.creditregulatorpro.com`, `xapp.floot.app`, `xapp.compnd.systems`, and the sandbox domain.
- Mobile app requests (if any) may need their origin added to the allowlist. Confirm that the native app's WebView sends one of the listed origins, or add the mobile app's origin.
- The PostGrid and tracking webhooks must NOT go through domain guard enforcement (they already have their own signature-based auth). Verify that `webhook/postgrid_POST` and `webhook/tracking_POST` do not call `validateOrigin`.

---

## Action Item 2: Fix Anonymous Upload Error Handling

### Problem
`POST /_api/ingest/anonymous-report` returns a 500 when given an empty/invalid body. The Zod validation error is thrown uncaught and wrapped as a generic 500 instead of a structured 400 response. This is the public conversion funnel — a 500 scares potential users.

### Approach
- In `ingest/anonymous-report_POST.ts`, wrap the `schema.parse(json)` call with a try/catch that returns a `400` response with a user-friendly message when Zod validation fails (e.g., "Please upload a PDF file to continue.").
- Also handle the case where `superjson.parse(text)` fails (malformed JSON) — return 400 instead of letting it bubble to 500.
- Keep the existing 500 handler for truly unexpected errors.

### Files to Modify
- `endpoints/ingest/anonymous-report_POST.ts` — Add Zod validation error catch returning 400.

### Files to Create
None.

### Risks & Considerations
- The frontend (`useAnonymousUpload`) already expects either a success response or an `{ error: string }` shape. The 400 response should use the same `superjson.stringify({ error: "..." })` format.
- Must remain backward compatible since the app is deployed as a native mobile app.

---

## Action Item 3: Wire Stripe for Trial-to-Paid Conversion

### Problem
User ID 11 has `plan: "monthly"`, `status: "trialing"`, trial ends `2026-05-16`, but both `stripe_customer_id` and `stripe_subscription_id` are NULL. When the trial expires, the user will be locked out with no mechanism to charge them.

### Approach
- Audit `subscription/create-checkout_POST` to confirm it creates a Stripe Customer and stores the `stripe_customer_id` and `stripe_subscription_id` in the `subscriptions` table after successful payment.
- Audit `subscription/update-plan_POST` to ensure it handles the trialing → active transition.
- Audit the `SubscriptionSection` and `SubscriptionCheckoutForm` components to verify the user-facing upgrade flow works end-to-end.
- If there's a gap in the flow (e.g., Stripe customer creation happens but the DB isn't updated), fix it.
- Add a guard in `ProtectedRoute` or the subscription check logic: when `status = "trialing"` and `trial_end < now`, if no Stripe subscription exists, redirect the user to the upgrade/checkout page rather than just locking them out.

### Files to Modify
- `endpoints/subscription/create-checkout_POST.ts` — Verify Stripe customer+subscription ID persistence.
- `endpoints/subscription/update-plan_POST.ts` — Verify trial-to-active transition logic.
- `components/ProtectedRoute.tsx` — Add graceful handling for expired trial without Stripe subscription (redirect to upgrade page instead of hard lock).
- `components/SubscriptionSection.tsx` — Verify upgrade CTA is visible and functional for trialing users.
- `helpers/subscriptionQueries.tsx` — Review subscription status check logic.

### Files to Create
None.

### Risks & Considerations
- Must be backward compatible. Don't change the subscription table schema.
- The Stripe PaymentElement flow should create a Stripe Customer at checkout time and store the IDs. If the flow currently relies on webhooks (which it shouldn't per the project resource notes), that's a design issue to fix.
- Test with the actual Stripe test mode keys before going live.

---

## Action Item 4: Fix PostGrid Webhook Auth

### Problem
`POST /_api/webhook/postgrid` returns 401 when the `x-postgrid-signature` header is missing AND `POSTGRID_WEBHOOK_SECRET` is set. This is actually correct security behavior — PostGrid SHOULD send the signature. However, we need to verify PostGrid is configured to send signatures.

### Approach
- The webhook code is already well-implemented with HMAC-SHA256 signature verification. No code changes needed if PostGrid is properly configured.
- However, add a fallback: if `POSTGRID_WEBHOOK_SECRET` is not set, log a warning but allow the request through (it already does this). If the secret IS set but the signature is missing, return 401 (it already does this correctly).
- The real fix is operational: verify that the PostGrid webhook URL is configured to `https://www.creditregulatorpro.com/_api/webhook/postgrid` (or whichever published domain is used) and that PostGrid's webhook signing secret matches `POSTGRID_WEBHOOK_SECRET`.
- Add a more descriptive error response body so debugging is easier.

### Files to Modify
- `endpoints/webhook/postgrid_POST.ts` — Minor: improve error response messages for debugging. Add request logging to help diagnose webhook delivery issues.
- `endpoints/webhook/tracking_POST.ts` — Same treatment: verify it doesn't require session auth for incoming webhooks.

### Files to Create
None.

### Risks & Considerations
- Webhook endpoints must NOT require session-based auth (cookies). They should use signature verification only.
- Make sure the webhook URL registered with PostGrid uses the production domain, not the sandbox.

---

## Action Item 5: Populate Licensed Collection Agency Registry

### Problem
The `licensed_collection_agency` table is empty (0 rows). The Ontario Open Data import functionality exists (`licensed-agency/import_POST`) but hasn't been executed.

### Approach
- Review and test `licensed-agency/import_POST` to ensure it works.
- Trigger the import to populate the table with Ontario licensed collection agencies.
- Verify the data is correctly formatted and queryable via `licensed-agency/list_GET` and `licensed-agency/check_GET`.

### Files to Modify
- Possibly `endpoints/licensed-agency/import_POST.ts` if the import fails or needs fixes.
- `helpers/licensedAgencyQueries.tsx` — Verify query logic handles the imported data correctly.

### Files to Create
None.

### Risks & Considerations
- The Ontario Open Data source URL may have changed or require an API key.
- Consider adding other provinces' collection agency registries if available.
- This is a one-time data import, but should be re-runnable for updates.

---

## Action Item 6: Add Bureau Contact Email Addresses

### Problem
Both Equifax Canada and TransUnion Canada have `contact_email: null` in the bureau table. Some dispute workflows may need email-based communication paths.

### Approach
- Update the bureau records via SQL to add official dispute email addresses:
  - **Equifax Canada**: No public consumer dispute email (they use online portal). Set to their general info or leave null with a note.
  - **TransUnion Canada**: `consumer.relations@transunion.ca` (verify this is current).
- If official dispute emails don't exist (bureaus increasingly use online portals), document this in the system and ensure the UI gracefully handles null email contacts.

### Files to Modify
- Database update only (bureau table).
- Optionally: any UI component that displays bureau contact info should handle null email gracefully (likely already does).

### Files to Create
None.

### Risks & Considerations
- Bureau contact information changes periodically. Should be easy to update via admin UI.
- Canadian bureaus may not publish dispute-specific email addresses. The mailing/PostGrid path is the primary dispute channel.

---

## Action Item 7: Clean Up Unused Code

### Problem
Two items are confirmed unused: `ProtectedContent` component and `requestFingerprint` helper. Additionally, 1 expired OAuth state exists in the database.

### Approach
- **Delete `ProtectedContent`** — Zero references. Anti-copy/anti-print wrapper that's never used.
- **Delete `requestFingerprint`** — Zero references. WAF-like fingerprinting helper that's never integrated.
- **Clean up expired OAuth state** — Delete the 1 expired row from `oauth_states`.
- Do NOT delete the 13 "potentially unused" endpoints — they are admin utilities, webhook receivers, and cron-triggered jobs that are called externally, not from code.

### Files to Modify
None.

### Files to Delete
- `components/ProtectedContent.tsx` + `components/ProtectedContent.module.css`
- `helpers/requestFingerprint.tsx` + `helpers/requestFingerprint.module.css`

### Risks & Considerations
- Confirm neither item is dynamically imported or referenced via string-based lookups (already confirmed: zero references).
- The `requestFingerprint` table in the database can stay — it's used by the rate limiter cleanup and doesn't harm anything.

---

## Implementation Order
1. **Action 7** (Code cleanup) — Quick win, no risk
2. **Action 2** (Anonymous upload 400) — Small code change, improves conversion funnel
3. **Action 6** (Bureau emails) — Database update
4. **Action 4** (PostGrid webhook) — Minor code + operational verification
5. **Action 5** (Licensed agencies import) — Data population
6. **Action 3** (Stripe wiring) — Most complex, requires careful audit of payment flow

## Expected Readiness After Remediation
Projected score: **~910 / 1000**
