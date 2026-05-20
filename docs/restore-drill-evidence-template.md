# Restore Drill Evidence Template

Status: Template only. This is not completed restore drill evidence.

Do not store secrets, private keys, database URLs with credentials, raw PDF bytes, raw extracted text, session cookies, or dump paths containing credentials in this file.

## Drill Summary

| Field | Value | Notes |
| --- | --- | --- |
| Drill date | TBD | Use ISO date and time with timezone. |
| Operator | TBD | Human operator who ran the drill outside Codex. |
| Source environment | TBD | Example: staging. Do not include credentials. |
| Source commit/SHA | TBD | Commit deployed at the source environment. |
| Source backup/dump identifier without secrets | TBD | Use a sanitized backup ID or dump label only. |
| Target environment | TBD | Must be local or explicitly approved non-production. |
| Target DB guard confirmation | TBD | Confirm local/non-production guard and `CRP_LOCAL_DEV=true` where applicable. |
| RPO target | TBD | Example: restore point age target. |
| RTO target | TBD | Example: maximum expected restore time. |
| Actual restore duration | TBD | Wall-clock duration from restore start to completed local restore. |
| Post-restore checks run | TBD | List commands run after restore. |
| Golden path result | TBD | Record pass/fail and command. |
| Auth/session check result | TBD | Record pass/fail and command. |
| Packet PDF check result | TBD | Record pass/fail and command. |
| Response queue/dashboard check result | TBD | Record pass/fail and commands. |
| Cleanup of local sensitive dump | TBD | Confirm deletion or approved retention location without secrets. |
| Signoff | TBD | Operator, observer, and reviewer signoff. |

## Required Commands

Record results for the commands actually run. Suggested local checks:

```sh
pnpm run test:golden-path
pnpm exec vitest run --config vitest.config.ts tests/api/auth-session-lifecycle-endpoint.spec.ts
pnpm exec vitest run --config vitest.config.ts tests/api/packet-lifecycle-endpoint.spec.ts
pnpm run response:soak-check
pnpm run operator:dashboard
```

## Sanitization Confirmation

| Item | Confirmed |
| --- | --- |
| No production restore was performed | TBD |
| No production data was mutated | TBD |
| No credentials are recorded | TBD |
| No raw PDFs are recorded | TBD |
| No raw extracted text is recorded | TBD |
| No session cookies or tokens are recorded | TBD |
| Local sensitive dump cleanup is recorded | TBD |

## Notes

- This template must be copied and filled by a human operator after an actual external restore drill.
- The filled artifact must pass `node scripts/staging-backup-restore-checklist.mjs --validate-evidence <path>`.
- Do not mark the disaster recovery blocker complete until filled, signed evidence exists and required post-restore checks pass.
