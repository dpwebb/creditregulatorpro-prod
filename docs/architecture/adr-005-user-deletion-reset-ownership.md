# ADR 005: User Deletion And Reset Ownership

Status: accepted
Date: 2026-05-27

## Context

User deletion, reset, report-artifact cascade deletion, and platform reset are protected CRP workflows. They touch report artifacts, tradelines, packets, evidence, auth rows, support data, storage, audit logs, and foreign key cleanup.

## Decision

`helpers/userDataDeletion.ts` should be treated as the intended canonical user-owned deletion/reset service for self-service data deletion and self-service account deletion.

`helpers/deleteReportArtifactCascade.tsx` owns report-artifact cascade deletion and report-derived tradeline cleanup.

`scripts/reset-platform.mjs` is platform-level reset logic. It must stay separate from user reset and account deletion because it has different safety rules, environment checks, admin preservation behavior, and operational scope.

## Known Overlap

`endpoints/admin/delete-user_POST.ts` currently appears to contain overlapping inline cascade logic. This should be treated as high-risk technical debt, not as permission to consolidate immediately.

`runDynamicUserFkCleanup` exists in more than one place. That duplication must not be consolidated without tests covering:

- admin delete user
- admin reset user
- self-service delete-data
- self-service delete-account
- platform reset dry-run and confirm behavior

## Future Work Rules

Do not change cascade ordering, optional schema fallbacks, dynamic FK handling, audit logging, storage deletion, admin preservation, session cleanup, or user row deletion behavior without a separate approved plan and regression coverage.

