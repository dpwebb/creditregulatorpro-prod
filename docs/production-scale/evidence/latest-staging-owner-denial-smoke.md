# Latest Staging Owner-Denial Smoke

Generated at: 2026-05-20T23:21:44.905Z
Current branch: `staging`
Current commit hash: `735139f29bcb6e711175f5fc09f4ed6b4a7a557b`
Label: `LOCAL/STAGING SYNTHETIC ONLY`
Status: passed

## Required Warnings

- This is local/staging-only synthetic evidence, not production proof.
- This smoke does not create production fixtures and does not mutate production data.
- No real consumer PII, real credit reports, credentials, production database dumps, live mail delivery, or live external providers are used.
- Production-safe privacy depth remains partial until human-observed read-only production evidence is recorded.

## Owner-Denial Checks

- owner B denied owner A case: expected=DENY; actual=DENY; passed=yes
- owner A can read own case: expected=ALLOW; actual=ALLOW; passed=yes
- support denied owner A case: expected=DENY; actual=DENY; passed=yes
- owner B denied owner A evidence: expected=DENY; actual=DENY; passed=yes
- owner A can read own evidence: expected=ALLOW; actual=ALLOW; passed=yes
- support denied owner A evidence: expected=DENY; actual=DENY; passed=yes
- owner B denied owner A report artifact: expected=DENY; actual=DENY; passed=yes
- owner A can read own report artifact: expected=ALLOW; actual=ALLOW; passed=yes
- support denied owner A report artifact: expected=DENY; actual=DENY; passed=yes
- owner B denied owner A packet: expected=DENY; actual=DENY; passed=yes
- owner A can read own packet: expected=ALLOW; actual=ALLOW; passed=yes
- support denied owner A packet: expected=DENY; actual=DENY; passed=yes
- owner B denied owner A packet PDF: expected=DENY; actual=DENY; passed=yes
- owner A can read own packet PDF: expected=ALLOW; actual=ALLOW; passed=yes
- support denied owner A packet PDF: expected=DENY; actual=DENY; passed=yes
- owner B denied owner A response document: expected=DENY; actual=DENY; passed=yes
- owner A can read own response document: expected=ALLOW; actual=ALLOW; passed=yes
- support denied owner A response document: expected=DENY; actual=DENY; passed=yes

## Admin-Only Checks

- owner B denied admin-only route /_api/admin/users: expected=DENY; actual=DENY; passed=yes
- support denied admin-only route /_api/admin/users: expected=DENY; actual=DENY; passed=yes
- admin can access admin-only route /_api/admin/users: expected=ALLOW; actual=ALLOW; passed=yes
- owner B denied admin-only route /_api/admin/ingest-queue: expected=DENY; actual=DENY; passed=yes
- support denied admin-only route /_api/admin/ingest-queue: expected=DENY; actual=DENY; passed=yes
- admin can access admin-only route /_api/admin/ingest-queue: expected=ALLOW; actual=ALLOW; passed=yes
- owner B denied admin-only route /_api/responses/queue: expected=DENY; actual=DENY; passed=yes
- support denied admin-only route /_api/responses/queue: expected=DENY; actual=DENY; passed=yes
- admin can access admin-only route /_api/responses/queue: expected=ALLOW; actual=ALLOW; passed=yes
- owner B denied admin-only route /_api/regulatory-notification/list: expected=DENY; actual=DENY; passed=yes
- support denied admin-only route /_api/regulatory-notification/list: expected=DENY; actual=DENY; passed=yes
- admin can access admin-only route /_api/regulatory-notification/list: expected=ALLOW; actual=ALLOW; passed=yes

## Safety Summary

- Synthetic fixtures only: yes
- Production proof: no
- Production data mutated: no
- Production fixtures created: no
- Live external providers connected: no
- Total checks: 30
- Failed checks: 0

