# Admin Operational Audit - 2026-05-09

## Scope

Repository: `C:\Users\webbd\Projects\creditregulatorpro-staging`

Admin surfaces inspected:

- Home dashboard
- User Management
- Risk Triage
- Rule Check Settings
- Activity Logs
- Error Logs
- Security & Compliance
- Support Tickets
- Admin Guide
- Letter Templates
- Credit Reporting Companies
- Laws
- Reporting Format Guide
- Rules Creditors Must Follow
- Rules Credit Reporting Companies Must Follow
- Rules Collectors Must Follow
- Enforcement
- Regulatory Updates
- Lifecycle Testing
- Parser Testing
- Parser Mappings
- AI Assist
- Version Management
- Platform Functions PDF export

## Validation Method

- Static route, sidebar, endpoint, and schema inventory.
- Admin protected-route and permission review.
- Existing automated regression suite execution.
- Authenticated live staging route sweep for menu routes.
- Local production build and e2e workflow tests.
- Targeted regression testing for violation correction behavior.
- Safety-limited workflow review for destructive operations.

Destructive actions such as user deletion/reset, data-retention enforcement, support-agent email sends, and production-mode changes were not executed against live data. They were validated by code path, schema, role enforcement, and targeted automated tests where safe.

## Anomaly Report

| ID | Area | Severity | Expected | Actual | Root Cause | Status |
| --- | --- | --- | --- | --- | --- | --- |
| A-001 | Security & Compliance | High | Admins can discover audit, retention, and semantic audit tools from the menu. | `/admin-security` existed but was hidden from the sidebar. | Sidebar inventory omitted the existing route. | Repaired |
| A-002 | User Management | Medium | Pagination reflects the true total record count. | Next page state could be wrong when the current page had exactly the page size. | Users API returned only the current page array with no total count. | Repaired |
| A-003 | Support Agent Creation | High | Staging admin password setup links point to the current staging/local host. | Reset link was hard-coded to production. | Static production URL in support-agent creation endpoint. | Repaired |
| A-004 | Rule Check Settings | Medium | Invalid pricing input is rejected before persistence. | UI could send malformed numeric values; direct API calls could persist invalid values. | Missing numeric validation for postal pricing settings. | Repaired |
| A-005 | Version Management | Medium | Migration controls clearly describe what the action does. | Buttons said Apply/Roll Back, but only update migration status metadata. | UI label implied SQL execution. | Repaired |
| A-006 | Violation Correction | Low | Reference status actions are visually distinct from deletion. | Mark incorrect used the same trash icon as delete. | Duplicate destructive icon for non-delete action. | Repaired |
| A-007 | Admin UI Text | Low | Admin labels render cleanly. | Some separators rendered inconsistently in terminal/code inspection. | Non-ASCII separator characters in touched admin panel. | Repaired |

## Repair Report

- Added Security & Compliance to the admin sidebar so the existing audit, data-retention, and semantic-audit route is discoverable.
- Extended `/admin/users` to return `{ users, total }` and updated User Management and dashboard consumers.
- Changed support-agent setup links to derive from the current request host, with same-host origin support for local/staging UI ports.
- Added UI validation for postal pricing fields and API validation for persisted postal pricing settings.
- Added API regression coverage for invalid pricing settings.
- Relabeled migration status buttons to Mark Applied and Mark Rolled Back.
- Replaced the misleading regulation-reference trash icon with active/incorrect status icons and added accessible labels.
- Normalized touched admin correction separators to ASCII.

## Validation Results

Passed:

- `pnpm run typecheck`
- `pnpm run test:contracts`
- `pnpm run test:api`
- `pnpm run test:unit`
- `pnpm run build`
- `pnpm run test:e2e`
- `pnpm run test:violation-corrections`
- `pnpm run test:deterministic-ingestion-report`
- `pnpm run test:credit-regression`
- `pnpm run test:tradeline-internal`
- `pnpm run test:extraction`
- `pnpm run test:db`
- Credit extraction smoke using local Equifax and TransUnion fixture PDFs

Route sweep:

- Live staging authenticated route sweep loaded 23 admin routes without route failures.
- The pre-deploy live staging sweep still showed Security & Compliance missing from the menu because the repair had not yet been deployed.
- Local route sweep could not authenticate with the staging admin account on localhost. Local code was therefore validated through typecheck, build, e2e, and static sidebar inspection.

## Remaining Concerns

- Full destructive workflow execution should be done only with a seeded disposable admin tenant or a staging database snapshot approved for mutation.
- Live screenshots were not embedded in the manuals to avoid exposing real user or operational data.
- A future hardening pass should add automated e2e coverage for every admin sidebar route after local seeded admin authentication is standardized.
