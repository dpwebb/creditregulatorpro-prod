# Ingest Stage Persistence Evidence

Generated at: 2026-05-21T04:27:35.8735106-03:00

Current HEAD: `8799a28d0b883c0352db2942dda420c243608d86`

Audit target: P1-4 Ingest persistence allows partial writes and replay drift.

CERTIFYING:false

Reason: this evidence is automated local simulation, static source verification, and regression proof. It does not claim live production database failure-injection certification.

## Implementation Summary

- Patched `helpers/ingestCorePipeline.tsx` without replacing the ingest pipeline or comprehensive report storage.
- Added report-artifact stage metadata for `artifact_stored`, `extraction_snapshot_stored`, `canonical_mapping_stored`, `evidence_index_stored`, `compliance_scan_stored`, `replay_payload_stored`, optional `comprehensive_sidecar_stored`, and `report_promoted_complete`.
- Kept comprehensive sidecar write errors explicit as `degraded` because those writes already return non-critical side-table errors.
- Converted evidence index, replay payload, and compliance scan persistence failures into failed critical stages instead of false completion.
- Added replay payload persistence from the deterministic pipeline output and verified it matches the persisted canonical output before marking replay stored.
- Replaced direct final completion with a transaction and row lock that promotes `processingStatus` to `completed` only after all critical stages are stored.
- Preserved deterministic parsing, current violation-search behavior, compliance scanner detection logic, and packet-readiness consumers.

## Automated Evidence

- Simulated pre-promotion failure leaves completion blocked when a critical stage is missing.
- Simulated evidence index persistence failure is represented as a failed critical stage.
- Compliance scan write errors are collected and fail the critical compliance stage instead of being swallowed.
- Replay payload equality is checked against persisted canonical output.
- Retry stage recording is idempotent and does not duplicate stage truth.
- Golden path, deterministic ingestion, credit parser regression, tradeline internal regression, and violation-correction regression remain green.

## Commands Run

| Command | Result |
| --- | --- |
| `pnpm exec tsc --noEmit --pretty false` | PASS |
| `pnpm exec vitest run --config vitest.config.ts tests/unit/ingest-stage-persistence.spec.ts tests/unit/compliance-persistence-atomic.spec.ts` | PASS - 2 files, 13 tests |
| `pnpm exec vitest run --config vitest.config.ts tests/unit/ingest-stage-persistence.spec.ts tests/unit/compliance-persistence-atomic.spec.ts tests/unit/deterministic-ingestion-lockdown.spec.ts tests/unit/evidence-location-index.spec.ts tests/unit/ingest-response-canonical-consistency.spec.ts` | PASS - 5 files, 46 tests |
| `git diff --check` | PASS - Git reported only an LF-to-CRLF working-copy warning |
| `pnpm exec vitest run tests/api tests/unit --runInBand` | FAIL - Vitest 4.1.5 rejects unsupported option `--runInBand` before tests run |
| `pnpm exec vitest run --config vitest.config.ts tests/api tests/unit` | PASS - 188 files, 1425 tests |
| `pnpm run test:deterministic-ingestion-report` | PASS - 11 fixtures, replay stable, violationSearchPreserved true |
| `pnpm run check` | PASS - build, golden path, unit, deterministic ingestion, credit regression, tradeline internal, and violation-correction checks |

## Residual Risk

- Live production database crash and rollback timing was not exercised. The proof here is bounded to local automated simulation, static transaction checks, and existing regression suites.
- Optional comprehensive side tables remain degraded rather than critical because the current storage subsystem already treats them as recoverable sidecar writes.
