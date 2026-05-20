# Disaster Recovery Restore Drill Runbook

Updated: 2026-05-20

This runbook defines a human-observed restore drill process for CreditRegulatorPro. It creates the evidence path required by the Production At Scale Maximum Readiness Audit, but it does not by itself complete a restore drill.

CreditRegulatorPro remains limited beta ready with strict constraints. It is not broad-production ready and is not production-at-scale ready.

## Scope

Allowed:

- Validate restore drill guardrails and evidence fields.
- Run a human-supervised staging-to-local or approved backup-to-local restore drill.
- Record sanitized evidence using `docs/restore-drill-evidence-template.md`.
- Run post-restore checks against the local restored target.

Forbidden:

- Do not restore into production.
- Do not mutate production data.
- Do not run dump or restore commands from Codex as part of this documentation task.
- Do not store secrets, private keys, database URLs with credentials, raw PDF bytes, extracted report text, session cookies, or dump paths containing credentials in docs.
- Do not commit dump files or local restored data.

## Roles

- Operator: runs the restore drill outside Codex and controls credentials.
- Observer: watches the drill, confirms guardrails, and records evidence.
- Reviewer: confirms the completed evidence is sanitized and signs off before any readiness claim changes.

## Pre-Drill Requirements

1. Confirm the source environment and intended backup/dump identifier without exposing credentials.
2. Confirm the target is local or another explicitly approved non-production restore target.
3. Confirm `CRP_LOCAL_DEV=true` and local database host guardrails before any restore command.
4. Confirm `.local/` dump artifacts remain ignored by git.
5. Run the non-mutating checklist:

```sh
CRP_STAGING_BACKUP_RESTORE_CHECK=true pnpm run check:staging-backup-restore
```

6. Validate the evidence template:

```sh
pnpm run check:restore-drill-evidence
```

7. Optional autonomous simulated proof can be generated without dumps, restores, production data, or live providers:

```sh
pnpm run restore:drill:simulated
```

This writes `docs/production-scale/evidence/latest-restore-drill-simulated.md` and `docs/production-scale/evidence/latest-restore-drill-simulated.json`. These artifacts are labeled `SIMULATED` and are not a substitute for a human-observed restore drill.

## Drill Procedure

1. Record the drill start time in a copy of `docs/restore-drill-evidence-template.md`.
2. Record source environment, source commit/SHA, backup/dump identifier, target environment, RPO target, and RTO target.
3. Run the existing refresh script in dry-run mode first:

```sh
pnpm run refresh:local-from-staging -- --dry-run --source ssh
```

4. If dry-run confirms a local-only target and the operator approves, the operator may run the restore outside Codex:

```sh
pnpm run refresh:local-from-staging -- --confirm --source ssh
```

5. Record actual restore duration and target DB guard confirmation.
6. Run post-restore checks on the local restored target:

```sh
pnpm run test:golden-path
pnpm exec vitest run --config vitest.config.ts tests/api/auth-session-lifecycle-endpoint.spec.ts
pnpm exec vitest run --config vitest.config.ts tests/api/packet-lifecycle-endpoint.spec.ts
pnpm run response:soak-check
pnpm run operator:dashboard
```

7. Record each check result in the evidence template.
8. Remove local sensitive dump files unless the operator has a documented retention reason.
9. Confirm no dump, secret, raw PDF, raw extracted text, or session artifact is staged in git.
10. Operator, observer, and reviewer sign off.
11. Copy the sanitized, signed artifact to `docs/production-scale/evidence/human-restore-drill-evidence.md` or `.json`.
12. Run strict human-evidence acceptance:

```sh
pnpm run restore:accept-human-evidence
```

## Evidence Acceptance Criteria

A restore drill is not complete until a filled evidence artifact records:

- Evidence type as `HUMAN-OBSERVED`.
- Drill date.
- Drill timestamp.
- Operator identity.
- Officer acknowledgement.
- Source environment.
- Source commit/SHA.
- Backup source.
- Source backup/dump identifier without secrets.
- Restore target.
- Target environment.
- Target DB guard confirmation.
- RPO target.
- RPO actual.
- RTO target.
- RTO actual.
- Actual restore duration.
- Post-restore checks run.
- Golden path result.
- Post-restore auth/session result.
- Post-restore packet PDF result.
- Post-restore response queue result.
- Cleanup/lifecycle result.
- Retention archive/restore result or an approved explicit retention exclusion.
- Rollback/cleanup result.
- Signed operator acknowledgement.
- Sanitized evidence statement.
- Signoff.

The evidence artifact must be sanitized and pass:

```sh
node scripts/staging-backup-restore-checklist.mjs --validate-evidence <path-to-filled-evidence>
pnpm run restore:accept-human-evidence
```

## Stop Conditions

Stop the drill and do not claim completion if:

- The target is production or target detection is ambiguous.
- The target database host is not local or explicitly approved non-production.
- A dump path or evidence note contains credentials.
- A secret, private key, token, session cookie, raw PDF, or extracted report text appears in output or evidence.
- Required post-restore checks fail.
- The operator cannot confirm cleanup of local sensitive dump files.

## Current Status

Runbook, template, non-mutating validation, and autonomous simulated restore evidence generation exist. Simulated proof does not close the disaster recovery blocker. No production backup has been accessed, no production dump has been restored, no production data has been mutated, and a human-observed signed restore drill remains blocking for broader production and production-at-scale readiness.
