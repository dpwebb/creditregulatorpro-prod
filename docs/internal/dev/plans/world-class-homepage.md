---
created: 2026-04-15T18:25:19.572Z
updated: 2026-04-15T18:25:19.572Z
---

## Summary
Build a world-class, conversion-focused public homepage at `/` for unauthenticated visitors. Authenticated users continue to see their dashboard. The page showcases XAPP-CA's value proposition for Canadian consumers, highlights key features, shows pricing, and drives visitors to sign up.

## Architecture

Currently `_index` is behind `UserRoute + AppLayout`, so unauthenticated users are redirected to `/login`. The new approach:

1. **Remove** `UserRoute` from `_index.pageLayout.tsx` (set to `[]`)
2. **Modify** `_index.tsx` to check auth state:
   - **Authenticated** → render `<AppLayout>` wrapping the existing dashboard
   - **Unauthenticated** → render the new `LandingPage` component (no sidebar, no auth)
   - **Loading** → show a loading state
3. The landing page is built as a **component** (not a separate page) so it renders at `/`

## Landing Page Sections

### Hero
- Bold headline: "Take Control of Your Credit Report"
- Sub: "XAPP automatically finds mistakes and compliance violations in your Canadian credit report — then helps you fight back with legally precise dispute letters."
- Primary CTA: "Start Free — No Credit Card Needed" → /register
- Secondary CTA: "Sign In" → /login
- Trust badges row: Canada Only · Bank-Level Security · 7-Day Free Trial

### Stats/Social Proof Bar
- "13 Provinces & Territories" · "Compliance Detection Modules" · "SHA-256 Secured Evidence"

### Features Grid (3×2)
1. **Upload & Auto-Scan** — Upload your credit report and our system reads it instantly
2. **Find Violations** — Automatic compliance checks across multiple detection categories
3. **Generate Dispute Letters** — Province-specific letters created for you
4. **Tamper-Proof Evidence** — SHA-256 hash-chained proof trail
5. **Track Deadlines** — Never miss a response deadline
6. **Identity Theft Protection** — Freeze management and fraud alerts

### How It Works (4 steps)
1. Upload your credit report (PDF)
2. We scan for compliance problems
3. Generate your dispute letters
4. Mail them and track responses

### Pricing
- **Trial User** - 7 days, all features
- **Monthly** — $19.95 CAD/month
- **Annual** — $49.95 CAD/year

### Final CTA
- "Ready to take control?" + sign-up button

### Footer
- Links: Login, Register, Terms
- "Built for Canadians. Your data stays in Canada."

## Generated Images
Generate 1 hero illustration for the landing page — a clean, modern illustration of a person reviewing a credit report on a laptop with a checkmark shield, in a professional blue/purple palette matching the app's design.

## Files to Modify

1. **pages/_index.tsx** — Rewrite to check auth state. If unauthenticated → render LandingPage. If authenticated → render existing dashboard wrapped in AppLayout.
2. **pages/_index.pageLayout.tsx** — Change from `[UserRoute, AppLayout]` to `export default []`
3. **pages/_index.module.css** — Keep existing dashboard styles, no changes needed (dashboard content stays the same)

## Files to Create

| File | Purpose |
|---|---|
| `components/LandingPage.tsx` | Full landing page component with all sections (Hero, Features, How It Works, Pricing, CTA, Footer) |
| `components/LandingPage.module.css` | Styles for the landing page — modern, clean, conversion-optimized |

## Approach

### Step 0: Generate hero image
Generate a hero illustration for the landing page.

### Step 1: Create LandingPage component
Build the full `components/LandingPage` component with all sections described above. Modern design, smooth animations, responsive. Uses existing Button component for CTAs. Links to /register and /login. All text at Grade 8 reading level.

### Step 2: Modify _index
- Change `_index.pageLayout.tsx` to `export default []`
- Rewrite `_index.tsx` to conditionally render LandingPage (unauthenticated) or AppLayout+Dashboard (authenticated)
- Move existing dashboard code into a local `Dashboard` component inside `_index.tsx` to keep it clean

## Risks & Considerations

- **Backward compatibility**: The dashboard behavior is unchanged for authenticated users. Only the unauthenticated path changes (from redirect-to-login to show-landing-page).
- **Mobile app**: The native mobile app will show the landing page to logged-out users instead of a login redirect. Since the landing page has prominent sign-in/sign-up buttons, this is actually a better experience.
- **SEO**: The landing page at `/` will be visible to search engines (no auth wall).
- **Performance**: Single component, no heavy dependencies. CSS animations only. Images loaded lazily.
- **No breaking changes to any endpoints or other pages**.
