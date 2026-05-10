# Core Config Promotion

Localhost is the initial workbase, but core platform truth must be reproducible on staging before production promotion. This workflow moves only the supported configuration/reference layer upward from localhost to staging.

## What Is Promoted

The core config snapshot includes:

- admin/support role assignments for existing users,
- system settings and feature flags,
- compliance configuration,
- parser bureau markers, field mappings, extraction rules, and known entities,
- letter templates,
- bureaus,
- statutes, statute versions, disclosure requirements, federal guidance, and industry standards,
- dynamic scanning rules,
- enforcement mechanisms,
- creditor/bureau/collector obligations.

The snapshot does not promote passwords, sessions, OAuth rows, reset tokens, email-verification tokens, login attempts, rate limits, arbitrary user records, uploaded documents, payment records, support tickets, audit logs, IP addresses, user-agent data, or temporary local test users.

## Standard Procedure

For code-only work:

```powershell
pnpm run check
pnpm run commit-push -- --message "your short summary"
```

For work that changes roles, settings, parser mappings, templates, statutes, rules, seeded defaults, or other core data:

```powershell
pnpm run core-config:export -- --target local
pnpm run core-config:apply:staging
pnpm run core-config:apply:staging -- --confirm
pnpm run core-config:verify
```

The apply command is a dry run unless `--confirm` is present. The confirmed staging apply writes an audit entry with action `CORE_CONFIG_APPLY_STAGING`.

## Code Plus Core Config Changes

When the core-config tooling itself or related code has changed, deploy the code first without replacing local data:

```powershell
pnpm run check
pnpm run commit-push -- --message "your short summary" --skip-local-refresh
```

After the staging deploy has the new code, promote the local core config:

```powershell
pnpm run core-config:apply:staging
pnpm run core-config:apply:staging -- --confirm
pnpm run core-config:verify
```

After staging is aligned, refresh localhost from staging if you want localhost to match the live pre-production dataset again:

```powershell
pnpm run refresh:local-from-staging -- --confirm
```

## Role Behavior

The workflow syncs privileged roles only. It updates existing staging users by email and changes `users.role` plus `user_account.role` for admin/support users. It does not create staging users or copy passwords.

If staging has an admin/support user that is not present in the localhost privileged-role snapshot, the confirmed apply demotes that staging-only privileged role to `user` and invalidates that user session. This prevents the earlier failure mode where localhost had one admin but staging still had two.

If localhost has a privileged user email that does not exist on staging, the apply stops with a validation error. Create that account through the normal application/auth path or add an explicit seed/remediation script before retrying.

## Reading Diff Results

`pnpm run core-config:diff` and `pnpm run core-config:verify` compare localhost to staging:

- `to add` means localhost has a core row staging does not have.
- `to update` means both environments have the logical row but values differ.
- `staging-only` means staging has a core row localhost does not have.
- `unchanged` means the row is aligned.

For most reference/config tables, staging-only rows are reported but not deleted by apply. For `privileged_user_roles`, staging-only admin/support assignments are demoted on confirmed apply because privileged access must match the promoted core truth.

## Snapshot Files

By default, exports are written under:

```text
.local/core-config/
```

That directory is ignored by Git. Treat snapshots as operational artifacts. Do not commit them unless there is a deliberate review decision to make a specific seed artifact part of the source tree.

## Required Access

Local snapshots require `CRP_LOCAL_DEV=true` and a localhost database URL. Staging operations use:

- `STAGING_HOST`
- `STAGING_USER`
- `STAGING_SSH_PRIVATE_KEY`
- optional `STAGING_SSH_PORT`

The remote command runs against the `creditregulatorpro-staging` container and never targets production.
