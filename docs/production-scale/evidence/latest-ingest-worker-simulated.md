# SIMULATED Ingest Worker Queue-Drain Evidence

SIMULATED evidence only. This is synthetic local proof and is not production worker activation, not production queue proof, and not production-at-scale readiness.

Generated at: 2026-05-22T17:51:28.641Z
Branch: `staging`
Commit: `b0c8de12b0d85ef47789ad35c7182ff1b6db4ca7`
Simulation ID: `SIMULATED-INGEST-WORKER-QUEUE-DRAIN`
Status: passed
Machine-attested production-safe queue-drain proof still required: yes

## SIMULATED Queue Scope

- Source filter: `SIMULATED_INGEST_WORKER_PROOF`
- Synthetic scoped jobs: 3
- Out-of-scope guard jobs untouched: yes

## SIMULATED Queue Depth

- Before bounded apply: total=3, queued=3, running=0, succeeded=0, failed=0, dead_lettered=0
- After bounded apply: total=3, queued=0, running=0, succeeded=2, failed=0, dead_lettered=1
- Stale queued or running jobs remaining in synthetic scope: 0

## SIMULATED Worker Checks

- SIMULATED_INGEST_WORKER_DRY_RUN_NO_MUTATION: passed - dry-run did not mutate queue state.
- SIMULATED_INGEST_WORKER_BOUNDED_APPLY_SCOPED: passed - bounded apply touched only the synthetic source scope.
- SIMULATED_INGEST_WORKER_DEAD_LETTER_VISIBLE: passed - malformed synthetic job status is dead_lettered with error code SIMULATED_MALFORMED_SYNTHETIC_JOB.
- SIMULATED_INGEST_WORKER_EMPTY_QUEUE_CLEAN_EXIT: passed - empty synthetic queue exited cleanly with code 0.
- Bounded apply worker exit code: 2 (The bounded worker returns 2 when the intentionally malformed SIMULATED job dead-letters.)

## SIMULATED Lifecycle Evidence

- Job 101: status=succeeded, attempts=1/2, events=queued, claimed, ocr_parsing_started, compliance_scan_started, succeeded
- Job 102: status=succeeded, attempts=1/2, events=queued, claimed, ocr_parsing_started, compliance_scan_started, succeeded
- Job 103: status=dead_lettered, attempts=1/1, events=queued, claimed, dead_lettered

## Safety

- Production environment targeted: no
- Production deployment or worker activation changed: no
- Production data mutated: no
- Real consumer PII used: no
- Real consumer credit reports processed: no
- Live external providers connected: no
- Parser, OCR, storage, packet PDF, DB pool, retention, violation, evidence binding, packet readiness, and deployment behavior changed: no
- SIMULATED evidence is not production proof.

## Remaining Blocker

This autonomous proof does not close the production ingest runtime blocker. A bounded staging-safe queue-drain run with recorded before/after queue depth is still required before any production-scoped activation decision.
