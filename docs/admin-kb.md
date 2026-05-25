# CreditRegulatorPro Admin Knowledge Base

Last updated: 2026-05-17

This KB is the operator reference for the current CreditRegulatorPro staging codebase. The in-app admin guide lives at `/admin-knowledge-base` and is backed by `helpers/adminKnowledgeBaseContent.ts`, `components/KBAdminFeatureIndex.tsx`, and the admin KB PDF endpoint. This markdown file gives maintainers a repository-level copy of the implemented feature and function inventory.

## System Summary

CreditRegulatorPro is a Canada-only credit report ingestion, compliance scanning, dispute packet, support, billing, and admin operations platform.

- Frontend: React, Vite, TypeScript.
- Backend: Hono server and endpoint modules.
- Data: PostgreSQL through Kysely.
- Primary users: consumers, support agents, and internal admins.
- Current branch purpose: staging.
- Production promotion source: `creditregulatorpro-staging` through the approved promotion workflow.

## Admin Knowledge Base Surfaces

| Surface | Function |
| --- | --- |
| `/admin-knowledge-base` | Admin-only guide page with feature groups and full platform function index. |
| `/_api/pdf/admin-knowledge-base` | Generates the confidential admin guide PDF. |
| `helpers/adminKnowledgeBaseContent.ts` | Source-of-truth arrays for admin feature groups and platform function groups. |
| `components/KBAdminFeatureIndex.tsx` | Renders feature groups and platform function groups in the admin guide. |
| `helpers/adminKbPdfContentSections.tsx` | Converts admin KB content into PDF sections. |

## Admin Feature Groups

### Home Dashboard

- Review dashboard status cards and platform activity.
- Use admin sidebar search, favorites, and recent items.
- Open the platform functions PDF from the sidebar.

### User Management

- Search, filter, and paginate user accounts by role or identity.
- Open user detail records and usage counts for reports, tradelines, packets, and evidence.
- Create support agent accounts.
- Reset user data only through approved workflows.
- Delete user accounts only through guarded admin actions when policy allows.

### Compliance Risk Triage

- Search active hidden-risk findings by ID, user, creditor, bureau, account, or category.
- Review severity, evidence, and tradeline context.
- Open linked correction workflow when parser output, evidence, or rule truth needs repair.
- Mark findings false positive only after admin review.

### Rule Check Settings

- Enable or disable detector categories.
- Tune detector confidence thresholds.
- Edit user explanation and recommended action templates.
- Configure postal delivery costs and surcharges.
- Control production-mode paid-plan enforcement.

### Activity Logs

- Filter by date, user, action, and entity.
- Review expanded audit payloads.
- Trace user/admin actions across uploads, packets, support activity, and configuration changes.

### Error Logs

- Filter failed audit records by severity, action type, entity type, user, and date range.
- Hide duplicate fingerprints.
- Expand sanitized error details for debugging.

### Security And Compliance

- Review audit records from the security view.
- Monitor and run retention workflows for expired evidence and packets.
- Run semantic audit diagnostics.
- Review domain guard, anti-duplication, content protection, and watermarking posture.

### Support Tickets

- View open, assigned, unassigned, urgent, and resolved tickets.
- Assign tickets to support agents.
- Reply to users, add internal notes, and update status/priority.
- Triage account, billing, dispute help, and technical issues.

### Legal And Rule References

- Bureau reference data for TransUnion and Equifax.
- Statute reference library with jurisdiction, section, and effective date details.
- Metro 2/reporting-format guidance.
- Creditor, bureau, collector, enforcement, regulatory update, licensed agency, and federal/provincial rule references.
- References support review. They do not create automatic legal conclusions.

### Admin Tools

- Lifecycle testing and mock dispute workflow validation.
- Parser testing and regression harness.
- Parser mappings and bureau detection configuration.
- AI Assist diagnostics.
- Version management, release notes, feature flags, and migration status.
- Letter-template status page for legacy packet tooling.
- Platform Functions PDF export.

## Platform Function Inventory

### Report Ingestion And Parsing

- Credit report upload for PDF and HTML.
- Anonymous upload preview for prospects.
- Deterministic PDF text extraction and bureau-specific parser rule packs.
- Bureau-specific parsing for TransUnion and Equifax.
- HTML extraction through DocStrange and internal bureau routing.
- Weighted automatic bureau detection.
- Dual-pass deterministic extraction.
- Consumer info, tradeline, score, inquiry, public record, bankruptcy, and consumer statement extraction.
- Cross-bureau tradeline matching.
- Report artifact versioning and SHA-256 integrity hashing.
- OCR support after deterministic OCR before canonical ingestion.

### Compliance Scanning And Violation Detection

- 45+ violation categories.
- Bureau-specific reporting format, balance, status, temporal, and date logic detectors.
- Creditor/furnisher detectors for reaging, phantom debt, rubber stamp, and related risks.
- Collector detectors for licensing, fees, limitation revival, and duplicate reporting.
- Cross-entity discrepancy detection.
- Dynamic detector definitions and admin configuration.
- Regulation infraction scanning and Metro 2 validation logging.

### Packet Generation, Viewing, And Delivery

- Packet recommendation, preview, creation, saving, listing, retrieval, and PDF download endpoints.
- Readiness validation that blocks parser-uncertain, unverified, dismissed, and missing-evidence findings.
- Historical packet PDF rendering.
- Historical packet compliance/evidence records.
- PostGrid registered mail and first-class mail delivery options.
- Tracking number and delivery status monitoring.
- Packet impact assessment against baseline and follow-up snapshots.
- Cloud storage for historical PDFs.

### Obligation Tracking And Escalation

- 80 statutory obligations across bureau, creditor, and collector sections.
- Obligation lifecycle tracking.
- Four-phase terminal label progression.
- Response recording with MOV, documentation, signature, and sender-address fields.
- Response analysis, auto-escalation, pressure scoring, vector rotation, and success analytics.

### Evidence Chain Management

- Tamper-evident SHA-256 linked evidence event chain.
- Evidence event logging per packet.
- Evidence attachment upload and storage.
- Evidence packaging for regulatory complaints.
- Bureau communication evidence recording.
- Challenge evidence panel.
- Statute version linkage.

### Bureau, Creditor, Collector, And Tradeline Management

- Bureau registries and dispute contact addresses.
- Creditor registry and creditor name normalization.
- Creditor validation requirements.
- Collection agency license verification and Ontario open data import.
- Tradeline detail, snapshots, change detection, drift monitoring, rescan, search/filter, source-text backfill, gap-fill repair, payment history, and related collection linking.

### Subscription And Billing

- Seven-day trial for new registrations.
- Monthly and annual paid plans.
- Stripe integration for subscriptions and postal transactions.
- Trial countdown and post-trial lockout.
- Upgrade/downgrade/cancellation.
- Renewal reminder email support.
- Postal markup tracking.

### User Management And Authentication

- Email/password registration and login.
- Google OAuth login.
- Email verification.
- Password reset.
- JWT session management and cleanup.
- Auth rate limiting and login attempt tracking.
- Profile management and profile completion checks.
- Terms acceptance tracking.
- Domain guard controls.

### Customer Support

- User ticket submission.
- Priority levels from low to urgent.
- Support agent queue management.
- Assignment, threaded replies, internal notes, status workflow, email notifications, and polling.
- AI-powered support chat for diagnostic triage.

### Identity Theft Protection

- Security freeze management.
- Fraud alert filing.
- Extended fraud alert support.
- Thaw requests.
- Freeze timeline and protection statistics.
- Consumer signature capture and identity theft documentation upload.

### Regulatory Intelligence

- Statute registry and limitation tracking.
- Regulatory update monitoring and lifecycle.
- Regulatory notification read/dismiss workflow.
- Auto-escalation and rollback support.
- Federal guidance, industry standards, enforcement mechanisms, and discrimination claim tracking.

### Calendar, Analytics, And Reporting

- Response deadline tracking.
- Compliance calendar and overdue alerts.
- Dashboard statistics.
- Success analytics by vector, bureau, and creditor.
- Analytics report PDF.
- Compliance audit docs export.
- CSV exports for tradelines, violations, and obligations.
- Hidden risk register, dispute journey tracker, and dispute rotation analytics.

### Bankruptcy Management

- Bankruptcy and proposal record tracking.
- Provincial retention calculation.
- Expected vs actual removal date tracking.
- Bureau-specific reporting status.
- Bankruptcy lifecycle status.

### Landing And Conversion

- Public landing page.
- Anonymous upload preview.
- Lead reminder capture.
- Get Your Report guide.
- Contact, privacy, terms, user manual, and knowledge base pages.

## Role And Subscription Rules

- Roles: `admin`, `user`, and `support`.
- There is no `enterprise` role.
- Support accounts are created by admin only.
- Support agents bypass subscription checks and terms acceptance.
- New users receive a seven-day trial with full feature access.
- After trial expiry, subscription is required unless the account is support/admin or otherwise exempt by policy.
- Production mode is active through system configuration.

## Critical Admin Routes

| Route | Function |
| --- | --- |
| `/admin-user-management` | User list, detail, support-agent creation, role/support operations. |
| `/admin-risk-triage` | Hidden risk triage and correction handoff. |
| `/admin-compliance-config` | Rule checks, thresholds, messages, postal pricing, production mode. |
| `/admin-activity-logs` | Audit log review. |
| `/admin-error-logs` | Failed action/error review. |
| `/admin-security` | Security, retention, and semantic audit tools. |
| `/support-tickets` | Support queue for admins/support agents. |
| `/admin-parser-testing` | Parser regression test harness. |
| `/admin-parser-mappings` | Mapping and bureau detection controls. |
| `/admin-ai-assist` | Diagnostic AI assist. |
| `/admin-version-management` | Versions, migrations, feature flags, release notes. |
| `/admin-letter-templates` | Legacy template tooling status. |
| `/admin-mock-lifecycle` | End-to-end lifecycle testing. |
| `/admin-knowledge-base` | Admin KB and PDF export. |

## Operational Commands

```bash
pnpm install
pnpm run validate:fast
pnpm run validate:changed
pnpm run validate:staging
pnpm start
pnpm run check:source-of-truth
pnpm run check:staging-gate
```

Staging publish:

```bash
pnpm run commit-push -- --message "short summary"
```

Production promotion:

```bash
pnpm run validate:release
pnpm run promote:production
```

Use production promotion only when explicitly approved.

## Guardrails

- Do not print secrets, API keys, environment files, private keys, OAuth tokens, Stripe keys, SendGrid keys, DocStrange keys, or database URLs.
- Do not edit production deployment configuration unless explicitly instructed.
- Use the staging repo and branch for active development.
- Keep Canada-only policy and data residency expectations in scope.
- Treat legal references as review support, not legal advice.
- Parser, evidence, violation, and regulation truth must remain deterministic and admin-reviewable.

## Known Current Limits

- Stripe and provider actions require configured runtime secrets.
- Staging/local behavior depends on the current database clone and migrations.
- AI Assist is diagnostic support only and must not replace deterministic truth layers.
- Some legacy template workflows are intentionally disabled in the current build.
- Admin operations can be destructive; verify target user/report/tradeline before reset, delete, purge, promotion, or production promotion.
