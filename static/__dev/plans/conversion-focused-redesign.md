---
created: 2026-04-16T13:57:17.449Z
updated: 2026-04-16T14:06:39.493Z
---

# Conversion-Focused Redesign — Credit Regulator Pro

## Summary
Complete redesign of the landing page, global color system, navigation, pricing model, and user onboarding flow — all optimized for trial-start conversion and paid retention. Includes a new anonymous upload → preview → paywall flow, in-app trial countdown, and clear billing transparency. Pricing changes from $4.99/month + $49.99/year + 30-day trial to **$19/month + 7-day trial**.

---

## Phase 0: Brand Assets (Pre-Build)

### Brand Reference
File ID: `82ce6dd5-d9ef-4626-98c2-9d338e516ceb` — Brand sheet showing all logo variants, favicon, app icon, and header/hero mockup.

### Assets to Generate Before Building Components
Using the brand sheet as reference, generate these individual assets with transparent backgrounds:

1. **Shield Icon (logo-icon-shield)** — The blue/navy shield with red checkmark swoosh. Square, transparent background. Used as favicon, app icon, and small logo mark throughout the app.

2. **Full Logo — Light Text (logo-full-light-text)** — Horizontal logo: shield icon + "Credit Regulator" in white + "PRO" in red (#FF2A2A). Transparent background. For use on the dark landing page header and hero.

3. **Full Logo — Dark Text (logo-full-dark-text)** — Same layout but "Credit Regulator" in dark/black text. Transparent background. For use on light backgrounds (in-app header, footer on light pages).

### Where Assets Are Used
| Asset | Used In |
|-------|---------|
| Shield Icon | Favicon (project metadata iconUrl), app icon, sidebar logo, mobile splash |
| Full Logo Light Text | LandingHeader, LandingFooter (dark backgrounds) |
| Full Logo Dark Text | In-app AppLayout header (light background) |

### Additional Notes
- Replace the existing ShieldCheck lucide icon in LandingHeader and LandingFooter with the actual logo image
- Replace the "CR" text logo in the register/login pages with the shield icon
- Update project metadata iconUrl with the new shield icon
- The header mockup in the brand sheet shows the layout: logo left, nav links + "Get Started" CTA right, dark background — this matches Prompt 2 of the design spec

---

## Phase 1: Global Design System + Landing Page Rebuild

### 1A. Global Color System (base.css)
**What changes:**
- Background: `#0B0B0B` (dark) — full dark mode landing
- Foreground: `#FFFFFF`
- CTA/Primary: `#FF2A2A` (red) — used only on buttons
- Accent/Info: `#1A73E8` (blue) — minimal use, links only
- Remove all gradients (`--background-gradient`, `--accent-gradient`)
- Typography: Inter (already in use), enforce `--font-family-base` and `--font-family-heading` both to Inter
- Max content width: 1100px (down from 1200px)
- Larger spacing defaults
- Shadows: subtle dark-mode appropriate
- Surface/card colors: dark tones (e.g. `#111111`, `#1A1A1A`)
- Border: subtle dark (`#2A2A2A`)
- Muted foreground: light gray (`#999999`)

**Files to modify:** `/base.css`

### 1B. Landing Header (Prompt 2)
**What changes:**
- Left: Logo only. Replace ShieldCheck lucide icon with actual brand logo image (logo-full-light-text). Use img tag instead of icon component.
- Right nav links: Home, How It Works, Pricing, Login
- Right CTA button: "Start Free Trial" (red #FF2A2A, white text)
- Sticky header, dark background (#0B0B0B)
- No dropdowns
- Remove "Get Started Free" button, replace with anchor-link nav items + CTA
- Scroll-to-section behavior for "How It Works" and "Pricing"

**Files to modify:** `components/LandingHeader`, `components/LandingHeader.module.css`

### 1C. Hero Section (Prompt 3)
**What changes:**
- Headline: "Check Your Credit Report for Problems"
- Subheadline: "We find issues and create letters you can send."
- CTA button: "Start Free Trial" (red)
- Subtext: "No charge for 7 days. Cancel anytime."
- Urgency line: "Takes less than 2 minutes to start"
- Remove: dashboard screenshot image, stats bar, trust badges, "legally precise dispute letters" language
- Clean, minimal layout — text-focused, no image

**Files to modify:** `components/LandingHero`, `components/LandingHero.module.css`

### 1D. Problem Awareness Section (Prompt 4 — NEW)
**What changes:**
- New section placed directly under hero
- Title: "Most People Miss Problems in Their Credit Report"
- Bullet list: Wrong balances / Accounts that are not yours / Late payments reported incorrectly
- Final line: "You will not see these unless you check carefully."
- CTA button: "Start Free Trial"

**Files to create:** New section within `components/LandingFeatures` OR a new `components/LandingProblemAwareness` component

### 1E. How It Works (Prompt 5)
**What changes:**
- Title: "How It Works"
- 4 steps: Upload → Scan → See results → Letters created
- Simplified step text (matches prompts exactly)
- Clean numbered circles, no feature grid
- Remove the existing 6-card feature grid entirely

**Files to modify:** `components/LandingFeatures`, `components/LandingFeatures.module.css`

### 1F. Value Preview Section (Prompt 6 — NEW)
**What changes:**
- Title: "See What We Find"
- Content: "We highlight possible problems in your report before you pay."
- Bullet examples: Incorrect account details / Missing information / Reporting errors
- CTA: "Start Free Trial"

**Files to create:** `components/LandingValuePreview` (new component)

### 1G. Pricing Section (Prompt 7 + 8)
**What changes:**
- Title: "Start Free"
- Single plan focus: 7-Day Free Trial → $19/month after
- Include: "No charge today" / "Cancel anytime" / "No contracts"
- Billing transparency block below: clear 3-line explanation of billing
- Remove 3-card pricing grid; replace with single-plan clarity
- CTA: "Start Free Trial"

**Files to modify:** `components/LandingPricing`, `components/LandingPricing.module.css`

### 1H. Trust + Compliance Section (Prompt 9 — NEW)
**What changes:**
- Two blocks side by side:
  - "What This Tool Does": check report, show problems, create letters
  - "What We Do Not Do": don't fix credit, don't contact companies, you stay in control
- Required for compliance — keeps "no fix credit" language enforced

**Files to create:** `components/LandingCompliance` (new component)

### 1I. Final CTA (Prompt 13)
**What changes:**
- Strong closing section before footer
- Text: "Start your free trial and check your credit report"
- Button: "Start Free Trial"
- Subtext: "No charge today"

**Approach:** Integrate into `LandingPricing` as the closing CTA block (replacing the existing gradient CTA box)

### 1J. Footer (Prompt 14)
**What changes:**
- Simplified: Privacy Policy, Terms of Service, Contact links
- Replace ShieldCheck lucide icon with actual brand logo image.
- Copyright: "© Credit Regulator Pro"
- Remove tagline and extra navigation

**Files to modify:** `components/LandingFooter`, `components/LandingFooter.module.css`

### 1K. Landing Page Assembly
**What changes:**
- Update `components/LandingPage` to include sections in order:
  1. LandingHeader (sticky)
  2. LandingHero
  3. LandingProblemAwareness (new)
  4. LandingFeatures (How It Works only)
  5. LandingValuePreview (new)
  6. LandingPricing (pricing + billing + final CTA)
  7. LandingCompliance (new)
  8. LandingFooter

**Files to modify:** `components/LandingPage`

---

## Phase 2: Pricing & Subscription Changes

### 2A. Database Schema Update
**What changes:**
- The `subscriptions` table likely stores plan/pricing info. The trial period needs to change from 30 days to 7 days for new registrations.
- Pricing: $19/month (no annual plan on landing page, but annual can remain in-app if desired)

### 2B. Registration Endpoint
**What changes:**
- Update trial duration from 30 days to 7 days for new user registrations
- Ensure new users get `plan: "beta"`, `status: "trialing"`, `trial_end: NOW + 7 days`

**Files to modify:** `endpoints/auth/register_with_password_POST`, subscription creation logic

### 2C. Stripe Integration
**What changes:**
- Update pricing to $19/month in Stripe checkout flow
- May need new Stripe price ID for $19/month
- Keep annual as an option in-app but lead with monthly

**Files to modify:** `endpoints/subscription/create-checkout_POST`, `helpers/subscriptionQueries`, `components/SubscriptionSection`, `components/SubscriptionCheckoutForm`

### 2D. Landing Page Pricing Constants
- Update all hardcoded pricing references from $4.99 → $19 and 30-day → 7-day

---

## Phase 3: Anonymous Upload → Preview → Paywall (Prompt 10)

### 3A. Anonymous Upload Endpoint
**What changes:**
- Create a new endpoint `endpoints/ingest/anonymous-report_POST` that:
  - Accepts file upload without authentication
  - Processes the report (text extraction + parsing)
  - Returns a summary: problem count, partial/blurred results
  - Stores a temporary session token (or uses a temp artifact ID) so the user can claim results after signup
  - Does NOT persist tradelines to the user's account yet

**Files to create:** `endpoints/ingest/anonymous-report_POST`

### 3B. Anonymous Upload Page
**What changes:**
- Create a new page or modify the landing flow so users can upload directly from the landing page without logging in
- Show a simplified upload UI (drag & drop / file select)
- After processing, show: "Problems found: X items"
- Show partial results (blurred or limited examples)
- Gate: "Create your account to see full results and download letters"
- CTA: "Start Free Trial"

**Files to create:** `pages/try-upload` (new page, no auth required) OR integrate into landing page as an interactive section
**Files to create:** `components/AnonymousUploadPreview` (shows blurred/partial results)

### 3C. Claim Results After Signup
**What changes:**
- After user registers, link their anonymous upload results to their new account
- Transfer temp artifact to user's account
- Navigate to full results view

**Files to modify:** Registration flow, `endpoints/auth/register_with_password_POST`

---

## Phase 4: In-App Trial Experience (Prompts 11 + 12)

### 4A. Trial Countdown Banner
**What changes:**
- After signup, show persistent banner/bar: "Your free trial ends in X days"
- Day counter (Day 1–7)
- "Cancel anytime before trial ends" reminder
- Show in the app sidebar or as a top banner

**Files to create:** `components/TrialCountdownBanner` (new component)
**Files to modify:** `components/AppLayout` or `components/AppSidebarUser` to include the banner

### 4B. Signup Screen Optimization (Prompt 11)
**What changes:**
- Update register page copy:
  - Title: "Unlock Your Full Report"
  - Content: See all problems / Download your letters / Take action today
  - CTA: "Start Free Trial"
  - Subtext: "No charge for 7 days"

**Files to modify:** `pages/register`, `components/PasswordRegisterForm`

---

## Files to Modify (Summary)
| File | Change |
|------|--------|
| `/base.css` | Full dark theme, new colors, no gradients |
| `components/LandingHeader` | Nav links, dark bg, CTA button |
| `components/LandingHero` | New copy, remove image/stats |
| `components/LandingFeatures` | Strip to How It Works only |
| `components/LandingPricing` | Single plan, billing clarity, final CTA |
| `components/LandingFooter` | Simplified links |
| `components/LandingPage` | New section order |
| `pages/register` | New copy for conversion |
| `components/ProtectedRoute` | Update trial period references |
| `components/AppSidebarUser` or `AppLayout` | Trial countdown |
| `helpers/subscriptionQueries` | Update trial day calculations |
| Subscription/registration endpoints | 7-day trial, $19/month |
| Project Metadata | Update iconUrl to new shield icon asset |

## Files to Create
| File | Purpose |
|------|---------|
| `components/LandingProblemAwareness` | Pre-conversion hook section |
| `components/LandingValuePreview` | Results preview section |
| `components/LandingCompliance` | What we do / don't do blocks |
| `components/TrialCountdownBanner` | In-app trial countdown |
| `endpoints/ingest/anonymous-report_POST` | Anonymous upload processing |
| `pages/try-upload` | Anonymous upload page |
| `components/AnonymousUploadPreview` | Blurred/partial results preview |

---

## Approach (Build Order)
1. **Update base.css** — global dark theme + new colors (affects everything)
2. **Rebuild landing components** — Header, Hero, new sections, Pricing, Footer, Page assembly
3. **Update pricing/subscription** — DB changes, registration endpoint, Stripe pricing
4. **Build anonymous upload flow** — New endpoint, new page, claim-after-signup logic
5. **Add trial countdown** — In-app banner component, sidebar integration
6. **Update register page** — Conversion-optimized copy
7. **Test end-to-end** — Landing → anonymous upload → preview → signup → claim → trial countdown

---

## Risks & Considerations

### Breaking Changes (Mobile App Backward Compatibility)
- **Pricing change ($4.99 → $19)**: Existing subscribers must NOT be affected. Only new signups get $19/month. Existing beta/monthly/annual users keep their plans.
- **Trial period (30 → 7 days)**: Only applies to NEW registrations. Existing trialing users keep their 30-day window.
- **No endpoint removal**: All existing endpoints remain. Anonymous upload is additive.
- **Color scheme change**: The dark theme applies globally (both landing and in-app). This is a significant visual shift for existing users. All components use CSS variables so the change propagates automatically, but some components may need contrast adjustments.

### Architecture Concerns
- **Anonymous upload storage**: Temp artifacts need a cleanup strategy (e.g., delete after 24h if unclaimed). May need a scheduled job.
- **Anonymous upload abuse**: Rate limiting needed to prevent spam uploads without auth.
- **Stripe price ID**: A new $19/month price must be created in Stripe dashboard. The admin will need to update the price ID.

### Compliance
- "What We Do Not Do" section must remain on the landing page per project policy (no "fix credit" language).
- Canada-only data residency policy unchanged.

### Existing Users
- Current beta users (30-day free trial, full access) continue unchanged.
- Current paid subscribers ($4.99/month, $49.99/year) continue at their existing rates.
- Only NEW registrations after this change get the 7-day trial + $19/month pricing.
