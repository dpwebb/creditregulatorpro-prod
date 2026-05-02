---
created: 2026-04-15T18:19:33.336Z
updated: 2026-04-15T18:19:33.336Z
---

## Summary
Two-part KB alignment update:
1. **Fix 6 issues in the existing USER Knowledge Base** — outdated beta/production wording, missing Support role, FCRA reference, inconsistent module count, and missing support ticket docs.
2. **Create a new Admin Knowledge Base** — a dedicated admin-only KB page documenting all admin features (Compliance Config, User Management, Version Management, Parser Testing, Activity Logs, Support Queue, Data Retention, Postal Pricing).

## Files to Modify

### Part 1: User KB Fixes

1. **components/KBAccountBilling.tsx**
   - **Subscriptions section:** Remove "Trial User accounts cannot upgrade until the application officially enters production mode." Replace with text reflecting production mode is active - Trial User accounts CAN upgrade now.
   - **Trial User Access section:** Remove "You will remain on this plan until the app enters full production." Replace with "You're on the Trial User plan. Upgrade anytime to keep using all features." Rename the old access section to "Trial User & Trials".
   - **Roles section:** Add "Support" as a third role alongside User and Admin. Describe it briefly (CS agent — manages tickets, replies, bypasses subscription checks).
   - **New section:** Add a "Support Tickets" KnowledgeBaseSection explaining that users can submit support tickets via /support-tickets, track status, and reply.

2. **components/KBSecurity.tsx**
   - **RBAC section:** Change "two primary roles" to "three roles." Add a SUPPORT role card alongside USER and ADMIN, with permissions: ticket queue, reply, assign, bypass subscription checks. Cannot access admin settings or user management.

3. **components/KBIdentityTheft.tsx**
   - **Document Management section:** Replace "FCRA/provincial identity theft dispute packets" with "PIPEDA and provincial Consumer Reporting Act identity theft dispute packets."

4. **components/KBGettingStarted.tsx**
   - **35-Module Compliance Scanner section:** The "Complete Module List" accordion only lists 16 items. Either: (a) expand to list all 35, or (b) change heading to "Key Detection Categories" and remove the specific count "35" from this section since KBCompliance already has the full list. **Approach (b)** — simplify the Getting Started list to show categories, not individual modules, and direct users to the "Rule Checks" tab for the full list. This avoids duplication.

### Part 2: Admin Knowledge Base

5. **components/KBAdminOverview.tsx** (NEW) — Admin getting started, sidebar navigation overview, role responsibilities.

6. **components/KBAdminUsers.tsx** (NEW) — User Management: viewing users, filtering, resetting user data, creating support agents.

7. **components/KBAdminCompliance.tsx** (NEW) — Compliance Configuration: detection thresholds, alert messaging, app settings (production mode toggle).

8. **components/KBAdminVersions.tsx** (NEW) — Version Management: versions, migrations, feature flags.

9. **components/KBAdminParserTesting.tsx** (NEW) — Parser Testing: test cases, running tests, import/export, known entity management.

10. **components/KBAdminOperations.tsx** (NEW) — Operational admin: Activity Logs, Data Retention, Postal Pricing & Revenue, Regulatory Update review, Support Ticket queue (admin perspective).

11. **pages/admin-knowledge-base.tsx** (NEW) — Admin-only KB page behind AdminRoute, with tabs for each admin KB section. Same layout style as user-manual page.

## Files to Create

| File | Purpose |
|---|---|
| `components/KBAdminOverview.tsx` | Admin getting started & navigation guide |
| `components/KBAdminUsers.tsx` | User management & support agent creation docs |
| `components/KBAdminCompliance.tsx` | Compliance config, thresholds, messaging docs |
| `components/KBAdminVersions.tsx` | Version management, migrations, feature flags docs |
| `components/KBAdminParserTesting.tsx` | Parser testing environment docs |
| `components/KBAdminOperations.tsx` | Activity logs, data retention, postal pricing, regulatory updates, support queue docs |
| `pages/admin-knowledge-base.tsx` | Admin KB page (AdminRoute + AppLayout) with tabbed navigation |

## Approach

### Step 1: Fix User KB (4 component updates)
Update KBAccountBilling, KBSecurity, KBIdentityTheft, and KBGettingStarted in a single updateItems call.

### Step 2: Create Admin KB components (6 new components)
Create all 6 KBAdmin* components in a single createItems call. Each follows the same pattern as existing KB components — uses KnowledgeBaseSection, Accordion, Badge, Button, Link. Content is written at Grade 8 reading level per system prompt.

### Step 3: Create Admin KB page
Create pages/admin-knowledge-base with AdminRoute layout, tabbed navigation matching the user-manual pattern.

### Step 4: Add Admin KB to sidebar
Update AppSidebarNavigation to include a link to /admin-knowledge-base in the admin section of the sidebar.

## Risks & Considerations

- **Backward compatibility:** No endpoints or APIs are changed. Only frontend KB content. Fully safe for mobile app.
- **Language level:** All new content must use plain language (Grade 8 level) per system prompt. Avoid jargon.
- **No duplication:** Admin KB should reference the User KB for shared concepts (e.g., "See the User Guide > Rule Checks tab for full module details") rather than duplicating content.
- **Page layout:** Admin KB page should use AdminRoute, not UserRoute, so only admins can access it.
- **Sidebar:** Need to verify how AppSidebarNavigation structures admin links to add the new page correctly.
