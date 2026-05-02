# User And Plan Limitations

This record documents the current implementation so plan and role changes can be configured deliberately.

## Naming

- The customer-facing trial plan name is `Trial User`.
- The database subscription plan key is still `beta` for compatibility with existing subscription rows and generated types.

## Account States

| Account type | Current access | Current limits |
| --- | --- | --- |
| Anonymous visitor | Public pages and the anonymous report preview flow. | Anonymous report previews are processed in memory and are not stored unless the visitor creates an account immediately after the preview. No authenticated dashboard, saved reports, letters, evidence, calendar, billing, or support ticket history. Anonymous preview uploads are rate-limited to 5 attempts per 22 minutes by IP. |
| Trial User | Consumer account with the internal `beta` plan key. In production mode, new registrations are created as `status: "trialing"` with a 7-day `trialEnd`. | Current code gives the same consumer feature access as paid users while the account remains on `plan: "beta"`. Postal payment is bypassed for Trial User accounts. Trial User accounts do not have a paid subscription to cancel. |
| Monthly subscriber | Consumer account on `plan: "monthly"` with active billing. | Full consumer feature access while subscription status is active. Monthly price is $19.95 CAD. Print-and-mail requires postal payment before sending. Can cancel. Blocked if subscription is expired, cancelled, or past due. |
| Annual subscriber | Consumer account on `plan: "annual"` with active billing. | Full consumer feature access while subscription status is active. Annual price is $49.95 CAD. Print-and-mail requires postal payment before sending. Can cancel. Blocked if subscription is expired, cancelled, or past due. |
| Support agent | Admin-created staff account for customer support. | Bypasses subscription checks and terms gate. Navigation is limited to support queue and reference/legal pages. Support ticket list is limited to assigned tickets plus unassigned open tickets. Cannot access admin-only routes. |
| Admin | Internal platform administrator. | Bypasses subscription checks and terms gate. No subscription is attached. Can access platform admin tools, user management, support tickets, settings, rules, logs, parser tools, version management, and reference data. Admin accounts cannot be self-registered. |

## Current Configuration Gaps

- Trial expiry is displayed in the trial countdown banner, but the subscription gate currently exempts `plan: "beta"` accounts from lockout. If Trial User accounts must lose access after 7 days, the gate or a scheduled subscription-expiry job needs to be configured.
- Trial User postal sending is currently free because mail payment is bypassed for the internal `beta` plan key. If trial users should pay mailing costs, remove that bypass.
- Rate limits are endpoint-based, not plan-based. The main shared limits are: login 5 per 15 minutes, authenticated report upload 10 per 60 minutes, anonymous preview upload 5 per 22 minutes, packet build/create 20 per 60 minutes, registered mail send 5 per 60 minutes, first-class mail send 10 per 60 minutes, payment intent creation 10 per 15 minutes, evidence upload 10 per 60 minutes.
