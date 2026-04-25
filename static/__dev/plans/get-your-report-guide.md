---
created: 2026-04-17T09:07:20.330Z
updated: 2026-04-17T09:07:20.330Z
---

## Summary

The anonymous upload feature is a strong conversion tool, but it requires users to already have their credit report PDF — a barrier most visitors won't clear. This plan adds a **"Get Your Report" guide** that walks users through obtaining their free credit report from Equifax Canada and TransUnion Canada, embedded directly into the try-upload page and linked from the landing page. The goal is to keep visitors in the funnel even if they don't have a report yet, and bring them back when they do.

## Approach

### 1. Redesign the try-upload page with a two-path layout

Replace the current single-dropzone layout with a **two-panel approach**:

- **Path A — "I have my report"**: The existing upload dropzone (unchanged functionality).
- **Path B — "I need my report first"**: A step-by-step guide showing exactly how to get a free credit report from Equifax Canada and TransUnion Canada.

Use a tab-style or toggle-style selector at the top: **"Upload Your Report"** | **"Get Your Free Report"**

### 2. Build the "Get Your Free Report" guide component

A new component `CreditReportGuide` that presents:

#### Bureau cards (Equifax + TransUnion), each showing:
- **Bureau name and logo area** (text-based, no external images)
- **Fastest method highlighted** — Online (instant)
  - Equifax: `https://my.equifax.ca/` — create a myEquifax account, download PDF
  - TransUnion: `https://ocs.transunion.ca/` — request Consumer Disclosure, download PDF
- **Alternative methods** — Phone & Mail
  - Equifax phone: 1-800-465-7166 (mailed in 5–10 days)
  - TransUnion phone: 1-800-663-9980
  - TransUnion mail: P.O. Box 338, LCD1, Hamilton, ON L8L 7W2
- **A "What to do next" callout**: "Once you download the PDF, come back here and upload it."

#### Key messaging (plain language, grade 8 level):
- "Every Canadian can get their credit report for free — it's the law."
- "It takes about 5 minutes online."
- "You'll need the PDF version of your report."
- A reminder to **download/save as PDF** (some bureaus show online-only views).

#### Bottom CTA:
- "Already have your report?" → scrolls/switches to the upload tab

### 3. Add a "Don't have your report?" prompt on the landing page

In the `LandingHero` component, add a small helper line near the "try it free" secondary link:
- Current: `or try it free without signing up`
- Add below: `Don't have your credit report yet? We'll show you how to get it free →` linking to `/try-upload` (which will default to the guide tab when accessed via a hash/query param like `?guide=true`).

### 4. Add an email reminder opt-in (lightweight)

On the guide tab, after the instructions, offer:
- "**Get a reminder email** when you're ready to upload" — a simple email field
- This captures leads who leave to go get their report
- Uses existing SendGrid integration
- Stores email in a new `lead_reminder` table (email, created_at, reminded_at)
- A cron job or manual trigger sends a follow-up email 24h later: "Your free credit report guide — ready to upload?"

## Files to Create

| File | Purpose |
|------|---------|
| `components/CreditReportGuide` | The step-by-step bureau guide component with Equifax & TransUnion cards |
| `endpoints/lead/reminder_POST` | Stores a lead email for the reminder opt-in |
| `endpoints/lead/send-reminders_POST` | Sends follow-up emails to leads (triggered by cron or admin) |

## Files to Modify

| File | Changes |
|------|---------|
| `pages/try-upload.tsx` | Add tab toggle between "Upload Your Report" and "Get Your Free Report"; render `CreditReportGuide` in the guide tab; support `?guide=true` query param to default to guide tab |
| `pages/try-upload.module.css` | Add styles for the tab toggle and two-panel layout |
| `components/LandingHero.tsx` | Add a "Don't have your report?" helper link below the "try it free" link |
| `components/LandingHero.module.css` | Style the new helper link |

## Database Changes

| Table | Columns | Purpose |
|-------|---------|---------|
| `lead_reminder` | `id` (serial PK), `email` (varchar, unique), `created_at` (timestamptz), `reminded_at` (timestamptz nullable), `source` (varchar, default 'try-upload') | Store lead emails for follow-up reminders |

## Risks & Considerations

- **External URLs may change**: Equifax and TransUnion URLs should be treated as content, not hardcoded deep in logic. The guide component should make them easy to update.
- **Privacy**: The lead reminder only stores an email — no personal data. Should include a note: "We'll only email you once to remind you."
- **Mobile-first**: The guide must work well on mobile since that's a primary audience. Bureau cards should stack vertically.
- **Backward compatible**: No existing endpoints or schemas are modified. The try-upload page adds new functionality without removing existing upload flow.
- **Grade 8 language**: All copy must be plain, short sentences. No jargon like "Consumer Disclosure" without explanation (e.g., "your credit history file (they call it a 'Consumer Disclosure')").
- **No account needed**: The guide and reminder opt-in are fully anonymous — no auth required.
