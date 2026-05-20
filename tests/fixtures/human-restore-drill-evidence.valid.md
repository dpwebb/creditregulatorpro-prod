# Human Restore Drill Evidence Fixture

Fixture only. This file is sanitized test evidence and is not production evidence.

| Field | Value | Notes |
| --- | --- | --- |
| Evidence type | HUMAN-OBSERVED | Fixture proof type for validator tests. |
| Drill date | 2026-05-20 | Synthetic date. |
| Drill timestamp | 2026-05-20T12:00:00-03:00 | Synthetic observed start time. |
| Operator identity | DR operator role: staging restore lead | Role only; no personal identifier. |
| Officer acknowledgement | Compliance reviewer acknowledged sanitized fixture evidence | Synthetic reviewer acknowledgement. |
| Source environment | staging-safe restore drill source | No credentials. |
| Source commit/SHA | abc123synthetic | Sanitized fixture commit label. |
| Backup source | sanitized staging backup family | No dump path or credential. |
| Source backup/dump identifier without secrets | sanitized-backup-20260520-a | No credential-bearing path. |
| Restore target | isolated local restore target | Non-production. |
| Target environment | local non-production | Non-production. |
| Target DB guard confirmation | passed - CRP_LOCAL_DEV=true and local DB host confirmed | No database URL. |
| RPO target | 15 minutes | Synthetic target. |
| RPO actual | passed - observed 5 minutes, within target | Synthetic result. |
| RTO target | 30 minutes | Synthetic target. |
| RTO actual | passed - observed 12 minutes, within target | Synthetic result. |
| Actual restore duration | passed - 11 minutes wall-clock | Synthetic duration. |
| Post-restore checks run | passed - golden path, auth/session, packet PDF, response queue, cleanup/lifecycle, retention archive/restore | Commands summarized without raw output. |
| Golden path result | passed - pnpm run test:golden-path | No raw consumer data. |
| Post-restore auth/session result | passed - auth/session lifecycle check verified | No cookies or tokens. |
| Post-restore packet PDF result | passed - packet PDF download check verified | No raw PDF bytes. |
| Post-restore response queue result | passed - response queue drain and dead-letter visibility verified | No provider calls. |
| Cleanup/lifecycle result | passed - local dump cleanup and lifecycle checks completed | No dump path. |
| Retention archive/restore result or explicit retention exclusion | passed - retention archive/restore recoverability verified with sanitized fixture markers | No physical archive contents. |
| Rollback/cleanup result | passed - restored local target cleaned and rollback notes recorded | No secrets. |
| Signed operator acknowledgement | signed - operator role attests this fixture is human-observed and sanitized | Fixture acknowledgement. |
| Sanitized evidence statement | sanitized - contains no secrets, PII, raw report text, raw PDFs, raw base64, tokens, database URLs, access keys, or signed URLs | Explicit sanitization. |
| Signoff | signed - operator, observer, and reviewer roles acknowledged | Role-only signoff. |
