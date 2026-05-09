# Admin Operational Validation Checklist - 2026-05-09

## Overall Status

Status: Stable after repair for non-destructive admin workflows and automated regression coverage.

## Section Checklist

| Admin Section | Purpose Confirmed | Route Confirmed | Permission Gate Reviewed | Main Actions Reviewed | Automated/Route Validation | Operational Status |
| --- | --- | --- | --- | --- | --- | --- |
| Home | Yes | Yes | Yes | Dashboard metrics and navigation | E2E/public route | Operational |
| User Management | Yes | Yes | Yes | Search, role filter, pagination, user reset dialog, support-agent creation | API/type/build/e2e | Operational after repair |
| Risk Triage | Yes | Yes | Yes | Queue review, status filters, packet/case navigation | Route sweep/static review | Operational |
| Rule Check Settings | Yes | Yes | Yes | Detector thresholds, messaging, postal pricing, production mode | API/type/build | Operational after repair |
| Activity Logs | Yes | Yes | Yes | Search, filters, pagination, audit review | Route sweep/API review | Operational |
| Error Logs | Yes | Yes | Yes | Severity filters, error review, pagination | Route sweep/API review | Operational |
| Security & Compliance | Yes | Yes | Yes | Audit logs, data retention, semantic audit | Route sweep/static review | Operational after repair |
| Support Tickets | Yes | Yes | Yes | Ticket queue, filters, status workflow | Route sweep/static review | Operational |
| Admin Guide | Yes | Yes | Yes | Documentation view and admin guide PDF | Route sweep/build | Operational |
| Letter Templates | Yes | Yes | Yes | Template browse/edit workflow | Route sweep/static review | Operational |
| Credit Reporting Companies | Yes | Yes | Yes | Bureau reference data | Route sweep/static review | Operational |
| Laws | Yes | Yes | Yes | Statute reference data | Route sweep/static review | Operational |
| Reporting Format Guide | Yes | Yes | Yes | Metro 2 guidance and rules | Route sweep/static review | Operational |
| Rules Creditors Must Follow | Yes | Yes | Yes | Creditor obligation reference | Route sweep/static review | Operational |
| Rules Credit Reporting Companies Must Follow | Yes | Yes | Yes | Bureau obligation reference | Route sweep/static review | Operational |
| Rules Collectors Must Follow | Yes | Yes | Yes | Collector obligation reference | Route sweep/static review | Operational |
| Enforcement | Yes | Yes | Yes | Enforcement reference data | Route sweep/static review | Operational |
| Regulatory Updates | Yes | Yes | Yes | Update review and regulatory tracking | Route sweep/static review | Operational |
| Lifecycle Testing | Yes | Yes | Yes | Mock lifecycle orchestration | E2E/admin route | Operational |
| Parser Testing | Yes | Yes | Yes | Test cases, parser runs, saved output review | E2E/extraction tests | Operational |
| Parser Mappings | Yes | Yes | Yes | Mapping management and parser field review | Route sweep/static review | Operational |
| AI Assist | Yes | Yes | Yes | Admin assistance panel | Route sweep/static review | Operational |
| Version Management | Yes | Yes | Yes | Versions, migration status, feature flags | Build/static review | Operational after repair |
| Platform Functions PDF | Yes | Yes | Yes | PDF export from admin layout | Build/static review | Operational |

## Repair Checklist

- [x] Security & Compliance added to the sidebar.
- [x] User Management total-count pagination repaired.
- [x] Dashboard user table updated for the new users API shape.
- [x] Support-agent reset links made host-aware.
- [x] Postal pricing UI validation added.
- [x] Postal pricing API validation added.
- [x] API regression test added for pricing validation.
- [x] Migration status buttons relabeled to avoid implying SQL execution.
- [x] Violation correction reference actions made visually distinct.
- [x] Admin correction action buttons given accessible labels.

## Test Checklist

- [x] `pnpm run typecheck`
- [x] `pnpm run test:contracts`
- [x] `pnpm run test:api`
- [x] `pnpm run test:unit`
- [x] `pnpm run build`
- [x] `pnpm run test:e2e`
- [x] `pnpm run test:violation-corrections`
- [x] Deterministic ingestion regression
- [x] Credit report parser regression
- [x] Tradeline internal regression
- [x] Extraction regression
- [x] DB harness regression

## Safety Notes

- Do not execute destructive admin workflows against live data unless the tenant/user is disposable and the action has been approved.
- Do not expose secrets, environment files, private keys, reset tokens, or user data in training manuals.
- Use staging-first validation before production promotion.
