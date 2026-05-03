# CreditRegulatorPro Global Functional Regression Checklist

Use this document after a full round of edits to validate core behavior across user, support, and admin sections.

## 1) Test Scope

- Frontend URL: `http://localhost:5175`
- Backend/API URL: `http://localhost:3333` (do not use as browser app URL)
- Roles covered: `user`, `support`, `admin`
- Primary goal: confirm major workflows still work and role boundaries are still correct

## 2) Required Test Data

Use these fixtures for ingestion-related tests:

- `C:\Users\webbd\My Drive\COMPND SYSTEMS\Credit Regulator Pro\Credit Report\Transunion\Transunion David Webb Consumer Disclosure.pdf`
- `C:\Users\webbd\My Drive\COMPND SYSTEMS\Credit Regulator Pro\Credit Report\Equifax\Equifax-creditreport_20260416.pdf`

Suggested accounts:

- 1 admin account
- 1 support account
- 1 normal user account with active subscription/trial

## 3) Pre-Flight Checks

1. Start app and verify login page loads: `/login`
2. Run `pnpm run typecheck`
3. Run `pnpm run build`
4. Confirm no fatal server/client console errors during first page load

## 4) Global Smoke (All Roles)

1. Login with each role (`admin`, `support`, `user`)
2. Confirm sidebar menu shows correct role-specific items only
3. Open profile/logout controls and verify logout returns to `/login`
4. Attempt direct URL access to an unauthorized admin route as non-admin:
   - `/admin-user-management`
   - Expected: blocked/redirected (no admin content exposed)

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
2. Create or edit a template
3. Save and reload page
4. Expected:
   - Saved changes persist
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

## 9) Pass/Fail Criteria

Mark release **PASS** only if all are true:

1. No critical workflow failure in Upload -> Accounts -> Packets/Evidence
2. No role/authorization leak (user/support cannot access admin content)
3. Admin user-management mutations behave safely and refresh correctly
4. Version management can produce release notes/changelog for a new version
5. No new blocking errors in logs during test run
6. Activity/error log filters, presets, and timestamp displays are correct
7. Error log severity classification, dedupe toggle, and metadata fields are functioning

If any critical item fails, mark **FAIL** and capture:

- route
- exact step
- expected vs actual
- screenshot
- timestamp
- browser console error (if any)
