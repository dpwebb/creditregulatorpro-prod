---
created: 2026-04-17T15:03:35.551Z
updated: 2026-04-17T15:03:35.551Z
---

# Highlight "Try It Free" as a Key Conversion Entry Point

## Summary
The anonymous upload feature (try-upload) is the app's strongest conversion tool — it lets visitors see real problems in their credit report without signing up. Currently it's buried as a small muted text link at the bottom of the hero. This plan promotes it to a first-class CTA throughout the landing page.

## Changes

### 1. Hero Section — Dual CTA Buttons (LandingHero)
**Current:** "Start Free Trial" button + tiny "or try it free without signing up" text link below it.
**New:** Two side-by-side buttons of equal visual weight:
- **Primary:** "Start Free Trial" (filled)
- **Secondary/outline:** "Try It Free — No Sign-Up" (outline, links to /try-upload)

Remove the small text link and the "Don't have your credit report?" guide link (move that into the try-upload page itself, where it already exists as a tab). Keep the "No charge for 7 days" subtext below both buttons.

### 2. New "How It Works" Section (new component: LandingHowItWorks)
Insert a new section **between LandingProblemAwareness and LandingFeatures** that shows a simple 3-step visual flow:
1. **Upload** — "Upload your credit report PDF" (Upload icon)
2. **Scan** — "We scan it for errors and violations" (Search icon)
3. **See Results** — "See what we found, instantly" (ShieldCheck icon)

Below the steps: a prominent CTA button "Try It Now — Free" linking to /try-upload, with reassurance text: "No sign-up needed. Your data is never stored."

This section uses a surface background to alternate with the surrounding sections. Each step is a numbered card with an icon, short title, and one-line description. Staggered scroll-reveal animation consistent with other landing sections.

### 3. Problem Awareness CTA Update (LandingProblemAwareness)
**Current:** Single "Start Free Trial" button.
**New:** Add a secondary link below the button: "Or upload your report and see for yourself →" linking to /try-upload. This reinforces the try-upload path after the section makes the visitor worried about hidden problems.

### 4. Value Preview CTA Update (LandingValuePreview)
**Current:** "See What We Find" section with a single "Start Free Trial" button.
**New:** Replace the CTA button with "Upload Your Report Free" linking to /try-upload — this section already talks about "see what we find before you pay," so linking directly to the free upload is a more natural action. Add a smaller "or start your free trial" text link below it linking to /register.

## Files to Create
- `components/LandingHowItWorks.tsx` + `.module.css` — New 3-step "How It Works" section

## Files to Modify
- `components/LandingPage.tsx` — Insert LandingHowItWorks between ProblemAwareness and Features
- `components/LandingHero.tsx` + `.module.css` — Dual CTA buttons, remove buried text links
- `components/LandingProblemAwareness.tsx` + `.module.css` — Add secondary try-upload link
- `components/LandingValuePreview.tsx` + `.module.css` — Swap CTA to try-upload, add register fallback

## Approach
1. Create `LandingHowItWorks` component with 3-step numbered cards, CTA, and scroll-reveal
2. Update `LandingHero` to use dual side-by-side CTAs
3. Update `LandingProblemAwareness` to add secondary try-upload link
4. Update `LandingValuePreview` to swap primary CTA to try-upload
5. Update `LandingPage` to insert the new section in the flow

## Risks & Considerations
- All changes are frontend-only, no backend or DB impact
- The try-upload page already handles the guide tab internally, so removing the guide link from the hero is safe
- The dual CTA in the hero must remain responsive — stack vertically on mobile
- Keep all text at Grade 8 reading level per project guidelines
