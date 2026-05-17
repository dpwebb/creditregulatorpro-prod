# CreditRegulatorPro Admin New-Hire Instruction Manual

Generated for: newly hired internal admins  
Application: CreditRegulatorPro staging  
Last updated: 2026-05-17  
Classification: Confidential - internal use only

## 1. Purpose Of This Manual

This manual is the practical starting guide for a newly hired CreditRegulatorPro admin. It explains what the application does, what an admin is responsible for, where each admin function lives, and how to perform common admin workflows safely.

Use this manual with the in-app Admin Guide at `/admin-knowledge-base`. The in-app guide is the admin-facing knowledge base. This PDF is the onboarding and operating manual for a new internal administrator.

## 2. What CreditRegulatorPro Does

CreditRegulatorPro is a Canada-only credit report ingestion, compliance scanning, dispute packet, support, billing, and admin operations platform.

At a high level, the product lets a user:

- Create an account and complete their profile.
- Upload a credit report.
- Let the deterministic parser extract consumer, tradeline, inquiry, public record, bankruptcy, and statement data.
- Run compliance and anomaly checks against extracted data.
- Review possible reporting risks and evidence.
- Generate dispute packets when findings are packet-ready.
- Download or mail packets.
- Track obligations, evidence, responses, deadlines, and follow-up results.

Admins do not use the app like a consumer. Admins operate, monitor, configure, and support the platform.

## 3. Admin Role Definition

An admin is an internal platform administrator with access to system-wide operational tools.

Admins can:

- Manage users and support agents.
- Review support tickets.
- Review audit logs and error logs.
- Tune compliance rule check settings.
- Review hidden-risk findings.
- Review legal and regulatory reference pages.
- Run parser and lifecycle test tools.
- Manage feature flags, versions, and release notes.
- Review security, retention, and semantic audit panels.
- Download admin and platform function reference PDFs.

Admins must not:

- Treat a detector finding as a confirmed legal conclusion without an approved authority classification and review path.
- Change parser, violation, evidence, regulation, or packet truth casually.
- Print or expose secrets, environment files, tokens, private keys, payment credentials, or database URLs.
- Modify production systems unless explicitly instructed through the approved workflow.
- Execute destructive actions against real users without verifying the target and approval basis.

## 4. First-Day Checklist

Complete these items before performing independent admin work.

- Confirm you can log in as an admin.
- Open `/admin-knowledge-base` and review the Overview and Feature Index tabs.
- Review this manual sections 5 through 12 before using destructive actions.
- Confirm you understand the three roles: admin, support, and user.
- Confirm you understand staging versus production.
- Open User Management and verify you can search without making changes.
- Open Support Tickets and review queue filters without replying.
- Open Activity Logs and Error Logs to understand audit history.
- Open Security & Compliance and review the available tabs.
- Open Parser Testing and Parser Mappings but do not edit or approve changes until trained.
- Ask a senior admin before resetting user data, deleting a user, changing production mode, changing rule thresholds, approving parser truth, or promoting production.

## 5. Environment And Deployment Rules

CreditRegulatorPro staging work happens in the staging repository and staging branch.

- Local project path: `C:\Users\webbd\Projects\creditregulatorpro-staging`
- Staging branch: `staging`
- Local frontend URL: `http://localhost:5175`
- Local backend/API port: `http://localhost:3333`
- Staging site: `https://staging.creditregulatorpro.com`

Code moves upward:

- Localhost
- `origin/staging`
- Staging deploy
- Production promotion

Production promotion is a separate approved workflow. Do not bypass staging. Do not directly push localhost work to production.

## 6. Role And Subscription Model

The active roles are:

- `admin`: internal platform administrator with full admin access.
- `support`: internal customer support account created by an admin.
- `user`: regular consumer account.

There is no `enterprise` role.

Admin and support accounts bypass subscription checks and terms gates because they are internal operational accounts. Regular users receive a trial and must subscribe after trial expiry unless a policy exception applies.

## 7. Admin Navigation Map

The admin sidebar is organized into three major groups.

### Platform

| Route | Purpose |
| --- | --- |
| `/` | Home dashboard and orientation. |
| `/admin-user-management` | User list, detail review, support-agent creation, reset and delete controls. |
| `/admin-risk-triage` | Hidden-risk finding review and correction handoff. |
| `/admin-compliance-config` | Rule check settings, messages, postal pricing, and production mode. |
| `/admin-activity-logs` | Audit log review. |
| `/admin-error-logs` | Failed action and error review. |
| `/admin-security` | Security, retention, and semantic audit tools. |
| `/support-tickets` | Support ticket queue. |
| `/admin-knowledge-base` | In-app admin guide and admin PDF export. |

### Legal And Rules

| Route | Purpose |
| --- | --- |
| `/bureaus` | Credit reporting company reference data. |
| `/statutes` | Law and statute reference library. |
| `/metro2-compliance` | Reporting-format guidance. |
| `/creditor-obligations` | Creditor and furnisher duties. |
| `/bureau-obligations` | Credit reporting company duties. |
| `/collector-obligations` | Collector duties and review references. |
| `/enforcement-mechanisms` | Complaint paths, enforcing bodies, and remedies. |
| `/regulatory-updates` | Regulatory update review and lifecycle. |

### Tools

| Route | Purpose |
| --- | --- |
| `/admin-mock-lifecycle` | Full mock user lifecycle testing. |
| `/admin-parser-testing` | Parser regression test cases and correction workflows. |
| `/admin-parser-mappings` | Parser field mappings and bureau detection configuration. |
| `/admin-ai-assist` | Guarded admin-only AI diagnostics. |
| `/admin-version-management` | Versions, migrations, release notes, and feature flags. |

## 8. Protected Systems

The following systems are platform-critical:

- Ingestion pipeline.
- Deterministic parser.
- Canonical mapping engine.
- Evidence engine.
- Violation engine.
- Regulation registry.
- Dispute packet generator.
- Audit logging.
- Admin correction system.

Admin screens can expose controls connected to these systems. Treat them as review-sensitive. A display-only review is low risk. A change to truth, mapping, evidence, packet inputs, detector behavior, or schema is high risk.

## 9. No Silent Truth Change Rule

Do not silently change platform truth.

Truth includes:

- Canonical extracted data.
- Parser mappings.
- Regulation mappings.
- Violation rules.
- Evidence binding.
- Seeded reference data.
- Packet truth.
- Schema behavior.

Any intended truth change needs a test update, version or migration marker when applicable, audit or review trail, and an admin review path when human approval is needed.

## 10. Consumer-Safe Legal Wording

Consumer-facing legal text must separate references from conclusions.

Use wording like:

`This item may require review under [rule/reference].`

Avoid saying something is a confirmed legal violation unless the surface is approved for that wording and a reviewed authority classification supports it.

## 11. Standard Workflow: User Management

Use User Management to find accounts, review user context, create support agents, and perform approved account operations.

Safe review steps:

1. Open `/admin-user-management`.
2. Search by user name or email.
3. Filter by role if needed.
4. Open the user detail screen when deeper context is needed.
5. Review usage counts and account status.

Support-agent creation:

1. Confirm the person should have support access.
2. Open User Management.
3. Use Add Support Agent.
4. Enter the approved email, display name, and temporary credential flow required by current policy.
5. Confirm the support agent understands they cannot perform admin-only configuration changes.

User reset or delete:

1. Confirm the request and approval basis.
2. Confirm the exact user email.
3. Confirm whether the action is reversible.
4. Read the warning dialog.
5. Type the required confirmation value.
6. Record the reason in the appropriate ticket or audit context.

Never reset or delete a user because an email "looks close." Verify the target.

## 12. Standard Workflow: Support Tickets

Use Support Tickets to manage user inquiries and escalations.

Ticket workflow:

- Open.
- In Progress.
- Waiting on User.
- Resolved.
- Closed.

Admin handling rules:

- Assign tickets to a support agent when appropriate.
- Take over urgent or complex tickets.
- Use internal notes for staff-only context.
- Keep user replies plain, direct, and specific.
- Do not expose internal diagnostics, secrets, private data from other users, or unreviewed legal conclusions.
- Link the ticket to user, report, packet, or billing context when available.

## 13. Standard Workflow: Compliance Risk Triage

Risk Triage shows active hidden-risk findings that need review.

Use this page when:

- A finding looks severe.
- A finding might be false positive.
- A user-facing explanation needs review.
- Parser output, evidence binding, or rule references may be wrong.

Triage steps:

1. Open `/admin-risk-triage`.
2. Search by finding ID, user, creditor, bureau, account, or category.
3. Review severity and display label.
4. Review evidence and affected account context.
5. Open the linked correction workflow if source data or rule evidence needs repair.
6. Mark false positive only when the finding should not remain active.

Do not use Risk Triage to make broad rule changes without senior review.

## 14. Standard Workflow: Rule Check Settings

Rule Check Settings controls detector enablement, thresholds, user explanations, recommended actions, postal pricing, and production mode.

Before changing a detector:

- Identify the detector category.
- Confirm the issue being fixed.
- Confirm expected impact on current users.
- Check whether parser, evidence, violation, regulation, or packet behavior may be affected.
- Decide whether a golden-path or targeted regression test is required.

Threshold guidance:

- Higher threshold means fewer findings and more conservative output.
- Lower threshold means more findings and greater false-positive risk.
- Turning a detector off can hide real risks.

Production mode guidance:

- Production mode affects paid-plan enforcement.
- Do not toggle it casually.
- Confirm the business reason and timing before saving.

Postal pricing guidance:

- Confirm base costs and surcharge policy before editing.
- Invalid pricing can affect billing and user trust.

## 15. Standard Workflow: Activity Logs

Activity Logs are used for successful and notable platform actions.

Use Activity Logs to answer:

- Who performed an action?
- When did it happen?
- What entity was affected?
- Was it user, support, admin, or system activity?
- Is there enough context to investigate a ticket or incident?

Filter by user, date, action type, and entity type. Expand details only as needed, and do not copy sensitive payloads into external systems.

## 16. Standard Workflow: Error Logs

Error Logs focus on failed actions and system failures.

Use Error Logs to investigate:

- Failed uploads.
- Failed extractions.
- Failed packet actions.
- Failed auth events.
- Repeated server errors.
- High-severity operational failures.

Recommended process:

1. Filter to the relevant date range.
2. Filter by severity or user email if known.
3. Hide duplicates when looking for unique root causes.
4. Expand the error record.
5. Capture sanitized notes in the related ticket or internal incident record.
6. Escalate to engineering when the error suggests a product defect.

## 17. Standard Workflow: Security And Compliance

Security & Compliance includes audit logs, data retention, and semantic audit tools.

Data retention:

- Evidence and generated packet records are subject to retention policy.
- Purge workflows should only run through approved paths.
- Do not purge data casually.

Semantic audit:

- Use semantic audit to find wording, reference, and consistency issues.
- Treat findings as review prompts.
- Do not assume a semantic finding is automatically correct.

Domain guard, anti-duplication, and content protection:

- These controls protect the app from unauthorized use and content copying.
- Do not change guard mode without operational approval.

## 18. Standard Workflow: Parser Testing

Parser Testing protects deterministic extraction quality.

Use Parser Testing to:

- Create parser test cases.
- Run a single test.
- Run all parser tests.
- Compare expected and actual output.
- Review saved parser output.
- Support violation correction workflows.

Parser test case creation:

1. Create a clear test name.
2. Attach or reference the sample report.
3. Record expected consumer and tradeline fields.
4. Save only reviewed expected truth.
5. Run the test.

Approving changed output:

- Approve only when the new output is correct.
- Do not approve because a test is inconvenient.
- Treat approval as training and regression truth.

## 19. Standard Workflow: Parser Mappings

Parser Mappings controls field mappings, test harness behavior, change history, and bureau detection.

Before changing mappings:

- Confirm bureau scope.
- Confirm field path.
- Confirm expected input and output.
- Test in the mapping harness.
- Review change history.
- Run targeted parser tests.

Do not use parser mappings to hide extraction problems. Fix the actual mapping or parser rule.

## 20. Standard Workflow: AI Assist

AI Assist is diagnostic support only.

Admins can use AI Assist to:

- Review guarded findings.
- Preview explanations.
- Look up candidate context.
- Support investigation.

AI Assist must not:

- Replace deterministic parsing.
- Create active violation truth.
- Override evidence requirements.
- Approve regulation mappings.
- Make consumer-facing legal conclusions.

## 21. Standard Workflow: Version Management

Version Management includes versions, migration status metadata, release notes, and feature flags.

Versions:

- Draft means work in progress.
- Released means active/current release.
- Archived means no longer active.

Migrations:

- Migration status buttons mark status metadata.
- They do not execute SQL.
- Do not imply a migration was applied if it was not verified.

Feature flags:

- Global flags affect all users.
- Admin flags affect admins.
- User flags affect selected user scope.
- Use flags for controlled rollout and emergency shutoff.

Release notes:

- Keep notes clear and accurate.
- Separate user-facing changes from internal changes.

## 22. Standard Workflow: Lifecycle Testing

Lifecycle Testing runs mock end-to-end dispute lifecycle scenarios.

Use it to verify:

- Initial report ingestion.
- Follow-up report behavior.
- Packet creation path.
- Simulated day gaps.
- Coverage matrix.
- Lifecycle report output.

Do not run lifecycle tests against real user data unless the test is approved and isolated.

## 23. Standard Workflow: Legal And Rule References

Legal and rules pages are reference surfaces.

They include:

- Credit reporting company reference data.
- Statutes.
- Reporting-format guidance.
- Creditor obligations.
- Credit reporting company obligations.
- Collector obligations.
- Enforcement mechanisms.
- Regulatory updates.

Use references to support review. Do not present references as automatic legal conclusions.

## 24. Licensed Agency Data

Licensed agency data supports collector-account review and agency verification.

Functions include:

- List licensed collection agency records through the licensed-agency API.
- Import Ontario open data through an approved guarded import endpoint.
- Run licensed agency checks for collector-account review.
- Use AI verification as diagnostic support only.

There is no dedicated `/admin-licensed-agencies` route in the current build.

## 25. Platform Function Catalog

Admins should understand the full product function map because support, triage, risk review, release decisions, and incident response often require cross-functional context.

Major platform areas:

- Report ingestion and parsing.
- Compliance scanning and violation detection.
- Packet generation, viewing, and delivery.
- Obligation tracking and escalation.
- Evidence chain management.
- Bureau and creditor management.
- Tradeline management.
- Subscription and billing.
- User management and authentication.
- Customer support.
- Identity theft protection.
- Regulatory intelligence.
- Calendar and deadline management.
- Analytics and reporting.
- Bankruptcy management.
- Landing page and conversion.

## 26. User Workflow Admins Must Understand

Typical consumer flow:

1. User registers.
2. User verifies email.
3. User completes profile.
4. User uploads a report.
5. Parser extracts report data.
6. Canonical mapping normalizes extracted values.
7. Compliance checks run.
8. Evidence binds findings to report snippets and fields.
9. Packet readiness determines whether dispute packet creation is allowed.
10. User creates or downloads a packet.
11. User mails packet or uses supported delivery options.
12. User uploads follow-up reports.
13. Platform tracks change, deadlines, obligations, and impact.

When troubleshooting, identify which step failed before changing settings.

## 27. Common Admin Scenarios

### A user cannot access paid features

- Check role and subscription status.
- Check trial state.
- Confirm production mode expectations.
- Review support ticket context.
- Escalate billing provider issues to the approved owner.

### A user says upload failed

- Check Error Logs by user and date.
- Check upload artifact context if available.
- Confirm file type and source.
- Do not ask user for secrets.
- Escalate repeated parser failures.

### A finding looks wrong

- Review Risk Triage.
- Review source evidence.
- Check parser output.
- Use correction workflow if needed.
- Do not lower thresholds globally to hide one bad case.

### A user asks for data deletion or reset

- Confirm identity and request.
- Confirm the exact account.
- Follow approved reset or deletion workflow.
- Record context in the support ticket.
- Do not perform destructive actions from memory.

### A support agent needs access

- Confirm approval.
- Create support agent through User Management.
- Explain support limitations.
- Confirm no admin privileges are granted.

## 28. Testing And Verification Commands

Use these commands from the repository root when working locally.

```bash
pnpm run typecheck
pnpm run build
pnpm run test:golden-path
pnpm run test:unit
pnpm run test:deterministic-ingestion-report
pnpm run test:credit-regression
pnpm run test:tradeline-internal
pnpm run test:violation-corrections
pnpm run check
```

The golden path covers upload payload contract, parse, canonical map, anomaly detect, violation detect, evidence bind, packet generate, and PDF download.

## 29. Publishing And Promotion

Standard staging publish command:

```bash
pnpm run commit-push -- --message "short summary"
```

Production promotion command:

```bash
pnpm run promote:production
```

Only run production promotion with explicit approval. GitHub remains the source of truth for deployment.

## 30. Data And Config Movement

Code moves upward:

- Localhost to `origin/staging`.
- Staging deploy.
- Production promotion.

Data usually moves downward for reproduction:

- Staging to localhost refresh.

Do not assume local database changes will appear on staging. Meaningful core data or config changes must be reproducible as a migration, seed, admin operation, export/import, or audited remediation script.

## 31. Do-Not-Do List

Do not:

- Expose secrets or environment file contents.
- Modify `.env` or `.env.*` without explicit credential setup approval.
- Modify production paths from the staging repo.
- Edit production deployment config from this workflow.
- Create new deploy keys, GitHub tokens, Hostinger credentials, or secrets unless explicitly asked.
- Change parser truth casually.
- Change regulation mappings casually.
- Disable detectors to avoid one difficult case.
- Delete or reset users without confirmed approval and target identity.
- Run data retention purge casually.
- Treat AI output as approved truth.
- Tell consumers that a possible issue is a confirmed legal violation without approved review support.

## 32. Escalation Guide

Escalate to a senior admin or engineering when:

- A parser failure affects multiple users.
- A rule check appears to create widespread false positives.
- Evidence binding is missing or points to the wrong source.
- Packet readiness blocks valid findings unexpectedly.
- A support ticket alleges legal urgency.
- A billing issue involves provider-side payment state.
- A data deletion or retention request is unclear.
- A security log suggests unauthorized access.
- A production promotion or rollback is requested.

## 33. New Admin Daily Operating Checklist

Start of day:

- Review urgent support tickets.
- Review high-severity error logs.
- Review active risk triage count.
- Check recent activity for unusual admin or auth events.
- Review any pending regulatory or semantic audit items assigned to you.

During the day:

- Work from tickets or assigned admin tasks.
- Use the smallest safe change.
- Record decisions in the ticket or approved review surface.
- Ask for review before protected-system changes.

End of day:

- Leave tickets in the correct status.
- Document unresolved blockers.
- Confirm no destructive action is pending without owner approval.
- Confirm any code or config change has passed required checks.

## 34. Glossary

Admin: internal platform administrator.

Support agent: internal support account with limited access.

User: consumer using the app to review credit report data and generate packets.

Tradeline: a credit account or reporting line extracted from a report.

Finding: a possible compliance or reporting issue detected by the system.

Evidence binding: the link between a finding and the exact source data supporting it.

Packet-ready: a finding state that has enough verified evidence for packet creation.

Canonical mapping: deterministic normalization of extracted report data.

Detector: a configured rule or check that identifies a possible reporting risk.

Semantic audit: diagnostic review of wording and reference consistency.

Feature flag: a switch used to enable or disable a feature for a scope.

Production mode: app-wide setting that affects paid-plan enforcement.

## 35. Final Operating Principle

Admins are stewards of the platform. The goal is not to make fast changes. The goal is to make correct, traceable, minimal changes that preserve deterministic behavior, protect users, and keep compliance-sensitive workflows reviewable.
