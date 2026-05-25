# CreditRegulatorPro Admin User Manual

## Version and Certification Context

- Date of certification: 2026-05-25.
- Staging URL used: https://staging.creditregulatorpro.com.
- Commit/ref tested: `ac2bdb6`.
- Live admin access available: yes. Authentication used supplied admin credentials in Playwright.
- Certification evidence generated at: 2026-05-25T02:24:47.542Z.
- Scope: live click-through certification plus route/source-informed documentation for the requested admin/sidebar pages.
- Safety note: no product code, route, schema, rule, parser mapping, packet logic, legal authority, feature flag, migration, or user-management change was made. Authentication necessarily created/touched normal login/session/audit metadata.

| Page | Route | Certification | Header Seen | Documentation Basis |
|---|---|---|---|---|
| Home | `/` | PASS_WITH_LIMITATIONS | Platform Dashboard | Live-certified with limitation |
| User Management | `/admin-user-management` | PASS_WITH_LIMITATIONS | User Management | Live-certified with limitation |
| Risk Triage | `/admin-risk-triage` | PASS_WITH_LIMITATIONS | Compliance Risk Triage | Live-certified with limitation |
| Rule Check Settings | `/admin-compliance-config` | PASS | Compliance Detection Configuration | Live-certified |
| Activity Logs | `/admin-activity-logs` | PASS_WITH_LIMITATIONS | Activity Logs | Live-certified with limitation |
| Outcome Reviews | `/admin-outcome-reviews` | PASS_WITH_LIMITATIONS | Outcome Reviews | Live-certified with limitation |
| Response Documents | `/admin-response-documents` | PASS_WITH_LIMITATIONS | Response Documents | Live-certified with limitation |
| Error Logs | `/admin-error-logs` | PASS_WITH_LIMITATIONS | System Error Logs | Live-certified with limitation |
| Security & Compliance | `/admin-security` | PASS_WITH_LIMITATIONS | Security & Compliance | Live-certified with limitation |
| Support Tickets | `/support-tickets` | PASS_WITH_LIMITATIONS | All Tickets | Live-certified with limitation |
| Admin Guide | `/admin-knowledge-base` | PASS | Admin Guide | Live-certified |
| Credit Reporting Companies | `/bureaus` | PASS_WITH_LIMITATIONS | Credit Reporting Companies | Live-certified with limitation |
| Laws | `/statutes` | PASS_WITH_LIMITATIONS | Laws Registry | Live-certified with limitation |
| Reporting Format Guide | `/metro2-compliance` | PASS_WITH_LIMITATIONS | Metro 2 Compliance Guide | Live-certified with limitation |
| Rules Creditors Must Follow | `/creditor-obligations` | PASS_WITH_LIMITATIONS | Creditor Obligations | Live-certified with limitation |
| Rules Credit Reporting Companies Must Follow | `/bureau-obligations` | PASS_WITH_LIMITATIONS | Bureau Obligations | Live-certified with limitation |
| Rules Collectors Must Follow | `/collector-obligations` | PASS_WITH_LIMITATIONS | Debt Collection Agency Obligations | Live-certified with limitation |
| Enforcement | `/enforcement-mechanisms` | PASS_WITH_LIMITATIONS | Enforcement Mechanisms | Live-certified with limitation |
| Regulatory Updates | `/regulatory-updates` | PASS_WITH_LIMITATIONS | Regulations & Law Update Engine | Live-certified with limitation |
| Beta Testing Hub | `/admin-beta-testing-hub` | PASS_WITH_LIMITATIONS | Beta Testing Hub | Live-certified with limitation |
| Lifecycle Testing | `/admin-mock-lifecycle` | PASS_WITH_LIMITATIONS | Mock User Lifecycle Testing | Live-certified with limitation |
| Parser Testing | `/admin-parser-testing` | PASS_WITH_LIMITATIONS | Parser Testing Environment | Live-certified with limitation |
| Parser Mappings | `/admin-parser-mappings` | PASS_WITH_LIMITATIONS | Parser Mapping Configuration | Live-certified with limitation |
| AI Assist | `/admin-ai-assist` | PASS_WITH_LIMITATIONS | AI Assist | Live-certified with limitation |
| Version Management | `/admin-version-management` | PASS_WITH_LIMITATIONS | Version Management | Live-certified with limitation |

## Admin Operating Principles

Admin actions can affect users, support records, compliance outputs, reference data, and downstream packet behavior. Work from the owning page, verify the record, and assume changes are auditable. Do not treat every issue as a legal violation. A formal regulatory/statutory violation requires explicit authority mapping, deterministic breach logic, account-bound evidence, confidence above threshold, and no parser/manual-review blocker. Consumer dispute bases are broader and may involve incomplete, inconsistent, unverifiable, ambiguous, or unsupported reporting without being formal legal violations. Parser-uncertain or manual-review findings should not be packet-ready. AI Assist is advisory/preview only unless an approved workflow promotes output. Regulatory updates and legal data changes must be review-gated. Destructive actions require approval and audit-trail awareness.

## Role and Access Overview

Admins can access platform management, legal/reference data, and staging tools. Support users may see support queues and user-assistance workflows but should not manage legal authority, parser mappings, feature flags, or migrations. Regular users should not access protected admin routes. Staging is for validation and controlled test operations; production-like records, legal data, users, and settings should not be altered casually. Protected routes should redirect unauthenticated users to login and render only for appropriate roles.

## Navigation Overview

The sidebar is organized into Platform, Legal & Rules, and Tools. Platform pages cover users, triage, logs, support, responses, security, and admin documentation. Legal & Rules pages cover bureaus, statutes, reporting-format guidance, obligations, enforcement, and regulatory updates. Tools pages cover staging/testing utilities, parser tooling, AI preview, and version management. Use sidebar search for fast navigation; favorites/recent items are personal navigation aids only.

## Page-by-Page Manual

## 1. Home

A. Page name: Home

B. Route: `/`

C. Certification status: **PASS_WITH_LIMITATIONS**. Live-certified with limitations; route rendered operational content, but certification was limited by data dependence, staging-only or guarded behavior, empty-state paths, placeholder wording, or safety restrictions on mutation controls.

D. Page purpose: Admin dashboard for platform stats, quick actions, operational counts, role-specific widgets, and orientation. Counts are directional signals, not legal conclusions.

E. Who should use it: Admins, support leads, and compliance reviewers.

F. When to use it: At the start of a shift, after staging deploys, or when deciding which queue needs attention.

G. What data appears: Dashboard cards, system stats, recent activity, quick links, and risk/support widgets that may be hidden, collapsed, or role/data dependent.

H. Primary controls: Sidebar search, dashboard cards/tables, quick navigation, and assistant/support input if enabled. Live-observed controls: Observed buttons/actions: RECENT; PLATFORM; LEGAL & RULES; TOOLS; Platform Functions; Logout; Take a Tour; More information; Open support chat; Close chat; How do I upload my credit report?; What compliance findings did you find?; How do I send a dispute letter?; I need to talk to a real person. Observed fields/filters: None observed during the live sweep. Observed tabs: No tabs observed. Tables/grids: 2; cards/panels: 8. Safe interactions performed: route load, sidebar navigation, and header/content verification only.

I. Step-by-step usage:
1. Open Home after admin login.
2. Review counts as operational signals only.
3. Use the owning page, such as Risk Triage or Support Tickets, before acting.
4. If the hidden risk widget is absent, verify Risk Triage before assuming no findings.
5. Navigate away and back to confirm the dashboard remains responsive.

J. Safe actions: Reviewing counts and opening non-mutating links.

K. Caution/destructive actions: Counts can be stale, filtered, or role-specific.

L. Do-not-do list: Do not infer formal violations from dashboard counts or assistant output.

M. Empty-state behavior: If no records appear, staging may not have matching data, filters may be narrow, or the page may be role/feature/data dependent. Clear filters and verify the owning queue before drawing conclusions.

N. Error-state behavior: If the page fails, check admin session, route access, failed network requests, Error Logs, and recent deploy status. Escalate with route, time, screenshot, and console/network evidence.

O. Related pages: Risk Triage, Activity Logs, Error Logs, Support Tickets

P. Compliance/legal boundary notes: Home is informational and does not grant formal violation status, create packet content, or validate authority.

Q. Troubleshooting notes: Confirm route, role, filters, staging data availability, and feature gates. Do not patch parser, legal, packet, or settings behavior from this page without an approved task.

R. Evidence from live certification: Header seen: Platform Dashboard. Console/page errors: 2. Failed critical network requests: 0. Screenshot: docs/admin-live-clickthrough-screenshots/01-home.png. Notes: Operational page is data-dependent, staging-only, guarded, or currently in an empty-state path.


## 2. User Management

A. Page name: User Management

B. Route: `/admin-user-management`

C. Certification status: **PASS_WITH_LIMITATIONS**. Live-certified with limitations; route rendered operational content, but certification was limited by data dependence, staging-only or guarded behavior, empty-state paths, placeholder wording, or safety restrictions on mutation controls.

D. Page purpose: Account lookup and support-admin management surface for users, roles, user details, support-agent creation, and reset/delete controls.

E. Who should use it: Admins and approved support-admin staff.

F. When to use it: When locating a user, reviewing role/status, opening detail pages, or preparing approved support-agent onboarding.

G. What data appears: User cards/list rows, role/status metadata, search results, support-agent dialog fields, reset/delete controls when present.

H. Primary controls: Name/email search, user detail links, Add Support Agent dialog, and destructive confirmations where present. Live-observed controls: Observed buttons/actions: RECENT; PLATFORM; LEGAL & RULES; TOOLS; Platform Functions; Logout; Take a Tour; Go back; Add Support Agent; All Roles; Actions; Previous; Next; Open support chat. Observed fields/filters: Search by name or email.... Observed tabs: No tabs observed. Tables/grids: 0; cards/panels: 101. Safe interactions performed: opened create/add dialog: Add Support Agent; dialog visible.

I. Step-by-step usage:
1. Search by email or display name first.
2. Open details before acting.
3. Open Add Support Agent only to inspect fields unless approved to create.
4. Treat reset/delete/role controls as destructive.
5. Use Activity Logs to verify account action history.

J. Safe actions: Searching, viewing details, opening and closing Add Support Agent without submitting.

K. Caution/destructive actions: Creating agents, resetting users, changing roles, or deleting/restoring accounts affects real access and audit trails.

L. Do-not-do list: Do not create agents, reset users, change roles, or delete accounts during certification.

M. Empty-state behavior: If no records appear, staging may not have matching data, filters may be narrow, or the page may be role/feature/data dependent. Clear filters and verify the owning queue before drawing conclusions.

N. Error-state behavior: If the page fails, check admin session, route access, failed network requests, Error Logs, and recent deploy status. Escalate with route, time, screenshot, and console/network evidence.

O. Related pages: Activity Logs, Security & Compliance, Support Tickets

P. Compliance/legal boundary notes: This page controls access; it must not alter compliance findings, parser output, packet truth, or legal authority.

Q. Troubleshooting notes: Confirm route, role, filters, staging data availability, and feature gates. Do not patch parser, legal, packet, or settings behavior from this page without an approved task.

R. Evidence from live certification: Header seen: User Management. Console/page errors: 0. Failed critical network requests: 0. Screenshot: docs/admin-live-clickthrough-screenshots/02-user-management.png. Notes: Operational page is data-dependent, staging-only, guarded, or currently in an empty-state path.


## 3. Risk Triage

A. Page name: Risk Triage

B. Route: `/admin-risk-triage`

C. Certification status: **PASS_WITH_LIMITATIONS**. Live-certified with limitations; route rendered operational content, but certification was limited by data dependence, staging-only or guarded behavior, empty-state paths, placeholder wording, or safety restrictions on mutation controls.

D. Page purpose: Review queue for possible findings, false positives, account/user links, AI Preview, Fix Source paths, and parser correction handoff.

E. Who should use it: Compliance reviewers, senior support, and developer-admins.

F. When to use it: When a finding needs review, a false positive is suspected, parser ambiguity appears, or a user asks about scanner output.

G. What data appears: Finding rows, user/account/bureau references, categories, confidence/severity, review status, AI preview and Fix Source controls when records exist.

H. Primary controls: Finding search, refresh, table/list, review actions, AI Preview, Fix Source, and parser correction links. Live-observed controls: Observed buttons/actions: RECENT; PLATFORM; LEGAL & RULES; TOOLS; Platform Functions; Logout; Take a Tour; Go back; Refresh; Open support chat; Close chat; How do I upload my credit report?; What compliance findings did you find?; How do I send a dispute letter?. Observed fields/filters: Search finding ID, user, creditor, bureau, account, or category. Observed tabs: No tabs observed. Tables/grids: 1; cards/panels: 0. Safe interactions performed: clicked safe button: /^refresh$/i.

I. Step-by-step usage:
1. Locate the finding by user, creditor, bureau, account, or category.
2. Confirm linked evidence before interpreting it.
3. Separate finding, dispute basis, and formal violation.
4. Use AI Preview only as advisory.
5. Route extraction defects to parser correction rather than changing legal classification.

J. Safe actions: Search, refresh, detail review, and non-mutating routing inspection.

K. Caution/destructive actions: False-positive marking, source fixes, and correction promotion can affect downstream packets and analytics.

L. Do-not-do list: Do not label broad completeness issues as formal violations without authority and eligibility.

M. Empty-state behavior: If no records appear, staging may not have matching data, filters may be narrow, or the page may be role/feature/data dependent. Clear filters and verify the owning queue before drawing conclusions.

N. Error-state behavior: If the page fails, check admin session, route access, failed network requests, Error Logs, and recent deploy status. Escalate with route, time, screenshot, and console/network evidence.

O. Related pages: Parser Testing, Parser Mappings, Rule Check Settings, Response Documents

P. Compliance/legal boundary notes: Raw findings are not legal truth; formal violation status requires the adjudication and authority gate.

Q. Troubleshooting notes: Confirm route, role, filters, staging data availability, and feature gates. Do not patch parser, legal, packet, or settings behavior from this page without an approved task.

R. Evidence from live certification: Header seen: Compliance Risk Triage. Console/page errors: 0. Failed critical network requests: 0. Screenshot: docs/admin-live-clickthrough-screenshots/03-risk-triage.png. Notes: Operational page is data-dependent, staging-only, guarded, or currently in an empty-state path.


## 4. Rule Check Settings

A. Page name: Rule Check Settings

B. Route: `/admin-compliance-config`

C. Certification status: **PASS**. Live-certified from staging UI.

D. Page purpose: Configuration page for thresholds, enabled checks, alert messaging/templates, postal pricing, production mode, and app settings.

E. Who should use it: Admin leads and compliance configuration owners.

F. When to use it: After reviewed policy changes, when checking why a detector fired, or before promotion.

G. What data appears: Detection thresholds, rule enablement, explanation/action templates, alert settings, postal pricing, and app settings.

H. Primary controls: Tabs for Detection Thresholds, Alert Messaging, Postal Pricing, App Settings; settings fields and save controls. Live-observed controls: Observed buttons/actions: RECENT; PLATFORM; LEGAL & RULES; TOOLS; Platform Functions; Logout; Take a Tour; Go back; Reset; Save All Changes; Detection Thresholds; Alert Messaging; Postal Pricing; App Settings. Observed fields/filters: None observed during the live sweep. Observed tabs: Detection Thresholds; Alert Messaging; Postal Pricing; App Settings. Tables/grids: 0; cards/panels: 200. Safe interactions performed: clicked tab: Detection Thresholds; clicked tab: Alert Messaging; clicked tab: Postal Pricing; clicked tab: App Settings.

I. Step-by-step usage:
1. Open the relevant tab.
2. Review current values before editing.
3. Confirm every change has policy basis and tests.
4. Remember thresholds do not create law.
5. Leave without saving during audits.

J. Safe actions: Viewing settings and switching tabs.

K. Caution/destructive actions: Saving thresholds, toggles, templates, production mode, or pricing can affect users and packet behavior.

L. Do-not-do list: Do not invent legal violations through thresholds or templates.

M. Empty-state behavior: If no records appear, staging may not have matching data, filters may be narrow, or the page may be role/feature/data dependent. Clear filters and verify the owning queue before drawing conclusions.

N. Error-state behavior: If the page fails, check admin session, route access, failed network requests, Error Logs, and recent deploy status. Escalate with route, time, screenshot, and console/network evidence.

O. Related pages: Risk Triage, Regulatory Updates, Parser Testing

P. Compliance/legal boundary notes: This page configures detection and messaging but does not itself provide legal authority.

Q. Troubleshooting notes: Confirm route, role, filters, staging data availability, and feature gates. Do not patch parser, legal, packet, or settings behavior from this page without an approved task.

R. Evidence from live certification: Header seen: Compliance Detection Configuration. Console/page errors: 0. Failed critical network requests: 0. Notes: Terminology flags observed: violation.


## 5. Activity Logs

A. Page name: Activity Logs

B. Route: `/admin-activity-logs`

C. Certification status: **PASS_WITH_LIMITATIONS**. Live-certified with limitations; route rendered operational content, but certification was limited by data dependence, staging-only or guarded behavior, empty-state paths, placeholder wording, or safety restrictions on mutation controls.

D. Page purpose: Audit trail for user/admin/system actions, status, actor, entity context, and investigation evidence.

E. Who should use it: Admins, security reviewers, and support leads.

F. When to use it: For incident investigation, verifying who did what, and tracing sensitive admin actions.

G. What data appears: Audit events, timestamps, actor email/user, action/entity/status, and expanded detail rows/cards.

H. Primary controls: Email search, date/status/entity filters, expansion controls, and pagination/refresh where present. Live-observed controls: Observed buttons/actions: RECENT; PLATFORM; LEGAL & RULES; TOOLS; Platform Functions; Logout; Take a Tour; Go back; All Actions; All Statuses; Last 24h; Errors Only; Clear; 24 May 2026, 23:21:26 GMT-3 webbd3500@gmail.com Admin LOGIN Success 47.54.9.10. Observed fields/filters: Search by email...; input. Observed tabs: No tabs observed. Tables/grids: 0; cards/panels: 301. Safe interactions performed: route load, sidebar navigation, and header/content verification only.

I. Step-by-step usage:
1. Filter by actor, action, date, or entity.
2. Open details only for context.
3. Correlate with Error Logs and Security & Compliance.
4. Redact sensitive fields before sharing.
5. Use timestamps and actor identity when escalating.

J. Safe actions: Searching, filtering, expanding rows, and collecting sanitized incident context.

K. Caution/destructive actions: Audit rows may contain sensitive internal metadata.

L. Do-not-do list: Do not expose raw audit metadata in consumer communication.

M. Empty-state behavior: If no records appear, staging may not have matching data, filters may be narrow, or the page may be role/feature/data dependent. Clear filters and verify the owning queue before drawing conclusions.

N. Error-state behavior: If the page fails, check admin session, route access, failed network requests, Error Logs, and recent deploy status. Escalate with route, time, screenshot, and console/network evidence.

O. Related pages: Security & Compliance, Error Logs, User Management

P. Compliance/legal boundary notes: Activity Logs support accountability; they do not determine violation status or packet wording.

Q. Troubleshooting notes: Confirm route, role, filters, staging data availability, and feature gates. Do not patch parser, legal, packet, or settings behavior from this page without an approved task.

R. Evidence from live certification: Header seen: Activity Logs. Console/page errors: 0. Failed critical network requests: 0. Screenshot: docs/admin-live-clickthrough-screenshots/05-activity-logs.png. Notes: Operational page is data-dependent, staging-only, guarded, or currently in an empty-state path.


## 6. Outcome Reviews

A. Page name: Outcome Reviews

B. Route: `/admin-outcome-reviews`

C. Certification status: **PASS_WITH_LIMITATIONS**. Live-certified with limitations; route rendered operational content, but certification was limited by data dependence, staging-only or guarded behavior, empty-state paths, placeholder wording, or safety restrictions on mutation controls.

D. Page purpose: Review surface for comparison runs, dispute outcome tracking, response outcomes, review actions, and sanitization/redaction status.

E. Who should use it: Compliance reviewers and support staff tracking dispute results.

F. When to use it: After bureau/creditor responses, when measuring packet outcomes, or reconciling user follow-up.

G. What data appears: Outcome records, comparison run data, response status, filters, review states, sanitization/redaction context, linked packet/response details.

H. Primary controls: Refresh, clear filters, search/filter fields, selectors, review actions, and detail panels. Live-observed controls: Observed buttons/actions: RECENT; PLATFORM; LEGAL & RULES; TOOLS; Platform Functions; Logout; Take a Tour; Go back; Refresh; Clear Filters; View Details; Open support chat; Close chat; How do I upload my credit report?. Observed fields/filters: input; select. Observed tabs: No tabs observed. Tables/grids: 0; cards/panels: 50. Safe interactions performed: clicked safe button: /^refresh$/i; clicked safe button: /^clear filters$/i.

I. Step-by-step usage:
1. Filter to the user, response, or packet under review.
2. Confirm sanitization/redaction before reading details.
3. Compare response outcome to the original dispute basis.
4. Record review decisions only through approved workflow.
5. Use Response Documents for source artifact review.

J. Safe actions: Filtering, refreshing, and reviewing sanitized summaries.

K. Caution/destructive actions: Review actions and outcome labels can affect analytics and follow-up.

L. Do-not-do list: Do not overstate legal results or expose metadata in consumer text.

M. Empty-state behavior: If no records appear, staging may not have matching data, filters may be narrow, or the page may be role/feature/data dependent. Clear filters and verify the owning queue before drawing conclusions.

N. Error-state behavior: If the page fails, check admin session, route access, failed network requests, Error Logs, and recent deploy status. Escalate with route, time, screenshot, and console/network evidence.

O. Related pages: Response Documents, Risk Triage, Activity Logs

P. Compliance/legal boundary notes: Outcome review tracks results; it must not reinterpret raw detector labels into legal conclusions.

Q. Troubleshooting notes: Confirm route, role, filters, staging data availability, and feature gates. Do not patch parser, legal, packet, or settings behavior from this page without an approved task.

R. Evidence from live certification: Header seen: Outcome Reviews. Console/page errors: 0. Failed critical network requests: 0. Screenshot: docs/admin-live-clickthrough-screenshots/06-outcome-reviews.png. Notes: Operational page is data-dependent, staging-only, guarded, or currently in an empty-state path. Terminology flags observed: metadata.


## 7. Response Documents

A. Page name: Response Documents

B. Route: `/admin-response-documents`

C. Certification status: **PASS_WITH_LIMITATIONS**. Live-certified with limitations; route rendered operational content, but certification was limited by data dependence, staging-only or guarded behavior, empty-state paths, placeholder wording, or safety restrictions on mutation controls.

D. Page purpose: Response capture and processing page for bureau/creditor responses, manual response recording, review status, packet/outcome links, and sensitive-content controls.

E. Who should use it: Support, compliance reviewers, and admins processing responses.

F. When to use it: When a response arrives, processing needs review, or a manual response must be recorded through an approved workflow.

G. What data appears: Response list/table, processing status, user/packet/outcome links, bureau/creditor/collector fields, upload/manual response controls.

H. Primary controls: Refresh, clear filters, search, selectors, document tables, file/manual-response fields, and review/status controls. Live-observed controls: Observed buttons/actions: RECENT; PLATFORM; LEGAL & RULES; TOOLS; Platform Functions; Logout; Take a Tour; Go back; Refresh; Submit Response Intake; Clear Filters; View Details; Open support chat; Close chat. Observed fields/filters: Search by name or email; select; input; Equifax, TransUnion, creditor, collector; example.test; response-letter.pdf; Paste safe response wording only. Do not paste raw report text, secrets, full account numbers, or full SINs.. Observed tabs: No tabs observed. Tables/grids: 2; cards/panels: 50. Safe interactions performed: clicked safe button: /^refresh$/i; clicked safe button: /^clear filters$/i.

I. Step-by-step usage:
1. Locate the user or response with filters.
2. Confirm sensitive content is sanitized.
3. Link responses only through approved workflow.
4. Use manual response recording only with the source response available.
5. Escalate parser uncertainty instead of forcing a result.

J. Safe actions: Searching, filtering, refreshing, and reviewing sanitized summaries.

K. Caution/destructive actions: Manual records, status changes, uploads, and packet links affect user records.

L. Do-not-do list: Do not upload, submit, paste raw response bodies, storage URLs, secrets, or metadata during certification.

M. Empty-state behavior: If no records appear, staging may not have matching data, filters may be narrow, or the page may be role/feature/data dependent. Clear filters and verify the owning queue before drawing conclusions.

N. Error-state behavior: If the page fails, check admin session, route access, failed network requests, Error Logs, and recent deploy status. Escalate with route, time, screenshot, and console/network evidence.

O. Related pages: Outcome Reviews, Risk Triage, Activity Logs

P. Compliance/legal boundary notes: Response handling can influence follow-up but must keep formal violation wording separate from outcome tracking.

Q. Troubleshooting notes: Confirm route, role, filters, staging data availability, and feature gates. Do not patch parser, legal, packet, or settings behavior from this page without an approved task.

R. Evidence from live certification: Header seen: Response Documents. Console/page errors: 0. Failed critical network requests: 0. Screenshot: docs/admin-live-clickthrough-screenshots/07-response-documents.png. Notes: Operational page is data-dependent, staging-only, guarded, or currently in an empty-state path. Terminology flags observed: violation, metadata.


## 8. Error Logs

A. Page name: Error Logs

B. Route: `/admin-error-logs`

C. Certification status: **PASS_WITH_LIMITATIONS**. Live-certified with limitations; route rendered operational content, but certification was limited by data dependence, staging-only or guarded behavior, empty-state paths, placeholder wording, or safety restrictions on mutation controls.

D. Page purpose: Operational diagnostics page for failed actions, severity, duplicate/fingerprint grouping, and escalation context.

E. Who should use it: Admins, developer-admins, and incident responders.

F. When to use it: When a page reports an error, a job fails, or support needs technical incident context.

G. What data appears: Error rows/cards, severity, route/API context, timestamps, fingerprints, duplicate counts, and diagnostic summaries.

H. Primary controls: Email/date/severity/status filters, row expansion, grouping, and pagination/refresh where present. Live-observed controls: Observed buttons/actions: Expand sidebar; Download Platform Functions PDF; Logout; Go back; All Actions; All Entities; All Severities; Hide Duplicates; Reset (Last 24h); Previous; Next; Open support chat; Close chat; How do I upload my credit report?. Observed fields/filters: Search by email...; input. Observed tabs: No tabs observed. Tables/grids: 0; cards/panels: 301. Safe interactions performed: route load, sidebar navigation, and header/content verification only.

I. Step-by-step usage:
1. Filter by time, user, severity, or action.
2. Check whether the failure repeats by fingerprint.
3. Correlate with Activity Logs.
4. Escalate P0/P1 issues with route, time, and screenshot.
5. Keep sensitive details internal.

J. Safe actions: Filtering, reading sanitized details, and copying incident summaries.

K. Caution/destructive actions: Logs can include sensitive metadata or stack details.

L. Do-not-do list: Do not expose stack traces, raw IDs, or secrets to consumers.

M. Empty-state behavior: If no records appear, staging may not have matching data, filters may be narrow, or the page may be role/feature/data dependent. Clear filters and verify the owning queue before drawing conclusions.

N. Error-state behavior: If the page fails, check admin session, route access, failed network requests, Error Logs, and recent deploy status. Escalate with route, time, screenshot, and console/network evidence.

O. Related pages: Activity Logs, Security & Compliance, Beta Testing Hub

P. Compliance/legal boundary notes: Error Logs are diagnostic and do not affect finding status or packet wording.

Q. Troubleshooting notes: Confirm route, role, filters, staging data availability, and feature gates. Do not patch parser, legal, packet, or settings behavior from this page without an approved task.

R. Evidence from live certification: Header seen: System Error Logs. Console/page errors: 0. Failed critical network requests: 0. Screenshot: docs/admin-live-clickthrough-screenshots/08-error-logs.png. Notes: Operational page is data-dependent, staging-only, guarded, or currently in an empty-state path.


## 9. Security & Compliance

A. Page name: Security & Compliance

B. Route: `/admin-security`

C. Certification status: **PASS_WITH_LIMITATIONS**. Live-certified with limitations; route rendered operational content, but certification was limited by data dependence, staging-only or guarded behavior, empty-state paths, placeholder wording, or safety restrictions on mutation controls.

D. Page purpose: Security oversight page for Audit Logs, Data Retention, and Semantic Audit tabs.

E. Who should use it: Security reviewers, admins, and compliance operations owners.

F. When to use it: For security review, retention checks, semantic audit review, and incident investigation.

G. What data appears: Audit log table, retention state, semantic audit entries, filters for action/entity/status/severity/date/user.

H. Primary controls: Tabs for Audit Logs, Data Retention, Semantic Audit; filters and tables; retention controls where present. Live-observed controls: Observed buttons/actions: Expand sidebar; Download Platform Functions PDF; Logout; Go back; Audit Logs; Data Retention; Semantic Audit; View details for audit log 8943; View details for audit log 8941; View details for audit log 8940; View details for audit log 8937; View details for audit log 8935; View details for audit log 8931; View details for audit log 8930. Observed fields/filters: Action Type; Entity Type; Status; Error Severity; Start Date; End Date; User Email; User ID. Observed tabs: Audit Logs; Data Retention; Semantic Audit. Tables/grids: 1; cards/panels: 0. Safe interactions performed: clicked tab: Audit Logs; clicked tab: Data Retention; clicked tab: Semantic Audit.

I. Step-by-step usage:
1. Start with Audit Logs for actor/action history.
2. Use Data Retention for review only unless approved.
3. Use Semantic Audit to inspect policy-sensitive wording.
4. Escalate anomalies with Activity/Error Log evidence.
5. Do not run retention actions during audits.

J. Safe actions: Switching tabs, filtering logs, and reviewing retention/semantic entries.

K. Caution/destructive actions: Retention actions can remove or restrict data; semantic entries may contain sensitive wording.

L. Do-not-do list: Do not run retention actions or copy sensitive audit details into consumer communications.

M. Empty-state behavior: If no records appear, staging may not have matching data, filters may be narrow, or the page may be role/feature/data dependent. Clear filters and verify the owning queue before drawing conclusions.

N. Error-state behavior: If the page fails, check admin session, route access, failed network requests, Error Logs, and recent deploy status. Escalate with route, time, screenshot, and console/network evidence.

O. Related pages: Activity Logs, Error Logs, User Management

P. Compliance/legal boundary notes: Security review supports governance and does not determine formal violations or packet readiness.

Q. Troubleshooting notes: Confirm route, role, filters, staging data availability, and feature gates. Do not patch parser, legal, packet, or settings behavior from this page without an approved task.

R. Evidence from live certification: Header seen: Security & Compliance. Console/page errors: 0. Failed critical network requests: 0. Screenshot: docs/admin-live-clickthrough-screenshots/09-security-and-compliance.png. Notes: Operational page is data-dependent, staging-only, guarded, or currently in an empty-state path.


## 10. Support Tickets

A. Page name: Support Tickets

B. Route: `/support-tickets`

C. Certification status: **PASS_WITH_LIMITATIONS**. Live-certified with limitations; route rendered operational content, but certification was limited by data dependence, staging-only or guarded behavior, empty-state paths, placeholder wording, or safety restrictions on mutation controls.

D. Page purpose: Support queue for user/support/admin issue intake, ticket review, and customer-support workflow.

E. Who should use it: Support agents, admins, and support leads.

F. When to use it: When users report issues, support needs queue triage, or admins review support volume.

G. What data appears: Ticket table/list, subject/description search, status/priority context, ticket creation/view/update controls depending on role.

H. Primary controls: Search by subject/description, ticket table, view/update/create controls where present. Live-observed controls: Observed buttons/actions: Expand sidebar; Download Platform Functions PDF; Logout; Go back; Unassigned; High Priority; Waiting on User; Overdue; Clear; All Statuses; All Categories; All Priorities; All Assignments; Previous. Observed fields/filters: Search by subject or description.... Observed tabs: No tabs observed. Tables/grids: 1; cards/panels: 0. Safe interactions performed: route load, sidebar navigation, and header/content verification only.

I. Step-by-step usage:
1. Search existing tickets before creating duplicates.
2. Open details to confirm user context.
3. Keep replies operational and avoid legal conclusions.
4. Escalate parser, packet, security, or billing issues to owning pages.
5. Redact sensitive record data.

J. Safe actions: Searching, reading tickets, and drafting support-only context.

K. Caution/destructive actions: Creating/updating tickets affects support records and audit history.

L. Do-not-do list: Do not include raw report IDs, sensitive metadata, or formal legal conclusions in support replies.

M. Empty-state behavior: If no records appear, staging may not have matching data, filters may be narrow, or the page may be role/feature/data dependent. Clear filters and verify the owning queue before drawing conclusions.

N. Error-state behavior: If the page fails, check admin session, route access, failed network requests, Error Logs, and recent deploy status. Escalate with route, time, screenshot, and console/network evidence.

O. Related pages: Error Logs, Activity Logs, User Management, Beta Testing Hub

P. Compliance/legal boundary notes: Support Tickets are operational records, not the source of formal violation determinations.

Q. Troubleshooting notes: Confirm route, role, filters, staging data availability, and feature gates. Do not patch parser, legal, packet, or settings behavior from this page without an approved task.

R. Evidence from live certification: Header seen: All Tickets. Console/page errors: 0. Failed critical network requests: 0. Screenshot: docs/admin-live-clickthrough-screenshots/10-support-tickets.png. Notes: Operational page is data-dependent, staging-only, guarded, or currently in an empty-state path.


## 11. Admin Guide

A. Page name: Admin Guide

B. Route: `/admin-knowledge-base`

C. Certification status: **PASS**. Live-certified from staging UI.

D. Page purpose: Built-in admin documentation with tabs and guide download/export affordances for onboarding and operations.

E. Who should use it: New admins, support agents, and operators.

F. When to use it: During onboarding, before sensitive actions, or when confirming procedure.

G. What data appears: Documentation tabs covering overview, user management, compliance config, version management, parser testing, operations, licensed agencies, and feature index.

H. Primary controls: Documentation tabs and PDF/download controls where present. Live-observed controls: Observed buttons/actions: Expand sidebar; Download Platform Functions PDF; Logout; Go back; Download Admin Guide as PDF; Overview; User Management; Compliance Config; Version Management; Parser Testing; Operations; Licensed Agencies; Feature Index; What each page does. Observed fields/filters: None observed during the live sweep. Observed tabs: Overview; User Management; Compliance Config; Version Management; Parser Testing; Operations; Licensed Agencies; Feature Index. Tables/grids: 0; cards/panels: 0. Safe interactions performed: clicked tab: Overview; clicked tab: User Management; clicked tab: Compliance Config; clicked tab: Version Management.

I. Step-by-step usage:
1. Open the relevant documentation tab.
2. Read procedure before using high-risk tools.
3. Use the guide as operational reference, not legal authority.
4. Download/export only for approved internal onboarding.
5. Escalate documentation drift when route behavior differs.

J. Safe actions: Switching tabs and reading/downloading approved internal documentation.

K. Caution/destructive actions: Documentation can lag current product behavior.

L. Do-not-do list: Do not treat guide text as reviewed legal authority.

M. Empty-state behavior: If no records appear, staging may not have matching data, filters may be narrow, or the page may be role/feature/data dependent. Clear filters and verify the owning queue before drawing conclusions.

N. Error-state behavior: If the page fails, check admin session, route access, failed network requests, Error Logs, and recent deploy status. Escalate with route, time, screenshot, and console/network evidence.

O. Related pages: All admin pages

P. Compliance/legal boundary notes: The guide changes no rules, users, parser mappings, or packet output.

Q. Troubleshooting notes: Confirm route, role, filters, staging data availability, and feature gates. Do not patch parser, legal, packet, or settings behavior from this page without an approved task.

R. Evidence from live certification: Header seen: Admin Guide. Console/page errors: 0. Failed critical network requests: 0.


## 12. Credit Reporting Companies

A. Page name: Credit Reporting Companies

B. Route: `/bureaus`

C. Certification status: **PASS_WITH_LIMITATIONS**. Live-certified with limitations; route rendered operational content, but certification was limited by data dependence, staging-only or guarded behavior, empty-state paths, placeholder wording, or safety restrictions on mutation controls.

D. Page purpose: Reference registry for credit reporting companies, official dispute addresses, exports, and packet recipient data.

E. Who should use it: Admins maintaining bureau/company reference data.

F. When to use it: When confirming bureau contact details or preparing reviewed registry updates.

G. What data appears: Company/bureau cards or rows, address/contact fields, exports, selection controls, add/delete controls.

H. Primary controls: Selection controls, Add a Company dialog, export/download controls, edit/delete controls where present. Live-observed controls: Observed buttons/actions: Expand sidebar; Download Platform Functions PDF; Logout; Go back; More information; Export All; Add a Company; Clear; Export; Delete; Open support chat; Close chat; How do I upload my credit report?; What compliance findings did you find?. Observed fields/filters: Select all items; Select item 48; Select item 3; Select item 4. Observed tabs: No tabs observed. Tables/grids: 0; cards/panels: 14. Safe interactions performed: opened create/add dialog: Add a Company; dialog visible.

I. Step-by-step usage:
1. Find the company record.
2. Verify addresses against approved sources before editing.
3. Use exports for internal review only.
4. Open add/edit dialogs only with approved source updates.
5. Cancel delete confirmations during audits.

J. Safe actions: Viewing companies, selecting rows, exporting reference lists, and opening/closing add dialogs.

K. Caution/destructive actions: Changing recipient data can affect packet delivery addresses.

L. Do-not-do list: Do not add/delete bureaus or change dispute addresses without approval.

M. Empty-state behavior: If no records appear, staging may not have matching data, filters may be narrow, or the page may be role/feature/data dependent. Clear filters and verify the owning queue before drawing conclusions.

N. Error-state behavior: If the page fails, check admin session, route access, failed network requests, Error Logs, and recent deploy status. Escalate with route, time, screenshot, and console/network evidence.

O. Related pages: Response Documents, Laws, Regulatory Updates

P. Compliance/legal boundary notes: Registry data affects recipients/contact details, not formal violation truth.

Q. Troubleshooting notes: Confirm route, role, filters, staging data availability, and feature gates. Do not patch parser, legal, packet, or settings behavior from this page without an approved task.

R. Evidence from live certification: Header seen: Credit Reporting Companies. Console/page errors: 0. Failed critical network requests: 0. Screenshot: docs/admin-live-clickthrough-screenshots/12-credit-reporting-companies.png. Notes: Operational page is data-dependent, staging-only, guarded, or currently in an empty-state path.


## 13. Laws

A. Page name: Laws

B. Route: `/statutes`

C. Certification status: **PASS_WITH_LIMITATIONS**. Live-certified with limitations; route rendered operational content, but certification was limited by data dependence, staging-only or guarded behavior, empty-state paths, placeholder wording, or safety restrictions on mutation controls.

D. Page purpose: Statute and legal authority registry with search, lifecycle status, watchlist/history, and create/update paths.

E. Who should use it: Compliance admins and legal data reviewers.

F. When to use it: When validating legal authority references or preparing reviewed legal data updates.

G. What data appears: Statute table, citation search, jurisdiction/lifecycle filters, watchlist/history, and create/update controls.

H. Primary controls: Search description/code/section, exact citation input, filters, table, Create Law Version dialog, watchlist controls. Live-observed controls: Observed buttons/actions: Expand sidebar; Download Platform Functions PDF; Logout; Go back; More information; Export CSV; Export PDF; Create Law Version; Open support chat; Close chat; How do I upload my credit report?; What compliance findings did you find?; How do I send a dispute letter?; I need to talk to a real person. Observed fields/filters: Search description, code, section...; Exact citation (e.g., CRA Section 12); select; input. Observed tabs: No tabs observed. Tables/grids: 1; cards/panels: 5. Safe interactions performed: opened create/add dialog: Create Law Version; dialog visible.

I. Step-by-step usage:
1. Search by exact citation or statute code.
2. Confirm jurisdiction, version, effective date, and source.
3. Use watchlist/history for review context.
4. Create/update versions only through reviewed legal workflow.
5. Keep broad accuracy principles separate from field-specific mandates unless authority supports them.

J. Safe actions: Searching, filtering, reviewing statute versions, and opening/closing create dialogs.

K. Caution/destructive actions: Legal registry changes can affect formal violation eligibility and packet references.

L. Do-not-do list: Do not create/update legal records or treat private standards as law.

M. Empty-state behavior: If no records appear, staging may not have matching data, filters may be narrow, or the page may be role/feature/data dependent. Clear filters and verify the owning queue before drawing conclusions.

N. Error-state behavior: If the page fails, check admin session, route access, failed network requests, Error Logs, and recent deploy status. Escalate with route, time, screenshot, and console/network evidence.

O. Related pages: Regulatory Updates, Rule Check Settings, obligation pages

P. Compliance/legal boundary notes: This is formal authority reference data; it supports legal references only after reviewed mapping/adjudication.

Q. Troubleshooting notes: Confirm route, role, filters, staging data availability, and feature gates. Do not patch parser, legal, packet, or settings behavior from this page without an approved task.

R. Evidence from live certification: Header seen: Laws Registry. Console/page errors: 0. Failed critical network requests: 0. Screenshot: docs/admin-live-clickthrough-screenshots/13-laws.png. Notes: Operational page is data-dependent, staging-only, guarded, or currently in an empty-state path.


## 14. Reporting Format Guide

A. Page name: Reporting Format Guide

B. Route: `/metro2-compliance`

C. Certification status: **PASS_WITH_LIMITATIONS**. Live-certified with limitations; route rendered operational content, but certification was limited by data dependence, staging-only or guarded behavior, empty-state paths, placeholder wording, or safety restrictions on mutation controls.

D. Page purpose: Reporting-format and Metro-style reference guide with validation rules, field reference, quick check, CRA obligations, and changelog content.

E. Who should use it: Admins, parser reviewers, and compliance operations staff.

F. When to use it: When understanding report-format conventions or parser/reporting-quality issues.

G. What data appears: Guide tabs, validation rules, field references, quick-check content, filters for rule category/severity/impact/confidence.

H. Primary controls: Search rules, filters, tabs for Version History, Validation Rules, Field Reference, Quick Check, CRA Obligations, Guide Changelog. Live-observed controls: Observed buttons/actions: Expand sidebar; Download Platform Functions PDF; Logout; Go back; Version History; Validation Rules; Field Reference; Quick Check; CRA Obligations; Guide Changelog; Reset; CSV; PDF Preview; Base-5. Observed fields/filters: Search rules by name, category, or guidance...; Rule category filter; Rule severity filter; Rule impact filter; Rule confidence filter. Observed tabs: Version History; Validation Rules; Field Reference; Quick Check; CRA Obligations; Guide Changelog. Tables/grids: 0; cards/panels: 0. Safe interactions performed: clicked tab: Version History; clicked tab: Validation Rules; clicked tab: Field Reference; clicked tab: Quick Check.

I. Step-by-step usage:
1. Use it to understand reporting-format expectations.
2. Decide whether the issue is format reference, dispute basis, or authority-backed violation.
3. Never convert Metro/reporting-format standards into legal violations without authority mapping.
4. Treat placeholder/coming-soon sections as not fully operational.
5. Route mapping issues to Parser Mappings.

J. Safe actions: Searching, filtering, and switching guide tabs.

K. Caution/destructive actions: Format guidance can inform review but is not automatically law.

L. Do-not-do list: Do not cite this guide as statutory authority in consumer packets.

M. Empty-state behavior: If no records appear, staging may not have matching data, filters may be narrow, or the page may be role/feature/data dependent. Clear filters and verify the owning queue before drawing conclusions.

N. Error-state behavior: If the page fails, check admin session, route access, failed network requests, Error Logs, and recent deploy status. Escalate with route, time, screenshot, and console/network evidence.

O. Related pages: Parser Testing, Parser Mappings, Laws, Rule Check Settings

P. Compliance/legal boundary notes: Reporting-format standards are reference guidance, not formal legal authority without registry mapping.

Q. Troubleshooting notes: Confirm route, role, filters, staging data availability, and feature gates. Do not patch parser, legal, packet, or settings behavior from this page without an approved task.

R. Evidence from live certification: Header seen: Metro 2 Compliance Guide. Console/page errors: 0. Failed critical network requests: 0. Screenshot: docs/admin-live-clickthrough-screenshots/14-reporting-format-guide.png. Notes: Placeholder or coming-soon wording observed. Terminology flags observed: violation.


## 15. Rules Creditors Must Follow

A. Page name: Rules Creditors Must Follow

B. Route: `/creditor-obligations`

C. Certification status: **PASS_WITH_LIMITATIONS**. Live-certified with limitations; route rendered operational content, but certification was limited by data dependence, staging-only or guarded behavior, empty-state paths, placeholder wording, or safety restrictions on mutation controls.

D. Page purpose: Creditor/data-provider obligation reference with statutory references and create/edit/delete controls.

E. Who should use it: Compliance admins and legal/reference reviewers.

F. When to use it: When checking furnisher duties or preparing authority mapping review.

G. What data appears: Creditor obligation cards, search/filter fields, statutory references, add/edit/delete controls.

H. Primary controls: Search obligations, filters, Add Creditor Obligation dialog, table/cards, edit/delete controls. Live-observed controls: Observed buttons/actions: Expand sidebar; Download Platform Functions PDF; Logout; Go back; Add Creditor Obligation; Open support chat; Close chat; How do I upload my credit report?; What compliance findings did you find?; How do I send a dispute letter?; I need to talk to a real person; Send message. Observed fields/filters: Search obligations...; select. Observed tabs: No tabs observed. Tables/grids: 0; cards/panels: 77. Safe interactions performed: opened create/add dialog: Add Creditor Obligation; dialog visible.

I. Step-by-step usage:
1. Search by topic or citation.
2. Verify the obligation applies to the actor and jurisdiction.
3. Confirm authority mapping before formal violation use.
4. Open add/edit dialogs only for reviewed updates.
5. Escalate missing obligations through legal data review.

J. Safe actions: Searching, filtering, reading obligations, and opening/closing add dialogs.

K. Caution/destructive actions: Changing obligations can affect authority mapping and interpretation.

L. Do-not-do list: Do not apply creditor obligations to bureaus or collectors without actor support.

M. Empty-state behavior: If no records appear, staging may not have matching data, filters may be narrow, or the page may be role/feature/data dependent. Clear filters and verify the owning queue before drawing conclusions.

N. Error-state behavior: If the page fails, check admin session, route access, failed network requests, Error Logs, and recent deploy status. Escalate with route, time, screenshot, and console/network evidence.

O. Related pages: Laws, Regulatory Updates, Risk Triage

P. Compliance/legal boundary notes: Reference/admin data only; formal violation status still requires eligibility and authority validation.

Q. Troubleshooting notes: Confirm route, role, filters, staging data availability, and feature gates. Do not patch parser, legal, packet, or settings behavior from this page without an approved task.

R. Evidence from live certification: Header seen: Creditor Obligations. Console/page errors: 0. Failed critical network requests: 0. Screenshot: docs/admin-live-clickthrough-screenshots/15-rules-creditors-must-follow.png. Notes: Operational page is data-dependent, staging-only, guarded, or currently in an empty-state path.


## 16. Rules Credit Reporting Companies Must Follow

A. Page name: Rules Credit Reporting Companies Must Follow

B. Route: `/bureau-obligations`

C. Certification status: **PASS_WITH_LIMITATIONS**. Live-certified with limitations; route rendered operational content, but certification was limited by data dependence, staging-only or guarded behavior, empty-state paths, placeholder wording, or safety restrictions on mutation controls.

D. Page purpose: Bureau/credit reporting company obligation reference and distinction from creditor/furnisher duties.

E. Who should use it: Compliance admins and bureau-dispute reviewers.

F. When to use it: When questions concern CRA dispute handling, reinvestigation, disclosure, or bureau-specific obligations.

G. What data appears: Bureau obligation table, statutory/reference context, add/edit/delete controls.

H. Primary controls: Search/list/table controls and Add Bureau Obligation dialog. Live-observed controls: Observed buttons/actions: Expand sidebar; Download Platform Functions PDF; Logout; Go back; Add Bureau Obligation; Open support chat; Close chat; How do I upload my credit report?; What compliance findings did you find?; How do I send a dispute letter?; I need to talk to a real person; Send message. Observed fields/filters: Search obligations.... Observed tabs: No tabs observed. Tables/grids: 1; cards/panels: 0. Safe interactions performed: opened create/add dialog: Add Bureau Obligation; dialog visible.

I. Step-by-step usage:
1. Confirm the actor is a bureau/CRA.
2. Review statutory reference and scope.
3. Keep bureau duties distinct from furnisher duties.
4. Escalate ambiguous cases to legal data review.
5. Do not copy internal references into consumer text.

J. Safe actions: Viewing, searching, and opening/closing add dialogs.

K. Caution/destructive actions: Misclassifying actor duties can create misleading packet language.

L. Do-not-do list: Do not apply bureau obligations to creditors or collectors without authority support.

M. Empty-state behavior: If no records appear, staging may not have matching data, filters may be narrow, or the page may be role/feature/data dependent. Clear filters and verify the owning queue before drawing conclusions.

N. Error-state behavior: If the page fails, check admin session, route access, failed network requests, Error Logs, and recent deploy status. Escalate with route, time, screenshot, and console/network evidence.

O. Related pages: Credit Reporting Companies, Laws, Risk Triage

P. Compliance/legal boundary notes: Bureau obligations support reference and authority mapping; packet builders must use adjudicated intent.

Q. Troubleshooting notes: Confirm route, role, filters, staging data availability, and feature gates. Do not patch parser, legal, packet, or settings behavior from this page without an approved task.

R. Evidence from live certification: Header seen: Bureau Obligations. Console/page errors: 0. Failed critical network requests: 0. Screenshot: docs/admin-live-clickthrough-screenshots/16-rules-credit-reporting-companies-must-follow.png. Notes: Operational page is data-dependent, staging-only, guarded, or currently in an empty-state path.


## 17. Rules Collectors Must Follow

A. Page name: Rules Collectors Must Follow

B. Route: `/collector-obligations`

C. Certification status: **PASS_WITH_LIMITATIONS**. Live-certified with limitations; route rendered operational content, but certification was limited by data dependence, staging-only or guarded behavior, empty-state paths, placeholder wording, or safety restrictions on mutation controls.

D. Page purpose: Collector/debt collection agency obligation reference and scope guardrails.

E. Who should use it: Compliance admins and collector-related dispute reviewers.

F. When to use it: When an issue involves a collection agency or collector conduct.

G. What data appears: Collector obligation table/list, statutory/reference details, add/edit/delete controls.

H. Primary controls: Search/list/table controls and Add Debt Collection Agency Obligation dialog. Live-observed controls: Observed buttons/actions: Expand sidebar; Download Platform Functions PDF; Logout; Go back; Add Debt Collection Agency Obligation; Open support chat; Close chat; How do I upload my credit report?; What compliance findings did you find?; How do I send a dispute letter?; I need to talk to a real person; Send message. Observed fields/filters: Search obligations.... Observed tabs: No tabs observed. Tables/grids: 1; cards/panels: 0. Safe interactions performed: opened create/add dialog: Add Debt Collection Agency Obligation; dialog visible.

I. Step-by-step usage:
1. Confirm the actor is a collector.
2. Review scope and jurisdiction.
3. Map formal claims through authority/adjudication.
4. Use this page as reference, not direct consumer wording.
5. Escalate missing agency identity as manual review.

J. Safe actions: Viewing obligations and opening/closing add dialogs.

K. Caution/destructive actions: Collector rules may be irrelevant to bureau packet claims unless actor/evidence supports them.

L. Do-not-do list: Do not confuse collector duties with bureau or creditor duties.

M. Empty-state behavior: If no records appear, staging may not have matching data, filters may be narrow, or the page may be role/feature/data dependent. Clear filters and verify the owning queue before drawing conclusions.

N. Error-state behavior: If the page fails, check admin session, route access, failed network requests, Error Logs, and recent deploy status. Escalate with route, time, screenshot, and console/network evidence.

O. Related pages: Laws, Enforcement, Risk Triage

P. Compliance/legal boundary notes: Collector references require actor-specific evidence and authority eligibility before formal violation use.

Q. Troubleshooting notes: Confirm route, role, filters, staging data availability, and feature gates. Do not patch parser, legal, packet, or settings behavior from this page without an approved task.

R. Evidence from live certification: Header seen: Debt Collection Agency Obligations. Console/page errors: 0. Failed critical network requests: 0. Screenshot: docs/admin-live-clickthrough-screenshots/17-rules-collectors-must-follow.png. Notes: Operational page is data-dependent, staging-only, guarded, or currently in an empty-state path.


## 18. Enforcement

A. Page name: Enforcement

B. Route: `/enforcement-mechanisms`

C. Certification status: **PASS_WITH_LIMITATIONS**. Live-certified with limitations; route rendered operational content, but certification was limited by data dependence, staging-only or guarded behavior, empty-state paths, placeholder wording, or safety restrictions on mutation controls.

D. Page purpose: Reference page for enforcement mechanisms, complaint procedures, enforcing bodies, penalties, and escalation channels.

E. Who should use it: Compliance admins and legal/reference reviewers.

F. When to use it: When understanding regulator roles, complaint paths, or administrative reference data.

G. What data appears: Enforcement cards, complaint procedure details, regulator/enforcing body fields, penalties, filters, add/edit controls.

H. Primary controls: Filters/selects, New Enforcement Mechanism dialog, card/list views. Live-observed controls: Observed buttons/actions: Expand sidebar; Download Platform Functions PDF; Logout; Go back; New Enforcement Mechanism; Open support chat; Close chat; How do I upload my credit report?; What compliance findings did you find?; How do I send a dispute letter?; I need to talk to a real person; Send message. Observed fields/filters: select. Observed tabs: No tabs observed. Tables/grids: 0; cards/panels: 37. Safe interactions performed: opened create/add dialog: New Enforcement Mechanism; dialog visible.

I. Step-by-step usage:
1. Review the mechanism relevant to jurisdiction and actor.
2. Use it for internal reference or escalation planning.
3. Keep penalties separate from user packet wording unless approved.
4. Open new/edit dialogs only with reviewed source updates.
5. Route outdated content through Regulatory Updates.

J. Safe actions: Viewing, filtering, and opening/closing add dialogs.

K. Caution/destructive actions: Penalty/enforcement wording can overstate consumer outcomes if copied into letters.

L. Do-not-do list: Do not insert penalties into dispute packets as promises or conclusions.

M. Empty-state behavior: If no records appear, staging may not have matching data, filters may be narrow, or the page may be role/feature/data dependent. Clear filters and verify the owning queue before drawing conclusions.

N. Error-state behavior: If the page fails, check admin session, route access, failed network requests, Error Logs, and recent deploy status. Escalate with route, time, screenshot, and console/network evidence.

O. Related pages: Laws, Regulatory Updates, obligation pages

P. Compliance/legal boundary notes: Admin reference data only; it is not direct packet wording and does not prove a formal violation.

Q. Troubleshooting notes: Confirm route, role, filters, staging data availability, and feature gates. Do not patch parser, legal, packet, or settings behavior from this page without an approved task.

R. Evidence from live certification: Header seen: Enforcement Mechanisms. Console/page errors: 0. Failed critical network requests: 0. Screenshot: docs/admin-live-clickthrough-screenshots/18-enforcement.png. Notes: Operational page is data-dependent, staging-only, guarded, or currently in an empty-state path. Terminology flags observed: violation.


## 19. Regulatory Updates

A. Page name: Regulatory Updates

B. Route: `/regulatory-updates`

C. Certification status: **PASS_WITH_LIMITATIONS**. Live-certified with limitations; route rendered operational content, but certification was limited by data dependence, staging-only or guarded behavior, empty-state paths, placeholder wording, or safety restrictions on mutation controls.

D. Page purpose: Review-gated update engine for registry, candidates, mappings, scans, rebuilds, reviews, activation/deactivation, and reconciliation.

E. Who should use it: Compliance admins, legal data reviewers, and developer-admins.

F. When to use it: When legal/reference data needs update review or source scan candidates/mappings need validation.

G. What data appears: Registry, Pending Updates, Manual Add, Mappings, Reconciliation Candidates, Runtime Bridge Mappings, update cards/tables, statuses.

H. Primary controls: Search regulations, filters, tabs, candidate review, scan/rebuild/activate/deactivate/restore/map controls where present. Live-observed controls: Observed buttons/actions: Expand sidebar; Download Platform Functions PDF; Logout; Go back; Run Source Check; Rebuild Indexes; Registry; Pending Updates; Manual Add; Mappings; Reconciliation Candidates; Runtime Bridge Mappings; Open support chat; Close chat. Observed fields/filters: Search regulations; select; input. Observed tabs: Registry; Pending Updates; Manual Add; Mappings; Reconciliation Candidates; Runtime Bridge Mappings. Tables/grids: 0; cards/panels: 0. Safe interactions performed: clicked tab: Registry; clicked tab: Pending Updates; clicked tab: Manual Add; clicked tab: Mappings.

I. Step-by-step usage:
1. Start in Registry to understand active reviewed data.
2. Use Pending Updates to review candidates, not auto-activate them.
3. Use Manual Add only with approved source details.
4. Validate authority relationships in mappings/reconciliation tabs.
5. Never scan, rebuild, activate, deactivate, restore, or map authority during certification.

J. Safe actions: Searching, filtering, and switching tabs.

K. Caution/destructive actions: Update actions can change legal authority used by formal eligibility and packet references.

L. Do-not-do list: Do not activate legal data or leak regulatory-reference labels into consumer letters.

M. Empty-state behavior: If no records appear, staging may not have matching data, filters may be narrow, or the page may be role/feature/data dependent. Clear filters and verify the owning queue before drawing conclusions.

N. Error-state behavior: If the page fails, check admin session, route access, failed network requests, Error Logs, and recent deploy status. Escalate with route, time, screenshot, and console/network evidence.

O. Related pages: Laws, obligation pages, Rule Check Settings

P. Compliance/legal boundary notes: Review-gated reference data; packet builders must consume only approved/adjudicated authority.

Q. Troubleshooting notes: Confirm route, role, filters, staging data availability, and feature gates. Do not patch parser, legal, packet, or settings behavior from this page without an approved task.

R. Evidence from live certification: Header seen: Regulations & Law Update Engine. Console/page errors: 0. Failed critical network requests: 0. Screenshot: docs/admin-live-clickthrough-screenshots/19-regulatory-updates.png. Notes: Operational page is data-dependent, staging-only, guarded, or currently in an empty-state path. Terminology flags observed: violation, Regulatory Reference.


## 20. Beta Testing Hub

A. Page name: Beta Testing Hub

B. Route: `/admin-beta-testing-hub`

C. Certification status: **PASS_WITH_LIMITATIONS**. Live-certified with limitations; route rendered operational content, but certification was limited by data dependence, staging-only or guarded behavior, empty-state paths, placeholder wording, or safety restrictions on mutation controls.

D. Page purpose: Staging-only hub for beta issue prompts, Codex report logging, and test handoff notes.

E. Who should use it: Admins and testers working on staging validation.

F. When to use it: After reproducing staging issues, collecting screenshots, or preparing developer handoff.

G. What data appears: Issue type fields, summary, URL, what happened/expected fields, steps, related run notes, Codex report paste area.

H. Primary controls: Dropdowns, text inputs, text areas, report generation/logging controls where present. Live-observed controls: Observed buttons/actions: Expand sidebar; Download Platform Functions PDF; Logout; Go back; FIX; Log Report; Open support chat; Close chat; How do I upload my credit report?; What compliance findings did you find?; How do I send a dispute letter?; I need to talk to a real person; Send message. Observed fields/filters: select; Upload, packet, admin, auth; Short issue summary; https://staging.creditregulatorpro.com/...; What happened on staging; What should happen; 1. ...; Related run, user role, screenshot note; Paste Codex's report here. Observed tabs: No tabs observed. Tables/grids: 0; cards/panels: 0. Safe interactions performed: route load, sidebar navigation, and header/content verification only.

I. Step-by-step usage:
1. Select the issue category.
2. Enter concise summary and staging URL.
3. Include reproduction steps and sanitized evidence.
4. Paste Codex reports only after removing secrets/user data.
5. Do not submit production-like records during certification.

J. Safe actions: Drafting test notes and reviewing fields without submitting.

K. Caution/destructive actions: Submitted reports may become developer work items or audit evidence.

L. Do-not-do list: Do not include credentials, cookies, raw reports, or unredacted user data.

M. Empty-state behavior: If no records appear, staging may not have matching data, filters may be narrow, or the page may be role/feature/data dependent. Clear filters and verify the owning queue before drawing conclusions.

N. Error-state behavior: If the page fails, check admin session, route access, failed network requests, Error Logs, and recent deploy status. Escalate with route, time, screenshot, and console/network evidence.

O. Related pages: Error Logs, Activity Logs, Support Tickets

P. Compliance/legal boundary notes: Documents staging issues only; it does not alter parser truth, legal authority, or packet readiness.

Q. Troubleshooting notes: Confirm route, role, filters, staging data availability, and feature gates. Do not patch parser, legal, packet, or settings behavior from this page without an approved task.

R. Evidence from live certification: Header seen: Beta Testing Hub. Console/page errors: 0. Failed critical network requests: 0. Screenshot: docs/admin-live-clickthrough-screenshots/20-beta-testing-hub.png. Notes: Operational page is data-dependent, staging-only, guarded, or currently in an empty-state path. Staging-only/admin testing tool.


## 21. Lifecycle Testing

A. Page name: Lifecycle Testing

B. Route: `/admin-mock-lifecycle`

C. Certification status: **PASS_WITH_LIMITATIONS**. Live-certified with limitations; route rendered operational content, but certification was limited by data dependence, staging-only or guarded behavior, empty-state paths, placeholder wording, or safety restrictions on mutation controls.

D. Page purpose: Staging tool for mock lifecycle testing with fixtures/uploads, strict mode, DB assist, job status, and report output.

E. Who should use it: Developer-admins and QA admins on staging.

F. When to use it: When validating upload-to-packet lifecycle behavior with approved fixtures.

G. What data appears: Fixture path/upload fields, strict-mode/job configuration, DB assist options, job status, report output panels.

H. Primary controls: Fixture inputs, upload fields, run controls, job status, report output controls. Live-observed controls: Observed buttons/actions: Expand sidebar; Download Platform Functions PDF; Logout; Go back; Start Lifecycle Run; Refresh Jobs; Open support chat; Close chat; How do I upload my credit report?; What compliance findings did you find?; How do I send a dispute letter?; I need to talk to a real person; Send message. Observed fields/filters: Optional: .local/fixtures/admin-lifecycle-smoke.pdf; input; Optional override (defaults to current environment). Observed tabs: No tabs observed. Tables/grids: 0; cards/panels: 0. Safe interactions performed: route load, sidebar navigation, and header/content verification only.

I. Step-by-step usage:
1. Confirm you are on staging.
2. Use only approved safe fixtures and dry-run/no-op paths.
3. Review strict mode and DB assist before running.
4. Do not start heavy lifecycle jobs during click-through certification.
5. Use reports for QA evidence, not consumer communication.

J. Safe actions: Reviewing fields and existing job status.

K. Caution/destructive actions: Lifecycle runs can create users, uploads, reports, packets, sessions, and cleanup jobs.

L. Do-not-do list: Do not run heavy jobs or submit real user data without explicit approval.

M. Empty-state behavior: If no records appear, staging may not have matching data, filters may be narrow, or the page may be role/feature/data dependent. Clear filters and verify the owning queue before drawing conclusions.

N. Error-state behavior: If the page fails, check admin session, route access, failed network requests, Error Logs, and recent deploy status. Escalate with route, time, screenshot, and console/network evidence.

O. Related pages: Parser Testing, Risk Triage, Version Management

P. Compliance/legal boundary notes: Lifecycle Testing validates flows; it must not manually alter parser/legal/packet truth.

Q. Troubleshooting notes: Confirm route, role, filters, staging data availability, and feature gates. Do not patch parser, legal, packet, or settings behavior from this page without an approved task.

R. Evidence from live certification: Header seen: Mock User Lifecycle Testing. Console/page errors: 0. Failed critical network requests: 0. Screenshot: docs/admin-live-clickthrough-screenshots/21-lifecycle-testing.png. Notes: Operational page is data-dependent, staging-only, guarded, or currently in an empty-state path. Staging-only/admin testing tool.


## 22. Parser Testing

A. Page name: Parser Testing

B. Route: `/admin-parser-testing`

C. Certification status: **PASS_WITH_LIMITATIONS**. Live-certified with limitations; route rendered operational content, but certification was limited by data dependence, staging-only or guarded behavior, empty-state paths, placeholder wording, or safety restrictions on mutation controls.

D. Page purpose: Parser test workspace for test cases, Stage Lab, finding corrections, run-all views, import/export, adjudication, and promote-rule caution.

E. Who should use it: Parser reviewers, QA admins, and developer-admins.

F. When to use it: When validating extraction behavior, reproducing parser ambiguity, or reviewing correction candidates.

G. What data appears: Test case table, Stage Lab, finding correction queues, Run All Tests tab, import/export controls, adjudication/promote-rule controls.

H. Primary controls: Search test cases, tabs, New Test Case dialog, run/import/export/promote controls. Live-observed controls: Observed buttons/actions: Expand sidebar; Download Platform Functions PDF; Logout; Go back; New Test Case; Test Cases; Stage Lab; Finding Corrections; Run All Tests; Import / Export; Open support chat; Close chat; How do I upload my credit report?; What compliance findings did you find?. Observed fields/filters: Search test cases.... Observed tabs: Test Cases; Stage Lab; Finding Corrections; Run All Tests; Import / Export. Tables/grids: 1; cards/panels: 0. Safe interactions performed: clicked tab: Test Cases; clicked tab: Stage Lab; clicked tab: Finding Corrections; clicked tab: Run All Tests; opened create/add dialog: New Test Case; dialog visible.

I. Step-by-step usage:
1. Start with the relevant test case or Stage Lab input.
2. Use parser tests to establish parser truth, not legal truth.
3. Review finding corrections carefully.
4. Run All only when safe and expected on staging.
5. Do not promote parser rules or delete cases without approval/tests.

J. Safe actions: Searching, switching tabs, opening/closing New Test Case.

K. Caution/destructive actions: Run-all, import/export, adjudication, delete, and promote actions can affect parser behavior.

L. Do-not-do list: Do not promote parser rules, delete cases, or mutate correction records during certification.

M. Empty-state behavior: If no records appear, staging may not have matching data, filters may be narrow, or the page may be role/feature/data dependent. Clear filters and verify the owning queue before drawing conclusions.

N. Error-state behavior: If the page fails, check admin session, route access, failed network requests, Error Logs, and recent deploy status. Escalate with route, time, screenshot, and console/network evidence.

O. Related pages: Parser Mappings, Risk Triage, Lifecycle Testing

P. Compliance/legal boundary notes: Parser truth is extraction/canonical quality; formal legal truth remains downstream and gated.

Q. Troubleshooting notes: Confirm route, role, filters, staging data availability, and feature gates. Do not patch parser, legal, packet, or settings behavior from this page without an approved task.

R. Evidence from live certification: Header seen: Parser Testing Environment. Console/page errors: 0. Failed critical network requests: 0. Screenshot: docs/admin-live-clickthrough-screenshots/22-parser-testing.png. Notes: Operational page is data-dependent, staging-only, guarded, or currently in an empty-state path.


## 23. Parser Mappings

A. Page name: Parser Mappings

B. Route: `/admin-parser-mappings`

C. Certification status: **PASS_WITH_LIMITATIONS**. Live-certified with limitations; route rendered operational content, but certification was limited by data dependence, staging-only or guarded behavior, empty-state paths, placeholder wording, or safety restrictions on mutation controls.

D. Page purpose: Parser mapping workspace for field mappings, test harness, change history, and bureau detection.

E. Who should use it: Parser admins and developer-admins.

F. When to use it: When a bureau field maps incorrectly, canonical output is missing, or bureau detection needs review.

G. What data appears: Field mapping table, test harness panels, change history, bureau detection tab, add/edit controls.

H. Primary controls: Tabs for Field Mappings, Test Harness, Change History, Bureau Detection; table/grid; Add mapping dialog. Live-observed controls: Observed buttons/actions: Expand sidebar; Download Platform Functions PDF; Logout; Go back; Field Mappings; Test Harness; Change History; Bureau Detection; All; Add Override; Open support chat; Close chat; How do I upload my credit report?; What compliance findings did you find?. Observed fields/filters: None observed during the live sweep. Observed tabs: Field Mappings; Test Harness; Change History; Bureau Detection. Tables/grids: 1; cards/panels: 0. Safe interactions performed: clicked tab: Field Mappings; clicked tab: Test Harness; clicked tab: Change History; clicked tab: Bureau Detection; opened create/add dialog: Add.

I. Step-by-step usage:
1. Identify bureau and field path.
2. Use Test Harness before proposing a change.
3. Review Change History for conflicts.
4. Remember mapping changes affect downstream findings/evidence/packets.
5. Do not save mapping changes during certification.

J. Safe actions: Viewing mappings, switching tabs, opening/closing add dialogs.

K. Caution/destructive actions: Mapping changes can alter canonical output and downstream dispute behavior.

L. Do-not-do list: Do not save mappings, alter bureau detection, or expose mapping metadata to consumers.

M. Empty-state behavior: If no records appear, staging may not have matching data, filters may be narrow, or the page may be role/feature/data dependent. Clear filters and verify the owning queue before drawing conclusions.

N. Error-state behavior: If the page fails, check admin session, route access, failed network requests, Error Logs, and recent deploy status. Escalate with route, time, screenshot, and console/network evidence.

O. Related pages: Parser Testing, Risk Triage, Lifecycle Testing

P. Compliance/legal boundary notes: Mappings affect extraction/canonical data only; formal violation eligibility remains gated downstream.

Q. Troubleshooting notes: Confirm route, role, filters, staging data availability, and feature gates. Do not patch parser, legal, packet, or settings behavior from this page without an approved task.

R. Evidence from live certification: Header seen: Parser Mapping Configuration. Console/page errors: 0. Failed critical network requests: 0. Screenshot: docs/admin-live-clickthrough-screenshots/23-parser-mappings.png. Notes: Operational page is data-dependent, staging-only, guarded, or currently in an empty-state path. Terminology flags observed: metadata.


## 24. AI Assist

A. Page name: AI Assist

B. Route: `/admin-ai-assist`

C. Certification status: **PASS_WITH_LIMITATIONS**. Live-certified with limitations; route rendered operational content, but certification was limited by data dependence, staging-only or guarded behavior, empty-state paths, placeholder wording, or safety restrictions on mutation controls.

D. Page purpose: Guarded admin-only AI preview page for feature gate status, finding lookup, deterministic fallback, and run history.

E. Who should use it: Admin reviewers using advisory AI previews.

F. When to use it: When checking whether AI assistance is available, helpful, and properly guarded for a finding.

G. What data appears: Finding lookup/search, optional finding id, run history table, deterministic fallback output, feature gate controls where visible.

H. Primary controls: Search field, finding id field, tables, create flag dialog where feature gate controls are visible. Live-observed controls: Observed buttons/actions: Expand sidebar; Download Platform Functions PDF; Logout; Go back; Refresh Runs; Create Flag; Search; Recent; Use ID; Preview Explanation; Open support chat; Close chat; How do I upload my credit report?; What compliance findings did you find?. Observed fields/filters: Search findings, or leave blank for recent; e.g. 123. Observed tabs: No tabs observed. Tables/grids: 2; cards/panels: 0. Safe interactions performed: opened create/add dialog: Create Flag.

I. Step-by-step usage:
1. Search for a finding or leave blank for recent items.
2. Confirm deterministic fallback behavior.
3. Treat output as advisory preview only.
4. Do not enable AI globally or change feature gates during audit.
5. Route wording concerns to approved packet/template review.

J. Safe actions: Viewing, searching, and checking guarded/fallback behavior.

K. Caution/destructive actions: Feature gates and AI output can affect user-facing assistance if promoted.

L. Do-not-do list: Do not let AI determine formal violation truth or promote text directly into letters.

M. Empty-state behavior: If no records appear, staging may not have matching data, filters may be narrow, or the page may be role/feature/data dependent. Clear filters and verify the owning queue before drawing conclusions.

N. Error-state behavior: If the page fails, check admin session, route access, failed network requests, Error Logs, and recent deploy status. Escalate with route, time, screenshot, and console/network evidence.

O. Related pages: Risk Triage, Rule Check Settings, Version Management

P. Compliance/legal boundary notes: AI Assist is advisory; deterministic adjudication and authority mapping remain the source of formal truth.

Q. Troubleshooting notes: Confirm route, role, filters, staging data availability, and feature gates. Do not patch parser, legal, packet, or settings behavior from this page without an approved task.

R. Evidence from live certification: Header seen: AI Assist. Console/page errors: 0. Failed critical network requests: 0. Screenshot: docs/admin-live-clickthrough-screenshots/24-ai-assist.png. Notes: Operational page is data-dependent, staging-only, guarded, or currently in an empty-state path. Intentionally guarded feature path; no global AI enablement or setting mutation attempted.


## 25. Version Management

A. Page name: Version Management

B. Route: `/admin-version-management`

C. Certification status: **PASS_WITH_LIMITATIONS**. Live-certified with limitations; route rendered operational content, but certification was limited by data dependence, staging-only or guarded behavior, empty-state paths, placeholder wording, or safety restrictions on mutation controls.

D. Page purpose: Release admin page for versions, migrations, feature flags, release tracking, and migration/feature toggle caution.

E. Who should use it: Developer-admins and release managers.

F. When to use it: Before/after deploys, when reviewing feature flag state, or confirming migration/release history.

G. What data appears: Version cards, Migrations tab, Feature Flags tab, release notes/status, add flag controls, migration controls.

H. Primary controls: Tabs for Versions, Migrations, Feature Flags; Add Flag dialog; migration/release controls where present. Live-observed controls: Observed buttons/actions: Expand sidebar; Download Platform Functions PDF; Logout; Go back; Versions; Migrations; Feature Flags; Create New Version; Edit; Snapshot; Open support chat; Close chat; How do I upload my credit report?; What compliance findings did you find?. Observed fields/filters: None observed during the live sweep. Observed tabs: Versions; Migrations; Feature Flags. Tables/grids: 0; cards/panels: 21. Safe interactions performed: clicked tab: Versions; clicked tab: Migrations; clicked tab: Feature Flags; opened create/add dialog: Add Flag; dialog visible.

I. Step-by-step usage:
1. Review current version and release status.
2. Use Migrations tab for visibility unless an approved migration run exists.
3. Review feature flags without toggling.
4. Open Add Flag only for inspection during audit.
5. Escalate deployment mismatches to release owners.

J. Safe actions: Viewing versions, switching tabs, opening/closing Add Flag.

K. Caution/destructive actions: Migrations and feature flags can change product behavior.

L. Do-not-do list: Do not run migrations, create/alter versions, or toggle feature flags during certification.

M. Empty-state behavior: If no records appear, staging may not have matching data, filters may be narrow, or the page may be role/feature/data dependent. Clear filters and verify the owning queue before drawing conclusions.

N. Error-state behavior: If the page fails, check admin session, route access, failed network requests, Error Logs, and recent deploy status. Escalate with route, time, screenshot, and console/network evidence.

O. Related pages: Regulatory Updates, AI Assist, Lifecycle Testing

P. Compliance/legal boundary notes: Controls release/admin behavior only and must not change parser/legal/packet truth without approved workflow.

Q. Troubleshooting notes: Confirm route, role, filters, staging data availability, and feature gates. Do not patch parser, legal, packet, or settings behavior from this page without an approved task.

R. Evidence from live certification: Header seen: Version Management. Console/page errors: 0. Failed critical network requests: 0. Screenshot: docs/admin-live-clickthrough-screenshots/25-version-management.png. Notes: Operational page is data-dependent, staging-only, guarded, or currently in an empty-state path.

