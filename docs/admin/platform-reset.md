# Admin Platform Reset

The Admin Platform Reset control lets an authorized admin reset development or staging operational data from the Security & Compliance admin area before end-to-end testing.

It is not a schema reset and it is not a production wipe.

## UI Location

Admin -> Security & Compliance -> Platform Reset

The button is labeled `Reset Platform Test Data`. The UI runs a dry-run preview first, then requires the exact phrase `RESET STAGING PLATFORM` before confirmed reset is enabled.

## Preserved Data

- Admin, super_admin, service, and system users
- Migrations and app version metadata
- Laws, regulations, statutes, obligations, rule definitions, and legal references
- Parser mappings, parser training/corrections, parser rules, known entities, and canonical extraction intelligence
- Role definitions and admin access rows
- Core system settings, feature flags, and deterministic OCR/runtime configuration
- Supported bureau and company reference mappings
- Letter templates and platform content/configuration

## Deleted Data

The reset clears operational and test/user-generated data, including:

- Uploaded reports, report artifacts, parsed artifacts, tradelines, findings, and violations
- Evidence artifacts, generated dispute packets, packet PDFs, and generated exports
- Ingest and response pipeline jobs/events/heartbeats
- Compliance risk triage and operational compliance audit/review rows
- Compliance detection configuration rows
- Activity logs, support tickets, outcome reviews, response documents, system error/security operational records where represented by current operational tables
- Parser-lab runs, beta/lifecycle testing records, mock lifecycle runs, AI Assist operational/test data
- Sessions, password reset tokens, email verification tokens, OAuth state/account rows, login attempts, and rate-limit rows
- Temporary OCR, upload cache, parser temp, generated PDF/export, and local generated storage objects

Hard mode also deletes non-admin users and their related account/password/profile/subscription rows. Soft mode preserves users.

## Safety Gates

- Production is refused by default.
- The endpoint requires an authenticated admin or super_admin session.
- Requests must use JSON and include the admin platform reset request header.
- Destructive confirm requires the exact typed phrase.
- Confirm requires the database target from the dry-run preview; if host/name/source changes, reset fails.
- Reset fails if no admin user would remain.
- Reset writes audit rows before and after confirmed execution; the start audit row is preserved while audit logs are cleared.
- Storage references are inspected before reset, storage write/read/delete health is checked, and deletion failures are reported.

## Dry-run Behavior

Dry-run deletes nothing. It reports:

- Environment and database host/name/source
- Users to preserve/delete
- Rows matched by table
- Generated files matched by target
- Generated storage references, including `storage_read_failed:not_found` orphaned references
- Preserved subsystems and tables

## Confirm Behavior

Confirm runs the same plan shown by dry-run, bound to the same database target. It uses transactions for database row deletion where safe, respects foreign-key ordering, resets identities where appropriate, deletes generated file targets, deletes referenced generated local storage objects, and returns post-reset validation.

## Production Protection

The backend refuses production unless a separate dangerous override exists outside the Admin UI. The Admin UI does not expose production reset.

## Recovery Notes

This utility is intended for staging/dev. Restore from the latest staging backup if operational data is reset unintentionally. Core platform intelligence is preserved by design; legal/rule/reference/parser datasets should not need restoration after a normal reset.

## Recommended Workflow

1. Open Admin -> Security & Compliance -> Platform Reset.
2. Run `Reset Platform Test Data` for dry-run preview.
3. Confirm database and storage target.
4. Type `RESET STAGING PLATFORM` and run confirmed reset.
5. Review validation summary.
6. Run minimal seed if needed.
7. Begin full end-to-end testing.
