---
created: 2026-04-21T04:54:16.272Z
updated: 2026-04-21T04:56:03.447Z
---

# Comprehensive System Optimization — Master TODO List

## Summary
A prioritized, categorized master plan to bring Credit Regulator Pro to peak performance across all dimensions: data integrity, pipeline accuracy, user experience, revenue optimization, operational reliability, and code quality. 

---

## 🔴 P0 — Critical / Data Integrity (fix immediately)

- [ ] **1. Clean Up 12 Unsent Obligation Instances Showing as "Used"** [Effort: S] [Plan: Yes]
  Delete stale pending records and ensure all UI paths filter by `challenge_sent_date IS NOT NULL`.
- [ ] **2. Wire Compliance Config to Scanner** [Effort: S] [Plan: Yes]
  Add post-filter in `complianceScanner` that respects enabled/disabled and confidence thresholds from DB config.
- [ ] **3. Fix Extraction → Mapping → Compliance Pipeline** [Effort: L] [Plan: Yes]
  Redesign matching to creditorId-only, fix entity type checks, refine compliance detectors, and map ECOA codes during ingestion.
- [ ] **4. Stop Failed Reports from Polluting the Database** [Effort: M] [Plan: Yes]
  Add rollback/cleanup logic in ingest catch blocks and schedule a daily orphan cleanup cron job.

---

## 🟠 P1 — High Priority / User Experience

- [ ] **5. Complete Jargon Cleanup (Plain Language Pass)** [Effort: M] [Plan: Yes]
  Systematic string replacement across ~12 components to remove technical terms (e.g., "Tradeline", "Obligation Instance").
- [ ] **6. Fix the Step 4 "Mail Your Letters" Journey Gap** [Effort: S] [Plan: No]
  Add a "Mark Ready to Mail" button for Draft packets so regular users can advance past Step 4.
- [ ] **7. Fix Dashboard Stats Accuracy** [Effort: S] [Plan: No]
  Update `dashboard/stats_GET` to separate "created" from "sent" letters, and use actual compliance violation counts for problems found.
- [ ] **8. Add Evidence Page to Regular User Sidebar** [Effort: S] [Plan: No]
  Add `/evidence` to the regular user nav in `AppLayout.tsx` so users can navigate back to it.
- [ ] **9. Simplify the Tradeline Detail Page** [Effort: M] [Plan: Yes]
  Use creditor name as page title, rename tabs to plain language, hide empty account number displays, and show ECOA info instead.
- [ ] **10. Cleanup Anonymous Upload Preview** [Effort: M] [Plan: Yes]
  Replace confusing blurred-section pattern with clean card layout and plain-language problem descriptions.
- [ ] **11. Delivery Wizard Improvements** [Effort: M] [Plan: Yes]
  Add mobile PDF zoom controls, show full bureau mailing address, and rename internal `xapp` references to `crp`.

---

## 🟡 P2 — Medium Priority / Revenue & Operational

- [ ] **12. Subscription Confirmation & Renewal Reminder Emails** [Effort: M] [Plan: Yes]
  Send confirmation email post-payment and add a 3-day-ahead renewal reminder cron job via SendGrid.
- [ ] **13. AI Support Chat (L1/L2 Escalation)** [Effort: S] [Plan: Yes]
  Smoke test to verify ticket creation and Gemini streaming work correctly.
- [ ] **14. Consolidate Extraction Pipeline** [Effort: L] [Plan: Yes]
  Replace redundant triple-mapping with a single `unifiedExtract()` function to save processing time.
- [ ] **15. Add Bureau Contact Email Addresses** [Effort: S] [Plan: No]
  Add official dispute contact emails to the bureau table (e.g., TransUnion Canada) and document portal-only flows gracefully.
- [ ] **16. Semantic Accuracy Diagnostic (Admin Tool)** [Effort: S] [Plan: Yes]
  Run the newly built diagnostic to verify count consistency, data isolation, and orphan detection.
- [ ] **17. Cryptocurrency Payment Integration** [Effort: XL] [Plan: Yes]
  Create NOWPayments integration to broaden payment options (BTC/LTC/XMR/USDT) alongside Stripe.

---

## 🟢 P3 — Nice to Have / Polish

- [ ] **18. Clean Up Unused Code** [Effort: S] [Plan: No]
  Delete unused helpers (e.g., `openaiReportParser`) and verify admin endpoints before removal.
- [ ] **19. Full User Experience Rewrite** [Effort: XL] [Plan: Yes]
  Reduce tabs on "My Accounts", humanize artifact displays, simplify packets page, and embed change detection.
- [ ] **20. Simplify Tradelines Page** [Effort: S] [Plan: Yes]
  Remove confusing "Add an Account" button, complex filter tabs, and export options to streamline for users.
- [ ] **21. World-Class Homepage Polish** [Effort: S] [Plan: Yes]
  Verify pricing section matches current plans and ensure all CTAs work correctly.
- [ ] **22. PostGrid Webhook Reliability** [Effort: S] [Plan: No]
  Verify PostGrid configuration sends signatures to production domain to fix 401 errors.
- [ ] **23. Duplicate `mapViolationToObligationType` Consolidation** [Effort: S] [Plan: No]
  Extract duplicate mapping functions into a shared helper and consolidate to the more complete version.
- [ ] **24. Guided User Journey — Next-Step Banners** [Effort: S] [Plan: Yes]
  Add contextual "what to do next" banners to key pages (e.g., Upload results → "Write a Letter").

---

## Implementation Priority Order

### Sprint 1 (Critical Fixes)
- [ ] 1. Clean up 12 unsent obligation instances (P0, #1)
- [ ] 2. Wire compliance config to scanner (P0, #2)
- [ ] 3. Fix Step 4 journey gap (P1, #6)
- [ ] 4. Fix dashboard stats accuracy (P1, #7)
- [ ] 5. Add evidence to user sidebar (P1, #8)
- [ ] 6. Add bureau contact emails (P2, #15)

### Sprint 2 (Pipeline Integrity)
- [ ] 7. Fix extraction/mapping/compliance pipeline (P0, #3)
- [ ] 8. Stop failed reports from polluting DB (P0, #4)
- [ ] 9. Consolidate extraction pipeline (P2, #14)
- [ ] 10. Consolidate duplicate mapViolationToObligationType (P3, #23)

### Sprint 3 (UX Polish)
- [ ] 11. Complete jargon cleanup (P1, #5)
- [ ] 12. Simplify tradeline detail page (P1, #9)
- [ ] 13. Simplify tradelines page (P3, #20)
- [ ] 14. Cleanup anonymous upload preview (P1, #10)
- [ ] 15. Next-step banners on key pages (P3, #24)

### Sprint 4 (Revenue & Operations)
- [ ] 16. Delivery wizard improvements (P1, #11)
- [ ] 17. Subscription emails (P2, #12)
- [ ] 18. Verify AI support chat (P2, #13)
- [ ] 19. Verify semantic diagnostic (P2, #16)
- [ ] 20. Clean up unused code (P3, #18)

### Sprint 5 (Big Features)
- [ ] 21. Cryptocurrency payments (P2, #17)
- [ ] 22. Full UX rewrite (P3, #19)