---
created: 2026-04-18T01:24:51.939Z
updated: 2026-04-18T01:24:51.939Z
---

# Subscription Emails: Confirmation + Renewal Reminder

## Summary
Add two subscription email features:
1. **Confirmation email** — sent immediately after payment is confirmed via `confirm-payment_POST`
2. **Renewal reminder email** — sent 3 days before the subscription period ends, containing an "I approve this payment" button (tracked via SendGrid click tracking) and a cancel subscription option

## Files to Modify

### `endpoints/subscription/confirm-payment_POST.ts`
- After the DB upsert succeeds, send a confirmation email via `sendGridEmail` to the user's email
- Email content: plan name, price, billing period, thank-you message
- Non-blocking — if email fails, log the error but don't fail the endpoint

### `static/__dev/scheduled-jobs.json`
- Add a 5th scheduled job `cronSubReminder` that runs daily at 8 AM Halifax time
- Schedule: `"0 8 * * *"`

## Files to Create

### `helpers/cronSubReminder.tsx`
Daily cron job that:
1. Queries `subscriptions` where `status = 'active'` and `current_period_end` is within the next 3 days (between now and now + 3 days)
2. Joins with `users` to get the user's email and display name
3. For each matching subscription, sends a renewal reminder email via `sendGridEmail`
4. Email HTML includes:
   - Plain-language reminder: "Your [Monthly/Annual] plan ($X CAD) renews on [date]"
   - A prominent **"Yes, I approve this payment"** button — this is a simple `<a>` link pointing to the published domain's subscription settings page (e.g. `https://www.creditregulatorpro.com/profile-settings`). SendGrid's built-in click tracking will record when users click it. No backend token/endpoint needed.
   - A **"Cancel my subscription"** link that also goes to the profile-settings page where the existing cancel flow lives
5. To avoid sending duplicate reminders, track which subscriptions have already been reminded. Simple approach: add a `renewal_reminder_sent_at` column to `subscriptions` table. Only send if `renewal_reminder_sent_at` is NULL or older than `current_period_start` (meaning it was for a previous cycle).

### DB Schema Change
- Add `renewal_reminder_sent_at TIMESTAMPTZ NULL` column to the `subscriptions` table

## Approach

1. **Add DB column** — `ALTER TABLE subscriptions ADD COLUMN renewal_reminder_sent_at TIMESTAMPTZ NULL`
2. **Create `cronSubReminder` helper** — the daily cron job that finds subscriptions due to renew within 3 days and sends reminder emails, updating `renewal_reminder_sent_at` after each send
3. **Update scheduled-jobs.json** — add the 5th cron job entry
4. **Update `confirm-payment_POST`** — add the confirmation email send after successful DB write
5. **Pull schema** — sync the new column into the schema helper

## Risks & Considerations

- **Scheduled job limit**: Currently 4 of 5 slots used. This plan uses the last available slot.
- **Duplicate email prevention**: The `renewal_reminder_sent_at` column prevents sending the same reminder twice per billing cycle.
- **SendGrid click tracking**: SendGrid automatically wraps links for click tracking when enabled in the SendGrid dashboard. The "approve" button is a regular link — no custom backend endpoint needed. The user can verify clicks in their SendGrid activity feed.
- **Email failures are non-blocking**: Both the confirmation and reminder emails log errors but don't fail the core operation.
- **Backward compatible**: Adding a nullable column and a new cron job doesn't affect existing functionality. The confirm-payment endpoint change only adds email sending after the existing success path.
- **Cancel link**: Points to the existing profile-settings page where the subscription cancel flow already exists — no new cancel endpoint needed.
