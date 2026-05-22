# Storage Durability Contract Evidence

Generated: 2026-05-22T02:48:20.224Z
Current HEAD: 35388f20d9c58282405602a7205a987ece110410
Audit target: P0-2 Artifact storage is not certifiably durable across deploys or rollbacks.
CERTIFYING:true

## Summary

- Evidence type: AUTOMATED_LOCAL_AND_STATIC_DEPLOY_PREFLIGHT
- Live external provider calls made: 0
- Staging contract: passed (durable-local-mount)
- Production contract: passed (durable-local-mount)
- Sentinel simulation: passed
- Staging deploy preflight: passed
- Production deploy preflight: passed

## Commands

- `pnpm run storage:durability-contract`
- `pnpm exec vitest run --config vitest.config.ts tests/unit/storage-durability-contract.spec.ts tests/unit/report-artifact-storage.spec.ts tests/unit/evidence-attachment-storage.spec.ts tests/api/report-artifact-storage-reference.spec.ts`
- `git diff --check`
- `pnpm run check`
- `pnpm run production-scale:evidence`

## Boundaries

- Existing document storage helpers are preserved.
- Object-storage configuration checks are static and do not call live GCS/S3.
- Durable local storage requires an explicit compose mount or explicit runtime durability acknowledgement.
- This evidence certifies only the artifact-storage durability contract, not broad production readiness.
