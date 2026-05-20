# Restore Drill Evidence Template

Status: Template only. This is not completed restore drill evidence.

Do not store secrets, private keys, database URLs with credentials, raw PDF bytes, raw extracted text, session cookies, or dump paths containing credentials in this file.

## Drill Summary

| Field | Value | Notes |
| --- | --- | --- |
| Evidence type | TBD | Must be HUMAN-OBSERVED for acceptance. SIMULATED-only evidence is not accepted as human proof. |
| Drill date | TBD | Use ISO date and time with timezone. |
| Drill timestamp | TBD | ISO timestamp when the drill started. |
| Operator identity | TBD | Human operator who ran the drill outside Codex. |
| Officer acknowledgement | TBD | Officer/reviewer acknowledgement that evidence is sanitized and complete. |
| Source environment | TBD | Example: staging. Do not include credentials. |
| Source commit/SHA | TBD | Commit deployed at the source environment. |
| Backup source | TBD | Sanitized source system or backup family name. |
| Source backup/dump identifier without secrets | TBD | Use a sanitized backup ID or dump label only. |
| Restore target | TBD | Sanitized target label; must not be production. |
| Target environment | TBD | Must be local or explicitly approved non-production. |
| Target DB guard confirmation | TBD | Confirm local/non-production guard and `CRP_LOCAL_DEV=true` where applicable. |
| RPO target | TBD | Example: restore point age target. |
| RPO actual | TBD | Actual observed restore point age. |
| RTO target | TBD | Example: maximum expected restore time. |
| RTO actual | TBD | Actual observed time to restore and complete checks. |
| Actual restore duration | TBD | Wall-clock duration from restore start to completed local restore. |
| Post-restore checks run | TBD | List commands run after restore. |
| Golden path result | TBD | Record pass/fail and command. |
| Post-restore auth/session result | TBD | Record pass/fail and command. |
| Post-restore packet PDF result | TBD | Record pass/fail and command. |
| Post-restore response queue result | TBD | Record pass/fail and commands. |
| Cleanup/lifecycle result | TBD | Confirm dump cleanup and lifecycle/queue cleanup checks without secrets. |
| Retention archive/restore result or explicit retention exclusion | TBD | Record physical retention archive/restore result, or an approved explicit exclusion. |
| Rollback/cleanup result | TBD | Record local restored-target rollback or cleanup result without dump paths containing credentials. |
| Signed operator acknowledgement | TBD | Operator signed acknowledgement that evidence is accurate, sanitized, and human-observed. |
| Sanitized evidence statement | TBD | Explicitly state that evidence is sanitized and contains no secrets, PII, raw report text, raw PDFs, raw base64, tokens, database URLs, access keys, or signed URLs. |
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
- Human acceptance for promotion-pack gating must pass `pnpm run restore:accept-human-evidence` against `docs/production-scale/evidence/human-restore-drill-evidence.md` or `.json`.
- Filled evidence must replace every `TBD`, `TODO`, and `N/A` placeholder with a concrete sanitized value.
- Do not mark the disaster recovery blocker complete until filled, signed evidence exists and required post-restore checks pass.
