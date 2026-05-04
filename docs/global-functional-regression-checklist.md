# CreditRegulatorPro Global Functional Regression Checklist

Use this document after a full round of edits to validate core behavior across user, support, and admin sections.

## 1) Test Scope

- Primary validation URL: `https://staging.creditregulatorpro.com`
- Local fallback URL (dev-only): `http://localhost:5175`
- Local backend/API URL (dev-only): `http://localhost:3333` (do not use as browser app URL)
- Roles covered: `user`, `support`, `admin`
- Primary goal: confirm major workflows still work and role boundaries are still correct in staging before production promotion

## 2) Required Test Data

Use these fixtures for ingestion-related tests:

- `C:\Users\webbd\Projects\creditregulatorpro-staging\.local\fixtures\credit-reports\transunion-david-webb-consumer-disclosure.pdf`
- `C:\Users\webbd\Projects\creditregulatorpro-staging\.local\fixtures\credit-reports\equifax-creditreport-20260416.pdf`

Suggested accounts:

- 1 admin account
- 1 support account
- 1 normal user account with active subscription/trial

## 3) Pre-Flight Checks

1. Start app and verify login page loads: `/login`
2. Run `pnpm run typecheck`
3. Run `pnpm run build`
4. Run `pnpm run check:staging-gate`
5. Confirm no fatal server/client console errors during first page load

## 4) Global Smoke (All Roles)

1. Login with each role (`admin`, `support`, `user`)
2. Confirm sidebar menu shows correct role-specific items only
3. Open profile/logout controls and verify logout returns to `/login`
4. Attempt direct URL access to an unauthorized admin route as non-admin:
   - `/admin-user-management`
   - Expected: blocked/redirected (no admin content exposed)

### Platform Scope Hard-Coding

1. Login as any authenticated role
2. Confirm top scope banner is visible and reads: `Platform scope: Canadian Credit Bureau Compliance only.`
3. Open one upload results page: `/upload-results/:artifactId`
4. Inspect the `/_api/upload-results/get?artifactId=...` response metadata
5. Expected:
   - `metadata.region` is always `"CA"`
   - `metadata.platformScope` is `"Canadian Credit Bureau Compliance"`
6. Open AI support chat and ask a scope question (example: "Do you cover U.S. credit bureau compliance?")
7. Expected:
   - Response remains Canada-only in framing (does not present non-Canadian scope as supported platform scope)

## 5) User Workflow Regression

### A) Upload + Ingestion

1. Login as normal user
2. Go to `/upload`
3. Upload TransUnion fixture PDF
4. Upload Equifax fixture PDF
5. Confirm each upload produces a review/results flow:
   - `/upload-review/:artifactId`
   - `/upload-results/:artifactId`
6. Expected:
   - No crash
   - Parsed tradeline/report content present
   - Report appears under `/report-artifacts`

### B) Account + Compliance Surfaces

1. Open `/my-accounts` and `/tradelines-tab`
2. Open one account detail page `/tradelines/:id`
3. Open `/compliance-audit`, `/compliance-calendar`, `/deadline-calendar`
4. Expected:
   - Data loads without blank/error state loops
   - Filters/sorting/pagination (if present) work
   - No duplicate rows unexpectedly introduced after refresh

### C) Dispute/Evidence/Packet Flow

1. Open `/packets` and generate or view packet(s)
2. Open `/evidence` and add/view evidence entries where available
3. Open `/evidence-events` and `/evidence-management`
4. Expected:
   - Packet/evidence data consistency across pages
   - Status labels and counts update after refresh

## 6) Support Workflow Regression

1. Login as support account
2. Open `/support-tickets`
3. Validate list controls:
   - Search by subject and by description keyword
   - Assignment filter (`All`, `Mine`, `Unassigned`, `Assigned`)
   - Presets (`Unassigned`, `High Priority`, `Waiting on User`, `Overdue`, `Clear`)
4. Confirm list output behavior:
   - Aging badge renders (`Active`/`Stale`)
   - Latest message preview appears and is redacted for sensitive values (`token`, long secret-like strings, long digit sequences)
5. Open one ticket detail: `/support-tickets/:ticketId`
6. Update priority and assignment
7. Try status update to `RESOLVED` or `CLOSED` without resolution note
   - Expected: blocked with validation error
8. Add resolution note (5+ chars) and set `RESOLVED` or `CLOSED`
   - Expected: status updates and internal resolution note is added in thread
9. Try invalid transition (example: `CLOSED` -> `RESOLVED`)
   - Expected: blocked by status transition rule
10. Reply to ticket (normal and internal note)
11. Expected:
   - Queue loads and updates
   - Reply appears in thread
   - Access remains limited to support/admin boundaries
   - Resolution-note requirement and transition enforcement are active

## 7) Admin Workflow Regression

### A) User Management (Critical)

1. Open `/admin-user-management`
2. Verify:
   - Search by email/name works
   - Role filter works
   - Pagination Previous/Next works
3. Open a user detail: `/admin-user-management/:userId`
4. Reset user data for a non-admin user
5. Delete a non-admin user with confirm email
6. Expected:
   - Actions succeed only when confirmation is valid
   - Admin self-delete/self-reset is blocked
   - List and detail views refresh accurately after mutation

### B) Version Management

1. Open `/admin-version-management`
2. Create a new version entry
3. Generate or refresh release notes/changelog
4. Expected:
   - New version persists
   - Notes/changelog include real changes since previous version
   - No empty "no changes" state when changes exist

### C) Letter Templates

1. Open `/admin-letter-templates`
2. Expand an existing template row and edit one or more sections
3. Click `Save Draft`
4. Reload page and confirm template remains `Draft` with edits persisted
5. Add an invalid placeholder syntax (example: `{{accountNumber`) and attempt publish
6. Expected:
   - Publish is blocked with validation error
7. Fix placeholder syntax and ensure no unresolved/unknown placeholders remain
8. Click `Publish Template`
9. Reload page and confirm template status is `Published`
10. In editor, review `Revision History`:
    - Confirm latest revision entry appears with timestamp, user, and changed fields
11. Trigger rollback from a previous history entry
12. Reload and confirm prior content is restored
13. Use archive flow on one template and confirm it becomes inactive/draft (not hard-deleted)
14. Expected:
   - Draft/Publish behavior is enforced
   - Validation and preview checks gate publish
   - Revision history and rollback are functional
   - Archive action preserves template record lifecycle
   - Template renders correctly in downstream packet flows

### D) Parser Tools

1. Open `/admin-parser-testing`
2. Run parser tests on both fixtures (TU + EQ)
3. Open `/admin-parser-mappings` and inspect mapping history/diff behavior
4. Expected:
   - Parser runs complete without fatal errors
   - Mappings/history load cleanly

### E) Admin Controls + Logs

1. Open:
   - `/admin-compliance-config`
   - `/admin-activity-logs`
   - `/admin-error-logs`
   - `/admin-security`
2. In `/admin-activity-logs`, verify:
   - Status filter works (`All`, `Success`, `Failure`)
   - Preset buttons work (`Last 24h`, `Errors Only`, `Clear`)
   - Expanded row shows local timestamp in header and UTC timestamp in details
3. In `/admin-error-logs`, verify:
   - Default date window starts at last 24h
   - Failure-only filtering works with action/entity/date filters
   - Severity filter works (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`)
   - Severity summary badges render and update with filters
   - `Hide Duplicates` toggle collapses repeated fingerprints on current page
4. Expand one error row and verify metadata fields render:
   - `Fingerprint`
   - `Request ID`
   - `Route`
   - `IP`
   - `User Agent`
5. Perform one admin mutation (e.g., create support agent or reset user) and confirm audit visibility
6. Confirm sensitive keys are redacted in log details if present (e.g., `password`, `token`, `apiKey` => `[REDACTED]`)
7. Expected:
   - Config saves work
   - Activity logs show recent admin actions
   - Error logs remain clean of new regressions
   - Redaction is applied to sensitive detail fields
   - Error severity/fingerprint metadata appears consistently on failures

### F) Laws Registry (Localhost Reliability)

1. Open a fresh tab to `http://localhost:5175/statutes` and hard refresh (`Ctrl+F5`)
2. Confirm page resolves from a cold load (not only via in-app navigation)
3. Confirm top stats cards render (Total/Active/Amended/Repealed/Jurisdictions) with no runtime crash
4. Confirm no `Cannot read properties of undefined (reading 'map')` error in browser console
5. Confirm no `Cannot read properties of undefined (reading 'replace')` error after export actions
6. Validate filter option resiliency:
   - Jurisdictions dropdown opens even when API returns empty/missing array
   - Codes dropdown opens even when API returns empty/missing array
   - Topics dropdown opens even when API returns empty/missing array
   - Status dropdown still shows fallback values (`ACTIVE`, `AMENDED`, `REPEALED`) when options payload is partial
7. Click `Export CSV`
8. Click `Export PDF`
9. Expected:
   - Both export actions complete without blanking the page or throwing runtime exceptions
10. Click `View change history` on a law row
11. Expected:
   - History modal opens
   - Modal shows entries or a clean empty-state message
   - No route/API 404 for `/_api/statute/history`
12. Force an error scenario (unauthenticated or expired session) and retry `/statutes`
13. Expected:
   - UI displays concrete error text instead of hanging or unresolved state
   - No JSON parse crash when backend returns non-JSON error bodies

### G) Metro 2 Compliance Guide

1. Open `/metro2-compliance` as admin
2. In `Validation Rules`, verify tab loads with:
   - Search box
   - Category filter
   - Severity filter
   - Impact filter
   - Confidence filter
3. Apply each filter independently and in combination
4. Click `Reset` and confirm all filters clear
5. Confirm rule cards include:
   - `Why It Matters`
   - `What To Check`
   - `Field References` (where available)
   - Source links and `Last Reviewed`
6. Click one field reference chip (example: `Base-8`)
7. Expected:
   - Active tab switches to `Field Reference`
   - Table search is populated with selected field ID
   - Matching field row is visibly highlighted
8. Back in `Validation Rules`, click `CSV`
9. Expected:
   - CSV downloads with current filtered rule set
10. Click `PDF Preview`
11. Expected:
   - Preview window opens with rendered rule summary
   - If popups are blocked, user receives actionable error message
12. Open `Quick Check` tab
13. Toggle checklist items and verify progress % updates
14. Click `Reset Checklist` and confirm all items clear
15. Open `CRA Obligations` tab and click `View Related Statutes`
16. Expected:
   - Route navigates to `/statutes` without error
17. Return to `/metro2-compliance` and open `Guide Changelog`
18. Expected:
   - Changelog entries render with date, summary, and details


## 8) Static/Reference Pages (Load Check)

Verify these pages render with no route error:

- `/bureaus`
- `/statutes`
- `/metro2-compliance`
- `/creditor-obligations`
- `/bureau-obligations`
- `/collector-obligations`
- `/enforcement-mechanisms`
- `/regulatory-updates`
- `/user-manual`

## 9) Automated Mock User Lifecycle (Full Suite)

Use this to simulate the full user lifecycle, including dispute exhaustion and user-function coverage matrix output.
Primary gate: run through staging first. Use localhost only for script-level debugging.

1. Confirm staging app/API are reachable at `https://staging.creditregulatorpro.com`
2. For localhost CLI runs (dev fallback only), place test fixtures under project-local paths (example):
   - `.local/fixtures/credit-reports/equifax-creditreport-20260416.pdf`
   - `.local/fixtures/credit-reports/transunion-david-webb-consumer-disclosure.pdf`
3. For staging/prod runs via Admin UI, upload PDFs directly in `/admin-mock-lifecycle` instead of relying on server-local file paths.
4. Run from CLI:

```powershell
pnpm run test:mock-lifecycle -- --initial-report ".local/fixtures/credit-reports/equifax-creditreport-20260416.pdf" --followup-report ".local/fixtures/credit-reports/transunion-david-webb-consumer-disclosure.pdf" --simulate-days 30 --packet-count 2
```

5. Optional strict mode (fail run when any coverage item is `FAILED` or `BLOCKED`):

```powershell
pnpm run test:mock-lifecycle -- --initial-report ".local/fixtures/credit-reports/equifax-creditreport-20260416.pdf" --followup-report ".local/fixtures/credit-reports/transunion-david-webb-consumer-disclosure.pdf" --simulate-days 30 --packet-count 2 --strict
```

6. Admin UI path (recommended for operations/review):
   - Open `/admin-mock-lifecycle` (admin role only)
   - Upload initial/follow-up PDFs (or supply valid server-local paths)
   - Verify run appears in **Recent Runs** with live `QUEUED`/`RUNNING`/`COMPLETED` status updates
   - Open completed run and verify **Coverage Matrix** + **Runner Log** render
   - Confirm non-admin users cannot access `/admin-mock-lifecycle`
7. Wait for completion and record both output files:
   - `.local/test-runs/mock-user-lifecycle-full-suite-*.json`
   - `.local/test-runs/mock-user-lifecycle-full-suite-*.md`
8. Validate the report sections:
   - `coverageSummary`
   - `coverageMatrix`
   - `analysis`
9. Confirm key lifecycle checkpoints exist in `coverageMatrix` as `PASSED` when environment services are available:
   - Auth: register/login/logout/password reset
   - Upload cycle: anonymous preview + initial upload + follow-up upload
   - Dispute flow: packet create/delivery, obligation response, escalation, exhaustion
   - Evidence flow: event create, bureau communication, attachment list/package
   - Support flow: ticket create/list/get/reply
   - Subscription flow attempts and outcomes
   - Change tracking: detect-changes + timeline
10. If `analysis.potentialBureauObligationFailureSignals` is non-empty, open those tradelines in `/upload-results/:artifactId` and `/tradelines/:id` to verify escalation paths.

## 10) Pass/Fail Criteria

Mark release **PASS** only if all are true:

1. No critical workflow failure in Upload -> Accounts -> Packets/Evidence
2. No role/authorization leak (user/support cannot access admin content)
3. Admin user-management mutations behave safely and refresh correctly
4. Version management can produce release notes/changelog for a new version
5. No new blocking errors in logs during test run
6. Activity/error log filters, presets, and timestamp displays are correct
7. Error log severity classification, dedupe toggle, and metadata fields are functioning
8. Letter templates support draft/publish validation, revision history, rollback, and archive lifecycle
9. Metro 2 Compliance Guide filters/exports/field-linking/checklist/changelog work without runtime errors

If any critical item fails, mark **FAIL** and capture:

- route
- exact step
- expected vs actual
- screenshot
- timestamp
- browser console error (if any)
